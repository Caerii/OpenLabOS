import fs from "node:fs";
import path from "node:path";
import { setTargetDevice } from "../adb.js";
import { updateLabosSettings } from "../lib/labos-settings.js";
import { CAMERA_ACTIONS, ensurePortForward, sendCameraCommand } from "../preview/device-preview.js";
import {
  runPowerProfile,
  summarizePowerSamples,
  type PowerProfileSummary,
  type PowerSample,
} from "../power/power-profiler.js";

type MatrixCase = {
  label: string;
  streamFps: number;
  preview: boolean;
  streamWidth: number;
  streamHeight: number;
  quality: number;
  repeat: number;
};

type PlotSeries = {
  label: string;
  color: string;
  points: Array<{ x: number; y: number | null }>;
};

const COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#f97316", "#84cc16"];

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasArg(name: string) {
  return process.argv.includes(name);
}

function parseNumber(name: string, defaultValue: number) {
  const parsed = Number(argValue(name));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : defaultValue;
}

function parseFpsList(value = "0,1,3,6,10,15") {
  const parsed = value
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((value) => Number.isFinite(value) && value >= 0)
    .filter((value, index, values) => values.indexOf(value) === index);
  return parsed.length ? parsed : [0, 1, 3, 6, 10, 15];
}

function parseNumberList(value: string | undefined, defaultValue: number[]) {
  if (!value) return defaultValue;
  const parsed = value
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((item) => Number.isFinite(item) && item >= 0)
    .filter((item, index, values) => values.indexOf(item) === index);
  return parsed.length ? parsed : defaultValue;
}

