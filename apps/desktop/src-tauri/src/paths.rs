use std::path::PathBuf;

pub struct Paths {
    pub home: PathBuf,
    pub config: PathBuf,
    pub vault: PathBuf,
    pub canvas: PathBuf,
    #[cfg_attr(windows, allow(dead_code))]
    pub socket: PathBuf,
    #[cfg_attr(not(windows), allow(dead_code))]
    pub ipc_port: PathBuf,
    pub pid_file: PathBuf,
    pub logs: PathBuf,
    pub bot_profiles: PathBuf,
    pub owner_commands: PathBuf,
}

impl Paths {
    pub fn resolve() -> Self {
        let home = std::env::var("SAURIA_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|_| {
                dirs::home_dir()
                    .unwrap_or_else(|| PathBuf::from("/tmp"))
                    .join(".sauria")
            });

        Self {
            config: home.join("config.json5"),
            vault: home.join("vault"),
            canvas: home.join("canvas.json"),
            socket: home.join("daemon.sock"),
            ipc_port: home.join("daemon.port"),
            pid_file: home.join("daemon.pid"),
            logs: home.join("logs"),
            bot_profiles: home.join("bot-profiles.json"),
            owner_commands: home.join("owner-commands.jsonl"),
            home,
        }
    }
}
