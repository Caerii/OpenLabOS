use crate::models::PowerSampleResult;
use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

pub fn save_power_sample(
    app: &tauri::AppHandle,
    result: &mut PowerSampleResult,
) -> Result<(), String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("power-samples");
    fs::create_dir_all(&dir)
        .map_err(|error| format!("failed to create {}: {error}", dir.display()))?;

    let path = dir.join(power_sample_name(result));
    result.artifact_path = Some(path.display().to_string());
    let body = serde_json::to_vec_pretty(result).map_err(|error| error.to_string())?;
    fs::write(&path, body)
        .map_err(|error| format!("failed to write {}: {error}", path.display()))?;
    Ok(())
}

fn power_sample_name(result: &PowerSampleResult) -> String {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
    let label = result
        .profile_label
        .as_deref()
        .map(safe_name)
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "sample".to_string());
    format!("{timestamp}-{label}.json")
}

fn safe_name(value: &str) -> String {
    value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_') {
                ch
            } else {
                '_'
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::PowerSampleResult;

    #[test]
    fn power_sample_name_uses_safe_label() {
        let result = PowerSampleResult {
            ok: true,
            serial: None,
            profile_label: Some("640/15 Q60".to_string()),
            duration_ms: 1000,
            interval_ms: 500,
            artifact_path: None,
            samples: Vec::new(),
            errors: Vec::new(),
        };
        let name = power_sample_name(&result);
        assert!(name.ends_with("-640_15_Q60.json"));
    }
}
