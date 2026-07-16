mod adb;
mod api_process;
mod artifacts;
mod models;
mod native_video;

use api_process::{LabosApiProcess, DEFAULT_LABOS_API_PORT};
use models::{
    AdbDevicesStatus, BatteryStatus, CommandOutput, DesktopHealth, LabosApiStatus,
    NativeVideoImportRequest, NativeVideoImportResult, NativeVideoInventory, PowerSampleRequest,
    PowerSampleResult, ThermalStatus,
};
use tauri::Manager;

#[tauri::command]
fn desktop_health() -> DesktopHealth {
    let adb = adb::command(&["version"]);
    DesktopHealth {
        app: "OpenLabOS Desktop",
        native_shell: true,
        adb_available: adb.ok,
        adb_version: adb.ok.then_some(adb.stdout),
        default_adb_target: adb::default_adb_target(),
        labos_api_running: api_process::is_local_api_running(DEFAULT_LABOS_API_PORT),
    }
}

#[tauri::command]
fn adb_devices() -> CommandOutput {
    adb::command(&["devices", "-l"])
}

#[tauri::command]
fn adb_devices_status() -> AdbDevicesStatus {
    adb::devices_status()
}

#[tauri::command]
fn adb_battery(serial: Option<String>) -> CommandOutput {
    adb::shell(serial, "dumpsys battery")
}

#[tauri::command]
fn adb_battery_status(serial: Option<String>) -> BatteryStatus {
    adb::battery_status(serial)
}

#[tauri::command]
fn adb_thermal(serial: Option<String>) -> CommandOutput {
    adb::thermal_raw(serial)
}

#[tauri::command]
fn adb_thermal_status(serial: Option<String>) -> ThermalStatus {
    adb::thermal_status(serial)
}

#[tauri::command]
fn adb_connect(target: String) -> CommandOutput {
    adb::connect(target)
}

#[tauri::command]
fn adb_native_video_inventory(serial: Option<String>) -> NativeVideoInventory {
    adb::native_video_inventory(serial)
}

#[tauri::command]
fn adb_import_native_videos(
    app: tauri::AppHandle,
    request: NativeVideoImportRequest,
) -> NativeVideoImportResult {
    native_video::import(&app, request)
}

#[tauri::command]
fn adb_power_sample(app: tauri::AppHandle, request: PowerSampleRequest) -> PowerSampleResult {
    let mut result = adb::power_sample(request);
    if let Err(error) = artifacts::save_power_sample(&app, &mut result) {
        result.ok = false;
        result.errors.push(error);
    }
    result
}

#[tauri::command]
fn labos_api_status(state: tauri::State<LabosApiProcess>, port: Option<u16>) -> LabosApiStatus {
    api_process::status(&state, api_process::port_or_default(port))
}

#[tauri::command]
fn labos_api_start(state: tauri::State<LabosApiProcess>, port: Option<u16>) -> LabosApiStatus {
    api_process::start(&state, api_process::port_or_default(port))
}

#[tauri::command]
fn labos_api_stop(state: tauri::State<LabosApiProcess>) -> LabosApiStatus {
    api_process::stop(&state)
}

pub fn run() {
    tauri::Builder::default()
        .manage(LabosApiProcess::default())
        .setup(|app| {
            let process = app.state::<LabosApiProcess>();
            api_process::configure_bundled_runtime(app, &process);
            let status = api_process::start(&process, DEFAULT_LABOS_API_PORT);
            if let Some(error) = status.error {
                eprintln!("[OpenLabOS Desktop] local API was not auto-started: {error}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            desktop_health,
            adb_devices,
            adb_devices_status,
            adb_battery,
            adb_battery_status,
            adb_thermal,
            adb_thermal_status,
            adb_connect,
            adb_native_video_inventory,
            adb_import_native_videos,
            adb_power_sample,
            labos_api_status,
            labos_api_start,
            labos_api_stop
        ])
        .run(tauri::generate_context!())
        .expect("failed to run OpenLabOS desktop app");
}
