# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 1.0.x   | Yes       |
| < 1.0   | No        |

## Reporting a Vulnerability

We take security seriously. If you discover a vulnerability, please report it responsibly.

**Do not open a public GitHub issue for security vulnerabilities.**

### How to Report

1. Email **security@sauria.ai** with a detailed description of the vulnerability.
2. Include steps to reproduce the issue.
3. Provide the affected version(s) and any relevant environment details.
4. If possible, suggest a fix or mitigation.

### What to Expect

- **Acknowledgment** within 48 hours of your report.
- **Assessment** and severity classification within 5 business days.
- **Resolution** timeline communicated once the issue is confirmed.
- **Credit** in the release notes (unless you prefer anonymity).

We will not take legal action against researchers who follow responsible disclosure.

## Security Design Principles

Sauria is built with a security-first architecture:

- **Local-first data**: All user data stays on the local machine by default. No data leaves the device unless explicitly configured.
- **Encrypted vault**: Sensitive data (API keys, tokens) is stored in an encrypted vault directory with restricted file permissions (700).
- **No remote telemetry**: Sauria does not phone home or collect usage data.
- **Minimal attack surface**: No embedded HTTP server, no open ports, no listening sockets.
- **Banned patterns**: CI enforces a blocklist of dangerous patterns (`child_process`, `eval`, `Function()`, `vm.run`, `createServer`, `.listen`) in source code.
- **Non-root containers**: Docker images run as a non-root user (uid 1000) with read-only root filesystem, dropped capabilities, and no-new-privileges.
- **Dependency hygiene**: Dependencies are pinned, audited, and kept minimal.
- **Input validation**: All user and external input is validated with Zod schemas before processing.
