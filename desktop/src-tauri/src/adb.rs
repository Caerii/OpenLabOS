use crate::models::{
    AdbDevice, AdbDevicesStatus, BatteryStatus, CommandOutput, NativeVideoFile,
    NativeVideoInventory, PowerSample, PowerSampleRequest, PowerSampleResult, ThermalStatus,
    ThermalZone,
};
use std::env;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

const DESKTOP_COMMAND_TIMEOUT: Duration = Duration::from_secs(15);
const DEFAULT_GLASSES_ADB_TARGET: &str = "192.168.50.122:5555";

fn run_command(program: &Path, args: &[String], timeout: Duration) -> CommandOutput {
    let mut child = match Command::new(program)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(child) => child,
        Err(error) => {
            return CommandOutput {
                ok: false,
                stdout: String::new(),
                stderr: error.to_string(),
            };
        }
    };

    let deadline = Instant::now() + timeout;
    loop {
        match child.try_wait() {
            Ok(Some(_status)) => match child.wait_with_output() {
                Ok(output) => {
                    return CommandOutput {
                        ok: output.status.success(),
                        stdout: String::from_utf8_lossy(&output.stdout).trim().to_string(),
                        stderr: String::from_utf8_lossy(&output.stderr).trim().to_string(),
                    };
                }
                Err(error) => {
                    return CommandOutput {
                        ok: false,
                        stdout: String::new(),
                        stderr: error.to_string(),
                    };
                }
            },
            Ok(None) if Instant::now() < deadline => {
                std::thread::sleep(Duration::from_millis(50));
            }
            Ok(None) => {
                let _ = child.kill();
                let output = child.wait_with_output();
                return match output {
                    Ok(output) => CommandOutput {
                        ok: false,
                        stdout: String::from_utf8_lossy(&output.stdout).trim().to_string(),
                        stderr: format!(
                            "command timed out after {}s{}{}",
                            timeout.as_secs(),
                            if output.stderr.is_empty() { "" } else { ": " },
                            String::from_utf8_lossy(&output.stderr).trim()
                        ),
                    },
                    Err(error) => CommandOutput {
                        ok: false,
                        stdout: String::new(),
                        stderr: format!(
                            "command timed out after {}s; failed to collect output: {error}",
                            timeout.as_secs()
                        ),
                    },
                };
            }
            Err(error) => {
                let _ = child.kill();
                return CommandOutput {
                    ok: false,
                    stdout: String::new(),
                    stderr: error.to_string(),
                };
            }
        }
    }
}

fn adb_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(value) = env::var("LABOS_ADB_PATH") {
        candidates.push(PathBuf::from(value));
    }
    candidates.push(PathBuf::from("adb"));
    if cfg!(windows) {
        if let Ok(local_app_data) = env::var("LOCALAPPDATA") {
            candidates.push(
                PathBuf::from(local_app_data)
                    .join("Android")
                    .join("Sdk")
                    .join("platform-tools")
                    .join("adb.exe"),
            );
        }
        candidates.push(PathBuf::from("C:\\Android\\platform-tools\\adb.exe"));
        candidates.push(PathBuf::from(
            "C:\\Program Files\\Android\\platform-tools\\adb.exe",
        ));
    }
    for env_key in ["ANDROID_HOME", "ANDROID_SDK_ROOT"] {
        if let Ok(root) = env::var(env_key) {
            candidates.push(
                PathBuf::from(root)
                    .join("platform-tools")
                    .join(if cfg!(windows) { "adb.exe" } else { "adb" }),
            );
        }
    }
    candidates
}

pub fn find_adb_program() -> PathBuf {
    for candidate in adb_candidates() {
        if candidate == PathBuf::from("adb") || candidate.is_file() {
            let output = run_command(
                &candidate,
                &[String::from("version")],
                DESKTOP_COMMAND_TIMEOUT,
            );
            if output.ok {
                return candidate;
            }
        }
    }
    PathBuf::from("adb")
}

pub fn command(args: &[&str]) -> CommandOutput {
    command_with_timeout(args, DESKTOP_COMMAND_TIMEOUT)
}

pub fn command_with_timeout(args: &[&str], timeout: Duration) -> CommandOutput {
    let owned_args = args
        .iter()
        .map(|arg| (*arg).to_string())
        .collect::<Vec<_>>();
    command_owned_with_timeout(&owned_args, timeout)
}

