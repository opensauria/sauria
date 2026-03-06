use std::fs;
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
    resource_node_modules: Option<String>,
}

impl DaemonState {
    pub fn new() -> Self {
        let (node_path, daemon_cli_path) = resolve_paths();
        Self {
            process: None,
            starting: false,
            restarts: 0,
            node_path,
            daemon_cli_path,
            resource_node_modules: None,
        }
    }

    /// Override daemon CLI path with the resolved Tauri resource path.
    pub fn set_daemon_cli_path(&mut self, path: String) {
        self.daemon_cli_path = path;
    }

    /// Set bundled node_modules path for native deps (better-sqlite3).
    pub fn set_node_path(&mut self, path: String) {
        self.resource_node_modules = Some(path);
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

fn resolve_daemon_cli() -> String {
    if let Some(path) = shell_which("sauria") {
        return path;
    }

    // Bundled .app: Contents/Resources/daemon/index.mjs
    if let Ok(exe) = std::env::current_exe() {
        if let Some(resources) = exe
            .parent()
            .and_then(|p| p.parent())
            .map(|p| p.join("Resources/daemon/index.mjs"))
        {
            if resources.exists() {
                return resources.to_string_lossy().to_string();
            }
        }
    }

    // Fallback: resolve relative to cwd or binary location
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

    "sauria".to_string()
}

fn resolve_node() -> String {
    if let Some(path) = shell_which("node") {
        return path;
    }

    #[cfg(unix)]
    {
        // Well-known paths (Homebrew Apple Silicon, Homebrew Intel)
        let well_known = ["/opt/homebrew/bin/node", "/usr/local/bin/node"];
        for candidate in well_known {
            if std::path::Path::new(candidate).exists() {
                return candidate.to_string();
            }
        }

        // NVM fallback: check default alias, then latest installed version
        if let Some(home) = dirs::home_dir() {
            let default_alias = home.join(".nvm/alias/default");
            if let Ok(alias) = fs::read_to_string(&default_alias) {
                let version = alias.trim();
                let bin = home
                    .join(".nvm/versions/node")
                    .join(version)
                    .join("bin/node");
                if bin.exists() {
                    return bin.to_string_lossy().to_string();
                }
            }

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
    }

    #[cfg(windows)]
    {
        // Well-known Windows paths
        let program_files = std::env::var("ProgramFiles").unwrap_or_else(|_| r"C:\Program Files".to_string());
        let node_default = std::path::PathBuf::from(&program_files).join("nodejs/node.exe");
        if node_default.exists() {
            return node_default.to_string_lossy().to_string();
        }

        // nvm-windows: %APPDATA%\nvm\<version>\node.exe
        if let Ok(appdata) = std::env::var("APPDATA") {
            let nvm_dir = std::path::PathBuf::from(&appdata).join("nvm");
            if let Ok(entries) = fs::read_dir(&nvm_dir) {
                let mut versions: Vec<String> = entries
                    .filter_map(|e| e.ok())
                    .filter_map(|e| e.file_name().into_string().ok())
                    .filter(|n| n.starts_with('v'))
                    .collect();
                versions.sort();
                if let Some(latest) = versions.last() {
                    let bin = nvm_dir.join(latest).join("node.exe");
                    if bin.exists() {
                        return bin.to_string_lossy().to_string();
                    }
                }
            }
        }

        // Volta: %LOCALAPPDATA%\Volta\bin\node.exe
        if let Ok(local_appdata) = std::env::var("LOCALAPPDATA") {
            let volta_node = std::path::PathBuf::from(&local_appdata).join("Volta/bin/node.exe");
            if volta_node.exists() {
                return volta_node.to_string_lossy().to_string();
            }
        }
    }

    "node".to_string()
}

fn resolve_paths() -> (String, String) {
    (resolve_node(), resolve_daemon_cli())
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

#[cfg(windows)]
fn is_process_alive(pid: i32) -> bool {
    Command::new("tasklist")
        .args(["/FI", &format!("PID eq {pid}"), "/NH"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).contains(&pid.to_string()))
        .unwrap_or(false)
}

#[cfg(unix)]
fn kill_process(pid: i32) {
    unsafe {
        libc::kill(pid, libc::SIGTERM);
    }
}

#[cfg(windows)]
fn kill_process(pid: i32) {
    let _ = Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/F"])
        .output();
}

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

    let mut cmd = tokio::process::Command::new(&s.node_path);
    cmd.args([&s.daemon_cli_path, "daemon"])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::from(err_file))
        .env("SAURIA_HOME", paths.home.to_string_lossy().as_ref());

    if let Some(ref nm) = s.resource_node_modules {
        cmd.env("NODE_PATH", nm);
    }

    let mut child = cmd.spawn()
        .map_err(|e| {
            s.starting = false;
            format!("Failed to spawn daemon: {e}")
        })?;

    // Read first status line from daemon stdout (up to 10s)
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
                // Timeout — fall back to PID file check
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

    if let Some(pid) = read_pid(paths) {
        kill_process(pid);
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
                    // Daemon is healthy — reset counter so future crashes get retried
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
