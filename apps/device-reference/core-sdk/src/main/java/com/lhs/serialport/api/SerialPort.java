package com.lhs.serialport.api;

import android.util.Log;

import java.io.FileDescriptor;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Serial port JNI wrapper from K900 SDK.
 * Opens a hardware UART port via native liblhsserial.so.
 */
public class SerialPort {
    private static final String TAG = "SerialPort";

    private String mDevPath;
    private int mBaudrate;
    private int mFlag;
    private FileDescriptor mFd;
    private FileInputStream mFileInputStream;
    private FileOutputStream mFileOutputStream;

    public SerialPort(String devPath, int baudrate, int flags) {
        mDevPath = devPath;
        mBaudrate = baudrate;
        mFlag = flags;
    }

    public boolean openSerial() {
        if (mFd != null) {
            closeSerial();
            mFd = null;
        }

        mFd = open(mDevPath, mBaudrate, mFlag);
        Log.d(TAG, "openSerial mFd=" + mFd);
        if (mFd == null) {
            return false;
        }
        mFileInputStream = new FileInputStream(mFd);
        mFileOutputStream = new FileOutputStream(mFd);
        return true;
    }

    public String getDevPath() { return mDevPath; }
    public int getBaudrate() { return mBaudrate; }
    public InputStream getInputStream() { return mFileInputStream; }
    public OutputStream getOutputStream() { return mFileOutputStream; }

    public void closeSerial() {
        close();
    }

    // JNI
    private native FileDescriptor open(String devPath, int baudrate, int flags);
    private native void setBlock(boolean bBlock);
    private native void close();

    static {
        try {
            System.loadLibrary("lhsserial");
        } catch (UnsatisfiedLinkError e) {
            Log.e(TAG, "Failed to load lhsserial library", e);
        }
    }
}
