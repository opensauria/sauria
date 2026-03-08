import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, platform } from 'node:os';
import { paths } from '../config/paths.js';

const LABEL = 'ai.sauria.daemon';

function sauriaBinPath(): string {
  return process.argv[1] ?? 'sauria';
}

function generateLaunchdPlist(): string {
  const bin = sauriaBinPath();
  const logDir = paths.logs;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${bin}</string>
        <string>daemon</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>
    <key>StandardOutPath</key>
    <string>${logDir}/daemon.log</string>
    <key>StandardErrorPath</key>
    <string>${logDir}/daemon.err</string>
    <key>ThrottleInterval</key>
    <integer>30</integer>
</dict>
</plist>`;
}

function generateSystemdUnit(): string {
  const bin = sauriaBinPath();
  return `[Unit]
Description=Sauria Daemon
After=network.target

[Service]
Type=simple
ExecStart=${bin} daemon
Restart=on-failure
RestartSec=30
Environment=NODE_ENV=production

[Install]
WantedBy=default.target`;
}

export interface DaemonServiceResult {
  readonly platform: string;
  readonly servicePath: string;
  readonly activationCommand: string;
}

export function generateDaemonService(): DaemonServiceResult | null {
  const os = platform();

  if (os === 'darwin') {
    const launchAgents = join(homedir(), 'Library', 'LaunchAgents');
    if (!existsSync(launchAgents)) {
      mkdirSync(launchAgents, { recursive: true });
    }
    const plistPath = join(launchAgents, `${LABEL}.plist`);
    writeFileSync(plistPath, generateLaunchdPlist(), 'utf-8');
    return {
      platform: 'macOS',
      servicePath: plistPath,
      activationCommand: `launchctl load -w "${plistPath}"`,
    };
  }

  if (os === 'linux') {
    const systemdDir = join(homedir(), '.config', 'systemd', 'user');
    if (!existsSync(systemdDir)) {
      mkdirSync(systemdDir, { recursive: true });
    }
    const unitPath = join(systemdDir, 'sauria.service');
    writeFileSync(unitPath, generateSystemdUnit(), 'utf-8');
    return {
      platform: 'Linux',
      servicePath: unitPath,
      activationCommand: 'systemctl --user enable --now sauria',
    };
  }

  if (os === 'win32') {
    // Windows Task Scheduler — generate XML but activation needs schtasks.exe
    const taskDir = join(paths.home, 'service');
    if (!existsSync(taskDir)) {
      mkdirSync(taskDir, { recursive: true });
    }
    const bin = sauriaBinPath();
    const xmlPath = join(taskDir, 'sauria-task.xml');
    const xml = `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Sauria Daemon</Description>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger><Enabled>true</Enabled></LogonTrigger>
  </Triggers>
  <Actions>
    <Exec>
      <Command>${bin}</Command>
      <Arguments>daemon</Arguments>
    </Exec>
  </Actions>
  <Settings>
    <RestartOnFailure>
      <Interval>PT1M</Interval>
      <Count>3</Count>
    </RestartOnFailure>
  </Settings>
</Task>`;
    writeFileSync(xmlPath, xml, 'utf-8');
    return {
      platform: 'Windows',
      servicePath: xmlPath,
      activationCommand: `schtasks /create /tn "Sauria" /xml "${xmlPath}"`,
    };
  }

  return null;
}
