package com.openlab.labos.sdk;

import android.os.Environment;
import android.util.Log;

import java.io.File;
import java.io.FileWriter;
import java.io.PrintWriter;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Uncaught exception handler that logs crashes to /sdcard/LabOS/.crashes/
 *
 * Each module should call CrashReporter.install("module-name") in its
 * Application.onCreate() or Service.onCreate().
 *
 * Crash files are named: {module}_{timestamp}.txt
 * Format: timestamp, module, thread, stack trace
 *
 * The dashboard-device module exposes these via GET /api/dev/crashes
 */
public class CrashReporter implements Thread.UncaughtExceptionHandler {

    private static final String TAG = "LabOS.CrashReporter";
    private static final String CRASH_DIR = "LabOS/.crashes";

    private final String mModuleName;
    private final Thread.UncaughtExceptionHandler mDefaultHandler;

    private CrashReporter(String moduleName, Thread.UncaughtExceptionHandler defaultHandler) {
        mModuleName = moduleName;
        mDefaultHandler = defaultHandler;
    }

    /**
     * Install the crash reporter for this module.
     * Call once in Service.onCreate() or Application.onCreate().
     *
     * @param moduleName e.g. "core-app", "camera", "dashboard", "devtools"
     */
    public static void install(String moduleName) {
        Thread.UncaughtExceptionHandler existing = Thread.getDefaultUncaughtExceptionHandler();
        // Don't double-install
        if (existing instanceof CrashReporter) return;
        Thread.setDefaultUncaughtExceptionHandler(new CrashReporter(moduleName, existing));
        Log.i(TAG, "Crash reporter installed for: " + moduleName);
    }

    @Override
    public void uncaughtException(Thread thread, Throwable throwable) {
        try {
            writeCrashLog(thread, throwable);
        } catch (Exception e) {
            Log.e(TAG, "Failed to write crash log", e);
        }

        // Forward to default handler (usually Android's, which shows the crash dialog)
        if (mDefaultHandler != null) {
            mDefaultHandler.uncaughtException(thread, throwable);
        }
    }

    private void writeCrashLog(Thread thread, Throwable throwable) {
        File dir = new File(Environment.getExternalStorageDirectory(), CRASH_DIR);
        dir.mkdirs();

        String timestamp = new SimpleDateFormat("yyyyMMdd_HHmmss_SSS", Locale.US).format(new Date());
        File file = new File(dir, mModuleName + "_" + timestamp + ".txt");

        try (PrintWriter pw = new PrintWriter(new FileWriter(file))) {
            pw.println("=== LabOS Crash Report ===");
            pw.println("Module:    " + mModuleName);
            pw.println("Timestamp: " + new SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS", Locale.US).format(new Date()));
            pw.println("Thread:    " + thread.getName() + " (id=" + thread.getId() + ")");
            pw.println("Model:     " + android.os.Build.MODEL);
            pw.println("Android:   " + android.os.Build.VERSION.RELEASE);
            pw.println("SDK:       " + android.os.Build.VERSION.SDK_INT);
            pw.println();
            pw.println("=== Stack Trace ===");
            throwable.printStackTrace(pw);
            pw.println();

            // Print causes
            Throwable cause = throwable.getCause();
            while (cause != null) {
                pw.println("=== Caused By ===");
                cause.printStackTrace(pw);
                pw.println();
                cause = cause.getCause();
            }

            // Memory info
            Runtime rt = Runtime.getRuntime();
            pw.println("=== Memory ===");
            pw.println("Max:   " + (rt.maxMemory() / 1024 / 1024) + " MB");
            pw.println("Total: " + (rt.totalMemory() / 1024 / 1024) + " MB");
            pw.println("Free:  " + (rt.freeMemory() / 1024 / 1024) + " MB");

            Log.e(TAG, "Crash log written: " + file.getAbsolutePath());
        } catch (Exception e) {
            Log.e(TAG, "Failed to write crash log file", e);
        }
    }

    /**
     * Get the crash directory path.
     */
    public static File getCrashDir() {
        return new File(Environment.getExternalStorageDirectory(), CRASH_DIR);
    }
}
