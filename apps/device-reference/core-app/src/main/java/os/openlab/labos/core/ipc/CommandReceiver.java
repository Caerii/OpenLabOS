package com.openlab.labos.core.ipc;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

import org.json.JSONObject;

import java.util.concurrent.CopyOnWriteArraySet;

/**
 * BroadcastReceiver that exposes LabOS functionality to third-party APKs
 * running on the the HMD-class device glasses via Android Intents.
 *
 * <h3>Supported actions</h3>
 * <ul>
 *   <li>{@link #ACTION_SEND_COMMAND} - accept a JSON command string (extra "command")
 *       and route it to the registered {@link CommandListener}.</li>
 *   <li>{@link #ACTION_REGISTER_LISTENER} - register a package to receive
 *       command responses (extra "packageName").</li>
 *   <li>{@link #ACTION_UNREGISTER_LISTENER} - unregister a package (extra "packageName").</li>
 * </ul>
 *
 * <h3>Usage (adb example)</h3>
 * <pre>
 *   adb shell am broadcast -a com.openlab.labos.ACTION_SEND_COMMAND \
 *     --es command '{"type":"ping","id":12345}'
 * </pre>
 *
 * <p>Responses are sent back to registered listeners via
 * {@link #broadcastResponse(Context, String, JSONObject)}.</p>
 */
public class CommandReceiver extends BroadcastReceiver {

    private static final String TAG = "LabOS.CommandReceiver";

    // Intent actions
    public static final String ACTION_SEND_COMMAND =
            "com.openlab.labos.ACTION_SEND_COMMAND";
    public static final String ACTION_REGISTER_LISTENER =
            "com.openlab.labos.ACTION_REGISTER_LISTENER";
    public static final String ACTION_UNREGISTER_LISTENER =
            "com.openlab.labos.ACTION_UNREGISTER_LISTENER";
    public static final String ACTION_COMMAND_RESPONSE =
            "com.openlab.labos.ACTION_COMMAND_RESPONSE";
    /** Clears device owner status so the package can be uninstalled for migration */
    public static final String ACTION_CLEAR_DEVICE_OWNER =
            "com.openlab.labos.core.ACTION_CLEAR_DEVICE_OWNER";

    // Intent extras
    public static final String EXTRA_COMMAND = "command";
    public static final String EXTRA_PACKAGE_NAME = "packageName";
    public static final String EXTRA_RESPONSE = "response";

    /** Thread-safe set of package names that should receive responses. */
    private static final CopyOnWriteArraySet<String> sRegisteredPackages =
            new CopyOnWriteArraySet<>();

    /**
     * The service or component that wants to handle incoming commands should
     * register itself through {@link #setCommandListener(CommandListener)}.
     */
    private static volatile CommandListener sCommandListener;

    // ──────────────────────────────────────────────
    // CommandListener interface
    // ──────────────────────────────────────────────

    /**
     * Interface for the host service to receive parsed commands from
     * third-party apps.
     */
    public interface CommandListener {
        /**
         * Called when a valid JSON command is received from a third-party app.
         *
         * @param command      the parsed JSON command
         * @param senderPackage the package name of the sender (may be null)
         */
        void onCommandReceived(JSONObject command, String senderPackage);
    }

    // ──────────────────────────────────────────────
    // Static configuration
    // ──────────────────────────────────────────────

    /**
     * Set the listener that will receive incoming commands.
     * Typically called once from the LabOS service on creation.
     *
     * @param listener the command handler, or null to clear
     */
    public static void setCommandListener(CommandListener listener) {
        sCommandListener = listener;
        Log.d(TAG, "CommandListener " + (listener != null ? "set" : "cleared"));
    }

    /**
     * Get the number of registered response listeners (for diagnostics).
     *
     * @return count of registered packages
     */
    public static int getRegisteredListenerCount() {
        return sRegisteredPackages.size();
    }

