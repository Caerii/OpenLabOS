package com.openlab.labos.core;

import android.os.Parcel;
import android.os.Parcelable;

/**
 * Parcelable wrapper for MCU events received via AIDL callbacks.
 * Contains the event type and raw JSON data from the MCU.
 */
public class McuEvent implements Parcelable {

    public static final String TYPE_BUTTON = "button";
    public static final String TYPE_BATTERY = "battery";
    public static final String TYPE_IMU = "imu";
    public static final String TYPE_GESTURE = "gesture";
    public static final String TYPE_RAW = "raw";
    public static final String TYPE_CONNECTED = "connected";
    public static final String TYPE_DISCONNECTED = "disconnected";

    private final String type;
    private final String jsonData;

    public McuEvent(String type, String jsonData) {
        this.type = type;
        this.jsonData = jsonData;
    }

    protected McuEvent(Parcel in) {
        type = in.readString();
        jsonData = in.readString();
    }

    public String getType() {
        return type;
    }

    public String getJsonData() {
        return jsonData;
    }

    @Override
    public void writeToParcel(Parcel dest, int flags) {
        dest.writeString(type);
        dest.writeString(jsonData);
    }

    @Override
    public int describeContents() {
        return 0;
    }

    public static final Creator<McuEvent> CREATOR = new Creator<McuEvent>() {
        @Override
        public McuEvent createFromParcel(Parcel in) {
            return new McuEvent(in);
        }

        @Override
        public McuEvent[] newArray(int size) {
            return new McuEvent[size];
        }
    };
}
