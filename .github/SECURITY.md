# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 1.x     | Yes                |

## Reporting a Vulnerability

If you discover a security vulnerability in Sauria, please report it
responsibly:

1. **Do NOT open a public issue.**
2. Email **t.bouancheau@gmail.com** with:
   - A description of the vulnerability
   - Steps to reproduce
   - Potential impact
3. You will receive an acknowledgment within 48 hours.
4. A fix will be developed privately and released as a patch.

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