function parseResolutionList(value: string | undefined, fallback: Array<{ width: number; height: number }>) {
  if (!value) return fallback;
  const parsed = value
    .split(",")
    .map((part) => part.trim().match(/^(\d+)x(\d+)$/i))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => ({ width: Number(match[1]), height: Number(match[2]) }))
    .filter((item) => item.width > 0 && item.height > 0);
  const seen = new Set<string>();
  return parsed.filter((item) => {
    const key = `${item.width}x${item.height}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).length ? parsed : fallback;
}

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "matrix";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPreviewHealth(previewHealthUrl: string | null) {
  if (!previewHealthUrl) return null;
  try {
    const response = await fetch(previewHealthUrl, { signal: AbortSignal.timeout(1500) });
    if (!response.ok) return null;
    return await response.json() as any;
  } catch {
    return null;
  }
}

async function waitForPreviewFrames(previewHealthUrl: string | null, timeoutMs: number) {
  if (!previewHealthUrl) return;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const health = await fetchPreviewHealth(previewHealthUrl);
    if (health?.frameReachable === true || Number(health?.frameCount || 0) > 0) return;
    await sleep(500);
  }
}

function readSamples(jsonlPath: string): PowerSample[] {
  return fs.readFileSync(jsonlPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as PowerSample);
}

function sampleMetric(samples: PowerSample[], metric: string) {
  const values: Array<{ x: number; y: number | null }> = [];
  const first = samples[0]?.atMs || 0;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    const prev = samples[index - 1];
    let y: number | null;
    switch (metric) {
      case "cpuC":
        y = sample.thermal.cpuC;
        break;
      case "batteryC":
        y = sample.thermal.batteryC ?? sample.battery.temperatureC;
        break;
      case "coreCpu":
        y = sample.cpu.labosCorePercent;
        break;
      case "cameraCpu":
        y = sample.cpu.labosCameraPercent;
        break;
      case "adbdCpu":
        y = sample.cpu.adbdPercent;
        break;
      case "wifiKBps": {
        if (!prev || sample.wifi.rxBytes === null || sample.wifi.txBytes === null || prev.wifi.rxBytes === null || prev.wifi.txBytes === null) {
          y = null;
          break;
        }
        const dt = Math.max(1, (sample.atMs - prev.atMs) / 1000);
        y = ((sample.wifi.rxBytes - prev.wifi.rxBytes) + (sample.wifi.txBytes - prev.wifi.txBytes)) / 1024 / dt;
        break;
      }
      case "previewFps":
        y = sample.preview?.fps ?? null;
        break;
      case "frameKB":
        y = sample.preview?.frameBytes ? sample.preview.frameBytes / 1024 : null;
        break;
      case "chargeUah":
        y = sample.battery.chargeCounterUah;
        break;
      default:
        y = null;
    }
    values.push({ x: (sample.atMs - first) / 1000, y });
  }
  return values;
}

function renderLinePlot(opts: {
  title: string;
  yLabel: string;
  series: PlotSeries[];
  outPath: string;
}) {
  const width = 1100;
  const height = 560;
  const margin = { left: 76, right: 24, top: 58, bottom: 72 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const allPoints = opts.series.flatMap((series) => series.points.filter((point) => Number.isFinite(Number(point.y))));
  const maxX = Math.max(1, ...opts.series.flatMap((series) => series.points.map((point) => point.x)));
  const minY = Math.min(...allPoints.map((point) => Number(point.y)));
  const maxY = Math.max(...allPoints.map((point) => Number(point.y)));
  const yPad = Math.max(0.1, (maxY - minY) * 0.12);
  const y0 = allPoints.length ? minY - yPad : 0;
  const y1 = allPoints.length ? maxY + yPad : 1;
  const xScale = (x: number) => margin.left + (x / maxX) * innerW;
  const yScale = (y: number) => margin.top + innerH - ((y - y0) / (y1 - y0 || 1)) * innerH;
  const gridY = Array.from({ length: 6 }, (_, index) => y0 + ((y1 - y0) * index) / 5);
  const gridX = Array.from({ length: 7 }, (_, index) => (maxX * index) / 6);
  const lines = opts.series.map((series) => {
    const pathData = series.points
      .filter((point) => Number.isFinite(Number(point.y)))
      .map((point, index) => `${index === 0 ? "M" : "L"}${xScale(point.x).toFixed(1)},${yScale(Number(point.y)).toFixed(1)}`)
      .join(" ");
    return `<path d="${pathData}" fill="none" stroke="${series.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
  }).join("\n");
  const legend = opts.series.map((series, index) => {
    const x = margin.left + (index % 4) * 245;
    const y = height - 38 + Math.floor(index / 4) * 18;
    return `<g><rect x="${x}" y="${y - 10}" width="14" height="4" fill="${series.color}"/><text x="${x + 20}" y="${y}" font-size="13" fill="#334155">${series.label}</text></g>`;
  }).join("\n");
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#f8fafc"/>
  <text x="${margin.left}" y="34" font-size="22" font-weight="700" fill="#0f172a">${opts.title}</text>
  <text x="${margin.left}" y="${height - 16}" font-size="14" fill="#475569">seconds from phase start</text>
  <text x="22" y="${margin.top + innerH / 2}" transform="rotate(-90 22 ${margin.top + innerH / 2})" font-size="14" fill="#475569">${opts.yLabel}</text>
  ${gridY.map((value) => `<line x1="${margin.left}" y1="${yScale(value).toFixed(1)}" x2="${margin.left + innerW}" y2="${yScale(value).toFixed(1)}" stroke="#e2e8f0"/><text x="${margin.left - 10}" y="${(yScale(value) + 4).toFixed(1)}" text-anchor="end" font-size="12" fill="#64748b">${value.toFixed(1)}</text>`).join("\n")}
  ${gridX.map((value) => `<line x1="${xScale(value).toFixed(1)}" y1="${margin.top}" x2="${xScale(value).toFixed(1)}" y2="${margin.top + innerH}" stroke="#eef2f7"/><text x="${xScale(value).toFixed(1)}" y="${margin.top + innerH + 22}" text-anchor="middle" font-size="12" fill="#64748b">${Math.round(value)}</text>`).join("\n")}
  <rect x="${margin.left}" y="${margin.top}" width="${innerW}" height="${innerH}" fill="none" stroke="#cbd5e1"/>
  ${lines}
  ${legend}
