package com.openlab.labos.dashboard.routes;

import android.util.Log;

import com.openlab.labos.dashboard.DashboardRouter;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

import fi.iki.elonen.NanoHTTPD.IHTTPSession;
import fi.iki.elonen.NanoHTTPD.Method;
import fi.iki.elonen.NanoHTTPD.Response;

/**
 * GET    /api/dev/packages           — List installed packages.
 * POST   /api/dev/packages/install   — Install APK (body: {"path": "/sdcard/app.apk"}).
 * POST   /api/dev/packages/uninstall — Uninstall package (body: {"package": "com.example"}).
 *
 * This replaces `adb install`, `adb uninstall`, `pm list packages` over WiFi.
 */
public class DevPackagesHandler {

    private static final String TAG = "LabOS.DevPackages";

    public Response handle(String uri, Method method, IHTTPSession session) {
        try {
            if (uri.equals("/api/dev/packages") && method == Method.GET) {
                return listPackages(session);
            }
            if (uri.equals("/api/dev/packages/install") && method == Method.POST) {
                return installPackage(session);
            }
            if (uri.equals("/api/dev/packages/install-url") && method == Method.POST) {
                return installFromUrl(session);
            }
            if (uri.equals("/api/dev/packages/uninstall") && method == Method.POST) {
                return uninstallPackage(session);
            }
            return DashboardRouter.jsonError(404, "Unknown packages endpoint");
        } catch (Exception e) {
            return DashboardRouter.jsonError(500, e.getMessage());
        }
    }

    private Response listPackages(IHTTPSession session) throws Exception {
        String filter = session.getParms().get("filter");
        boolean thirdPartyOnly = "true".equals(session.getParms().get("thirdParty"));

        String cmd = "pm list packages" + (thirdPartyOnly ? " -3" : "");
        Process process = Runtime.getRuntime().exec(new String[]{"sh", "-c", cmd});

        JSONArray packages = new JSONArray();
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(process.getInputStream()))) {
            String line;
            while ((line = reader.readLine()) != null) {
                String pkg = line.replace("package:", "").trim();
                if (filter == null || pkg.contains(filter)) {
                    packages.put(pkg);
                }
            }
        }
        process.waitFor();

        JSONObject result = new JSONObject();
        result.put("packages", packages);
        result.put("count", packages.length());
        return DashboardRouter.jsonOk(result.toString());
    }

    private Response installPackage(IHTTPSession session) throws Exception {
        String body = DashboardRouter.readBody(session);
        if (body == null) {
            return DashboardRouter.jsonError(400, "Empty body");
        }

        JSONObject json = new JSONObject(body);
        String apkPath = json.optString("path", "");
        if (apkPath.isEmpty()) {
            return DashboardRouter.jsonError(400, "Missing 'path' field");
        }

        // Use pm install for device-owner level installs
        String cmd = "pm install -r -t " + apkPath;
        Log.i(TAG, "Installing: " + cmd);

        Process process = Runtime.getRuntime().exec(new String[]{"sh", "-c", cmd});
        StringBuilder output = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(process.getInputStream()))) {
            String line;
            while ((line = reader.readLine()) != null) {
                output.append(line).append("\n");
            }
        }
        StringBuilder errorOutput = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(process.getErrorStream()))) {
            String line;
            while ((line = reader.readLine()) != null) {
                errorOutput.append(line).append("\n");
            }
        }
        int exitCode = process.waitFor();

        JSONObject result = new JSONObject();
        result.put("exitCode", exitCode);
        result.put("success", exitCode == 0);
        result.put("output", output.toString().trim());
        result.put("error", errorOutput.toString().trim());
        result.put("path", apkPath);
        return DashboardRouter.jsonOk(result.toString());
    }

    private Response uninstallPackage(IHTTPSession session) throws Exception {
        String body = DashboardRouter.readBody(session);
        if (body == null) {
            return DashboardRouter.jsonError(400, "Empty body");
        }

        JSONObject json = new JSONObject(body);
        String packageName = json.optString("package", "");
        if (packageName.isEmpty()) {
            return DashboardRouter.jsonError(400, "Missing 'package' field");
        }

        String cmd = "pm uninstall " + packageName;
        Log.i(TAG, "Uninstalling: " + cmd);

        Process process = Runtime.getRuntime().exec(new String[]{"sh", "-c", cmd});
        StringBuilder output = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(process.getInputStream()))) {
            String line;
            while ((line = reader.readLine()) != null) {
                output.append(line).append("\n");
            }
        }
        int exitCode = process.waitFor();

        JSONObject result = new JSONObject();
        result.put("exitCode", exitCode);
        result.put("success", exitCode == 0);
        result.put("output", output.toString().trim());
        result.put("package", packageName);
        return DashboardRouter.jsonOk(result.toString());
    }

    /**
     * Download APK from URL and install it.
     * POST /api/dev/packages/install-url
     * Body: {"url": "https://..../app.apk"}
     */
    private Response installFromUrl(IHTTPSession session) throws Exception {
        String body = DashboardRouter.readBody(session);
        if (body == null) {
            return DashboardRouter.jsonError(400, "Empty body");
        }

        JSONObject json = new JSONObject(body);
        String urlStr = json.optString("url", "");
        if (urlStr.isEmpty()) {
            return DashboardRouter.jsonError(400, "Missing 'url' field");
        }

        Log.i(TAG, "Downloading APK from: " + urlStr);

        // Download to temp location
        File downloadDir = new File("/sdcard/LabOS/.ota/");
        downloadDir.mkdirs();
        String filename = "ota_" + System.currentTimeMillis() + ".apk";
        File apkFile = new File(downloadDir, filename);

        try {
            URL url = new URL(urlStr);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(30000);
            conn.setReadTimeout(60000);
            conn.setRequestMethod("GET");

            int responseCode = conn.getResponseCode();
            if (responseCode != 200) {
                return DashboardRouter.jsonError(502, "Download failed: HTTP " + responseCode);
            }

            long totalSize = conn.getContentLength();
            long downloaded = 0;

            try (InputStream is = conn.getInputStream();
                 FileOutputStream fos = new FileOutputStream(apkFile)) {
                byte[] buf = new byte[8192];
                int n;
                while ((n = is.read(buf)) != -1) {
                    fos.write(buf, 0, n);
                    downloaded += n;
                }
            }

            Log.i(TAG, "Downloaded " + downloaded + " bytes to " + apkFile.getAbsolutePath());

            // Install the downloaded APK
            String cmd = "pm install -r -t " + apkFile.getAbsolutePath();
            Process process = Runtime.getRuntime().exec(new String[]{"sh", "-c", cmd});

            StringBuilder output = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(process.getInputStream()))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    output.append(line).append("\n");
                }
            }
            StringBuilder errorOutput = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(process.getErrorStream()))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    errorOutput.append(line).append("\n");
                }
            }
            int exitCode = process.waitFor();

            // Clean up APK file
            apkFile.delete();

            JSONObject result = new JSONObject();
            result.put("exitCode", exitCode);
            result.put("success", exitCode == 0);
            result.put("output", output.toString().trim());
            result.put("error", errorOutput.toString().trim());
            result.put("url", urlStr);
            result.put("downloadedBytes", downloaded);
            return DashboardRouter.jsonOk(result.toString());

        } catch (Exception e) {
            if (apkFile.exists()) apkFile.delete();
            throw e;
        }
    }
}
