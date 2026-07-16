use std::collections::BTreeMap;
use std::env;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const ONE_PIXEL_JPEG: &[u8] = &[
    0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x03, 0x02, 0x02, 0x03, 0x02, 0x02, 0x03,
    0x03, 0x03, 0x03, 0x04, 0x03, 0x03, 0x04, 0x05, 0x08, 0x05, 0x05, 0x04, 0x04, 0x05,
    0x0a, 0x07, 0x07, 0x06, 0x08, 0x0c, 0x0a, 0x0c, 0x0c, 0x0b, 0x0a, 0x0b, 0x0b, 0x0d,
    0x0e, 0x12, 0x10, 0x0d, 0x0e, 0x11, 0x0e, 0x0b, 0x0b, 0x10, 0x16, 0x10, 0x11, 0x13,
    0x14, 0x15, 0x15, 0x15, 0x0c, 0x0f, 0x17, 0x18, 0x16, 0x14, 0x18, 0x12, 0x14, 0x15,
    0x14, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
    0xff, 0xc4, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x08, 0xff, 0xc4, 0x00, 0x14, 0x10, 0x01,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x37, 0xff,
    0xd9,
];

#[derive(Debug, Clone)]
struct Event {
    sequence: u64,
    at_ms: u128,
    kind: String,
    details_json: Option<String>,
}

#[derive(Debug, Clone)]
struct ServerConfig {
    stream_frames: usize,
    stream_interval_ms: u64,
}

impl ServerConfig {
    fn from_env() -> Self {
        Self {
            stream_frames: parse_positive_env("LABOS_STREAM_FRAMES", 50),
            stream_interval_ms: parse_positive_env("LABOS_STREAM_INTERVAL_MS", 200),
        }
    }
}

#[derive(Debug)]
struct DeviceState {
    started_at: Instant,
    streaming: bool,
    recording: bool,
    frame_count: u64,
    active_video_path: Option<String>,
    last_video_path: Option<String>,
    last_frame_served_ms: Option<u128>,
    next_event_sequence: u64,
    events: Vec<Event>,
    request_counts: BTreeMap<String, u64>,
    total_requests: u64,
}

