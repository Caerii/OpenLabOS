package com.openlab.labos.sdk;

import android.util.Log;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * K900 binary protocol for communicating with the the HMD-class device MCU.
 *
 * Packet format:
 *   ## (2 bytes) + type (1 byte) + length (2 bytes, big-endian) + payload + $$ (2 bytes)
 *
 * Types:
 *   0x30 = JSON string command
 *   0x31 = Photo/image data
 *   0x32 = Video data
 *   0x33 = Music data
 *   0x34 = Audio data
 *   0x35 = Generic data
 *
 * JSON commands are wrapped as: {"C": <actual_json>}
 * Responses from MCU come as: {"R": <actual_json>}
 */
public class K900Protocol {

    private static final String TAG = "LabOS.K900Protocol";

    // Frame markers
    public static final byte START_1 = 0x23; // #
    public static final byte START_2 = 0x23; // #
    public static final byte END_1 = 0x24;   // $
    public static final byte END_2 = 0x24;   // $

    // Command types
    public static final byte TYPE_STRING = 0x30;
    public static final byte TYPE_PHOTO = 0x31;
    public static final byte TYPE_VIDEO = 0x32;
    public static final byte TYPE_MUSIC = 0x33;
    public static final byte TYPE_AUDIO = 0x34;
    public static final byte TYPE_DATA = 0x35;

    // Protocol overhead: ## (2) + type (1) + length (2) + $$ (2) = 7
    public static final int FRAME_OVERHEAD = 7;

    public static byte[] packFrame(byte[] payload, byte type) {
        int len = payload.length;
        byte[] frame = new byte[len + FRAME_OVERHEAD];

        frame[0] = START_1;
        frame[1] = START_2;
        frame[2] = type;
        frame[3] = (byte) ((len >> 8) & 0xFF);
        frame[4] = (byte) (len & 0xFF);
        System.arraycopy(payload, 0, frame, 5, len);
        frame[5 + len] = END_1;
        frame[6 + len] = END_2;

        return frame;
    }

    public static byte[] packJsonCommand(JSONObject json) {
        try {
            byte[] payload = json.toString().getBytes(StandardCharsets.UTF_8);
            return packFrame(payload, TYPE_STRING);
        } catch (Exception e) {
            Log.e(TAG, "Failed to pack JSON command", e);
            return null;
        }
    }

    public static byte[] packStringCommand(String command) {
        byte[] payload = command.getBytes(StandardCharsets.UTF_8);
        return packFrame(payload, TYPE_STRING);
    }

    public static boolean isValidFrame(byte[] data) {
        if (data == null || data.length < FRAME_OVERHEAD) return false;
        return data[0] == START_1 && data[1] == START_2
            && data[data.length - 2] == END_1 && data[data.length - 1] == END_2;
    }

    public static byte[] extractPayload(byte[] frame) {
        if (!isValidFrame(frame)) return null;

        int len = ((frame[3] & 0xFF) << 8) | (frame[4] & 0xFF);
        if (len + FRAME_OVERHEAD != frame.length) {
            Log.w(TAG, "Frame length mismatch: declared=" + len + " actual=" + (frame.length - FRAME_OVERHEAD));
            len = frame.length - FRAME_OVERHEAD;
        }

        byte[] payload = new byte[len];
        System.arraycopy(frame, 5, payload, 0, len);
        return payload;
    }

    public static byte getFrameType(byte[] frame) {
        if (frame == null || frame.length < 3) return 0;
        return frame[2];
    }

    public static JSONObject parseJsonPayload(byte[] payload) {
        if (payload == null || payload.length == 0) return null;

        try {
            String str = new String(payload, StandardCharsets.UTF_8).trim();
            if (!str.startsWith("{")) return null;

            JSONObject json = new JSONObject(str);

            if (json.has("R")) {
                Object r = json.get("R");
                if (r instanceof JSONObject) return (JSONObject) r;
            }

            if (json.has("C")) {
                Object c = json.get("C");
                if (c instanceof JSONObject) return (JSONObject) c;
            }

            return json;
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Message parser that handles fragmented/multi-message streams.
     */
    public static class MessageParser {
        private final ByteArrayOutputStream buffer = new ByteArrayOutputStream();

        public synchronized void addData(byte[] data, int length) {
            buffer.write(data, 0, length);
        }

        public synchronized List<byte[]> parseMessages() {
            List<byte[]> messages = new ArrayList<>();
            byte[] raw = buffer.toByteArray();
            buffer.reset();

            int i = 0;
            while (i < raw.length - 1) {
                if (raw[i] == START_1 && raw[i + 1] == START_2) {
                    if (i + FRAME_OVERHEAD > raw.length) {
                        buffer.write(raw, i, raw.length - i);
                        return messages;
                    }

                    int payloadLen = ((raw[i + 3] & 0xFF) << 8) | (raw[i + 4] & 0xFF);
                    int frameLen = payloadLen + FRAME_OVERHEAD;

                    if (i + frameLen > raw.length) {
                        buffer.write(raw, i, raw.length - i);
                        return messages;
                    }

                    if (raw[i + frameLen - 2] == END_1 && raw[i + frameLen - 1] == END_2) {
                        byte[] frame = new byte[frameLen];
                        System.arraycopy(raw, i, frame, 0, frameLen);
                        messages.add(frame);
                        i += frameLen;
                    } else {
                        i++;
                    }
                } else {
                    i++;
                }
            }

            if (i < raw.length) {
                buffer.write(raw, i, raw.length - i);
            }

            return messages;
        }

        public synchronized void reset() {
            buffer.reset();
        }
    }
}
