import { Router } from "express";
import { adb, adbShell } from "../adb.js";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { asyncRoute, badRequest } from "../lib/http.js";

const router = Router();

const LABOS_PACKAGE = "com.openlab.labos.core";
const LABOS_ADMIN = `${LABOS_PACKAGE}/.AdminReceiver`;
const LABOS_SERVICE = `${LABOS_PACKAGE}/.LabOsService`;
const DASHBOARD_START_ACTION = "com.openlab.labos.dashboard.START";
const DASHBOARD_BOOTSTRAP_ACTIVITY = "com.openlab.labos.dashboard/.DashboardBootstrapActivity";
const PROJECT_ROOT = path.resolve(import.meta.dirname, "../../../../device");

// All LabOS module APKs - core-app must be installed first (device owner)
const LABOS_MODULES = [
  { name: "core-app", pkg: "com.openlab.labos.core", apk: "core-app/build/outputs/apk/debug/core-app-debug.apk", prebuiltApk: "prebuilt/labos-debug/core-app.apk" },
  { name: "camera", pkg: "com.openlab.labos.camera", apk: "camera/build/outputs/apk/debug/camera-debug.apk", prebuiltApk: "prebuilt/labos-debug/camera.apk" },
  { name: "dashboard-device", pkg: "com.openlab.labos.dashboard", apk: "dashboard-device/build/outputs/apk/debug/dashboard-device-debug.apk", prebuiltApk: "prebuilt/labos-debug/dashboard-device.apk" },
  { name: "devtools", pkg: "com.openlab.labos.devtools", apk: "devtools/build/outputs/apk/debug/devtools-debug.apk", prebuiltApk: "prebuilt/labos-debug/devtools.apk" },
] as const;

type LabosModule = (typeof LABOS_MODULES)[number];
type ApkSource = "build" | "prebuilt";
type ApkResolution = {
  absolutePath: string;
  relativePath: string;
  source: ApkSource;
  exists: boolean;
  buildApkExists: boolean;
  prebuiltApkExists: boolean;
};
type DeployResult = {
  name: string;
  success: boolean;
  output: string;
  apkPath?: string;
  apkSource?: ApkSource;
  code?: "already_latest" | "missing_apk" | "signature_mismatch" | "install_failed";
  needsSignatureReset?: boolean;
};
type ModuleVersion = { versionCode: number | null; versionName: string | null };

function outputLooksSuccessful(output: string) {
  const normalized = output.toLowerCase();
  return !normalized.includes("error") && !normalized.includes("exception");
}

async function readInstalledPackages() {
  return adbShell("pm list packages").catch(() => "");
}

async function readLabosProcesses() {
  return adbShell(`ps -A | grep ${LABOS_PACKAGE}`).catch(() => "");
}

