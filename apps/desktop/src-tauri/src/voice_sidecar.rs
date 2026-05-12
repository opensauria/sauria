use std::fs;
use std::sync::Arc;
use tokio::process::Child;
use tokio::sync::Mutex;
use tokio::time::{interval, Duration};

const DEFAULT_PORT: u16 = 8100;
const MAX_RESTARTS: u32 = 5;
const HEALTH_CHECK_INTERVAL: Duration = Duration::from_secs(10);
const HEALTH_CHECK_TIMEOUT_SECS: u64 = 5;
const STARTUP_WAIT_SECS: u64 = 10;

pub struct VoiceSidecarState {
    process: Option<Child>,
    port: u16,
    token: String,
    starting: bool,
    restarts: u32,
    python_path: String,
}

impl VoiceSidecarState {
    pub fn new() -> Self {
        Self {
            process: None,
            port: DEFAULT_PORT,
            token: String::new(),
            starting: false,
            restarts: 0,
            python_path: String::new(),
        }
    }

    pub fn set_python_path(&mut self, path: String) {
        self.python_path = path;
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    pub fn token(&self) -> &str {
        &self.token
    }

    pub fn is_running(&mut self) -> bool {
        let Some(child) = self.process.as_mut() else {
            return false;
        };
        match child.try_wait() {
            Ok(None) => true,
            _ => {
                self.process = None;
                false
            }
        }
    }
}

fn generate_token() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or(0);
    format!("sv-{:016x}{:08x}", rand_u64(), nanos)
}

fn rand_u64() -> u64 {
    // Simple entropy from stack address + time; sufficient for a local auth token
    let mut x: u64 = 0x517cc1b727220a95;
    let addr = &x as *const u64 as u64;
    x ^= addr;
    x ^= x >> 30;
    x = x.wrapping_mul(0xbf58476d1ce4e5b9);
    x ^= x >> 27;
    x = x.wrapping_mul(0x94d049bb133111eb);
    x ^= x >> 31;
    x
}

// ─── Sidecar lifecycle ──────────────────────────────────────────────

pub async fn start_voice_sidecar(
    state: &Arc<Mutex<VoiceSidecarState>>,
    log_dir: &std::path::Path,
) -> Result<(), String> {
    let mut s = state.lock().await;

    if s.starting || s.is_running() {
        return Ok(());
    }

    if s.python_path.is_empty() {
        return Err("Python path not configured".to_string());
    }

    s.starting = true;

    let token = generate_token();
    s.token = token.clone();
    let port = s.port;
    let python_path = s.python_path.clone();

    let _ = fs::create_dir_all(log_dir);

    let err_file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_dir.join("voice-sidecar.err"))
        .map_err(|e| {
            s.starting = false;
            format!("Failed to open voice sidecar error log: {e}")
        })?;

    let mut cmd = tokio::process::Command::new(&python_path);
    cmd.args(["-m", "sauria_voice.cli", "--port", &port.to_string()])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::from(err_file))
        .env("SAURIA_VOICE_TOKEN", &token);

    let child = cmd.spawn().map_err(|e| {
        s.starting = false;
        format!("Failed to spawn voice sidecar: {e}")
    })?;

    s.process = Some(child);
    drop(s);

    // Wait for the sidecar to become healthy
    let health_url = format!("http://127.0.0.1:{port}/api/health");
    let deadline = tokio::time::Instant::now() + Duration::from_secs(STARTUP_WAIT_SECS);

    loop {
        if tokio::time::Instant::now() >= deadline {
            state.lock().await.starting = false;
            return Err("Voice sidecar did not become healthy in time".to_string());
        }

        let reachable = tokio::time::timeout(
            Duration::from_secs(HEALTH_CHECK_TIMEOUT_SECS),
            reqwest_health_check(&health_url),
        )
        .await
        .unwrap_or(false);

        if reachable {
            break;
        }

        tokio::time::sleep(Duration::from_millis(300)).await;
    }

    state.lock().await.starting = false;
    Ok(())
}

async fn reqwest_health_check(url: &str) -> bool {
    // Use hyper/reqwest is unavailable in base Tauri — use std blocking in a spawn_blocking
    // to avoid pulling in extra deps. A simple TCP connect suffices for liveness.
    let url = url.to_string();
    tokio::task::spawn_blocking(move || {
        use std::net::TcpStream;
        // Extract host:port from http://127.0.0.1:{port}/api/health
        let host_port = url
            .trim_start_matches("http://")
            .split('/')
            .next()
            .unwrap_or("127.0.0.1:8100");
        TcpStream::connect(host_port).is_ok()
    })
    .await
    .unwrap_or(false)
}

pub async fn stop_voice_sidecar(state: &Arc<Mutex<VoiceSidecarState>>) -> Result<(), String> {
    let mut s = state.lock().await;

    if let Some(mut child) = s.process.take() {
        let _ = child.kill().await;
    }

    s.starting = false;
    Ok(())
}

pub async fn restart_voice_sidecar(
    state: &Arc<Mutex<VoiceSidecarState>>,
    log_dir: &std::path::Path,
) -> Result<(), String> {
    stop_voice_sidecar(state).await?;
    tokio::time::sleep(Duration::from_secs(1)).await;
    start_voice_sidecar(state, log_dir).await
}

pub fn start_health_check(
    state: Arc<Mutex<VoiceSidecarState>>,
    log_dir: std::path::PathBuf,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        let mut timer = interval(HEALTH_CHECK_INTERVAL);
        loop {
            timer.tick().await;
            let should_restart = {
                let s = state.lock().await;
                !s.starting && s.restarts < MAX_RESTARTS && !s.python_path.is_empty()
            };
            if should_restart {
                let running = state.lock().await.is_running();
                if running {
                    state.lock().await.restarts = 0;
                } else {
                    state.lock().await.restarts += 1;
                    let _ = start_voice_sidecar(&state, &log_dir).await;
                }
            }
        }
    })
}
