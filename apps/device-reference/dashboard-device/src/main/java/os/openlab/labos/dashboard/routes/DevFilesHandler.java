package com.openlab.labos.dashboard.routes;

import android.util.Log;

import com.openlab.labos.dashboard.DashboardRouter;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

import fi.iki.elonen.NanoHTTPD;
import fi.iki.elonen.NanoHTTPD.IHTTPSession;
import fi.iki.elonen.NanoHTTPD.Method;
import fi.iki.elonen.NanoHTTPD.Response;

/**
 * GET    /api/dev/files?path=/sdcard/     — List directory or download file.
 * PUT    /api/dev/files?path=/sdcard/x    — Upload/write file (body = content).
 * DELETE /api/dev/files?path=/sdcard/x    — Delete file or directory.
 *
 * This replaces `adb pull`, `adb push`, `adb shell ls` over WiFi.
 */
public class DevFilesHandler {

    private static final String TAG = "LabOS.DevFiles";
    private static final SimpleDateFormat DATE_FMT =
            new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US);

    public Response handle(String uri, Method method, IHTTPSession session) {
        // Binary file upload endpoint
        if (uri.equals("/api/dev/files/upload") && method == Method.POST) {
            return handleUpload(session);
        }

        String path = session.getParms().get("path");
        if (path == null || path.isEmpty()) {
            path = "/sdcard/";
        }

        try {
            switch (method) {
                case GET:
                    return handleGet(path);
                case PUT:
                case POST:
                    return handlePut(path, session);
                case DELETE:
                    return handleDelete(path);
                default:
                    return DashboardRouter.jsonError(400, "Use GET, PUT, POST, or DELETE");
            }
        } catch (Exception e) {
            return DashboardRouter.jsonError(500, e.getMessage());
        }
    }

    /**
     * GET: If path is a directory, list contents. If file, download it.
     */
    private Response handleGet(String path) throws Exception {
        File file = new File(path);
        if (!file.exists()) {
            return DashboardRouter.jsonError(404, "Not found: " + path);
        }

        if (file.isDirectory()) {
            return listDirectory(file);
        } else {
            return downloadFile(file);
        }
    }

    private Response listDirectory(File dir) throws Exception {
        JSONArray entries = new JSONArray();
        File[] files = dir.listFiles();
        if (files != null) {
            for (File f : files) {
                JSONObject entry = new JSONObject();
                entry.put("name", f.getName());
                entry.put("path", f.getAbsolutePath());
                entry.put("isDirectory", f.isDirectory());
                entry.put("size", f.isFile() ? f.length() : 0);
                entry.put("modified", DATE_FMT.format(new Date(f.lastModified())));
                entry.put("readable", f.canRead());
                entry.put("writable", f.canWrite());
                entries.put(entry);
            }
        }

        JSONObject result = new JSONObject();
        result.put("path", dir.getAbsolutePath());
        result.put("isDirectory", true);
        result.put("entries", entries);
        result.put("count", entries.length());
        return DashboardRouter.jsonOk(result.toString());
    }

    private Response downloadFile(File file) throws Exception {
        String mimeType = guessMimeType(file.getName());
        FileInputStream fis = new FileInputStream(file);
        Response response = NanoHTTPD.newFixedLengthResponse(
                Response.Status.OK, mimeType, fis, file.length());
        response.addHeader("Content-Disposition",
                "attachment; filename=\"" + file.getName() + "\"");
        return response;
    }

    /**
     * PUT: Write request body to file at path.
     */
    private Response handlePut(String path, IHTTPSession session) throws Exception {
        File file = new File(path);
        file.getParentFile().mkdirs();

        String body = DashboardRouter.readBody(session);
        if (body != null) {
            try (FileOutputStream fos = new FileOutputStream(file)) {
                fos.write(body.getBytes());
            }
        }

        JSONObject result = new JSONObject();
        result.put("success", true);
        result.put("path", file.getAbsolutePath());
        result.put("size", file.length());
        return DashboardRouter.jsonOk(result.toString());
    }

    /**
     * DELETE: Remove file or directory.
     */
    private Response handleDelete(String path) throws Exception {
        File file = new File(path);
        if (!file.exists()) {
            return DashboardRouter.jsonError(404, "Not found: " + path);
        }

        boolean deleted;
        if (file.isDirectory()) {
            deleted = deleteRecursive(file);
        } else {
            deleted = file.delete();
        }

        JSONObject result = new JSONObject();
        result.put("success", deleted);
        result.put("path", path);
        return DashboardRouter.jsonOk(result.toString());
    }

    private boolean deleteRecursive(File file) {
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) {
                for (File child : children) {
                    deleteRecursive(child);
                }
            }
        }
        return file.delete();
    }

    /**
     * Handle multipart file upload.
     * POST /api/dev/files/upload?path=/sdcard/dir/
     * Body: multipart/form-data with a "file" field.
     */
    private Response handleUpload(IHTTPSession session) {
        try {
            String destDir = session.getParms().get("path");
            if (destDir == null || destDir.isEmpty()) {
                destDir = "/sdcard/LabOS/uploads/";
            }

            // NanoHTTPD writes uploaded files to temp files and gives us the paths
            Map<String, String> files = new HashMap<>();
            session.parseBody(files);

            // Look for the uploaded file data
            String tmpPath = files.get("file");
            if (tmpPath == null) {
                // Try first available file
                for (Map.Entry<String, String> entry : files.entrySet()) {
                    tmpPath = entry.getValue();
                    break;
                }
            }

            if (tmpPath == null) {
                return DashboardRouter.jsonError(400, "No file in upload");
            }

            // Get original filename from params
            String filename = session.getParms().get("filename");
            if (filename == null || filename.isEmpty()) {
                filename = "upload_" + System.currentTimeMillis();
            }

            // Copy temp file to destination
            File dest = new File(destDir, filename);
            dest.getParentFile().mkdirs();

            File tmpFile = new File(tmpPath);
            try (FileInputStream fis = new FileInputStream(tmpFile);
                 FileOutputStream fos = new FileOutputStream(dest)) {
                byte[] buf = new byte[8192];
                int n;
                while ((n = fis.read(buf)) != -1) {
                    fos.write(buf, 0, n);
                }
            }

            JSONObject result = new JSONObject();
            result.put("success", true);
            result.put("path", dest.getAbsolutePath());
            result.put("size", dest.length());
            result.put("filename", filename);
            return DashboardRouter.jsonOk(result.toString());
        } catch (Exception e) {
            Log.e(TAG, "Upload failed", e);
            return DashboardRouter.jsonError(500, "Upload failed: " + e.getMessage());
        }
    }

    private String guessMimeType(String name) {
        String lower = name.toLowerCase();
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".mp4")) return "video/mp4";
        if (lower.endsWith(".mp3")) return "audio/mpeg";
        if (lower.endsWith(".wav")) return "audio/wav";
        if (lower.endsWith(".json")) return "application/json";
        if (lower.endsWith(".csv")) return "text/csv";
        if (lower.endsWith(".txt") || lower.endsWith(".log")) return "text/plain";
        if (lower.endsWith(".xml")) return "application/xml";
        if (lower.endsWith(".apk")) return "application/vnd.android.package-archive";
        return "application/octet-stream";
    }
}
