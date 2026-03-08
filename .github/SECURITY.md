# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 1.x     | Yes       |
| < 1.0   | No        |

## Reporting a Vulnerability

We take security seriously. If you discover a vulnerability, please report it responsibly.

**Do not open a public GitHub issue for security vulnerabilities.**

### How to Report

1. Email **security@sauria.dev** with:
   - A detailed description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Affected version(s) and relevant environment details
   - If possible, a suggested fix or mitigation
2. You will receive an acknowledgment within 48 hours.
3. Assessment and severity classification within 5 business days.
4. A fix will be developed privately and released as a patch.
5. Credit in the release notes (unless you prefer anonymity).

We will not take legal action against researchers who follow responsible disclosure.

## Scope

The following are in scope:

- Vault encryption and key derivation
- Channel authentication and token handling
- Input sanitization and injection prevention
- IPC protocol security
- PII handling and scrubbing

## Out of Scope

- Vulnerabilities in third-party dependencies (report upstream)
- Social engineering attacks
- Denial of service on local daemon (runs locally)

## Security Design Principles

Sauria is built with a security-first architecture:

- **Local-first data**: All user data stays on the local machine by default. No data leaves the device unless explicitly configured.
- **Encrypted vault**: Sensitive data (API keys, tokens) is stored in an encrypted vault (AES-256-GCM, PBKDF2 key derivation) with restricted file permissions (700).
- **No remote telemetry**: Sauria does not phone home or collect usage data.
- **Minimal attack surface**: No embedded HTTP server, no open ports, no listening sockets.
- **Banned patterns**: CI enforces a blocklist of dangerous patterns (`eval`, `Function()`, `vm.run`, `createServer`, `.listen`) in source code.
- **Non-root containers**: Docker images run as a non-root user (uid 1000) with read-only root filesystem, dropped capabilities, and no-new-privileges.
- **Dependency hygiene**: Dependencies are pinned, audited, and kept minimal.
- **Input validation**: All user and external input is validated with Zod schemas before processing.
- **PII scrubbing**: Personal data is scrubbed before any AI call or log write.
