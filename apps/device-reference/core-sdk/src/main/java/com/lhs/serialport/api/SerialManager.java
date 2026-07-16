package com.lhs.serialport.api;

import android.util.Log;

import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;

/**
 * Singleton manager for serial port connections.
 * Ported from K900 SDK with external dependency removed.
 */
public class SerialManager {
    private static final String TAG = "SerialManager";

    private final ArrayList<SerialPort> mSerialList = new ArrayList<>();
    private static SerialManager instance;

    private SerialManager() {}

    public static synchronized SerialManager getInstance() {
        if (instance == null) {
            instance = new SerialManager();
        }
        return instance;
    }

    public boolean openSerial(String devPath, int baudrate) {
        if (devPath == null) return false;

        for (SerialPort sp : mSerialList) {
            if (devPath.equals(sp.getDevPath())) {
                return true; // Already open
            }
        }

        SerialPort sp = new SerialPort(devPath, baudrate, 0);
        boolean success = sp.openSerial();
        Log.d(TAG, "openSerial " + devPath + " success=" + success);

        if (success) mSerialList.add(sp);
        return success;
    }

    public InputStream getInputStream(String devPath) {
        if (devPath == null) return null;
        for (SerialPort sp : mSerialList) {
            if (devPath.equals(sp.getDevPath())) return sp.getInputStream();
        }
        return null;
    }

    public OutputStream getOutputStream(String devPath) {
        if (devPath == null) return null;
        for (SerialPort sp : mSerialList) {
            if (devPath.equals(sp.getDevPath())) return sp.getOutputStream();
        }
        return null;
    }

    public void closeSerial(String devPath) {
        if (devPath == null) return;
        for (SerialPort sp : mSerialList) {
            if (devPath.equals(sp.getDevPath())) {
                sp.closeSerial();
                mSerialList.remove(sp);
                return;
            }
        }
    }
}
