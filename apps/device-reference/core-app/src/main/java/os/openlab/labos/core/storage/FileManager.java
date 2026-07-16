package com.openlab.labos.core.storage;

import android.os.Environment;
import android.os.StatFs;
import android.util.Log;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Comparator;
import java.util.Date;
import java.util.Locale;

/**
 * Manages LabOS media storage on the glasses.
 *
 * All media is stored under /sdcard/LabOS/ with the following structure:
 *   media/photos/   — captured JPEG photos
 *   media/videos/   — recorded MP4 videos
 *   media/streams/  — stream recordings
 *   data/           — generic app data
 *   logs/           — runtime logs
 *
 * Provides path-traversal protection: all mutating operations verify that
 * the target path is under the LabOS base directory.
 */
public class FileManager {

    private static final String TAG = "LabOS.FileManager";

    private static final String BASE_DIR = "/sdcard/LabOS";
    private static final String DIR_PHOTOS = "media/photos";
    private static final String DIR_VIDEOS = "media/videos";
    private static final String DIR_STREAMS = "media/streams";
    private static final String DIR_DATA = "data";
    private static final String DIR_LOGS = "logs";

    private final File mBaseDir;
    private final File mPhotoDir;
    private final File mVideoDir;
    private final File mStreamDir;
    private final File mDataDir;
    private final File mLogDir;

    public FileManager() {
        mBaseDir = new File(BASE_DIR);
        mPhotoDir = new File(mBaseDir, DIR_PHOTOS);
        mVideoDir = new File(mBaseDir, DIR_VIDEOS);
        mStreamDir = new File(mBaseDir, DIR_STREAMS);
        mDataDir = new File(mBaseDir, DIR_DATA);
        mLogDir = new File(mBaseDir, DIR_LOGS);

        ensureDirectories();
    }

    /**
     * Create all required directories if they do not already exist.
     * Called automatically on construction and can be called explicitly
     * after external storage events.
     */
    public void ensureDirectories() {
        File[] dirs = { mPhotoDir, mVideoDir, mStreamDir, mDataDir, mLogDir };
        for (File dir : dirs) {
            if (!dir.exists()) {
                if (dir.mkdirs()) {
                    Log.i(TAG, "Created directory: " + dir.getAbsolutePath());
                } else {
                    Log.e(TAG, "Failed to create directory: " + dir.getAbsolutePath());
                }
            }
        }
    }

    // ──────────────────────────────────────────────
    // Save operations
    // ──────────────────────────────────────────────

    /**
     * Save a JPEG photo to the photos directory.
     *
     * @param jpeg Raw JPEG byte data.
     * @return Absolute path to the saved file, or null on failure.
     */
    public String savePhoto(byte[] jpeg) {
        if (jpeg == null || jpeg.length == 0) {
            Log.w(TAG, "savePhoto called with empty data");
            return null;
        }

        String filename = "IMG_" + timestamp() + ".jpg";
        File file = new File(mPhotoDir, filename);

        try (FileOutputStream fos = new FileOutputStream(file)) {
            fos.write(jpeg);
            Log.i(TAG, "Photo saved: " + file.getAbsolutePath() + " (" + jpeg.length + " bytes)");
            return file.getAbsolutePath();
        } catch (IOException e) {
            Log.e(TAG, "Failed to save photo", e);
            return null;
        }
    }

    /**
     * Move a video file from a temporary location to the videos directory.
     *
     * @param tempPath Absolute path to the temporary video file.
     * @return Absolute path to the final location, or null on failure.
     */
    public String saveVideo(String tempPath) {
        if (tempPath == null) {
            Log.w(TAG, "saveVideo called with null path");
            return null;
        }

        File source = new File(tempPath);
        if (!source.exists()) {
            Log.w(TAG, "Source video does not exist: " + tempPath);
            return null;
        }

        String extension = getExtension(source.getName(), ".mp4");
        String filename = "VID_" + timestamp() + extension;
        File dest = new File(mVideoDir, filename);

        try {
            Files.move(source.toPath(), dest.toPath(), StandardCopyOption.REPLACE_EXISTING);
            Log.i(TAG, "Video saved: " + dest.getAbsolutePath());
            return dest.getAbsolutePath();
        } catch (IOException e) {
            Log.e(TAG, "Failed to move video", e);
            return null;
        }
    }

