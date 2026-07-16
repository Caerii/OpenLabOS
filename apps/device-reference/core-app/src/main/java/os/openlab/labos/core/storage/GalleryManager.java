package com.openlab.labos.core.storage;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;

/**
 * Gallery facade over FileManager.
 *
 * Provides JSON-friendly status queries suitable for IPC with the
 * LabOS dashboard, plus optional thumbnail generation for photos.
 */
public class GalleryManager {

    private static final String TAG = "LabOS.Gallery";

    private static final int THUMBNAIL_WIDTH = 320;
    private static final int THUMBNAIL_HEIGHT = 240;
    private static final int THUMBNAIL_QUALITY = 80;
    private static final String THUMBNAIL_DIR = "thumbnails";

    private final FileManager mFileManager;
    private final File mThumbnailDir;

    public GalleryManager(FileManager fileManager) {
        mFileManager = fileManager;
        mThumbnailDir = new File(mFileManager.getBaseDir(), THUMBNAIL_DIR);
        if (!mThumbnailDir.exists()) {
            mThumbnailDir.mkdirs();
        }
    }

    // ──────────────────────────────────────────────
    // Status
    // ──────────────────────────────────────────────

    /**
     * Get gallery status as a JSONObject.
     *
     * Returned keys:
     *   photoCount       — number of photos
     *   videoCount       — number of videos
     *   storageUsedBytes — total bytes used by LabOS
     *   availableBytes   — free space on device
     *
     * @return JSONObject with gallery metadata.
     */
    public JSONObject getStatus() {
        JSONObject status = new JSONObject();
        try {
            status.put("photoCount", mFileManager.getPhotoCount());
            status.put("videoCount", mFileManager.getVideoCount());
            status.put("storageUsedBytes", mFileManager.getTotalStorageUsed());
            status.put("availableBytes", mFileManager.getAvailableStorage());
        } catch (JSONException e) {
            Log.e(TAG, "Failed to build status JSON", e);
        }
        return status;
    }

    // ──────────────────────────────────────────────
    // Recent media
    // ──────────────────────────────────────────────

    /**
     * Get the most recent photos as a JSONArray of paths.
     *
     * @param count Maximum number of entries to return.
     * @return JSONArray of absolute file path strings (newest first).
     */
    public JSONArray getRecentPhotos(int count) {
        return recentPaths(mFileManager.listPhotos(), count);
    }

    /**
     * Get the most recent videos as a JSONArray of paths.
     *
     * @param count Maximum number of entries to return.
     * @return JSONArray of absolute file path strings (newest first).
     */
    public JSONArray getRecentVideos(int count) {
        return recentPaths(mFileManager.listVideos(), count);
    }

    // ──────────────────────────────────────────────
    // Thumbnails
    // ──────────────────────────────────────────────

    /**
     * Generate a downscaled JPEG thumbnail for the given photo.
     *
     * Returns an existing thumbnail if one has already been generated and is
     * still up to date. Returns null if the source does not exist or
     * decoding fails.
     *
     * @param photoPath Absolute path to the full-size JPEG.
     * @return File pointing to the thumbnail, or null on failure.
     */
    public File getThumbnail(String photoPath) {
        if (photoPath == null) return null;

        File source = new File(photoPath);
        if (!source.exists()) {
            Log.w(TAG, "Thumbnail source not found: " + photoPath);
            return null;
        }

        String thumbName = source.getName().replace(".jpg", "_thumb.jpg")
                                           .replace(".jpeg", "_thumb.jpg");
        File thumbFile = new File(mThumbnailDir, thumbName);

        // Return cached thumbnail if it is newer than the source
        if (thumbFile.exists() && thumbFile.lastModified() >= source.lastModified()) {
            return thumbFile;
        }

        return createThumbnail(source, thumbFile);
    }

    // ──────────────────────────────────────────────
    // Internal
    // ──────────────────────────────────────────────

    private JSONArray recentPaths(File[] files, int count) {
        JSONArray arr = new JSONArray();
        if (files == null) return arr;
        int limit = Math.min(files.length, Math.max(count, 0));
        for (int i = 0; i < limit; i++) {
            arr.put(files[i].getAbsolutePath());
        }
        return arr;
    }

    private File createThumbnail(File source, File dest) {
        try {
            // Decode bounds only
            BitmapFactory.Options opts = new BitmapFactory.Options();
            opts.inJustDecodeBounds = true;
            BitmapFactory.decodeFile(source.getAbsolutePath(), opts);

            if (opts.outWidth <= 0 || opts.outHeight <= 0) {
                Log.e(TAG, "Cannot decode image dimensions: " + source.getName());
                return null;
            }

            // Calculate sample size
            opts.inSampleSize = calculateSampleSize(opts, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);
            opts.inJustDecodeBounds = false;

            Bitmap bitmap = BitmapFactory.decodeFile(source.getAbsolutePath(), opts);
            if (bitmap == null) {
                Log.e(TAG, "Failed to decode image: " + source.getName());
                return null;
            }

            Bitmap thumb;
            try {
                thumb = Bitmap.createScaledBitmap(bitmap, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, true);
            } catch (OutOfMemoryError oom) {
                Log.e(TAG, "OOM creating thumbnail for " + source.getName());
                bitmap.recycle();
                return null;
            }

            try (FileOutputStream fos = new FileOutputStream(dest)) {
                thumb.compress(Bitmap.CompressFormat.JPEG, THUMBNAIL_QUALITY, fos);
            }

            if (bitmap != thumb) bitmap.recycle();
            thumb.recycle();

            Log.d(TAG, "Thumbnail created: " + dest.getName() + " (" + dest.length() + " bytes)");
            return dest;

        } catch (IOException e) {
            Log.e(TAG, "Thumbnail creation failed for " + source.getName(), e);
            return null;
        }
    }

    private static int calculateSampleSize(BitmapFactory.Options opts,
            int reqWidth, int reqHeight) {
        int height = opts.outHeight;
        int width = opts.outWidth;
        int sample = 1;

        if (height > reqHeight || width > reqWidth) {
            int halfH = height / 2;
            int halfW = width / 2;
            while ((halfH / sample) >= reqHeight && (halfW / sample) >= reqWidth) {
                sample *= 2;
            }
        }
        return sample;
    }
}