pub fn command_owned_with_timeout(args: &[String], timeout: Duration) -> CommandOutput {
    run_command(&find_adb_program(), args, timeout)
}

pub fn shell(serial: Option<String>, shell_command: &str) -> CommandOutput {
    let mut args = Vec::new();
    if let Some(serial) = serial.as_deref().filter(|value| !value.trim().is_empty()) {
        args.push("-s");
        args.push(serial);
    }
    args.push("shell");
    args.push(shell_command);
    command(&args)
}

pub fn devices_status() -> AdbDevicesStatus {
    let adb_path = find_adb_program();
    let mut output = run_command(
        &adb_path,
        &[String::from("devices"), String::from("-l")],
        DESKTOP_COMMAND_TIMEOUT,
    );
    let mut devices = parse_adb_devices(&output.stdout);
    let auto_connect_target = default_adb_target();
    let mut auto_connect = None;
    let should_autoconnect = output.ok
        && devices.iter().all(|device| device.state != "device")
        && auto_connect_target.is_some();

    if should_autoconnect {
        if let Some(target) = auto_connect_target.clone() {
            let connect_output = run_command(
                &adb_path,
                &[String::from("connect"), target],
                Duration::from_secs(20),
            );
            auto_connect = Some(connect_output);
            output = run_command(
                &adb_path,
                &[String::from("devices"), String::from("-l")],
                DESKTOP_COMMAND_TIMEOUT,
            );
            devices = parse_adb_devices(&output.stdout);
        }
    }

    AdbDevicesStatus {
        ok: output.ok,
        adb_path: adb_path.display().to_string(),
        devices,
        auto_connect_target,
        auto_connect_attempted: should_autoconnect,
        auto_connect,
        stdout: output.stdout,
        stderr: output.stderr,
    }
}

pub fn battery_status(serial: Option<String>) -> BatteryStatus {
    parse_battery_status(shell(serial, "dumpsys battery"))
}

pub fn thermal_raw(serial: Option<String>) -> CommandOutput {
    shell(
        serial,
        "for z in /sys/class/thermal/thermal_zone*; do if [ -f \"$z/temp\" ]; then zone=$(basename \"$z\"); typ=$(cat \"$z/type\" 2>/dev/null | tr -d '\\r\\n'); temp=$(cat \"$z/temp\" 2>/dev/null | tr -d '\\r\\n'); echo \"$zone,$typ,$temp\"; fi; done",
    )
}

pub fn thermal_status(serial: Option<String>) -> ThermalStatus {
    parse_thermal_status(thermal_raw(serial))
}

pub fn connect(target: String) -> CommandOutput {
    command_owned_with_timeout(&[String::from("connect"), target], Duration::from_secs(20))
}

pub fn default_adb_target() -> Option<String> {
    for key in ["LABOS_DESKTOP_ADB_TARGET", "LABOS_GLASSES_ADB_TARGET"] {
        if let Ok(value) = env::var(key) {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                return Some(normalize_adb_target(trimmed));
            }
        }
    }
    Some(DEFAULT_GLASSES_ADB_TARGET.to_string())
}

fn normalize_adb_target(value: &str) -> String {
    if value.contains(':') {
        value.to_string()
    } else {
        format!("{value}:5555")
    }
}

pub fn native_video_inventory(serial: Option<String>) -> NativeVideoInventory {
    let output = shell(
        serial.clone(),
        "for root in /sdcard/LabOS /sdcard/Movies /sdcard/DCIM /sdcard/Download; do [ -d \"$root\" ] || continue; find \"$root\" -type f \\( -iname '*.mp4' -o -iname '*.mov' -o -iname '*.mkv' -o -iname '*.webm' \\) 2>/dev/null; done | while IFS= read -r f; do size=$(stat -c%s \"$f\" 2>/dev/null || echo \"\"); mtime=$(stat -c%Y \"$f\" 2>/dev/null || echo \"\"); echo \"$size\t$mtime\t$f\"; done",
    );
    NativeVideoInventory {
        ok: output.ok,
        serial,
        files: parse_native_video_inventory(&output.stdout),
        stdout: output.stdout,
        stderr: output.stderr,
    }
}

