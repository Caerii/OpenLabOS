use crate::models::LabosApiStatus;
use std::io::Read;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;
use tauri::Manager;

pub const DEFAULT_LABOS_API_PORT: u16 = 3847;

#[derive(Default)]
pub struct LabosApiProcess {
    child: Mutex<Option<Child>>,
    bundled_server_entry: Mutex<Option<PathBuf>>,
    bundled_node: Mutex<Option<PathBuf>>,
}

fn local_api_port(port: Option<u16>) -> u16 {
    port.unwrap_or(DEFAULT_LABOS_API_PORT)
}

pub fn port_or_default(port: Option<u16>) -> u16 {
    local_api_port(port)
}

pub fn is_local_api_running(port: u16) -> bool {
    let Ok(addr) = format!("127.0.0.1:{port}").parse() else {
        return false;
    };
    std::net::TcpStream::connect_timeout(&addr, Duration::from_millis(400)).is_ok()
}

fn managed_child_pid(process: &LabosApiProcess) -> Option<u32> {
    let mut guard = process.child.lock().ok()?;
    let Some(child) = guard.as_mut() else {
        return None;
    };
    match child.try_wait() {
        Ok(Some(_status)) => {
            *guard = None;
            None
        }
        Ok(None) => Some(child.id()),
        Err(_error) => {
            *guard = None;
            None
        }
    }
}

fn candidate_server_entries() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(value) = std::env::var("LABOS_DESKTOP_SERVER_ENTRY") {
        candidates.push(PathBuf::from(value));
    }
    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join("../services/api/dist/index.js"));
        candidates.push(cwd.join("../../services/api/dist/index.js"));
        candidates.push(cwd.join("services/api/dist/index.js"));
    }
    candidates
}

fn find_server_entry(process: Option<&LabosApiProcess>) -> Option<PathBuf> {
    if let Some(process) = process {
        if let Ok(guard) = process.bundled_server_entry.lock() {
            if let Some(path) = guard.as_ref().filter(|path| path.is_file()) {
                return Some(path.clone());
            }
        }
    }
    candidate_server_entries()
        .into_iter()
        .filter_map(|path| path.canonicalize().ok())
        .find(|path| path.is_file())
}

fn find_node_program(process: &LabosApiProcess) -> PathBuf {
    if let Ok(guard) = process.bundled_node.lock() {
        if let Some(path) = guard.as_ref().filter(|path| path.is_file()) {
            return path.clone();
        }
    }
    if let Ok(value) = std::env::var("LABOS_DESKTOP_NODE_PATH") {
        let path = PathBuf::from(value);
        if path.is_file() {
            return path;
        }
    }
    PathBuf::from("node")
}

pub fn status(process: &LabosApiProcess, port: u16) -> LabosApiStatus {
    let managed_pid = managed_child_pid(process);
    LabosApiStatus {
        running: is_local_api_running(port),
        managed_by_desktop: managed_pid.is_some(),
        port,
        pid: managed_pid,
        server_entry: find_server_entry(Some(process)).map(|path| path.display().to_string()),
        error: None,
    }
}