function execFileText(file: string, args: string[], timeoutMs = 15000): Promise<string> {
  return new Promise((resolve, reject) => {
    const isWindowsScript = process.platform === "win32" && /\.(bat|cmd)$/i.test(file);
    const command = isWindowsScript ? (process.env.ComSpec || "cmd.exe") : file;
    const commandArgs = isWindowsScript
      ? ["/d", "/s", "/c", [file, ...args].map(quoteCmdArg).join(" ")]
      : args;
    execFile(command, commandArgs, { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr?.trim() || err.message));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

function quoteCmdArg(value: string) {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function deviceRelativePath(absolutePath: string) {
  return path.relative(PROJECT_ROOT, absolutePath).replaceAll(path.sep, "/");
}

function resolveModuleApk(module: LabosModule, opts: { preferPrebuilt?: boolean } = {}): ApkResolution {
  const build = {
    absolutePath: path.join(PROJECT_ROOT, module.apk),
    relativePath: module.apk,
    source: "build" as const,
    exists: fs.existsSync(path.join(PROJECT_ROOT, module.apk)),
  };
  const prebuilt = {
    absolutePath: path.join(PROJECT_ROOT, module.prebuiltApk),
    relativePath: module.prebuiltApk,
    source: "prebuilt" as const,
    exists: fs.existsSync(path.join(PROJECT_ROOT, module.prebuiltApk)),
  };
  const candidates = opts.preferPrebuilt ? [prebuilt, build] : [build, prebuilt];
  const selected = candidates.find((candidate) => candidate.exists) || candidates[0];
  return {
    absolutePath: selected.absolutePath,
    relativePath: deviceRelativePath(selected.absolutePath),
    source: selected.source,
    exists: selected.exists,
    buildApkExists: build.exists,
    prebuiltApkExists: prebuilt.exists,
  };
}

function findAapt() {
  const sdkRoots = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    path.join(process.env.LOCALAPPDATA || "", "Android", "Sdk"),
    path.join(process.env.USERPROFILE || "", "AppData", "Local", "Android", "Sdk"),
  ].filter(Boolean) as string[];

  for (const root of sdkRoots) {
    const buildToolsDir = path.join(root, "build-tools");
    if (!fs.existsSync(buildToolsDir)) continue;
    const versions = fs.readdirSync(buildToolsDir).sort().reverse();
    for (const version of versions) {
      const candidate = path.join(buildToolsDir, version, process.platform === "win32" ? "aapt.exe" : "aapt");
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function findApkSignerJar() {
  const sdkRoots = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    path.join(process.env.LOCALAPPDATA || "", "Android", "Sdk"),
    path.join(process.env.USERPROFILE || "", "AppData", "Local", "Android", "Sdk"),
  ].filter(Boolean) as string[];

  for (const root of sdkRoots) {
    const buildToolsDir = path.join(root, "build-tools");
    if (!fs.existsSync(buildToolsDir)) continue;
    const versions = fs.readdirSync(buildToolsDir).sort().reverse();
    for (const version of versions) {
      const candidate = path.join(buildToolsDir, version, "lib", "apksigner.jar");
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function parseVersionFromText(raw: string): ModuleVersion {
  const versionCodeMatch = raw.match(/versionCode=['=]?\s*'?(\d+)/);
  const versionNameMatch = raw.match(/versionName=['=]?\s*'?([^'\s]+)/);
  return {
    versionCode: versionCodeMatch ? Number(versionCodeMatch[1]) : null,
    versionName: versionNameMatch?.[1] || null,
  };
}

async function readApkCertSha256(apkPath: string): Promise<string | null> {
  if (!fs.existsSync(apkPath)) return null;
  const apksignerJar = findApkSignerJar();
  if (!apksignerJar) return null;
  const raw = await execFileText("java", ["-jar", apksignerJar, "verify", "--print-certs", apkPath], 20000).catch(() => "");
  return raw.match(/SHA-256 digest:\s*([a-fA-F0-9]+)/)?.[1] || null;
}

async function readInstalledSignatureSummary(pkg: string): Promise<string | null> {
  const raw = await adbShell(`dumpsys package ${pkg} | grep signatures=`, 10000).catch(() => "");
  return raw.match(/signatures=\S+\{(.+)\}/)?.[1]?.trim() || raw.trim() || null;
}

async function readApkVersion(apkPath: string): Promise<ModuleVersion> {
  if (!fs.existsSync(apkPath)) return { versionCode: null, versionName: null };
  const aapt = findAapt();
  if (!aapt) return { versionCode: null, versionName: null };
  const raw = await execFileText(aapt, ["dump", "badging", apkPath]).catch(() => "");
  return parseVersionFromText(raw);
}

async function readInstalledVersion(pkg: string): Promise<ModuleVersion> {
  const raw = await adbShell(`dumpsys package ${pkg} | grep -E "versionCode|versionName"`, 10000).catch(() => "");
  return parseVersionFromText(raw);
}

async function listModuleStatus(packages: string, opts: { preferPrebuilt?: boolean } = {}) {
  return Promise.all(LABOS_MODULES.map(async (module) => {
    const selectedApk = resolveModuleApk(module, opts);
    const apkPath = selectedApk.absolutePath;
    const installed = packages.includes(module.pkg);
    const [installedVersion, builtVersion, builtCertSha256, installedSignatureSummary] = await Promise.all([
      installed ? readInstalledVersion(module.pkg) : Promise.resolve({ versionCode: null, versionName: null }),
      readApkVersion(apkPath),
      readApkCertSha256(apkPath),
      installed ? readInstalledSignatureSummary(module.pkg) : Promise.resolve(null),
    ]);
    const apkExists = selectedApk.exists;
    const isLatest =
      installed &&
      apkExists &&
      installedVersion.versionCode !== null &&
      builtVersion.versionCode !== null &&
      installedVersion.versionCode >= builtVersion.versionCode;

    return {
      name: module.name,
      pkg: module.pkg,
      installed,
      apkExists,
      apkPath: selectedApk.relativePath,
      apkSource: selectedApk.source,
      buildApkExists: selectedApk.buildApkExists,
      prebuiltApkExists: selectedApk.prebuiltApkExists,
      installedVersionCode: installedVersion.versionCode,
      installedVersionName: installedVersion.versionName,
      builtVersionCode: builtVersion.versionCode,
      builtVersionName: builtVersion.versionName,
      builtCertSha256,
      installedSignatureSummary,
      isLatest,
      needsUpdate: apkExists && (!installed || !isLatest),
    };
  }));
}

function resolveDeployTargetsOrThrow(moduleName: unknown) {
  const selectedModule = typeof moduleName === "string" && moduleName ? moduleName : "all";
  const targets = selectedModule === "all"
    ? LABOS_MODULES
    : LABOS_MODULES.filter((module) => module.name === selectedModule);
  if (!targets.length) {
    badRequest(`Unknown module: ${selectedModule}`);
  }
  return targets;
}

async function deployModule(module: LabosModule, opts: { preferPrebuilt?: boolean } = {}): Promise<DeployResult> {
  const selectedApk = resolveModuleApk(module, opts);
  const apkPath = selectedApk.absolutePath;
  if (!fs.existsSync(apkPath)) {
    return {
      name: module.name,
      success: false,
      code: "missing_apk",
      apkPath: selectedApk.relativePath,
      apkSource: selectedApk.source,
      output: `APK not found: ${apkPath}`,
    };
  }

  try {
    const output = await adb(["install", "-r", apkPath], 120000);
    const success = output.includes("Success");
    return {
      name: module.name,
      success,
      apkPath: selectedApk.relativePath,
      apkSource: selectedApk.source,
      code: success ? undefined : classifyInstallFailure(output),
      needsSignatureReset: isSignatureMismatch(output),
      output,
    };
  } catch (error: any) {
    const output = error.message || String(error);
    return {
      name: module.name,
      success: false,
      apkPath: selectedApk.relativePath,
      apkSource: selectedApk.source,
      code: classifyInstallFailure(output),
      needsSignatureReset: isSignatureMismatch(output),
      output,
    };
  }
}

function isSignatureMismatch(output: string) {
  const normalized = output.toLowerCase();
  return normalized.includes("install_failed_update_incompatible") || normalized.includes("signatures do not match");
}

function classifyInstallFailure(output: string): DeployResult["code"] {
  if (isSignatureMismatch(output)) return "signature_mismatch";
  return "install_failed";
}

async function runDeviceOwnerCommand(command: string) {
  const output = await adbShell(command, 15000);
  return { success: outputLooksSuccessful(output), output };
}

export async function getLabosStatus() {
  const [devicePolicy, packages, procs] = await Promise.all([
    adbShell("dumpsys device_policy"),
    readInstalledPackages(),
    readLabosProcesses(),
  ]);

  return {
    isDeviceOwner: devicePolicy.includes(LABOS_PACKAGE),
    isInstalled: packages.includes(LABOS_PACKAGE),
    isRunning: procs.includes(LABOS_PACKAGE),
    packageName: LABOS_PACKAGE,
    modules: await listModuleStatus(packages),
  };
}

router.get("/status", asyncRoute(async (_req, res) => {
  res.json(await getLabosStatus());
}));

router.post("/activate", asyncRoute(async (_req, res) => {
  res.json(await runDeviceOwnerCommand(`dpm set-device-owner ${LABOS_ADMIN}`));
}));

router.post("/deactivate", asyncRoute(async (_req, res) => {
  res.json(await runDeviceOwnerCommand(`dpm remove-active-admin ${LABOS_ADMIN}`));
}));

// Deploy a single module by name, or all modules if name is "all".
// Pass { force: true } during iterative development to reinstall same-version debug APKs.
router.post("/deploy", asyncRoute(async (req, res) => {
  const results: DeployResult[] = [];
  const targets = resolveDeployTargetsOrThrow(req.body?.module);
  const force = req.body?.force === true || req.body?.reinstall === true;
  const preferPrebuilt = req.body?.usePrebuilt === true || req.body?.preferPrebuilt === true;
  const statuses = await listModuleStatus(await readInstalledPackages(), { preferPrebuilt });
  for (const module of targets) {
    const status = statuses.find((item) => item.name === module.name);
    if (status?.isLatest && !force) {
      results.push({
        name: module.name,
        success: true,
        code: "already_latest",
        apkPath: status.apkPath,
        apkSource: status.apkSource,
        output: `Already latest: installed ${status.installedVersionName} (${status.installedVersionCode}), selected ${status.apkSource} APK ${status.builtVersionName} (${status.builtVersionCode})`,
      });
      continue;
    }
    if (!status?.apkExists) {
      results.push({
        name: module.name,
        success: true,
        code: "missing_apk",
        apkPath: status?.apkPath,
        apkSource: status?.apkSource,
        output: "Skipped: no build or prebuilt APK is available",
      });
      continue;
    }
    results.push(await deployModule(module, { preferPrebuilt }));
  }

  res.json({
    success: results.every((result) => result.success),
    results,
  });
}));

router.post("/launch", asyncRoute(async (_req, res) => {
  const coreOutput = await adbShell(`am start-foreground-service -n ${LABOS_SERVICE}`);
  const dashboardOutput = await adbShell(`am start -a ${DASHBOARD_START_ACTION} -n ${DASHBOARD_BOOTSTRAP_ACTIVITY}`);
  res.json({
    success: true,
    output: [coreOutput, dashboardOutput].filter(Boolean).join("\n"),
    modules: {
      core: coreOutput,
      dashboardDevice: dashboardOutput,
    },
  });
}));

router.post("/stop", asyncRoute(async (_req, res) => {
  const output = await adbShell(`am force-stop ${LABOS_PACKAGE}`);
  res.json({ success: true, output });
}));

export default router;
