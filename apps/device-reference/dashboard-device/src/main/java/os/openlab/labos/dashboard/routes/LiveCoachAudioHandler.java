package com.openlab.labos.dashboard.routes;

import com.openlab.labos.core.ILabOsCore;
import com.openlab.labos.core.McuCommand;
import com.openlab.labos.dashboard.DashboardRouter;
import com.openlab.labos.dashboard.DashboardService;
import com.openlab.labos.dashboard.livecoach.LiveCoachMicBridge;

import org.json.JSONObject;

import android.util.Log;

import fi.iki.elonen.NanoHTTPD.IHTTPSession;
import fi.iki.elonen.NanoHTTPD.Method;
import fi.iki.elonen.NanoHTTPD.Response;

/**
 * POST /api/live-coach/audio/start  body: {"wsUrl":"ws://host:3847/api/live-coach/ws","playback":true}
 * POST /api/live-coach/audio/stop
 * GET  /api/live-coach/audio/status
 */
public class LiveCoachAudioHandler {
    private static final String TAG = "LabOS.LiveCoachAudio";

    private final DashboardService mService;
    private final LiveCoachMicBridge mBridge;
    private boolean mSpeakerPathOpenedByLiveCoach = false;

    public LiveCoachAudioHandler(DashboardService service) {
        mService = service;
        mBridge = new LiveCoachMicBridge(this::setLiveCoachSpeakerPath);
    }

    public Response handle(String uri, Method method, IHTTPSession session) {
        try {
            if (uri.equals("/api/live-coach/audio/status") && method == Method.GET) {
                return DashboardRouter.jsonOk(mBridge.status().toString());
            }

            if (uri.equals("/api/live-coach/audio/start") && method == Method.POST) {
                String body = DashboardRouter.readBody(session);
                JSONObject json = (body != null && !body.isEmpty()) ? new JSONObject(body) : new JSONObject();
                String wsUrl = json.optString("wsUrl", "");
                boolean playback = json.optBoolean("playback", true);
                if (wsUrl.isEmpty()) {
                    return DashboardRouter.jsonError(400, "Missing 'wsUrl' field");
                }
                enableHardwareMic();
                if (!mBridge.start(wsUrl, playback)) {
                    releaseLiveCoachSpeakerPath();
                    return DashboardRouter.jsonError(500, mBridge.status().optString("lastError", "Failed to start"));
                }
                JSONObject result = mBridge.status();
                result.put("success", true);
                result.put("speakerPathRequested", playback);
                result.put("speakerPathOwnedByLiveCoach", mSpeakerPathOpenedByLiveCoach);
                return DashboardRouter.jsonOk(result.toString());
            }

            if (uri.equals("/api/live-coach/audio/stop") && method == Method.POST) {
                mBridge.stop();
                releaseLiveCoachSpeakerPath();
                JSONObject result = mBridge.status();
                result.put("success", true);
                result.put("speakerPathRequested", false);
                result.put("speakerPathOwnedByLiveCoach", mSpeakerPathOpenedByLiveCoach);
                return DashboardRouter.jsonOk(result.toString());
            }

            return DashboardRouter.jsonError(404, "Unknown live coach audio endpoint");
        } catch (Exception e) {
            return DashboardRouter.jsonError(500, e.getMessage());
        }
    }

    private void enableHardwareMic() {
        try {
            ILabOsCore core = mService.getCoreService();
            if (core == null) return;
            JSONObject body = new JSONObject();
            body.put("enable", 1);
            JSONObject cmd = new JSONObject();
            cmd.put("C", "cs_mic");
            cmd.put("V", 1);
            cmd.put("B", body.toString());
            core.sendMcuCommand(new McuCommand(cmd.toString()));
        } catch (Exception ignored) {}
    }

    private synchronized void setLiveCoachSpeakerPath(boolean open) {
        if (open) {
            if (setI2SSpeakerPath(true)) {
                mSpeakerPathOpenedByLiveCoach = true;
            }
            return;
        }
        releaseLiveCoachSpeakerPath();
    }

    private synchronized void releaseLiveCoachSpeakerPath() {
        if (!mSpeakerPathOpenedByLiveCoach) return;
        if (setI2SSpeakerPath(false)) {
            mSpeakerPathOpenedByLiveCoach = false;
        }
    }

    private boolean setI2SSpeakerPath(boolean enabled) {
        try {
            ILabOsCore core = mService.getCoreService();
            if (core == null) return false;
            JSONObject cmd = new JSONObject();
            cmd.put("C", enabled ? "mh_starti2s" : "mh_stopi2s");
            cmd.put("V", 1);
            cmd.put("B", "{}");
            boolean sent = core.sendMcuCommand(new McuCommand(cmd.toString()));
            Log.i(TAG, "I2S speaker path " + (enabled ? "open" : "close") + " sent=" + sent);
            return sent;
        } catch (Exception e) {
            Log.w(TAG, "Failed to set I2S speaker path", e);
            return false;
        }
    }
}