pub fn power_sample(request: PowerSampleRequest) -> PowerSampleResult {
    let duration_ms = request.duration_ms.unwrap_or(60_000).clamp(1_000, 300_000);
    let interval_ms = request.interval_ms.unwrap_or(5_000).clamp(500, 60_000);
    let started = Instant::now();
    let mut samples = Vec::new();
    let mut errors = Vec::new();

    while started.elapsed().as_millis() <= u128::from(duration_ms) {
        let battery = battery_status(request.serial.clone());
        let thermal = thermal_status(request.serial.clone());
        if !battery.ok && !battery.stderr.is_empty() {
            errors.push(battery.stderr.clone());
        }
        if !thermal.ok && !thermal.stderr.is_empty() {
            errors.push(thermal.stderr.clone());
        }
        samples.push(PowerSample {
            timestamp_unix_ms: unix_now_ms(),
            elapsed_ms: started.elapsed().as_millis(),
            battery,
            hottest_thermal_zone: thermal.hottest,
        });
        if started.elapsed().as_millis() + u128::from(interval_ms) > u128::from(duration_ms) {
            break;
        }
        std::thread::sleep(Duration::from_millis(interval_ms));
    }

    PowerSampleResult {
        ok: errors.is_empty() && !samples.is_empty(),
        serial: request.serial,
        profile_label: request.profile_label,
        duration_ms,
        interval_ms,
        artifact_path: None,
        samples,
        errors,
    }
}

fn parse_adb_devices(stdout: &str) -> Vec<AdbDevice> {
    stdout
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with("List of devices"))
        .filter_map(|line| {
            let parts = line.split_whitespace().collect::<Vec<_>>();
            if parts.len() < 2 {
                return None;
            }
            let detail_tokens = parts
                .iter()
                .skip(2)
                .map(|value| value.to_string())
                .collect::<Vec<_>>();
            let mut model = None;
            let mut product = None;
            let mut transport_id = None;
            for token in &detail_tokens {
                if let Some(value) = token.strip_prefix("model:") {
                    model = Some(value.to_string());
                } else if let Some(value) = token.strip_prefix("product:") {
                    product = Some(value.to_string());
                } else if let Some(value) = token.strip_prefix("transport_id:") {
                    transport_id = Some(value.to_string());
                }
            }
            Some(AdbDevice {
                serial: parts[0].to_string(),
                state: parts[1].to_string(),
                model,
                product,
                transport_id,
                details: detail_tokens,
            })
        })
        .collect()
}

fn parse_native_video_inventory(stdout: &str) -> Vec<NativeVideoFile> {
    stdout
        .lines()
        .filter_map(|line| {
            let mut parts = line.splitn(3, '\t');
            let size = parts.next()?.trim().parse::<u64>().ok();
            let modified = parts.next()?.trim().parse::<i64>().ok();
            let device_path = parts.next()?.trim();
            if device_path.is_empty() {
                return None;
            }
            let name = device_path
                .rsplit('/')
                .next()
                .filter(|value| !value.is_empty())
                .unwrap_or("video")
                .to_string();
            Some(NativeVideoFile {
                device_path: device_path.to_string(),
                name,
                size_bytes: size,
                modified_unix_seconds: modified,
            })
        })
        .collect()
}

fn unix_now_ms() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

fn parse_battery_field<'a>(stdout: &'a str, key: &str) -> Option<&'a str> {
    stdout.lines().find_map(|line| {
        let (left, right) = line.split_once(':')?;
        left.trim()
            .eq_ignore_ascii_case(key)
            .then_some(right.trim())
    })
}

fn battery_status_label(status_code: u8) -> Option<&'static str> {
    match status_code {
        1 => Some("unknown"),
        2 => Some("charging"),
        3 => Some("discharging"),
        4 => Some("not charging"),
        5 => Some("full"),
        _ => None,
    }
}

fn parse_battery_status(output: CommandOutput) -> BatteryStatus {
    let level_percent =
        parse_battery_field(&output.stdout, "level").and_then(|value| value.parse().ok());
    let status_code =
        parse_battery_field(&output.stdout, "status").and_then(|value| value.parse().ok());
    let voltage_mv =
        parse_battery_field(&output.stdout, "voltage").and_then(|value| value.parse().ok());
    let charge_counter_uah =
        parse_battery_field(&output.stdout, "charge counter").and_then(|value| value.parse().ok());
    let temperature_c = parse_battery_field(&output.stdout, "temperature")
        .and_then(|value| value.parse::<f32>().ok())
        .map(|value| value / 10.0);
    BatteryStatus {
        ok: output.ok,
        level_percent,
        status_code,
        status_label: status_code.and_then(battery_status_label),
        voltage_mv,
        temperature_c,
        charge_counter_uah,
        stdout: output.stdout,
        stderr: output.stderr,
    }
}