impl DeviceState {
    fn new() -> Self {
        let mut state = Self {
            started_at: Instant::now(),
            streaming: false,
            recording: false,
            frame_count: 0,
            active_video_path: None,
            last_video_path: None,
            last_frame_served_ms: None,
            next_event_sequence: 1,
            events: Vec::new(),
            request_counts: BTreeMap::new(),
            total_requests: 0,
        };
        state.push_event("service_started", Some(r#"{"edition":"rust"}"#.to_string()));
        state
    }

    fn push_event(&mut self, kind: &str, details_json: Option<String>) {
        self.events.push(Event {
            sequence: self.next_event_sequence,
            at_ms: unix_ms(),
            kind: kind.to_string(),
            details_json,
        });
        self.next_event_sequence += 1;
        if self.events.len() > 200 {
            let drain_count = self.events.len() - 200;
            self.events.drain(0..drain_count);
        }
    }

    fn reset_runtime(&mut self) {
        self.streaming = false;
        self.recording = false;
        self.frame_count = 0;
        self.active_video_path = None;
        self.last_video_path = None;
        self.last_frame_served_ms = None;
        self.events.clear();
        self.request_counts.clear();
        self.total_requests = 0;
        self.push_event("state_reset", None);
    }
}

fn main() -> std::io::Result<()> {
    let state = Arc::new(Mutex::new(DeviceState::new()));
    let config = Arc::new(ServerConfig::from_env());
    let addr = env::var("LABOS_RUST_ADDR").unwrap_or_else(|_| "127.0.0.1:8092".to_string());
    let listener = TcpListener::bind(&addr)?;
    println!("LabOS Rust edition listening on http://{addr}");

    for stream in listener.incoming() {
        let state = Arc::clone(&state);
        let config = Arc::clone(&config);
        match stream {
            Ok(stream) => {
                thread::spawn(move || {
                    let _ = handle_stream(stream, state, config);
                });
            }
            Err(error) => eprintln!("connection error: {error}"),
        }
    }

    Ok(())
}

fn handle_stream(
    mut stream: TcpStream,
    state: Arc<Mutex<DeviceState>>,
    config: Arc<ServerConfig>,
) -> std::io::Result<()> {
    let mut buffer = [0; 2048];
    let read = stream.read(&mut buffer)?;
    let request = String::from_utf8_lossy(&buffer[..read]);
    let mut parts = request.lines().next().unwrap_or_default().split_whitespace();
    let method = parts.next().unwrap_or_default();
    let path = parts.next().unwrap_or_default();
    record_request(&state, method, path);

    match (method, path) {
        ("GET", "/api/health") => write_json(&mut stream, &health_json(&state)),
        ("GET", "/api/device/status") => write_json(
            &mut stream,
            r#"{"connected":true,"device":"local-rust-edition","transport":"loopback"}"#,
        ),
        ("GET", "/api/labos/status") => write_json(
            &mut stream,
            r#"{"isInstalled":true,"isRunning":true,"edition":"rust","modules":[{"name":"rust-single-binary","installed":true,"isLatest":true,"installedVersionName":"0.2.0","builtVersionName":"0.2.0"}]}"#,
        ),
        ("POST", "/api/preview/start") => {
            let mut guard = state.lock().unwrap();
            let changed = !guard.streaming;
            guard.streaming = true;
            if changed {
                guard.push_event("preview_started", None);
            }
            write_json(&mut stream, &format!(r#"{{"success":true,"streaming":true,"changed":{changed}}}"#))
        }
        ("POST", "/api/preview/stop") => {
            let mut guard = state.lock().unwrap();
            let changed = guard.streaming;
            guard.streaming = false;
            if changed {
                guard.push_event("preview_stopped", None);
            }
            write_json(&mut stream, &format!(r#"{{"success":true,"streaming":false,"changed":{changed}}}"#))
        }
        ("GET", "/api/preview/health") => write_json(&mut stream, &preview_health_json(&state)),
        ("GET", "/api/preview/frame") => {
            record_frame_served(&state);
            write_bytes(&mut stream, "image/jpeg", ONE_PIXEL_JPEG)
        }
        ("GET", "/api/preview/stream") => write_stream(&mut stream, state, &config),
        ("POST", "/api/preview/recording/start") => {
            let mut guard = state.lock().unwrap();
            let changed = !guard.recording;
            if changed {
                let path = format!("/tmp/labos-rust-recording-{}.mp4", unix_ms());
                guard.active_video_path = Some(path.clone());
                guard.push_event("recording_started", Some(format!(r#"{{"path":"{}"}}"#, escape_json(&path))));
            }
            guard.recording = true;
            let active = option_json(&guard.active_video_path);
            write_json(
                &mut stream,
                &format!(r#"{{"success":true,"recording":true,"changed":{changed},"activeVideoPath":{active}}}"#),
            )
        }
        ("POST", "/api/preview/recording/stop") => {
            let mut guard = state.lock().unwrap();
            let changed = guard.recording;
            let last = guard.active_video_path.take();
            guard.recording = false;
            if changed {
                guard.last_video_path = last.clone();
                let path = option_json(&last);
                guard.push_event("recording_stopped", Some(format!(r#"{{"path":{path}}}"#)));
            }
            write_json(
                &mut stream,
                &format!(
                    r#"{{"success":true,"recording":false,"changed":{changed},"lastVideoPath":{}}}"#,
                    option_json(&last)
                ),
            )
        }
        ("GET", "/api/preview/recording/status") => {
            write_json(&mut stream, &recording_status_json(&state))
        }
        ("GET", "/api/events") => write_json(&mut stream, &events_json(&state)),
        ("GET", "/api/diagnostics") => write_json(&mut stream, &diagnostics_json(&state, &config)),
        ("GET", "/api/metrics") => write_json(&mut stream, &metrics_json(&state)),
        ("POST", "/api/control/reset") => {
            state.lock().unwrap().reset_runtime();
            write_json(&mut stream, r#"{"success":true,"reset":true}"#)
        }
        _ => write_status(&mut stream, 404, "not found"),
    }
}

fn health_json(state: &Arc<Mutex<DeviceState>>) -> String {
    let guard = state.lock().unwrap();
    format!(
        r#"{{"ok":true,"service":"labos-device-rust","edition":"rust","version":"0.2.0","uptimeMs":{}}}"#,
        guard.started_at.elapsed().as_millis()
    )
}

fn preview_health_json(state: &Arc<Mutex<DeviceState>>) -> String {
    let guard = state.lock().unwrap();
    format!(
        r#"{{"streaming":{},"fps":0,"frameCount":{},"frameReachable":true,"frameBytes":{},"recording":{},"activeVideoPath":{},"lastVideoPath":{},"lastFrameServedMs":{}}}"#,
        guard.streaming,
        guard.frame_count,
        ONE_PIXEL_JPEG.len(),
        guard.recording,
        option_json(&guard.active_video_path),
        option_json(&guard.last_video_path),
        option_u128_json(guard.last_frame_served_ms)
    )
}

fn recording_status_json(state: &Arc<Mutex<DeviceState>>) -> String {
    let guard = state.lock().unwrap();
    format!(
        r#"{{"recording":{},"activeVideoPath":{},"lastVideoPath":{},"source":"rust-edition"}}"#,
        guard.recording,
        option_json(&guard.active_video_path),
        option_json(&guard.last_video_path)
    )
}

fn events_json(state: &Arc<Mutex<DeviceState>>) -> String {
    let guard = state.lock().unwrap();
    let events = guard
        .events
        .iter()
        .map(|event| {
            format!(
                r#"{{"sequence":{},"atMs":{},"type":"{}","details":{}}}"#,
                event.sequence,
                event.at_ms,
                escape_json(&event.kind),
                event.details_json.as_deref().unwrap_or("{}")
            )
        })
        .collect::<Vec<_>>()
        .join(",");
    format!(r#"{{"count":{},"events":[{}]}}"#, guard.events.len(), events)
}

fn diagnostics_json(state: &Arc<Mutex<DeviceState>>, config: &ServerConfig) -> String {
    let guard = state.lock().unwrap();
    format!(
        r#"{{"edition":"rust","capabilities":["http-api","synthetic-frame","event-log","mjpeg-stream","idempotent-recording"],"eventCount":{},"uptimeMs":{},"frameFixtureLen":{},"streamFrames":{},"streamIntervalMs":{}}}"#,
        guard.events.len(),
        guard.started_at.elapsed().as_millis(),
        ONE_PIXEL_JPEG.len(),
        config.stream_frames,
        config.stream_interval_ms
    )
}

fn metrics_json(state: &Arc<Mutex<DeviceState>>) -> String {
    let guard = state.lock().unwrap();
    let counts = guard
        .request_counts
        .iter()
        .map(|(key, value)| format!(r#""{}":{}"#, escape_json(key), value))
        .collect::<Vec<_>>()
        .join(",");
    format!(
        r#"{{"edition":"rust","totalRequests":{},"requestCounts":{{{}}},"frameCount":{},"uptimeMs":{}}}"#,
        guard.total_requests,
        counts,
        guard.frame_count,
        guard.started_at.elapsed().as_millis()
    )
}

fn record_frame_served(state: &Arc<Mutex<DeviceState>>) {
    let mut guard = state.lock().unwrap();
    guard.frame_count += 1;
    guard.last_frame_served_ms = Some(unix_ms());
    if guard.frame_count == 1 || guard.frame_count % 25 == 0 {
        let frame_count = guard.frame_count;
        guard.push_event("frame_served", Some(format!(r#"{{"frameCount":{frame_count}}}"#)));
    }
}

fn record_request(state: &Arc<Mutex<DeviceState>>, method: &str, path: &str) {
    let mut guard = state.lock().unwrap();
    let key = format!("{method} {path}");
    *guard.request_counts.entry(key).or_insert(0) += 1;
    guard.total_requests += 1;
}

fn write_stream(
    stream: &mut TcpStream,
    state: Arc<Mutex<DeviceState>>,
    config: &ServerConfig,
) -> std::io::Result<()> {
    stream.write_all(
        b"HTTP/1.1 200 OK\r\ncontent-type: multipart/x-mixed-replace; boundary=labos\r\nconnection: close\r\n\r\n",
    )?;
    for _ in 0..config.stream_frames {
        record_frame_served(&state);
        let header = format!(
            "--labos\r\ncontent-type: image/jpeg\r\ncontent-length: {}\r\n\r\n",
            ONE_PIXEL_JPEG.len()
        );
        stream.write_all(header.as_bytes())?;
        stream.write_all(ONE_PIXEL_JPEG)?;
        stream.write_all(b"\r\n")?;
        stream.flush()?;
        thread::sleep(Duration::from_millis(config.stream_interval_ms));
    }
    Ok(())
}

fn option_json(value: &Option<String>) -> String {
    match value {
        Some(value) => format!(r#""{}""#, escape_json(value)),
        None => "null".to_string(),
    }
}

fn option_u128_json(value: Option<u128>) -> String {
    match value {
        Some(value) => value.to_string(),
        None => "null".to_string(),
    }
}

fn escape_json(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

fn unix_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

fn parse_positive_env<T>(name: &str, fallback: T) -> T
where
    T: std::str::FromStr + PartialOrd + From<u8> + Copy,
{
    match env::var(name).ok().and_then(|value| value.parse::<T>().ok()) {
        Some(value) if value > T::from(0) => value,
        _ => fallback,
    }
}

fn write_json(stream: &mut TcpStream, body: &str) -> std::io::Result<()> {
    write_bytes(stream, "application/json", body.as_bytes())
}

fn write_status(stream: &mut TcpStream, code: u16, body: &str) -> std::io::Result<()> {
    let status = match code {
        404 => "404 Not Found",
        405 => "405 Method Not Allowed",
        _ => "500 Internal Server Error",
    };
    let response = format!(
        "HTTP/1.1 {status}\r\ncontent-type: text/plain\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",
        body.len()
    );
    stream.write_all(response.as_bytes())
}

fn write_bytes(stream: &mut TcpStream, content_type: &str, body: &[u8]) -> std::io::Result<()> {
    let header = format!(
        "HTTP/1.1 200 OK\r\ncontent-type: {content_type}\r\ncontent-length: {}\r\nconnection: close\r\n\r\n",
        body.len()
    );
    stream.write_all(header.as_bytes())?;
    stream.write_all(body)?;
    stream.flush()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn option_json_handles_null() {
        assert_eq!(option_json(&None), "null");
    }

    #[test]
    fn health_json_contains_edition() {
        let state = Arc::new(Mutex::new(DeviceState::new()));
        let json = health_json(&state);
        assert!(json.contains(r#""edition":"rust""#));
    }

    #[test]
    fn preview_health_contains_frame_size() {
        let state = Arc::new(Mutex::new(DeviceState::new()));
        let json = preview_health_json(&state);
        assert!(json.contains(r#""frameBytes":"#));
    }

    #[test]
    fn recording_start_is_idempotent_at_state_level() {
        let mut state = DeviceState::new();
        state.recording = true;
        state.active_video_path = Some("/tmp/current.mp4".to_string());
        let before = state.active_video_path.clone();
        let changed = !state.recording;
        if changed {
            state.active_video_path = Some("/tmp/new.mp4".to_string());
        }
        assert_eq!(state.active_video_path, before);
    }

    #[test]
    fn events_are_capped() {
        let mut state = DeviceState::new();
        for _ in 0..250 {
            state.push_event("x", None);
        }
        assert_eq!(state.events.len(), 200);
    }

    #[test]
    fn jpeg_fixture_is_non_empty() {
        assert!(ONE_PIXEL_JPEG.len() > 100);
    }

    #[test]
    fn diagnostics_contains_capability() {
        let state = Arc::new(Mutex::new(DeviceState::new()));
        let config = ServerConfig {
            stream_frames: 3,
            stream_interval_ms: 10,
        };
        let json = diagnostics_json(&state, &config);
        assert!(json.contains("mjpeg-stream"));
    }

    #[test]
    fn metrics_counts_requests() {
        let state = Arc::new(Mutex::new(DeviceState::new()));
        record_request(&state, "GET", "/api/health");
        record_request(&state, "GET", "/api/health");
        let json = metrics_json(&state);
        assert!(json.contains(r#""GET /api/health":2"#));
        assert!(json.contains(r#""totalRequests":2"#));
    }

    #[test]
    fn reset_clears_runtime_state() {
        let mut state = DeviceState::new();
        state.streaming = true;
        state.recording = true;
        state.frame_count = 10;
        state.active_video_path = Some("/tmp/x.mp4".to_string());
        state.reset_runtime();
        assert!(!state.streaming);
        assert!(!state.recording);
        assert_eq!(state.frame_count, 0);
        assert!(state.active_video_path.is_none());
    }
}