    // ──────────────────────────────────────────────
    // BroadcastReceiver
    // ──────────────────────────────────────────────

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) {
            return;
        }

        String action = intent.getAction();
        Log.d(TAG, "Received intent: " + action);

        switch (action) {
            case ACTION_SEND_COMMAND:
                handleSendCommand(intent);
                break;
            case ACTION_REGISTER_LISTENER:
                handleRegisterListener(intent);
                break;
            case ACTION_UNREGISTER_LISTENER:
                handleUnregisterListener(intent);
                break;
            case ACTION_CLEAR_DEVICE_OWNER:
                handleClearDeviceOwner(context);
                break;
            default:
                Log.w(TAG, "Unknown action: " + action);
                break;
        }
    }

    // ──────────────────────────────────────────────
    // Action handlers
    // ──────────────────────────────────────────────

    private void handleSendCommand(Intent intent) {
        String jsonString = intent.getStringExtra(EXTRA_COMMAND);
        if (jsonString == null || jsonString.isEmpty()) {
            Log.w(TAG, "ACTION_SEND_COMMAND missing '" + EXTRA_COMMAND + "' extra");
            return;
        }

        CommandListener listener = sCommandListener;
        if (listener == null) {
            Log.e(TAG, "No CommandListener registered, cannot process command");
            return;
        }

        try {
            JSONObject json = new JSONObject(jsonString);
            String senderPackage = getSenderPackage(intent);
            Log.i(TAG, "Processing command from " + (senderPackage != null ? senderPackage : "unknown")
                    + ": " + json.optString("type", "(no type)"));
            listener.onCommandReceived(json, senderPackage);
        } catch (Exception e) {
            Log.e(TAG, "Failed to parse/process command JSON", e);
        }
    }

    private void handleRegisterListener(Intent intent) {
        String packageName = intent.getStringExtra(EXTRA_PACKAGE_NAME);
        if (packageName == null || packageName.isEmpty()) {
            Log.w(TAG, "ACTION_REGISTER_LISTENER missing '" + EXTRA_PACKAGE_NAME + "' extra");
            return;
        }
        sRegisteredPackages.add(packageName);
        Log.i(TAG, "Registered listener: " + packageName
                + " (total: " + sRegisteredPackages.size() + ")");
    }

    /**
     * Clear device owner status so core-app can be uninstalled for migration.
     * Usage: adb shell am broadcast -a com.openlab.labos.core.ACTION_CLEAR_DEVICE_OWNER \
     *          -n com.openlab.labos.core/.ipc.CommandReceiver
     */
    private void handleClearDeviceOwner(Context context) {
        try {
            com.openlab.labos.core.DeviceController controller =
                new com.openlab.labos.core.DeviceController(context);
            controller.clearDeviceOwner();
            Log.i(TAG, "Device owner cleared via broadcast");
        } catch (Exception e) {
            Log.e(TAG, "Failed to clear device owner", e);
        }
    }

    private void handleUnregisterListener(Intent intent) {
        String packageName = intent.getStringExtra(EXTRA_PACKAGE_NAME);
        if (packageName == null || packageName.isEmpty()) {
            Log.w(TAG, "ACTION_UNREGISTER_LISTENER missing '" + EXTRA_PACKAGE_NAME + "' extra");
            return;
        }
        boolean removed = sRegisteredPackages.remove(packageName);
        if (removed) {
            Log.i(TAG, "Unregistered listener: " + packageName
                    + " (total: " + sRegisteredPackages.size() + ")");
        } else {
            Log.w(TAG, "Package was not registered: " + packageName);
        }
    }

    // ──────────────────────────────────────────────
    // Response broadcasting
    // ──────────────────────────────────────────────

    /**
     * Send a JSON response to a specific registered listener package.
     *
     * @param context     application context
     * @param packageName target package that should receive the response
     * @param response    the JSON response payload
     */
    public static void broadcastResponse(Context context, String packageName, JSONObject response) {
        if (context == null || response == null) {
            Log.w(TAG, "Cannot broadcast response: null context or response");
            return;
        }
        if (packageName == null || packageName.isEmpty()) {
            Log.w(TAG, "Cannot broadcast response: null/empty packageName");
            return;
        }

        try {
            Intent intent = new Intent(ACTION_COMMAND_RESPONSE);
            intent.setPackage(packageName);
            intent.putExtra(EXTRA_RESPONSE, response.toString());
            context.sendBroadcast(intent);
            Log.d(TAG, "Sent response to: " + packageName);
        } catch (Exception e) {
            Log.e(TAG, "Failed to broadcast response to " + packageName, e);
        }
    }

    /**
     * Send a JSON response to all registered listener packages.
     *
     * @param context  application context
     * @param response the JSON response payload
     */
    public static void broadcastResponseToAll(Context context, JSONObject response) {
        if (sRegisteredPackages.isEmpty()) {
            return;
        }
        if (context == null || response == null) {
            Log.w(TAG, "Cannot broadcast response: null context or response");
            return;
        }

        Log.d(TAG, "Broadcasting response to " + sRegisteredPackages.size() + " listener(s)");

        for (String packageName : sRegisteredPackages) {
            broadcastResponse(context, packageName, response);
        }
    }

    // ──────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────

    /**
     * Attempt to extract the sender's package name from the intent.
     * On Android 11+ with the K900 build this may return null for
     * implicit broadcasts.
     */
    private String getSenderPackage(Intent intent) {
        // getPackage() returns the target, not the sender.
        // The sender's identity is generally not available on implicit
        // broadcasts, but we include the extra for cooperative callers.
        String explicit = intent.getStringExtra(EXTRA_PACKAGE_NAME);
        if (explicit != null && !explicit.isEmpty()) {
            return explicit;
        }
        return null;
    }
}
