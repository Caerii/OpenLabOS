package com.openlab.labos.core.network;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.wifi.ScanResult;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import com.openlab.labos.core.hardware.SysControl;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.util.Collections;
import java.util.List;

/**
 * High-level WiFi controller for LabOS Glass.
 *
 * Wraps {@link SysControl} (K900 ODM broadcast commands) together with the
 * standard Android {@link WifiManager} to provide a unified API for scanning,
 * connecting, disconnecting, and managing hotspot state on the the HMD-class device
 * hardware.
 *
 * <p>Because the K900's Android 11 build restricts direct WifiManager
 * mutation for non-system apps, most write operations go through
 * {@link SysControl} which sends privileged broadcasts to the ODM's
 * SystemUI receiver.</p>
 */
public class WifiController {

    private static final String TAG = "LabOS.WifiController";

    private final Context mContext;
    private final WifiManager mWifiManager;
    private final Handler mHandler;

    private BroadcastReceiver mScanReceiver;
    private ScanCallback mPendingScanCallback;

    /**
     * Callback for asynchronous WiFi scan results.
     */
    public interface ScanCallback {
        /**
         * Called when scan results are available.
         *
         * @param networks JSONArray of network objects with ssid, bssid, level, frequency, capabilities
         */
        void onScanResults(JSONArray networks);

        /** Called when the scan fails. */
        void onScanFailed(String reason);
    }

    /**
     * Create a WifiController.
     *
     * @param context application or service context
     */
    public WifiController(Context context) {
        mContext = context.getApplicationContext();
        mWifiManager = (WifiManager) mContext.getSystemService(Context.WIFI_SERVICE);
        mHandler = new Handler(Looper.getMainLooper());
        Log.d(TAG, "WifiController initialized");
    }

    // ──────────────────────────────────────────────
    // Status
    // ──────────────────────────────────────────────

    /**
     * Get the current WiFi connection status.
     *
     * @return JSONObject with keys: connected, ssid, ip, rssi, link_speed, frequency.
     *         If not connected, only "connected":false is guaranteed.
     */
    public JSONObject getWifiStatus() {
        JSONObject status = new JSONObject();
        try {
            if (mWifiManager == null) {
                status.put("connected", false);
                status.put("error", "WifiManager unavailable");
                return status;
            }

            WifiInfo info = mWifiManager.getConnectionInfo();
            ConnectivityManager cm = (ConnectivityManager)
                    mContext.getSystemService(Context.CONNECTIVITY_SERVICE);
            NetworkInfo netInfo = cm != null ? cm.getActiveNetworkInfo() : null;

            boolean connected = netInfo != null && netInfo.isConnected()
                    && netInfo.getType() == ConnectivityManager.TYPE_WIFI;

            status.put("connected", connected);

            if (connected && info != null) {
                String ssid = info.getSSID();
                // WifiInfo wraps SSID in quotes
                if (ssid != null && ssid.startsWith("\"") && ssid.endsWith("\"")) {
                    ssid = ssid.substring(1, ssid.length() - 1);
                }
                status.put("ssid", ssid);
                status.put("ip", intToIp(info.getIpAddress()));
                status.put("rssi", info.getRssi());
                status.put("link_speed", info.getLinkSpeed());
                status.put("frequency", info.getFrequency());
            }

            Log.d(TAG, "getWifiStatus: " + status);
        } catch (JSONException e) {
            Log.e(TAG, "Error building WiFi status", e);
        }
        return status;
    }

    // ──────────────────────────────────────────────
    // Scan
    // ──────────────────────────────────────────────

