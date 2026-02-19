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
    running: bool,
    starting: bool,
    restarts: u32,
    health_check_running: bool,
    node_path: String,
    opensauria_path: String,
}

impl DaemonState {
    pub fn new() -> Self {
        let (node_path, opensauria_path) = resolve_node_bin();
        Self {
            process: None,
            running: false,
            starting: false,
            restarts: 0,
            health_check_running: false,
            node_path,
            opensauria_path,
        }
    }
}

fn resolve_login_shell() -> (String, Vec<String>) {
    #[cfg(target_os = "windows")]
    {
        ("cmd.exe".to_string(), vec!["/c".to_string()])
    }

    #[cfg(target_os = "macos")]
    {
        let candidates = ["/bin/zsh", "/bin/bash"];
        for sh in candidates {
            if std::path::Path::new(sh).exists() {
                return (sh.to_string(), vec!["-lc".to_string()]);
            }
        }
        ("/bin/sh".to_string(), vec!["-lc".to_string()])
    }

    #[cfg(target_os = "linux")]
    {
        let candidates = ["/bin/bash", "/bin/zsh", "/bin/sh"];
        for sh in candidates {
            if std::path::Path::new(sh).exists() {
                return (sh.to_string(), vec!["-lc".to_string()]);
            }
        }
        ("/bin/sh".to_string(), vec!["-lc".to_string()])
    }
}

fn resolve_node_bin() -> (String, String) {
    let (shell, args) = resolve_login_shell();

    #[cfg(not(target_os = "windows"))]
    let which_cmd = "which";
    #[cfg(target_os = "windows")]
    let which_cmd = "where";

    let resolve = |name: &str| -> Option<String> {
        let mut cmd_args = args.clone();
        cmd_args.push(format!("{which_cmd} {name}"));
        Command::new(&shell)
            .args(&cmd_args)
            .output()
            .ok()
            .and_then(|o| {
                String::from_utf8(o.stdout)
                    .ok()
                    .map(|s| s.trim().lines().next().unwrap_or("").to_string())
            })
            .filter(|s| !s.is_empty())
    };

    let opensauria_path = resolve("opensauria").unwrap_or_else(|| "opensauria".to_string());
    let node_path = resolve("node").unwrap_or_else(|| {
        // NVM fallback
        #[cfg(not(target_os = "windows"))]
        {
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
        }
        "node".to_string()
    });

    (node_path, opensauria_path)
}

pub fn is_daemon_running_by_pid(paths: &Paths) -> bool {
    if let Ok(pid_str) = fs::read_to_string(&paths.pid_file) {
        if let Ok(pid) = pid_str.trim().parse::<i32>() {
            #[cfg(unix)]
            {
                // signal 0 tests if process exists
                unsafe {
                    return libc::kill(pid, 0) == 0;
                }
            }
            #[cfg(not(unix))]
            {
                let _ = pid;
                return false;
            }
        }
    }
    false
}

pub fn is_configured(paths: &Paths) -> bool {
    paths.config.exists()
}

pub async fn start_daemon(state: &Arc<Mutex<DaemonState>>, paths: &Paths) -> Result<(), String> {
    let mut s = state.lock().await;

    if s.starting || s.running {
        return Ok(());
    }
    if is_daemon_running_by_pid(paths) {
        s.running = true;
        return Ok(());
    }

    s.starting = true;

    let log_dir = &paths.logs;
    let _ = fs::create_dir_all(log_dir);

    let err_path = log_dir.join("daemon.err");
    let err_file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&err_path)
        .map_err(|e| format!("Failed to open error log: {e}"))?;

    let child = tokio::process::Command::new(&s.node_path)
        .args([&s.opensauria_path, "daemon"])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::from(err_file))
        .env("OPENSAURIA_HOME", paths.home.to_string_lossy().as_ref())
        .spawn()
        .map_err(|e| format!("Failed to spawn daemon: {e}"))?;

    s.process = Some(child);
    s.running = true;
    s.starting = false;
    s.restarts = 0;

    Ok(())
}

pub async fn stop_daemon(state: &Arc<Mutex<DaemonState>>, paths: &Paths) {
    let mut s = state.lock().await;

    if let Some(mut child) = s.process.take() {
        let _ = child.kill().await;
    }

    // Also try to kill by PID file
    if let Ok(pid_str) = fs::read_to_string(&paths.pid_file) {
        if let Ok(pid) = pid_str.trim().parse::<i32>() {
            #[cfg(unix)]
            unsafe {
                libc::kill(pid, libc::SIGTERM);
            }
        }
    }

    s.running = false;
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
                !s.running && is_configured(&paths) && s.restarts < MAX_RESTARTS
            };
            if should_restart {
                let mut s = state.lock().await;
                s.restarts += 1;
                drop(s);
                let _ = start_daemon(&state, &paths).await;
            }
        }
    })
}