</svg>`;
  fs.writeFileSync(opts.outPath, svg);
}

function writeCsv(outPath: string, rows: Array<Record<string, unknown>>) {
  const headers = Array.from(rows.reduce((set, row) => {
    Object.keys(row).forEach((key) => set.add(key));
    return set;
  }, new Set<string>()));
  const esc = (value: unknown) => {
    if (value === null || value === undefined) return "";
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
  };
  fs.writeFileSync(outPath, `${headers.join(",")}\n${rows.map((row) => headers.map((header) => esc(row[header])).join(",")).join("\n")}\n`);
}

function printHelp() {
  console.log([
    "Usage:",
    "  pnpm --filter @openlabos/api power:matrix -- --device 192.168.50.122:5555 --duration 120 --interval 5 --fps-list 0,1,3,6,10,15",
    "",
    "Options:",
    "  --label <name>          Matrix label. Default: fps-matrix.",
    "  --duration <sec>        Seconds per phase. Default: 120.",
    "  --interval <sec>        Sample interval. Default: 5.",
    "  --cooldown <sec>        Stop-preview cooldown between phases. Default: 10.",
    "  --settle <sec>          Settle time after applying each phase. Default: 5.",
    "  --fps-list <list>       Comma-separated preview FPS values. 0 means preview off.",
    "  --stream-width <px>     Preview width. Default: 640.",
    "  --stream-height <px>    Preview height. Default: 480.",
    "  --quality <1-100>       MJPEG quality. Default: 60.",
    "  --resolution-list <list> Comma-separated WxH list, e.g. 320x240,640x480.",
    "  --quality-list <list>    Comma-separated JPEG qualities, e.g. 35,60.",
    "  --repeats <n>           Repeats per condition. Default: 1.",
    "  --randomize             Randomize condition order within each repeat.",
    "  --device <serial>       ADB serial.",
    "  --preview-url <url>     Operator preview health URL.",
    "  --from-dir <dir>        Rebuild CSV/SVG plots from an existing matrix directory.",
  ].join("\n"));
}

async function configureCase(testCase: MatrixCase, opts: {
  previewHealthUrl: string | null;
  settleMs: number;
}) {
  const settings = {
    stream_width: testCase.streamWidth,
    stream_height: testCase.streamHeight,
    stream_jpeg_quality: testCase.quality,
    stream_fps: Math.max(1, testCase.streamFps || 1),
    camera_keep_alive_ms: testCase.preview ? 30_000 : 3_000,
  };
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await updateLabosSettings(settings, 900);
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      await sleep(1000 * attempt);
    }
  }
  if (lastError) throw lastError;
  if (!testCase.preview) {
    await sendCameraCommand(CAMERA_ACTIONS.STOP_PREVIEW).catch(() => "");
    await sleep(opts.settleMs);
    return;
  }
  await ensurePortForward();
  await sendCameraCommand(CAMERA_ACTIONS.START_PREVIEW);
  await waitForPreviewFrames(opts.previewHealthUrl, Math.max(2500, opts.settleMs));
  await sleep(opts.settleMs);
}

function runFromJsonl(jsonlPath: string, index: number) {
  const samples = readSamples(jsonlPath);
  const rawLabel = path.basename(jsonlPath, ".jsonl").replace(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-/, "");
  const fpsMatch = rawLabel.match(/preview-(\d+)fps/);
  const testCase: MatrixCase = {
    label: rawLabel,
    preview: rawLabel !== "preview-off",
    streamFps: fpsMatch ? Number(fpsMatch[1]) : 0,
    streamWidth: 0,
    streamHeight: 0,
    quality: 0,
    repeat: 1,
  };
  return {
    testCase,
    outPath: jsonlPath,
    summary: summarizePowerSamples(testCase.label || `run-${index + 1}`, samples),
    samples,
  };
}

function writeMatrixArtifacts(opts: {
  label: string;
  outDir: string;
  runs: Array<{ testCase: MatrixCase; outPath: string; summary: PowerProfileSummary; samples: PowerSample[] }>;
  args: Record<string, unknown>;
}) {
  const { label, outDir, runs } = opts;
  const summaryRows = runs.map(({ testCase, summary, outPath }) => ({
    label: testCase.label,
    preview: testCase.preview,
    streamFps: testCase.streamFps,
    streamWidth: testCase.streamWidth,
    streamHeight: testCase.streamHeight,
    quality: testCase.quality,
    repeat: testCase.repeat,
    samples: summary.samples,
    durationSec: summary.durationSec,
    batteryDeltaPercent: summary.batteryDeltaPercent,
    wifiBytesPerSec: summary.wifiBytesPerSec,
    wifiRxBytes: summary.wifiRxBytes,
    wifiTxBytes: summary.wifiTxBytes,
    previewFrameDelta: summary.previewFrameDelta,
    previewBytesPerFrame: summary.previewBytesPerFrame,
    previewFramesPerWattHourProxy: summary.previewFramesPerWattHourProxy,
    avgCpuPercent: summary.avgCpuPercent,
    avgCoreCpuPercent: summary.avgCoreCpuPercent,
    avgCameraCpuPercent: summary.avgCameraCpuPercent,
    maxCpuTempC: summary.maxCpuTempC,
    chargeDeltaUah: summary.chargeDeltaUah,
    estimatedAverageCurrentMa: summary.estimatedAverageCurrentMa,
    jsonl: path.relative(process.cwd(), outPath),
  }));
  writeCsv(path.join(outDir, "summary.csv"), summaryRows);

  const sampleRows = runs.flatMap(({ testCase, samples }) => samples.map((sample, index) => {
    const prev = samples[index - 1];
    const dt = prev ? Math.max(1, (sample.atMs - prev.atMs) / 1000) : null;
    const wifiKBps = prev && sample.wifi.rxBytes !== null && sample.wifi.txBytes !== null && prev.wifi.rxBytes !== null && prev.wifi.txBytes !== null && dt
      ? ((sample.wifi.rxBytes - prev.wifi.rxBytes) + (sample.wifi.txBytes - prev.wifi.txBytes)) / 1024 / dt
      : null;
    return {
      label: testCase.label,
      streamFps: testCase.streamFps,
      streamWidth: testCase.streamWidth,
      streamHeight: testCase.streamHeight,
      quality: testCase.quality,
      repeat: testCase.repeat,
      sample: index,
      seconds: samples[0] ? (sample.atMs - samples[0].atMs) / 1000 : 0,
      at: sample.at,
      batteryLevel: sample.battery.level,
      batteryStatus: sample.battery.status,
      chargeUah: sample.battery.chargeCounterUah,
      batteryC: sample.thermal.batteryC ?? sample.battery.temperatureC,
      cpuC: sample.thermal.cpuC,
      skinC: sample.thermal.skinC,
      gpuC: sample.thermal.gpuC,
      totalCpu: sample.cpu.totalPercent,
      coreCpu: sample.cpu.labosCorePercent,
      cameraCpu: sample.cpu.labosCameraPercent,
      dashboardCpu: sample.cpu.dashboardPercent,
      adbdCpu: sample.cpu.adbdPercent,
      wifiKBps,
      previewFps: sample.preview?.fps ?? null,
      frameKB: sample.preview?.frameBytes ? sample.preview.frameBytes / 1024 : null,
      frameCount: sample.preview?.frameCount ?? null,
    };
  }));
  writeCsv(path.join(outDir, "samples.csv"), sampleRows);

  const seriesFor = (metric: string): PlotSeries[] => runs.map(({ testCase, samples }, index) => ({
    label: testCase.label,
    color: COLORS[index % COLORS.length],
    points: sampleMetric(samples, metric),
  }));
  const plots = [
    ["cpu-temp.svg", "CPU Thermal Over Time", "degrees C", "cpuC"],
    ["battery-temp.svg", "Battery Temperature Over Time", "degrees C", "batteryC"],
    ["core-cpu.svg", "OpenLabOS Core CPU Over Time", "percent", "coreCpu"],
    ["camera-cpu.svg", "OpenLabOS Camera CPU Over Time", "percent", "cameraCpu"],
    ["wifi-kbps.svg", "Wi-Fi Throughput Over Time", "KB/s", "wifiKBps"],
    ["preview-fps.svg", "Observed Preview FPS Over Time", "fps", "previewFps"],
    ["frame-kb.svg", "Preview Frame Size Over Time", "KB/frame", "frameKB"],
    ["charge-counter.svg", "Battery Charge Counter Over Time", "uAh", "chargeUah"],
  ] as const;
  for (const [file, title, yLabel, metric] of plots) {
    renderLinePlot({
      title,
      yLabel,
      series: seriesFor(metric),
      outPath: path.join(outDir, file),
    });
  }

  const aggregate = {
    label,
    outDir,
    generatedAt: new Date().toISOString(),
    args: opts.args,
    summaries: summaryRows,
    recomputed: runs.map(({ testCase, samples }) => summarizePowerSamples(testCase.label, samples)),
    plots: plots.map(([file]) => path.join(outDir, file)),
  };
  fs.writeFileSync(path.join(outDir, "matrix.summary.json"), JSON.stringify(aggregate, null, 2));
  return aggregate;
}

async function main() {
  if (hasArg("--help") || hasArg("-h")) {
    printHelp();
    return;
  }

  const device = argValue("--device");
  if (device) setTargetDevice(device);
  const label = safeName(argValue("--label") || "fps-matrix");
  const fromDir = argValue("--from-dir");
  if (fromDir) {
    const outDir = path.resolve(process.cwd(), fromDir);
    const files = fs.readdirSync(outDir)
      .filter((file) => file.endsWith(".jsonl"))
      .sort()
      .map((file) => path.join(outDir, file));
    const runs = files.map(runFromJsonl);
    const aggregate = writeMatrixArtifacts({
      label,
      outDir,
      runs,
      args: { fromDir },
    });
    console.log(JSON.stringify(aggregate, null, 2));
    return;
  }
  const durationSec = parseNumber("--duration", 120);
  const intervalSec = parseNumber("--interval", 5);
  const cooldownSec = parseNumber("--cooldown", 10);
  const settleSec = parseNumber("--settle", 5);
  const streamWidth = parseNumber("--stream-width", 640);
  const streamHeight = parseNumber("--stream-height", 480);
  const quality = parseNumber("--quality", 60);
  const resolutionList = parseResolutionList(argValue("--resolution-list"), [{ width: streamWidth, height: streamHeight }]);
  const qualityList = parseNumberList(argValue("--quality-list"), [quality]);
  const previewHealthUrl = argValue("--preview-url") || null;
  const fpsList = parseFpsList(argValue("--fps-list"));
  const repeats = Math.max(1, Math.floor(parseNumber("--repeats", 1)));
  const randomize = hasArg("--randomize");
  const started = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.resolve(process.cwd(), "data", "power-profiles", `${started}-${label}`);
  fs.mkdirSync(outDir, { recursive: true });
  const baseCases: MatrixCase[] = resolutionList.flatMap((resolution) =>
    qualityList.flatMap((qualityValue) =>
      fpsList.map((fps) => ({
        streamFps: fps,
        streamWidth: resolution.width,
        streamHeight: resolution.height,
        quality: qualityValue,
        repeat: 1,
        preview: fps > 0,
        label: fps > 0
          ? `${resolution.width}x${resolution.height}-q${qualityValue}-preview-${fps}fps`
          : `${resolution.width}x${resolution.height}-q${qualityValue}-preview-off`,
      })),
    ),
  );
  const cases: MatrixCase[] = [];
  for (let repeat = 1; repeat <= repeats; repeat += 1) {
    const repeatCases = baseCases.map((testCase) => ({
      ...testCase,
      repeat,
      label: repeats > 1 ? `${testCase.label}-r${repeat}` : testCase.label,
    }));
    cases.push(...(randomize ? shuffle(repeatCases) : repeatCases));
  }
  const runs: Array<{ testCase: MatrixCase; outPath: string; summary: PowerProfileSummary; samples: PowerSample[] }> = [];

  console.log(`[power-matrix] writing to ${outDir}`);
  console.log(`[power-matrix] cases: ${cases.map((item) => item.label).join(", ")}`);

  try {
    for (const testCase of cases) {
      console.log(`[power-matrix] configuring ${testCase.label}`);
      await configureCase(testCase, {
        previewHealthUrl,
        settleMs: settleSec * 1000,
      });
      console.log(`[power-matrix] sampling ${testCase.label} for ${durationSec}s`);
      const { outPath, summary } = await runPowerProfile({
        label: testCase.label,
        durationSec,
        intervalSec,
        outDir,
      });
      const samples = readSamples(outPath);
      runs.push({ testCase, outPath, summary, samples });
      console.log(JSON.stringify(summary));
      await sendCameraCommand(CAMERA_ACTIONS.STOP_PREVIEW).catch(() => "");
      if (cooldownSec > 0) await sleep(cooldownSec * 1000);
    }
  } finally {
    await sendCameraCommand(CAMERA_ACTIONS.STOP_PREVIEW).catch(() => "");
  }

  const aggregate = writeMatrixArtifacts({
    label,
    outDir,
    runs,
    args: { durationSec, intervalSec, cooldownSec, settleSec, streamWidth, streamHeight, quality, resolutionList, qualityList, fpsList, repeats, randomize },
  });
  console.log(JSON.stringify(aggregate, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
