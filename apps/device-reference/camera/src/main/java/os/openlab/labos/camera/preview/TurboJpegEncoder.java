package com.openlab.labos.camera.preview;

/**
 * libjpeg-turbo JNI encoder scaffold.
 *
 * When {@code labos_turbojpeg} native library is built (NDK), NV21 compress runs on NEON
 * at ~2× the throughput of {@code YuvImage.compressToJpeg}. Until then, returns null and
 * {@link com.openlab.labos.camera.CameraCapture} falls back to software JPEG.
 */
public final class TurboJpegEncoder {

    private static final boolean NATIVE;

    static {
        boolean loaded = false;
        try {
            System.loadLibrary("labos_turbojpeg");
            loaded = true;
        } catch (UnsatisfiedLinkError ignored) {
        }
        NATIVE = loaded;
    }

    private TurboJpegEncoder() {
    }

    public static boolean isAvailable() {
        return NATIVE;
    }

    private static native byte[] compressNv21(byte[] nv21, int width, int height, int quality);

    public static byte[] encodeNv21(byte[] nv21, int width, int height, int quality) {
        if (!NATIVE || nv21 == null) return null;
        try {
            return compressNv21(nv21, width, height, quality);
        } catch (Exception ignored) {
            return null;
        }
    }
}