pub fn start(process: &LabosApiProcess, port: u16) -> LabosApiStatus {
    if is_local_api_running(port) {
        return status(process, port);
    }

    let Some(server_entry) = find_server_entry(Some(process)) else {
        return LabosApiStatus {
            running: false,
            managed_by_desktop: false,
            port,
            pid: None,
            server_entry: None,
            error: Some(
                "services/api/dist/index.js was not found. Run pnpm --filter @openlabos/api build first."
                    .to_string(),
            ),
        };
    };

    let mut guard = match process.child.lock() {
        Ok(guard) => guard,
        Err(error) => {
            return LabosApiStatus {
                running: false,
                managed_by_desktop: false,
                port,
                pid: None,
                server_entry: Some(server_entry.display().to_string()),
                error: Some(error.to_string()),
            };
        }
    };

    let node_program = find_node_program(process);
    let child = Command::new(&node_program)
        .arg(node_entry_arg(&server_entry))
        .current_dir(server_working_dir(&server_entry))
        .env("LABOS_DASHBOARD_API_HOST", "127.0.0.1")
        .env("LABOS_DASHBOARD_API_PORT", port.to_string())
        .env("OPENLABOS_API_HOST", "127.0.0.1")
        .env("OPENLABOS_API_PORT", port.to_string())
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn();

    match child {
        Ok(mut child) => {
            let pid = child.id();
            for _ in 0..20 {
                if is_local_api_running(port) {
                    break;
                }
                if let Ok(Some(status)) = child.try_wait() {
                    let output = read_child_output(&mut child);
                    return LabosApiStatus {
                        running: false,
                        managed_by_desktop: false,
                        port,
                        pid: Some(pid),
                        server_entry: Some(server_entry.display().to_string()),
                        error: Some(format!(
                            "OpenLabOS API exited before startup completed: {status}{output}"
                        )),
                    };
                }
                std::thread::sleep(Duration::from_millis(150));
            }
            let running = is_local_api_running(port);
            *guard = Some(child);
            LabosApiStatus {
                running,
                managed_by_desktop: true,
                port,
                pid: Some(pid),
                server_entry: Some(server_entry.display().to_string()),
                error: (!running).then(|| {
                    format!("OpenLabOS API did not answer /api/health on 127.0.0.1:{port}")
                }),
            }
        }
        Err(error) => LabosApiStatus {
            running: false,
            managed_by_desktop: false,
            port,
            pid: None,
            server_entry: Some(server_entry.display().to_string()),
            error: Some(format!("{}: {}", node_program.display(), error)),
        },
    }
}

fn read_child_output(child: &mut Child) -> String {
    let mut parts = Vec::new();
    if let Some(mut stdout) = child.stdout.take() {
        let mut text = String::new();
        if stdout.read_to_string(&mut text).is_ok() && !text.trim().is_empty() {
            parts.push(format!("stdout: {}", text.trim()));
        }
    }
    if let Some(mut stderr) = child.stderr.take() {
        let mut text = String::new();
        if stderr.read_to_string(&mut text).is_ok() && !text.trim().is_empty() {
            parts.push(format!("stderr: {}", text.trim()));
        }
    }
    if parts.is_empty() {
        String::new()
    } else {
        format!(" ({})", parts.join("; "))
    }
}

pub fn stop(process: &LabosApiProcess) -> LabosApiStatus {
    let mut guard = match process.child.lock() {
        Ok(guard) => guard,
        Err(error) => {
            return LabosApiStatus {
                running: is_local_api_running(DEFAULT_LABOS_API_PORT),
                managed_by_desktop: false,
                port: DEFAULT_LABOS_API_PORT,
                pid: None,
                server_entry: find_server_entry(Some(process))
                    .map(|path| path.display().to_string()),
                error: Some(error.to_string()),
            };
        }
    };

    if let Some(mut child) = guard.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    LabosApiStatus {
        running: is_local_api_running(DEFAULT_LABOS_API_PORT),
        managed_by_desktop: false,
        port: DEFAULT_LABOS_API_PORT,
        pid: None,
        server_entry: find_server_entry(Some(process)).map(|path| path.display().to_string()),
        error: None,
    }
}

fn node_entry_arg(path: &PathBuf) -> String {
    let value = path.to_string_lossy().to_string();
    if cfg!(windows) {
        value
            .strip_prefix(r"\\?\")
            .unwrap_or(&value)
            .to_string()
    } else {
        value
    }
}

fn server_working_dir(server_entry: &PathBuf) -> PathBuf {
    server_entry
        .parent()
        .and_then(|path| path.parent())
        .and_then(|path| path.parent())
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")))
}

pub fn configure_bundled_runtime(app: &tauri::App, process: &LabosApiProcess) {
    let Ok(resource_dir) = app.path().resource_dir() else {
        return;
    };
    let resource_roots = [
        resource_dir.clone(),
        resource_dir.join("resources"),
    ];

    if let Some(server_entry) = resource_roots
        .iter()
        .map(|root| root.join("openlabos-api").join("index.mjs"))
        .find(|path| path.is_file())
    {
        if let Ok(mut guard) = process.bundled_server_entry.lock() {
            *guard = Some(server_entry);
        }
    }
    let node_name = if cfg!(windows) { "node.exe" } else { "node" };
    if let Some(node) = resource_roots
        .iter()
        .map(|root| root.join("node").join(node_name))
        .find(|path| path.is_file())
    {
        if let Ok(mut guard) = process.bundled_node.lock() {
            *guard = Some(node);
        }
    }
}
