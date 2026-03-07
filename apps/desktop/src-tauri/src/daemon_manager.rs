use std::fs;
use std::sync::Arc;
use tokio::process::Child;
use tokio::sync::Mutex;
use tokio::time::{interval, Duration};

use crate::daemon_process;
use crate::paths::Paths;

const MAX_RESTARTS: u32 = 5;
const HEALTH_CHECK_INTERVAL: Duration = Duration::from_secs(10);

pub struct DaemonState {
    process: Option<Child>,
    starting: bool,
    restarts: u32,
    node_path: String,
    daemon_cli_path: String,
    resource_node_modules: Option<String>,
}

impl DaemonState {
    pub fn new() -> Self {
        let (node_path, daemon_cli_path) = daemon_process::resolve_paths();
        Self {
            process: None,
            starting: false,
            restarts: 0,
            node_path,
            daemon_cli_path,
            resource_node_modules: None,
        }
    }

    pub fn set_daemon_cli_path(&mut self, path: String) {
        self.daemon_cli_path = path;
    }

    pub fn set_node_path(&mut self, path: String) {
        self.resource_node_modules = Some(path);
    }
}

pub fn is_daemon_running_by_pid(paths: &Paths) -> bool {
    daemon_process::read_pid(paths).is_some_and(daemon_process::is_process_alive)
}

pub fn is_configured(paths: &Paths) -> bool {
    paths.config.exists()
}

// ─── Daemon lifecycle ───────────────────────────────────────────────

pub async fn start_daemon(state: &Arc<Mutex<DaemonState>>, paths: &Paths) -> Result<(), String> {
    let mut s = state.lock().await;

    if s.starting || is_daemon_running_by_pid(paths) {
        return Ok(());
    }

    s.starting = true;

    let _ = fs::create_dir_all(&paths.logs);

    let err_file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(paths.logs.join("daemon.err"))
        .map_err(|e| {
            s.starting = false;
            format!("Failed to open error log: {e}")
        })?;

    let mut cmd = tokio::process::Command::new(&s.node_path);
    cmd.args([&s.daemon_cli_path, "daemon"])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::from(err_file))
        .env("SAURIA_HOME", paths.home.to_string_lossy().as_ref());

    if let Some(ref nm) = s.resource_node_modules {
        cmd.env("NODE_PATH", nm);
    }

    let mut child = cmd.spawn().map_err(|e| {
        s.starting = false;
        format!("Failed to spawn daemon: {e}")
    })?;

    let stdout = child.stdout.take();
    s.process = Some(child);

    drop(s);

    if let Some(stdout) = stdout {
        use tokio::io::{AsyncBufReadExt, BufReader};
        let mut reader = BufReader::new(stdout);
        let mut line = String::new();
        let read_result = tokio::time::timeout(
            Duration::from_secs(10),
            reader.read_line(&mut line),
        )
        .await;

        match read_result {
            Ok(Ok(_)) if line.contains("\"error\"") => {
                let mut s = state.lock().await;
                s.starting = false;
                return Err(format!("Daemon startup failed: {}", line.trim()));
            }
            Ok(Ok(_)) => { /* status: ready */ }
            Ok(Err(e)) => {
                let mut s = state.lock().await;
                s.starting = false;
                return Err(format!("Failed to read daemon status: {e}"));
            }
            Err(_) => {
                for _ in 0..50 {
                    if paths.pid_file.exists() {
                        break;
                    }
                    tokio::time::sleep(Duration::from_millis(100)).await;
                }
            }
        }
    }

    state.lock().await.starting = false;
    Ok(())
}

pub async fn stop_daemon(state: &Arc<Mutex<DaemonState>>, paths: &Paths) {
    let mut s = state.lock().await;

    if let Some(mut child) = s.process.take() {
        let _ = child.kill().await;
    }

    if let Some(pid) = daemon_process::read_pid(paths) {
        daemon_process::kill_process(pid);
    }

    s.starting = false;
}

pub async fn restart_daemon(state: &Arc<Mutex<DaemonState>>, paths: &Paths) {
    stop_daemon(state, paths).await;
    tokio::time::sleep(Duration::from_secs(1)).await;
    let _ = start_daemon(state, paths).await;
}

pub fn start_health_check(
    state: Arc<Mutex<DaemonState>>,
    paths: Paths,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        let mut timer = interval(HEALTH_CHECK_INTERVAL);
        loop {
            timer.tick().await;
            let should_restart = {
                let s = state.lock().await;
                !s.starting && is_configured(&paths) && s.restarts < MAX_RESTARTS
            };
            if should_restart {
                if is_daemon_running_by_pid(&paths) {
                    let mut s = state.lock().await;
                    s.restarts = 0;
                } else {
                    let mut s = state.lock().await;
                    s.restarts += 1;
                    drop(s);
                    let _ = start_daemon(&state, &paths).await;
                }
            }
        }
    })
}
