use std::fs;
use std::process::Command;
use crate::paths::Paths;

pub(crate) fn resolve_paths() -> (String, String) {
    (resolve_node(), resolve_daemon_cli())
}

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

pub(crate) fn shell_which(name: &str) -> Option<String> {
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
    resolve_node_platform().unwrap_or_else(|| "node".to_string())
}

#[cfg(unix)]
fn resolve_node_platform() -> Option<String> {
    for candidate in ["/opt/homebrew/bin/node", "/usr/local/bin/node"] {
        if std::path::Path::new(candidate).exists() {
            return Some(candidate.to_string());
        }
    }

    let home = dirs::home_dir()?;
    if let Ok(alias) = fs::read_to_string(home.join(".nvm/alias/default")) {
        let bin = home.join(".nvm/versions/node").join(alias.trim()).join("bin/node");
        if bin.exists() {
            return Some(bin.to_string_lossy().to_string());
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
            return Some(nvm_dir.join(latest).join("bin/node").to_string_lossy().to_string());
        }
    }

    None
}

#[cfg(windows)]
fn resolve_node_platform() -> Option<String> {
    let program_files = std::env::var("ProgramFiles").unwrap_or_else(|_| r"C:\Program Files".to_string());
    let node_default = std::path::PathBuf::from(&program_files).join("nodejs/node.exe");
    if node_default.exists() {
        return Some(node_default.to_string_lossy().to_string());
    }

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
                    return Some(bin.to_string_lossy().to_string());
                }
            }
        }
    }

    if let Ok(local_appdata) = std::env::var("LOCALAPPDATA") {
        let volta_node = std::path::PathBuf::from(&local_appdata).join("Volta/bin/node.exe");
        if volta_node.exists() {
            return Some(volta_node.to_string_lossy().to_string());
        }
    }

    None
}

// ─── PID helpers ────────────────────────────────────────────────────

pub(crate) fn read_pid(paths: &Paths) -> Option<i32> {
    fs::read_to_string(&paths.pid_file)
        .ok()
        .and_then(|s| s.trim().parse().ok())
}

#[cfg(unix)]
pub(crate) fn is_process_alive(pid: i32) -> bool {
    unsafe { libc::kill(pid, 0) == 0 }
}

#[cfg(windows)]
pub(crate) fn is_process_alive(pid: i32) -> bool {
    Command::new("tasklist")
        .args(["/FI", &format!("PID eq {pid}"), "/NH"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).contains(&pid.to_string()))
        .unwrap_or(false)
}

#[cfg(unix)]
pub(crate) fn kill_process(pid: i32) {
    unsafe {
        libc::kill(pid, libc::SIGTERM);
    }
}

#[cfg(windows)]
pub(crate) fn kill_process(pid: i32) {
    let _ = Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/F"])
        .output();
}
