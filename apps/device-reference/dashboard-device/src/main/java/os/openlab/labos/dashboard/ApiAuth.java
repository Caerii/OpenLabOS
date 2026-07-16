package com.openlab.labos.dashboard;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import java.security.SecureRandom;

/**
 * Token-based authentication for the dashboard HTTP API.
 *
 * On first boot, generates a random 32-char hex token and stores it in SharedPreferences.
 * All API requests must include the header: X-LabOS-Token: <token>
 *
 * Exceptions (no auth required):
 * - GET / and /health (health check)
 * - GET /api/auth/token (returns the token — only accessible from localhost/ADB)
 * - OPTIONS (CORS preflight)
 *
 * To get the token for initial pairing:
 *   adb shell am broadcast -a com.openlab.labos.dashboard.GET_TOKEN
 *   — or —
 *   curl http://127.0.0.1:8080/api/auth/token  (via ADB port forward)
 */
public class ApiAuth {

    private static final String TAG = "LabOS.ApiAuth";
    private static final String PREFS_NAME = "labos_dashboard_auth";
    private static final String KEY_TOKEN = "api_token";
    private static final String HEADER_NAME = "X-LabOS-Token";
    private static final int TOKEN_LENGTH = 32;

    private final String mToken;

    public ApiAuth(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String stored = prefs.getString(KEY_TOKEN, null);
        if (stored == null || stored.isEmpty()) {
            stored = generateToken();
            prefs.edit().putString(KEY_TOKEN, stored).apply();
            Log.i(TAG, "Generated new API token");
        }
        mToken = stored;
        Log.i(TAG, "API token loaded");
    }

    /** Get the current API token. */
    public String getToken() {
        return mToken;
    }

    /** Get the expected header name. */
    public String getHeaderName() {
        return HEADER_NAME;
    }

    /**
     * Check if a request is authenticated.
     * @param tokenHeader value of X-LabOS-Token header (may be null)
     * @return true if valid
     */
    public boolean isAuthenticated(String tokenHeader) {
        return mToken.equals(tokenHeader);
    }

    /**
     * Check if a URI is exempt from authentication.
     */
    public boolean isExempt(String uri, String method, String remoteIp) {
        // Health checks
        if ("/".equals(uri) || "/health".equals(uri)) return true;
        // Token retrieval (localhost only — enforced at network level via ADB forward)
        if ("/api/auth/token".equals(uri)) return isLoopback(remoteIp);
        // CORS preflight
        if ("OPTIONS".equalsIgnoreCase(method)) return true;
        return false;
    }

    private boolean isLoopback(String remoteIp) {
        if (remoteIp == null) return false;
        return "127.0.0.1".equals(remoteIp)
                || "::1".equals(remoteIp)
                || "0:0:0:0:0:0:0:1".equals(remoteIp)
                || "localhost".equalsIgnoreCase(remoteIp);
    }

    /**
     * Regenerate the token (e.g., if compromised).
     */
    public String regenerateToken(Context context) {
        String newToken = generateToken();
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putString(KEY_TOKEN, newToken).apply();
        Log.i(TAG, "Token regenerated");
        return newToken;
    }

    private String generateToken() {
        SecureRandom random = new SecureRandom();
        StringBuilder sb = new StringBuilder(TOKEN_LENGTH);
        String chars = "abcdefghijklmnopqrstuvwxyz0123456789";
        for (int i = 0; i < TOKEN_LENGTH; i++) {
            sb.append(chars.charAt(random.nextInt(chars.length())));
        }
        return sb.toString();
    }
}