    // ──────────────────────────────────────────────
    // Listing
    // ──────────────────────────────────────────────

    /**
     * List all photos sorted by date (newest first).
     *
     * @return Array of photo File objects, or empty array.
     */
    public File[] listPhotos() {
        return listSorted(mPhotoDir);
    }

    /**
     * List all videos sorted by date (newest first).
     *
     * @return Array of video File objects, or empty array.
     */
    public File[] listVideos() {
        return listSorted(mVideoDir);
    }

    /**
     * List all stream recordings sorted by date (newest first).
     *
     * @return Array of stream File objects, or empty array.
     */
    public File[] listStreams() {
        return listSorted(mStreamDir);
    }

    /**
     * @return Number of photos in the photo directory.
     */
    public int getPhotoCount() {
        return countFiles(mPhotoDir);
    }

    /**
     * @return Number of videos in the video directory.
     */
    public int getVideoCount() {
        return countFiles(mVideoDir);
    }

    // ──────────────────────────────────────────────
    // Deletion
    // ──────────────────────────────────────────────

    /**
     * Delete a file, with path traversal protection.
     * The file must reside under the LabOS base directory.
     *
     * @param path Absolute path to the file.
     * @return true if deleted, false if the path is invalid or deletion failed.
     */
    public boolean deleteFile(String path) {
        if (path == null) return false;

        File file = new File(path);
        try {
            String canonical = file.getCanonicalPath();
            String baseCanonical = mBaseDir.getCanonicalPath();
            if (!canonical.startsWith(baseCanonical + File.separator)) {
                Log.w(TAG, "Path traversal blocked: " + path);
                return false;
            }
        } catch (IOException e) {
            Log.e(TAG, "Failed to resolve canonical path", e);
            return false;
        }

        if (!file.exists()) {
            Log.w(TAG, "File not found for deletion: " + path);
            return false;
        }

        boolean deleted = file.delete();
        if (deleted) {
            Log.i(TAG, "Deleted: " + path);
        } else {
            Log.w(TAG, "Failed to delete: " + path);
        }
        return deleted;
    }

    // ──────────────────────────────────────────────
    // Storage info
    // ──────────────────────────────────────────────

    /**
     * Calculate total bytes used by all LabOS media and data.
     *
     * @return Size in bytes.
     */
    public long getTotalStorageUsed() {
        return directorySize(mBaseDir);
    }

    /**
     * Get available free space on the storage volume.
     *
     * @return Free bytes available.
     */
    public long getAvailableStorage() {
        try {
            StatFs stat = new StatFs(mBaseDir.getAbsolutePath());
            return stat.getAvailableBytes();
        } catch (Exception e) {
            Log.e(TAG, "Failed to query available storage", e);
            return -1;
        }
    }

    // ──────────────────────────────────────────────
    // Directory accessors
    // ──────────────────────────────────────────────

    public File getBaseDir() { return mBaseDir; }
    public File getPhotoDir() { return mPhotoDir; }
    public File getVideoDir() { return mVideoDir; }
    public File getStreamDir() { return mStreamDir; }
    public File getDataDir() { return mDataDir; }
    public File getLogDir() { return mLogDir; }

    // ──────────────────────────────────────────────
    // Internal helpers
    // ──────────────────────────────────────────────

    private File[] listSorted(File dir) {
        File[] files = dir.listFiles(File::isFile);
        if (files == null || files.length == 0) return new File[0];
        Arrays.sort(files, Comparator.comparingLong(File::lastModified).reversed());
        return files;
    }

    private int countFiles(File dir) {
        File[] files = dir.listFiles(File::isFile);
        return files != null ? files.length : 0;
    }

    private long directorySize(File dir) {
        long size = 0;
        if (dir.exists() && dir.isDirectory()) {
            File[] files = dir.listFiles();
            if (files != null) {
                for (File f : files) {
                    if (f.isFile()) {
                        size += f.length();
                    } else if (f.isDirectory()) {
                        size += directorySize(f);
                    }
                }
            }
        }
        return size;
    }

    private String timestamp() {
        return new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date());
    }

    private String getExtension(String filename, String defaultExt) {
        int dot = filename.lastIndexOf('.');
        if (dot >= 0) {
            return filename.substring(dot);
        }
        return defaultExt;
    }
}