fn parse_thermal_status(output: CommandOutput) -> ThermalStatus {
    let mut zones = output
        .stdout
        .lines()
        .filter_map(|line| {
            let mut parts = line.trim().splitn(3, ',');
            let zone = parts.next()?.trim();
            let label = parts.next()?.trim();
            let raw = parts.next()?.trim().parse::<i64>().ok()?;
            let celsius = if raw.abs() > 1000 {
                raw as f32 / 1000.0
            } else {
                raw as f32
            };
            Some(ThermalZone {
                zone: zone.to_string(),
                label: if label.is_empty() { zone } else { label }.to_string(),
                raw,
                celsius,
            })
        })
        .collect::<Vec<_>>();
    zones.sort_by(|a, b| {
        b.celsius
            .partial_cmp(&a.celsius)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    ThermalStatus {
        ok: output.ok,
        hottest: zones.first().cloned(),
        zones,
        stdout: output.stdout,
        stderr: output.stderr,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_adb_devices_with_metadata() {
        let devices = parse_adb_devices(
            "List of devices attached\n\
             ABC123 device product:mentor model:Mentra_Live transport_id:7\n\
             192.168.1.10:5555 offline\n",
        );

        assert_eq!(devices.len(), 2);
        assert_eq!(devices[0].serial, "ABC123");
        assert_eq!(devices[0].state, "device");
        assert_eq!(devices[0].model.as_deref(), Some("Mentra_Live"));
        assert_eq!(devices[0].product.as_deref(), Some("mentor"));
        assert_eq!(devices[0].transport_id.as_deref(), Some("7"));
        assert_eq!(devices[1].state, "offline");
    }

    #[test]
    fn parses_battery_dump_summary_fields() {
        let status = parse_battery_status(CommandOutput {
            ok: true,
            stdout: "\
              AC powered: false\n\
              USB powered: true\n\
              status: 2\n\
              level: 87\n\
              voltage: 4152\n\
              temperature: 331\n\
              Charge counter: 423000\n"
                .to_string(),
            stderr: String::new(),
        });

        assert_eq!(status.level_percent, Some(87));
        assert_eq!(status.status_label, Some("charging"));
        assert_eq!(status.voltage_mv, Some(4152));
        assert_eq!(status.charge_counter_uah, Some(423000));
        assert_eq!(status.temperature_c, Some(33.1));
    }

    #[test]
    fn parses_and_sorts_thermal_zones() {
        let status = parse_thermal_status(CommandOutput {
            ok: true,
            stdout: "thermal_zone0,quiet_therm,31000\nthermal_zone1,cpu-0-0,44\n".to_string(),
            stderr: String::new(),
        });

        assert_eq!(status.zones.len(), 2);
        assert_eq!(
            status.hottest.as_ref().map(|zone| zone.label.as_str()),
            Some("cpu-0-0")
        );
        assert_eq!(status.hottest.as_ref().map(|zone| zone.celsius), Some(44.0));
        assert_eq!(status.zones[1].celsius, 31.0);
    }

    #[test]
    fn parses_native_video_inventory_rows() {
        let files = parse_native_video_inventory(
            "123\t1715020000\t/sdcard/LabOS/media/run-one.mp4\n\
             \t\t/sdcard/DCIM/Camera/fallback.mov\n",
        );

        assert_eq!(files.len(), 2);
        assert_eq!(files[0].name, "run-one.mp4");
        assert_eq!(files[0].size_bytes, Some(123));
        assert_eq!(files[0].modified_unix_seconds, Some(1715020000));
        assert_eq!(files[1].name, "fallback.mov");
        assert_eq!(files[1].size_bytes, None);
    }

    #[test]
    fn normalizes_adb_target_port() {
        assert_eq!(normalize_adb_target("192.168.50.122"), "192.168.50.122:5555");
        assert_eq!(
            normalize_adb_target("192.168.50.122:5555"),
            "192.168.50.122:5555"
        );
    }
}
