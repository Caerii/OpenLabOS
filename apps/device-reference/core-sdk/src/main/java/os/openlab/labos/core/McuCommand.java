package com.openlab.labos.core;

import android.os.Parcel;
import android.os.Parcelable;

/**
 * Parcelable wrapper for MCU commands sent via AIDL.
 * Contains the raw JSON string to be transmitted to the MCU.
 */
public class McuCommand implements Parcelable {

    private final String jsonPayload;

    public McuCommand(String jsonPayload) {
        this.jsonPayload = jsonPayload;
    }

    protected McuCommand(Parcel in) {
        jsonPayload = in.readString();
    }

    public String getJsonPayload() {
        return jsonPayload;
    }

    @Override
    public void writeToParcel(Parcel dest, int flags) {
        dest.writeString(jsonPayload);
    }

    @Override
    public int describeContents() {
        return 0;
    }

    public static final Creator<McuCommand> CREATOR = new Creator<McuCommand>() {
        @Override
        public McuCommand createFromParcel(Parcel in) {
            return new McuCommand(in);
        }

        @Override
        public McuCommand[] newArray(int size) {
            return new McuCommand[size];
        }
    };
}