    /**
     * Trigger a WiFi scan and deliver results asynchronously.
     *
     * @param callback receives the scan results or an error
     */
    public void scanWifi(ScanCallback callback) {
        Log.d(TAG, "Starting WiFi scan");

        if (mWifiManager == null) {
            if (callback != null) callback.onScanFailed("WifiManager unavailable");
            return;
        }

        // Ensure WiFi is enabled before scanning
        if (!mWifiManager.isWifiEnabled()) {
            Log.d(TAG, "WiFi disabled, enabling via SysControl before scan");
            SysControl.enableWifi(mContext);
        }

        // Unregister any previous scan receiver
        unregisterScanReceiver();

        mPendingScanCallback = callback;

        mScanReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (WifiManager.SCAN_RESULTS_AVAILABLE_ACTION.equals(intent.getAction())) {
                    unregisterScanReceiver();
                    deliverScanResults();
                }
            }
        };

        mContext.registerReceiver(mScanReceiver,
                new IntentFilter(WifiManager.SCAN_RESULTS_AVAILABLE_ACTION));

        boolean started = mWifiManager.startScan();
        if (!started) {
            Log.w(TAG, "startScan() returned false, delivering cached results");
            // Fall through to deliver whatever cached results are available
            mHandler.postDelayed(this::deliverScanResults, 500);
        }

        // Safety timeout so callback is never orphaned
        mHandler.postDelayed(() -> {
            if (mPendingScanCallback != null) {
                Log.w(TAG, "Scan timeout, delivering cached results");
                deliverScanResults();
            }
        }, 10_000);
    }

    /**
     * Return the most recent scan results synchronously as a JSONArray.
     *
     * @return JSONArray of network objects, or empty array if unavailable
     */
    public JSONArray getLastScanResults() {
        return buildScanResultsArray();
    }

    // ──────────────────────────────────────────────
    // Connect / Disconnect / Forget
    // ──────────────────────────────────────────────

    /**
     * Connect to a WiFi network via the K900 ODM broadcast.
     *
     * @param ssid     network SSID (must not be null or empty)
     * @param password network password (null or empty for open networks)
     */
    public void connectToWifi(String ssid, String password) {
        if (ssid == null || ssid.isEmpty()) {
            Log.w(TAG, "connectToWifi called with null/empty SSID, ignoring");
            return;
        }
        Log.i(TAG, "Connecting to WiFi: " + ssid);
        SysControl.connectToWifi(mContext, ssid, password);
    }

    /**
     * Disconnect from the current WiFi network.
     */
    public void disconnectWifi() {
        Log.i(TAG, "Disconnecting from WiFi");
        SysControl.disconnectFromWifi(mContext);
    }

    /**
     * Forget (remove) a saved WiFi network.
     * Uses WifiManager to remove the saved configuration for the given SSID.
     *
     * @param ssid the SSID of the network to forget
     */
    @SuppressWarnings("deprecation")
    public void forgetWifi(String ssid) {
        if (ssid == null || ssid.isEmpty()) {
            Log.w(TAG, "forgetWifi called with null/empty SSID, ignoring");
            return;
        }

        Log.i(TAG, "Forgetting WiFi network: " + ssid);

        if (mWifiManager == null) {
            Log.e(TAG, "WifiManager unavailable, cannot forget network");
            return;
        }

        String quotedSsid = "\"" + ssid + "\"";
        List<android.net.wifi.WifiConfiguration> configs = mWifiManager.getConfiguredNetworks();
        if (configs != null) {
            for (android.net.wifi.WifiConfiguration config : configs) {
                if (config.SSID != null && config.SSID.equals(quotedSsid)) {
                    boolean removed = mWifiManager.removeNetwork(config.networkId);
                    Log.d(TAG, "Removed network " + ssid + " (netId=" + config.networkId
                            + "): " + removed);
                    mWifiManager.saveConfiguration();
                    return;
                }
            }
        }

        Log.w(TAG, "Network not found in saved configurations: " + ssid);
    }

    // ──────────────────────────────────────────────
    // Hotspot
    // ──────────────────────────────────────────────

    /**
     * Enable the WiFi hotspot with the given credentials.
     *
     * @param ssid     hotspot SSID (null to use the device default)
     * @param password hotspot password (must be >= 8 chars, or null for default)
     */
    public void enableHotspot(String ssid, String password) {
        Log.i(TAG, "Enabling hotspot: " + (ssid != null ? ssid : "(default)"));
        SysControl.openHotspot(mContext, ssid, password);
    }

    /**
     * Disable the WiFi hotspot.
     */
    public void disableHotspot() {
        Log.i(TAG, "Disabling hotspot");
        SysControl.closeHotspot(mContext);
    }

    // ──────────────────────────────────────────────
    // IP address
    // ──────────────────────────────────────────────

    /**
     * Get the device's local IPv4 address on any active interface.
     * Prefers the wlan0 interface but will return any non-loopback address.
     *
     * @return IP address string (e.g. "192.168.1.42"), or null if unavailable
     */
    public String getLocalIpAddress() {
        try {
            List<NetworkInterface> interfaces =
                    Collections.list(NetworkInterface.getNetworkInterfaces());

            // First pass: look for wlan0
            for (NetworkInterface iface : interfaces) {
                if ("wlan0".equals(iface.getName())) {
                    for (InetAddress addr : Collections.list(iface.getInetAddresses())) {
                        if (!addr.isLoopbackAddress() && addr instanceof Inet4Address) {
                            String ip = addr.getHostAddress();
                            Log.d(TAG, "getLocalIpAddress (wlan0): " + ip);
                            return ip;
                        }
                    }
                }
            }

            // Second pass: any non-loopback IPv4
            for (NetworkInterface iface : interfaces) {
                for (InetAddress addr : Collections.list(iface.getInetAddresses())) {
                    if (!addr.isLoopbackAddress() && addr instanceof Inet4Address) {
                        String ip = addr.getHostAddress();
                        Log.d(TAG, "getLocalIpAddress (" + iface.getName() + "): " + ip);
                        return ip;
                    }
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Error getting local IP address", e);
        }

        Log.w(TAG, "No local IP address found");
        return null;
    }

    // ──────────────────────────────────────────────
    // Lifecycle
    // ──────────────────────────────────────────────

    /**
     * Release resources. Call when the owning component is destroyed.
     */
    public void shutdown() {
        Log.d(TAG, "Shutting down WifiController");
        unregisterScanReceiver();
        mPendingScanCallback = null;
    }

    // ──────────────────────────────────────────────
    // Internal helpers
    // ──────────────────────────────────────────────

    private void deliverScanResults() {
        ScanCallback cb = mPendingScanCallback;
        mPendingScanCallback = null;
        unregisterScanReceiver();

        if (cb != null) {
            JSONArray results = buildScanResultsArray();
            Log.d(TAG, "Delivering " + results.length() + " scan results");
            cb.onScanResults(results);
        }
    }

    private JSONArray buildScanResultsArray() {
        JSONArray array = new JSONArray();

        if (mWifiManager == null) return array;

        List<ScanResult> results = mWifiManager.getScanResults();
        if (results == null) return array;

        for (ScanResult sr : results) {
            try {
                JSONObject net = new JSONObject();
                net.put("ssid", sr.SSID);
                net.put("bssid", sr.BSSID);
                net.put("level", sr.level);
                net.put("frequency", sr.frequency);
                net.put("capabilities", sr.capabilities);
                array.put(net);
            } catch (JSONException e) {
                Log.e(TAG, "Error building scan result entry", e);
            }
        }

        return array;
    }

    private void unregisterScanReceiver() {
        if (mScanReceiver != null) {
            try {
                mContext.unregisterReceiver(mScanReceiver);
            } catch (IllegalArgumentException e) {
                // Already unregistered
            }
            mScanReceiver = null;
        }
    }

    /**
     * Convert an integer IP address (from WifiInfo) to a dotted-quad string.
     */
    private static String intToIp(int ip) {
        return (ip & 0xFF) + "."
                + ((ip >> 8) & 0xFF) + "."
                + ((ip >> 16) & 0xFF) + "."
                + ((ip >> 24) & 0xFF);
    }
}
