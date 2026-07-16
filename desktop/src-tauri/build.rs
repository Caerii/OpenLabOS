fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "desktop_health",
            "adb_devices",
            "adb_devices_status",
            "adb_battery",
            "adb_battery_status",
            "adb_thermal",
            "adb_thermal_status",
            "adb_connect",
            "adb_native_video_inventory",
            "adb_import_native_videos",
            "adb_power_sample",
            "labos_api_status",
            "labos_api_start",
            "labos_api_stop",
        ]),
    ))
    .expect("failed to build Tauri desktop command manifest");
}
