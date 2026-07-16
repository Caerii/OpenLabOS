use crate::adb;
use crate::models::{ImportedNativeVideo, NativeVideoImportRequest, NativeVideoImportResult};
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::Manager;

const MAX_IMPORT_FILES: usize = 50;

pub fn import(
    app: &tauri::AppHandle,
    request: NativeVideoImportRequest,
) -> NativeVideoImportResult {
    let destination_dir = request
        .destination_dir
        .as_ref()
        .map(PathBuf::from)
        .unwrap_or_else(|| default_import_dir(app));

    let mut imported = Vec::new();
    let mut errors = Vec::new();

    if request.device_paths.is_empty() {
        errors.push("no device paths were provided".to_string());
    }
    if request.device_paths.len() > MAX_IMPORT_FILES {
        errors.push(format!(
            "too many files requested; maximum is {MAX_IMPORT_FILES}"
        ));
    }
    if let Err(error) = fs::create_dir_all(&destination_dir) {
        errors.push(format!(
            "failed to create destination {}: {error}",
            destination_dir.display()
        ));
    }
    if !errors.is_empty() {
        return result(destination_dir, imported, errors);
    }

    for device_path in request.device_paths.iter().take(MAX_IMPORT_FILES) {
        if !is_allowed_video_path(device_path) {
            errors.push(format!("refusing unsupported device path: {device_path}"));
            continue;
        }

        let local_path = destination_dir.join(safe_file_name(device_path));
        let mut args = Vec::new();
        if let Some(serial) = request
            .serial
            .as_deref()
            .filter(|value| !value.trim().is_empty())
        {
            args.push("-s".to_string());
            args.push(serial.to_string());
        }
        args.push("pull".to_string());
        args.push(device_path.clone());
        args.push(local_path.display().to_string());

        let output = adb::command_owned_with_timeout(&args, Duration::from_secs(180));
        if !output.ok {
            errors.push(format!(
                "adb pull failed for {device_path}: {}{}{}",
                output.stderr,
                if output.stdout.is_empty() { "" } else { " " },
                output.stdout
            ));
            continue;
        }

        match file_digest(&local_path) {
            Ok((size_bytes, sha256)) => imported.push(ImportedNativeVideo {
                device_path: device_path.clone(),
                local_path: local_path.display().to_string(),
                size_bytes,
                sha256,
            }),
            Err(error) => errors.push(format!(
                "failed to hash imported file {}: {error}",
                local_path.display()
            )),
        }
    }

    result(destination_dir, imported, errors)
}

fn result(
    destination_dir: PathBuf,
    imported: Vec<ImportedNativeVideo>,
    errors: Vec<String>,
) -> NativeVideoImportResult {
    NativeVideoImportResult {
        ok: errors.is_empty(),
        destination_dir: destination_dir.display().to_string(),
        imported,
        errors,
    }
}

fn default_import_dir(app: &tauri::AppHandle) -> PathBuf {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("native-video-imports")
        .join(timestamp.to_string())
}

fn is_allowed_video_path(path: &str) -> bool {
    let lower = path.to_ascii_lowercase();
    let under_media_root = lower.starts_with("/sdcard/labos/")
        || lower.starts_with("/sdcard/movies/")
        || lower.starts_with("/sdcard/dcim/")
        || lower.starts_with("/sdcard/download/");
    let video_ext = [".mp4", ".mov", ".mkv", ".webm"]
        .iter()
        .any(|ext| lower.ends_with(ext));
    under_media_root && video_ext && !path.contains('\0')
}

fn safe_file_name(device_path: &str) -> String {
    let name = device_path
        .rsplit('/')
        .next()
        .filter(|value| !value.is_empty())
        .unwrap_or("native-video");
    name.chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-' | '_') {
                ch
            } else {
                '_'
            }
        })
        .collect()
}

fn file_digest(path: &Path) -> io::Result<(u64, String)> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut size = 0_u64;
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        size += read as u64;
        hasher.update(&buffer[..read]);
    }
    Ok((size, format!("{:x}", hasher.finalize())))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn restricts_native_video_paths() {
        assert!(is_allowed_video_path("/sdcard/LabOS/media/run.mp4"));
        assert!(is_allowed_video_path("/sdcard/DCIM/Camera/run.MOV"));
        assert!(!is_allowed_video_path("/data/local/tmp/run.mp4"));
        assert!(!is_allowed_video_path("/sdcard/LabOS/media/run.txt"));
    }

    #[test]
    fn sanitizes_local_names() {
        assert_eq!(safe_file_name("/sdcard/LabOS/media/a b:c.mp4"), "a_b_c.mp4");
    }
}
