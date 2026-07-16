use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize)]
pub struct CommandOutput {
    pub ok: bool,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Clone, Serialize)]
pub struct AdbDevice {
    pub serial: String,
    pub state: String,
    pub model: Option<String>,
    pub product: Option<String>,
    pub transport_id: Option<String>,
    pub details: Vec<String>,
}

#[derive(Serialize)]
pub struct AdbDevicesStatus {
    pub ok: bool,
    pub adb_path: String,
    pub devices: Vec<AdbDevice>,
    pub auto_connect_target: Option<String>,
    pub auto_connect_attempted: bool,
    pub auto_connect: Option<CommandOutput>,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Serialize)]
pub struct BatteryStatus {
    pub ok: bool,
    pub level_percent: Option<u8>,
    pub status_code: Option<u8>,
    pub status_label: Option<&'static str>,
    pub voltage_mv: Option<u32>,
    pub temperature_c: Option<f32>,
    pub charge_counter_uah: Option<i64>,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Clone, Serialize)]
pub struct ThermalZone {
    pub zone: String,
    pub label: String,
    pub raw: i64,
    pub celsius: f32,
}

#[derive(Serialize)]
pub struct ThermalStatus {
    pub ok: bool,
    pub zones: Vec<ThermalZone>,
    pub hottest: Option<ThermalZone>,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Serialize)]
pub struct DesktopHealth {
    pub app: &'static str,
    pub native_shell: bool,
    pub adb_available: bool,
    pub adb_version: Option<String>,
    pub default_adb_target: Option<String>,
    pub labos_api_running: bool,
}

#[derive(Serialize)]
pub struct LabosApiStatus {
    pub running: bool,
    pub managed_by_desktop: bool,
    pub port: u16,
    pub pid: Option<u32>,
    pub server_entry: Option<String>,
    pub error: Option<String>,
}

#[derive(Serialize)]
pub struct NativeVideoFile {
    pub device_path: String,
    pub name: String,
    pub size_bytes: Option<u64>,
    pub modified_unix_seconds: Option<i64>,
}

#[derive(Serialize)]
pub struct NativeVideoInventory {
    pub ok: bool,
    pub serial: Option<String>,
    pub files: Vec<NativeVideoFile>,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Deserialize)]
pub struct NativeVideoImportRequest {
    pub serial: Option<String>,
    pub device_paths: Vec<String>,
    pub destination_dir: Option<String>,
}

#[derive(Serialize)]
pub struct ImportedNativeVideo {
    pub device_path: String,
    pub local_path: String,
    pub size_bytes: u64,
    pub sha256: String,
}

#[derive(Serialize)]
pub struct NativeVideoImportResult {
    pub ok: bool,
    pub destination_dir: String,
    pub imported: Vec<ImportedNativeVideo>,
    pub errors: Vec<String>,
}

#[derive(Deserialize)]
pub struct PowerSampleRequest {
    pub serial: Option<String>,
    pub duration_ms: Option<u64>,
    pub interval_ms: Option<u64>,
    pub profile_label: Option<String>,
}

#[derive(Serialize)]
pub struct PowerSample {
    pub timestamp_unix_ms: u128,
    pub elapsed_ms: u128,
    pub battery: BatteryStatus,
    pub hottest_thermal_zone: Option<ThermalZone>,
}

#[derive(Serialize)]
pub struct PowerSampleResult {
    pub ok: bool,
    pub serial: Option<String>,
    pub profile_label: Option<String>,
    pub duration_ms: u64,
    pub interval_ms: u64,
    pub artifact_path: Option<String>,
    pub samples: Vec<PowerSample>,
    pub errors: Vec<String>,
}
