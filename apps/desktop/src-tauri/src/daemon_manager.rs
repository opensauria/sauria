use std::fs;
use std::path::Path;
use std::process::Command;
use std::sync::Arc;
use tokio::process::Child;
use tokio::sync::Mutex;
use tokio::time::{interval, Duration};

use crate::paths::Paths;

const MAX_RESTARTS: u32 = 5;
const HEALTH_CHECK_INTERVAL: Duration = Duration::from_secs(10);

pub struct DaemonState {
    process: Option<Child>,
    starting: bool,
    restarts: u32,
    node_path: String,
    daemon_cli_path: String,
}

impl DaemonState {
    pub fn new() -> Self {
        Self {
            process: None,
            starting: false,
            restarts: 0,
            node_path: resolve_node(),
            daemon_cli_path: String::new(),
        }
    }

    pub fn set_daemon_cli_path(&mut self, path: String) {
        self.daemon_cli_path = path;
    }
}

// ─── Path resolution ────────────────────────────────────────────────────────

fn resolve_login_shell() -> (String, Vec<String>) {
    #[cfg(target_os = "windows")]
    {
        ("cmd.exe".to_string(), vec!["/c".to_string()])
    }

    #[cfg(not(target_os = "windows"))]
    {
        let candidates = if cfg!(target_os = "macos") {
            &["/bin/zsh", "/bin/bash", "/bin/sh"][..]
        } else {
            &["/bin/bash", "/bin/zsh", "/bin/sh"][..]
        };
        for sh in candidates {
            if std::path::Path::new(sh).exists() {
                return (sh.to_string(), vec!["-lc".to_string()]);
            }
        }
        ("/bin/sh".to_string(), vec!["-lc".to_string()])
    }
}

fn shell_which(name: &str) -> Option<String> {
    let (shell, args) = resolve_login_shell();

    #[cfg(not(target_os = "windows"))]
    let which_cmd = "which";
    #[cfg(target_os = "windows")]
    let which_cmd = "where";

    let mut cmd_args = args;
    cmd_args.push(format!("{which_cmd} {name}"));

    Command::new(&shell)
        .args(&cmd_args)
        .output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .and_then(|s| s.trim().lines().next().map(str::to_string))
        .filter(|s| !s.is_empty())
}

pub fn resolve_daemon_cli(resource_dir: Option<&Path>) -> String {
    // 1. Global install
    if let Some(path) = shell_which("opensauria") {
        return path;
    }

    // 2. Bundled Tauri resource
    if let Some(dir) = resource_dir {
        let bundled = dir.join("daemon/index.mjs");
        if bundled.exists() {
            return bundled.to_string_lossy().to_string();
        }
    }

    // 3. Dev mode: relative to cwd or binary location
    let candidates = [
        std::env::current_dir()
            .ok()
            .map(|d| d.join("../../daemon/dist/index.mjs")),
        std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|d| d.to_path_buf()))
            .map(|d| d.join("../../../apps/daemon/dist/index.mjs")),
    ];

    for candidate in candidates.into_iter().flatten() {
        if let Ok(resolved) = candidate.canonicalize() {
            return resolved.to_string_lossy().to_string();
        }
    }

    "opensauria".to_string()
}

fn resolve_node() -> String {
    if let Some(path) = shell_which("node") {
        return path;
    }

    // NVM fallback
    #[cfg(not(target_os = "windows"))]
    if let Some(home) = dirs::home_dir() {
        let nvm_dir = home.join(".nvm/versions/node");
        if let Ok(entries) = fs::read_dir(&nvm_dir) {
            let mut versions: Vec<String> = entries
                .filter_map(|e| e.ok())
                .filter_map(|e| e.file_name().into_string().ok())
                .collect();
            versions.sort();
            if let Some(latest) = versions.last() {
                return nvm_dir
                    .join(latest)
                    .join("bin/node")
                    .to_string_lossy()
                    .to_string();
            }
        }
    }

    "node".to_string()
}

// ─── PID helpers ────────────────────────────────────────────────────────────

fn read_pid(paths: &Paths) -> Option<i32> {
    fs::read_to_string(&paths.pid_file)
        .ok()
        .and_then(|s| s.trim().parse().ok())
}

#[cfg(unix)]
fn is_process_alive(pid: i32) -> bool {
    unsafe { libc::kill(pid, 0) == 0 }
}

#[cfg(not(unix))]
fn is_process_alive(_pid: i32) -> bool {
    false
}

#[cfg(unix)]
fn kill_process(pid: i32) {
    unsafe {
        libc::kill(pid, libc::SIGTERM);
    }
}

#[cfg(not(unix))]
fn kill_process(_pid: i32) {}

pub fn is_daemon_running_by_pid(paths: &Paths) -> bool {
    read_pid(paths).is_some_and(is_process_alive)
}

pub fn is_configured(paths: &Paths) -> bool {
    paths.config.exists()
}

// ─── Daemon lifecycle ───────────────────────────────────────────────────────

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

    let child = tokio::process::Command::new(&s.node_path)
        .args([&s.daemon_cli_path, "daemon"])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::from(err_file))
        .env("OPENSAURIA_HOME", paths.home.to_string_lossy().as_ref())
        .spawn()
        .map_err(|e| {
            s.starting = false;
            format!("Failed to spawn daemon: {e}")
        })?;

    s.process = Some(child);

    // Release lock, then wait for daemon to write PID file (up to 5s)
    drop(s);
    for _ in 0..50 {
        if paths.pid_file.exists() {
            break;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }

    state.lock().await.starting = false;
    Ok(())
}

pub async fn stop_daemon(state: &Arc<Mutex<DaemonState>>, paths: &Paths) {
    let mut s = state.lock().await;

    if let Some(mut child) = s.process.take() {
        let _ = child.kill().await;
    }

    if let Some(pid) = read_pid(paths) {
        kill_process(pid);
    }

    // Belt-and-suspenders: clean up PID + socket even if daemon's own handler didn't
    let _ = fs::remove_file(&paths.pid_file);
    let _ = fs::remove_file(&paths.socket);

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

            // Reap zombie child so kill(pid, 0) stops returning true
            {
                let mut s = state.lock().await;
                if let Some(ref mut child) = s.process {
                    if let Ok(Some(_)) = child.try_wait() {
                        s.process = None;
                    }
                }
            }

            if is_daemon_running_by_pid(&paths) {
                let mut s = state.lock().await;
                s.restarts = 0;
                continue;
            }

            {
                let mut s = state.lock().await;
                if s.starting || !is_configured(&paths) || s.restarts >= MAX_RESTARTS {
                    continue;
                }
                s.restarts += 1;
            }
            let _ = start_daemon(&state, &paths).await;
        }
    })
}
