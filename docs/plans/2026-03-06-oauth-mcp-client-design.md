# Sauria OAuth MCP Client — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable zero-friction OAuth 2.1 + PKCE connections to 27+ remote MCP servers, plus a Cloudflare Worker proxy for ~5 services without remote MCP.

**Architecture:** Sauria becomes an MCP OAuth 2.1 client. When a user clicks "Connect" on an integration, the desktop app opens the browser to the provider's remote MCP OAuth endpoint (or our Worker proxy for services without one). The provider handles consent, returns an auth code via deep link (`sauria://oauth/callback`), and the desktop exchanges it for tokens stored in the local vault. The daemon connects to the remote MCP server using the access token over HTTP/SSE, or spawns a local MCP server with the token as env var.

**Tech Stack:** Rust (Tauri commands), TypeScript (daemon MCP client), Cloudflare Workers (OAuth proxy), MCP SDK (`@modelcontextprotocol/sdk`).

---

## Phase 1: Types & Remote MCP Support

### Task 1: Extend IntegrationDefinition type for remote MCP

**Files:**

- Modify: `packages/types/src/integrations.ts`

**Step 1: Add remote MCP fields to types**

```typescript
// Add to McpServerTemplate — optional remote server config
export interface McpRemoteServer {
  readonly url: string; // e.g. "https://mcp.notion.com/mcp"
  readonly authorizationUrl?: string; // Override if different from MCP discovery
  readonly tokenUrl?: string; // Override if different from MCP discovery
}

// Update IntegrationDefinition
export interface IntegrationDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  readonly category: IntegrationCategory;
  readonly authType: 'local' | 'oauth' | 'token' | 'api_key';
  readonly credentialKeys: readonly string[];
  readonly mcpServer: McpServerTemplate;
  readonly mcpRemote?: McpRemoteServer; // NEW — remote MCP with OAuth
}
```

**Step 2: Build packages**

Run: `pnpm -F @sauria/types build`
Expected: Clean build

**Step 3: Commit**

```bash
git add packages/types/src/integrations.ts
git commit -m "feat: add McpRemoteServer type for remote MCP OAuth connections"
```

---

### Task 2: Update integration catalog with remote MCP URLs

**Files:**

- Modify: `apps/daemon/src/integrations/catalog.ts`

**Step 1: Add `mcpRemote` to all 27 services with remote MCP servers**

For each service that has a remote MCP, add the `mcpRemote` field. Examples:

```typescript
{
  id: 'notion',
  name: 'Notion',
  description: 'Workspace for notes, docs, and project management',
  icon: 'notion',
  category: 'productivity',
  authType: 'oauth',
  credentialKeys: [],  // OAuth flow produces token automatically
  mcpServer: {
    package: '@notionhq/notion-mcp-server',
    envMapping: { token: 'NOTION_TOKEN' },
  },
  mcpRemote: {
    url: 'https://mcp.notion.com/mcp',
  },
},
```

Full list of `mcpRemote` entries to add:

| id          | url                                                     |
| ----------- | ------------------------------------------------------- |
| notion      | `https://mcp.notion.com/mcp`                            |
| stripe      | `https://mcp.stripe.com`                                |
| hubspot     | `https://mcp.hubspot.com`                               |
| clickup     | `https://mcp.clickup.com/mcp`                           |
| sentry      | `https://mcp.sentry.dev/mcp`                            |
| cloudflare  | `https://observability.mcp.cloudflare.com/mcp`          |
| salesforce  | `https://mcp.salesforce.com`                            |
| github      | `https://api.githubcopilot.com/mcp/`                    |
| jira        | `https://mcp.atlassian.com/v1/mcp`                      |
| confluence  | `https://mcp.atlassian.com/v1/mcp`                      |
| bitbucket   | `https://mcp.atlassian.com/v1/mcp`                      |
| slack-tools | `https://mcp.slack.com/mcp`                             |
| figma       | `https://mcp.figma.com/mcp`                             |
| supabase    | `https://mcp.supabase.com/mcp`                          |
| vercel      | `https://mcp.vercel.com`                                |
| linear      | `https://mcp.linear.app/mcp`                            |
| monday      | `https://mcp.monday.com/mcp`                            |
| asana       | `https://mcp.asana.com/v2/mcp`                          |
| todoist     | `https://ai.todoist.net/mcp`                            |
| miro        | `https://mcp.miro.com/`                                 |
| canva       | `https://mcp.canva.com/mcp`                             |
| azure       | `https://mcp.azure.com/`                                |
| paypal      | `https://mcp.paypal.com/sse`                            |
| zapier      | `https://mcp.zapier.com`                                |
| datadog     | `https://mcp.datadoghq.com/api/unstable/mcp-server/mcp` |
| pagerduty   | `https://mcp.pagerduty.com/mcp`                         |
| netlify     | `https://netlify-mcp.netlify.app/mcp`                   |
| contentful  | `https://mcp.contentful.com/mcp`                        |

Also set `authType: 'oauth'` and `credentialKeys: []` for all 27 remote MCP services (the OAuth flow produces the token, user fills nothing).

**Step 2: Build and verify**

Run: `pnpm -r build && pnpm -F @sauria/daemon test`
Expected: 261 tests pass, clean build

**Step 3: Commit**

```bash
git add apps/daemon/src/integrations/catalog.ts
git commit -m "feat: add remote MCP URLs for 27 OAuth-enabled integrations"
```

---

## Phase 2: MCP Remote Client in Daemon

### Task 3: Add SSE/Streamable HTTP MCP client transport

**Files:**

- Create: `apps/daemon/src/mcp/remote-client.ts`
- Modify: `apps/daemon/src/mcp/client.ts`

**Step 1: Write the remote MCP client**

This module connects to remote MCP servers using the MCP SDK's `StreamableHTTPClientTransport` (or `SSEClientTransport` for legacy servers).

```typescript
// apps/daemon/src/mcp/remote-client.ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { Logger } from '../utils/logger.js';

export interface RemoteMcpConfig {
  readonly name: string;
  readonly url: string;
  readonly accessToken: string;
}

export async function connectRemoteMcp(
  config: RemoteMcpConfig,
  logger: Logger,
): Promise<{ client: Client; transport: StreamableHTTPClientTransport | SSEClientTransport }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.accessToken}`,
  };

  // Try Streamable HTTP first (MCP 2025-03-26+), fall back to SSE
  try {
    const transport = new StreamableHTTPClientTransport(new URL(config.url), {
      requestInit: { headers },
    });
    const client = new Client({ name: 'sauria', version: '1.0.0' });
    await client.connect(transport);
    logger.info(`Connected to remote MCP: ${config.name} via Streamable HTTP`);
    return { client, transport };
  } catch {
    const transport = new SSEClientTransport(new URL(config.url), { requestInit: { headers } });
    const client = new Client({ name: 'sauria', version: '1.0.0' });
    await client.connect(transport);
    logger.info(`Connected to remote MCP: ${config.name} via SSE`);
    return { client, transport };
  }
}
```

**Step 2: Extend McpClientManager to support remote servers**

Add a `connectRemote(config: RemoteMcpConfig)` method alongside the existing stdio `connect()`.

**Step 3: Build and verify**

Run: `pnpm -F @sauria/daemon build`
Expected: Clean build

**Step 4: Commit**

```bash
git add apps/daemon/src/mcp/remote-client.ts apps/daemon/src/mcp/client.ts
git commit -m "feat: add remote MCP client with Streamable HTTP and SSE transports"
```

---

### Task 4: Update IntegrationRegistry to support remote MCP connections

**Files:**

- Modify: `apps/daemon/src/integrations/registry.ts`

**Step 1: Add remote connection path**

In `connectInstance()`, check if the integration has `mcpRemote`. If yes, use `connectRemoteMcp()` instead of spawning a local process:

```typescript
async connectInstance(
  instanceId: string,
  integrationId: string,
  label: string,
  credentials: Record<string, string>,
): Promise<IntegrationInstanceStatus> {
  const definition = this.findDefinition(integrationId);

  if (definition.mcpRemote && credentials.accessToken) {
    // Remote MCP path — connect via HTTP/SSE with OAuth token
    const serverName = `integration:${instanceId}`;
    await this.mcpClients.connectRemote({
      name: serverName,
      url: definition.mcpRemote.url,
      accessToken: credentials.accessToken,
    });
    const tools = await this.mcpClients.listTools(serverName);
    // ... store instance, audit, return status
  } else {
    // Existing local MCP path — spawn via npx
    // ... existing code unchanged
  }
}
```

**Step 2: Add token refresh logic**

For remote connections, tokens expire. Add a method to refresh and reconnect:

```typescript
async refreshRemoteConnection(instanceId: string, newAccessToken: string): Promise<void> {
  // Disconnect old, reconnect with new token
}
```

**Step 3: Build and test**

Run: `pnpm -F @sauria/daemon build && pnpm -F @sauria/daemon test`
Expected: All tests pass

**Step 4: Commit**

```bash
git add apps/daemon/src/integrations/registry.ts
git commit -m "feat: support remote MCP connections in integration registry"
```

---

## Phase 3: OAuth 2.1 + PKCE Client (Desktop)

### Task 5: Add deep link protocol to Tauri

**Files:**

- Modify: `apps/desktop/src-tauri/tauri.conf.json`
- Modify: `apps/desktop/src-tauri/Cargo.toml`
- Modify: `apps/desktop/src-tauri/src/main.rs`

**Step 1: Add deep-link plugin to Cargo.toml**

```toml
tauri-plugin-deep-link = "2"
```

**Step 2: Register protocol in tauri.conf.json**

```json
{
  "plugins": {
    "deep-link": {
      "desktop": {
        "schemes": ["sauria"]
      }
    }
  }
}
```

**Step 3: Register deep link plugin and handler in main.rs**

```rust
use tauri_plugin_deep_link::DeepLinkExt;

// In Builder::default()
.plugin(tauri_plugin_deep_link::init())

// In setup closure
app.deep_link().on_open_url(|event| {
    // Parse sauria://oauth/callback?code=xxx&state=yyy
    // Forward to cmd_oauth_integrations::complete_integration_oauth
});
```

**Step 4: Build and verify**

Run: `cd apps/desktop && cargo check`
Expected: Compiles

**Step 5: Commit**

```bash
git add apps/desktop/src-tauri/
git commit -m "feat: add sauria:// deep link protocol for OAuth callbacks"
```

---

### Task 6: Build generic OAuth 2.1 + PKCE flow for integrations

**Files:**

- Create: `apps/desktop/src-tauri/src/cmd_oauth_integrations.rs`
- Modify: `apps/desktop/src-tauri/src/main.rs`

**Step 1: Create the OAuth integration commands**

```rust
// cmd_oauth_integrations.rs

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::LazyLock;
use tokio::sync::Mutex;
use sha2::{Sha256, Digest};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::RngCore;

#[derive(Clone)]
struct PendingOAuth {
    provider: String,
    verifier: String,
    state: String,
    mcp_url: String,
}

static PENDING: LazyLock<Mutex<HashMap<String, PendingOAuth>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

#[derive(Serialize)]
pub struct OAuthStartResult {
    started: bool,
    state: String,
}

/// Start OAuth flow for an integration.
/// 1. Discover OAuth metadata from remote MCP server
/// 2. Generate PKCE verifier + challenge
/// 3. Open browser to authorization URL
#[tauri::command]
pub async fn start_integration_oauth(
    integration_id: String,
    mcp_url: String,
    auth_url: Option<String>,     // Override for Worker proxy
    scopes: Option<String>,
) -> Result<OAuthStartResult, String> {
    // Generate PKCE
    let mut verifier_bytes = [0u8; 48];
    rand::rng().fill_bytes(&mut verifier_bytes);
    let verifier = URL_SAFE_NO_PAD.encode(verifier_bytes);

    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    let challenge = URL_SAFE_NO_PAD.encode(hasher.finalize());

    // Generate state
    let mut state_bytes = [0u8; 16];
    rand::rng().fill_bytes(&mut state_bytes);
    let state = hex::encode(state_bytes);

    // Store pending
    PENDING.lock().await.insert(state.clone(), PendingOAuth {
        provider: integration_id.clone(),
        verifier: verifier.clone(),
        state: state.clone(),
        mcp_url,
    });

    // If no auth_url override, discover from MCP server metadata
    // GET {mcp_url}/.well-known/oauth-authorization-server
    let authorize_url = if let Some(url) = auth_url {
        url
    } else {
        // MCP OAuth discovery — fetch metadata
        discover_auth_url(&mcp_url).await?
    };

    // Build authorization URL
    let redirect_uri = "sauria://oauth/callback";
    let url = format!(
        "{}?response_type=code&client_id={}&redirect_uri={}&state={}&code_challenge={}&code_challenge_method=S256{}",
        authorize_url,
        "sauria-desktop",  // Dynamic client registration or pre-registered
        urlencoding::encode(redirect_uri),
        state,
        challenge,
        scopes.map(|s| format!("&scope={}", urlencoding::encode(&s))).unwrap_or_default(),
    );

    open::that(&url).map_err(|e| e.to_string())?;

    Ok(OAuthStartResult { started: true, state })
}

/// Complete OAuth flow — exchange code for tokens.
#[tauri::command]
pub async fn complete_integration_oauth(
    code: String,
    state: String,
    paths: tauri::State<'_, crate::paths::Paths>,
    client: tauri::State<'_, std::sync::Arc<crate::daemon_client::DaemonClient>>,
) -> Result<serde_json::Value, String> {
    let pending = {
        let mut map = PENDING.lock().await;
        map.remove(&state).ok_or("No pending OAuth for this state")?
    };

    // Discover token endpoint
    let token_url = discover_token_url(&pending.mcp_url).await?;

    // Exchange code for tokens
    let http = reqwest::Client::new();
    let resp = http.post(&token_url)
        .json(&serde_json::json!({
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": "sauria://oauth/callback",
            "client_id": "sauria-desktop",
            "code_verifier": pending.verifier,
        }))
        .send().await.map_err(|e| e.to_string())?;

    let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;

    let access_token = body["access_token"].as_str()
        .ok_or("No access_token in response")?;
    let refresh_token = body.get("refresh_token")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let expires_in = body.get("expires_in")
        .and_then(|v| v.as_u64())
        .unwrap_or(3600);

    // Store in vault
    let credential = serde_json::json!({
        "kind": "oauth",
        "accessToken": access_token,
        "refreshToken": refresh_token,
        "expiresAt": chrono::Utc::now().timestamp_millis() + (expires_in as i64 * 1000),
    });
    let vault_key = format!("integration_oauth_{}", pending.provider);
    crate::vault::vault_store(&paths, &vault_key, &credential.to_string())?;

    // Tell daemon to connect the integration with the token
    let connect_result = client.request(
        "integrations:connect-instance",
        serde_json::json!({
            "instanceId": format!("{}:default", pending.provider),
            "integrationId": pending.provider,
            "label": "default",
            "credentials": { "accessToken": access_token },
        }),
    ).await.map_err(|e| e.to_string())?;

    Ok(connect_result)
}

/// Discover OAuth authorization URL from MCP server metadata.
async fn discover_auth_url(mcp_url: &str) -> Result<String, String> {
    let base = mcp_url.trim_end_matches("/mcp").trim_end_matches('/');
    let metadata_url = format!("{}/.well-known/oauth-authorization-server", base);
    let http = reqwest::Client::new();
    let resp = http.get(&metadata_url)
        .send().await.map_err(|e| e.to_string())?;
    let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    body["authorization_endpoint"].as_str()
        .map(String::from)
        .ok_or("No authorization_endpoint in metadata".into())
}

/// Discover OAuth token URL from MCP server metadata.
async fn discover_token_url(mcp_url: &str) -> Result<String, String> {
    let base = mcp_url.trim_end_matches("/mcp").trim_end_matches('/');
    let metadata_url = format!("{}/.well-known/oauth-authorization-server", base);
    let http = reqwest::Client::new();
    let resp = http.get(&metadata_url)
        .send().await.map_err(|e| e.to_string())?;
    let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    body["token_endpoint"].as_str()
        .map(String::from)
        .ok_or("No token_endpoint in metadata".into())
}
```

**Step 2: Register commands in main.rs**

Add to `invoke_handler`:

```rust
cmd_oauth_integrations::start_integration_oauth,
cmd_oauth_integrations::complete_integration_oauth,
```

**Step 3: Build and verify**

Run: `cd apps/desktop && cargo check`
Expected: Compiles

**Step 4: Commit**

```bash
git add apps/desktop/src-tauri/src/cmd_oauth_integrations.rs apps/desktop/src-tauri/src/main.rs
git commit -m "feat: generic OAuth 2.1 + PKCE flow for MCP integrations"
```

---

### Task 7: Add token refresh daemon-side

**Files:**

- Create: `apps/daemon/src/integrations/token-refresh.ts`
- Modify: `apps/daemon/src/daemon-lifecycle.ts`

**Step 1: Write token refresh service**

Periodically checks OAuth tokens and refreshes before expiry:

```typescript
// apps/daemon/src/integrations/token-refresh.ts
import type { VaultClient } from '../config/vault-client.js';
import type { Logger } from '../utils/logger.js';

const REFRESH_MARGIN_MS = 5 * 60 * 1000; // Refresh 5 min before expiry

export class TokenRefreshService {
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly vault: VaultClient,
    private readonly logger: Logger,
  ) {}

  scheduleRefresh(integrationId: string, tokenUrl: string, expiresAt: number): void {
    const delay = Math.max(0, expiresAt - Date.now() - REFRESH_MARGIN_MS);
    const timer = setTimeout(() => this.refresh(integrationId, tokenUrl), delay);
    this.timers.set(integrationId, timer);
  }

  private async refresh(integrationId: string, tokenUrl: string): Promise<void> {
    const vaultKey = `integration_oauth_${integrationId}`;
    const stored = await this.vault.get(vaultKey);
    if (!stored) return;

    const credential = JSON.parse(stored);
    if (!credential.refreshToken) return;

    try {
      const resp = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          refresh_token: credential.refreshToken,
          client_id: 'sauria-desktop',
        }),
      });
      const body = (await resp.json()) as Record<string, unknown>;
      const newCredential = {
        kind: 'oauth',
        accessToken: body.access_token as string,
        refreshToken: (body.refresh_token as string) || credential.refreshToken,
        expiresAt: Date.now() + ((body.expires_in as number) || 3600) * 1000,
      };
      await this.vault.store(vaultKey, JSON.stringify(newCredential));
      this.logger.info(`Refreshed OAuth token for ${integrationId}`);

      // Schedule next refresh
      this.scheduleRefresh(integrationId, tokenUrl, newCredential.expiresAt);
    } catch (err) {
      this.logger.error(`Failed to refresh token for ${integrationId}`, err);
    }
  }

  stop(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }
}
```

**Step 2: Integrate into daemon lifecycle**

In `startDaemonContext()`, create `TokenRefreshService` and schedule refreshes for connected OAuth integrations.

**Step 3: Build and test**

Run: `pnpm -F @sauria/daemon build && pnpm -F @sauria/daemon test`
Expected: All tests pass

**Step 4: Commit**

```bash
git add apps/daemon/src/integrations/token-refresh.ts apps/daemon/src/daemon-lifecycle.ts
git commit -m "feat: automatic OAuth token refresh for remote MCP integrations"
```

---

## Phase 4: Desktop UI Updates

### Task 8: Update integrations UI for OAuth connect

**Files:**

- Modify: `apps/desktop/src/renderer/integrations/main.ts`

**Step 1: Change the connect flow for OAuth integrations**

When `definition.authType === 'oauth'` AND `definition.mcpRemote` exists:

- Show a single "Connect with {provider}" button (no credential form)
- On click, call `start_integration_oauth` with the remote MCP URL
- Show a "Waiting for authorization..." spinner

When `definition.authType === 'token'` or `'api_key'`:

- Keep existing credential form (unchanged)

**Step 2: Handle OAuth callback**

Listen for `integration-oauth-complete` Tauri event (emitted by deep link handler):

- Refresh catalog
- Show success message with tool count

**Step 3: Build and verify**

Run: `cd apps/desktop && pnpm run build`
Expected: Full build succeeds

**Step 4: Commit**

```bash
git add apps/desktop/src/renderer/integrations/main.ts
git commit -m "feat: one-click OAuth connect for remote MCP integrations"
```

---

## Phase 5: Cloudflare Worker OAuth Proxy

### Task 9: Create the Worker for services without remote MCP

**Files:**

- Create: `workers/oauth-proxy/src/index.ts`
- Create: `workers/oauth-proxy/src/providers.ts`
- Create: `workers/oauth-proxy/wrangler.toml`
- Create: `workers/oauth-proxy/package.json`
- Create: `workers/oauth-proxy/tsconfig.json`

**Step 1: Create wrangler.toml**

```toml
name = "sauria-oauth-proxy"
main = "src/index.ts"
compatibility_date = "2025-12-01"

[vars]
ALLOWED_REDIRECT = "sauria://oauth/callback"
```

**Step 2: Create provider config**

```typescript
// workers/oauth-proxy/src/providers.ts
export interface ProviderConfig {
  readonly authorizeUrl: string;
  readonly tokenUrl: string;
  readonly defaultScopes: string;
  readonly pkce: boolean;
}

export const PROVIDERS: Record<string, ProviderConfig> = {
  google: {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    defaultScopes:
      'https://mail.google.com/ https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/drive',
    pkce: true,
  },
  x: {
    authorizeUrl: 'https://x.com/i/oauth2/authorize',
    tokenUrl: 'https://api.x.com/2/oauth2/token',
    defaultScopes: 'tweet.read tweet.write users.read offline.access',
    pkce: true,
  },
  reddit: {
    authorizeUrl: 'https://www.reddit.com/api/v1/authorize',
    tokenUrl: 'https://www.reddit.com/api/v1/access_token',
    defaultScopes: 'identity read submit vote',
    pkce: true,
  },
  linkedin: {
    authorizeUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    defaultScopes: 'openid profile email w_member_social',
    pkce: true,
  },
  zendesk: {
    authorizeUrl: 'https://{subdomain}.zendesk.com/oauth/authorizations/new',
    tokenUrl: 'https://{subdomain}.zendesk.com/oauth/tokens',
    defaultScopes: 'read write',
    pkce: true,
  },
};
```

**Step 3: Create Worker handler**

```typescript
// workers/oauth-proxy/src/index.ts
import { PROVIDERS } from './providers';

interface Env {
  // Per-provider secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, etc.
  [key: string]: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // GET /connect/:provider — redirect to OAuth provider
    if (url.pathname.startsWith('/connect/')) {
      return handleConnect(url, env);
    }

    // GET /callback/:provider — handle OAuth callback
    if (url.pathname.startsWith('/callback/')) {
      return handleCallback(url, env);
    }

    // GET /health
    if (url.pathname === '/health') {
      return new Response('ok');
    }

    return new Response('Not found', { status: 404 });
  },
};

function handleConnect(url: URL, env: Env): Response {
  const provider = url.pathname.split('/')[2];
  const config = PROVIDERS[provider];
  if (!config) return new Response('Unknown provider', { status: 404 });

  const state = url.searchParams.get('state') || '';
  const codeChallenge = url.searchParams.get('code_challenge') || '';
  const scopes = url.searchParams.get('scopes') || config.defaultScopes;
  const redirectUri = `${url.origin}/callback/${provider}`;

  const clientId = env[`${provider.toUpperCase()}_CLIENT_ID`];

  const authUrl = new URL(config.authorizeUrl);
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('scope', scopes);
  if (config.pkce) {
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
  }
  authUrl.searchParams.set('access_type', 'offline'); // Google-specific, ignored by others

  return Response.redirect(authUrl.toString(), 302);
}

async function handleCallback(url: URL, env: Env): Promise<Response> {
  const provider = url.pathname.split('/')[2];
  const config = PROVIDERS[provider];
  if (!config) return new Response('Unknown provider', { status: 404 });

  const code = url.searchParams.get('code') || '';
  const state = url.searchParams.get('state') || '';

  // Exchange code for tokens server-side (Worker has client_secret)
  const clientId = env[`${provider.toUpperCase()}_CLIENT_ID`];
  const clientSecret = env[`${provider.toUpperCase()}_CLIENT_SECRET`];
  const redirectUri = `${url.origin}/callback/${provider}`;

  const tokenResp = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  const tokens = (await tokenResp.json()) as Record<string, unknown>;

  // Redirect to Sauria deep link with tokens
  // Note: tokens are sent via deep link — acceptable because:
  // 1. Deep links are local-only (not over network)
  // 2. The access_token is already in the URL fragment for many OAuth flows
  const deepLink = `sauria://oauth/callback?state=${state}&access_token=${encodeURIComponent(tokens.access_token as string)}&refresh_token=${encodeURIComponent((tokens.refresh_token as string) || '')}&expires_in=${tokens.expires_in || 3600}`;

  // Return HTML that redirects via JS (some browsers block direct deep link redirects)
  return new Response(
    `
    <!DOCTYPE html>
    <html>
    <head><title>Sauria - Authorization Complete</title></head>
    <body>
      <p>Authorization complete. Redirecting to Sauria...</p>
      <script>window.location.href = ${JSON.stringify(deepLink)};</script>
      <noscript><a href="${deepLink}">Click here to return to Sauria</a></noscript>
    </body>
    </html>
  `,
    { headers: { 'Content-Type': 'text/html' } },
  );
}
```

**Step 4: Commit**

```bash
git add workers/
git commit -m "feat: Cloudflare Worker OAuth proxy for services without remote MCP"
```

---

### Task 10: Add Worker proxy config to Sauria

**Files:**

- Modify: `packages/config/src/schema.ts` (or equivalent config schema)
- Modify: `apps/daemon/src/integrations/catalog.ts`

**Step 1: Add auth proxy URL to config**

Default: `https://auth.sauria.app`
Self-hosted: `https://my-worker.workers.dev`

**Step 2: Update catalog entries for Worker-proxied services**

For services that need the Worker (no remote MCP but have OAuth + PKCE):

```typescript
{
  id: 'google-calendar',
  // ...
  authType: 'oauth',
  credentialKeys: [],
  mcpServer: { /* local npm package */ },
  // No mcpRemote — Worker handles OAuth, then local MCP uses the token
},
```

The desktop UI detects: `authType === 'oauth'` + no `mcpRemote` = use Worker proxy.

**Step 3: Commit**

```bash
git add packages/config/ apps/daemon/src/integrations/catalog.ts
git commit -m "feat: configure Worker proxy URL for non-remote OAuth integrations"
```

---

## Phase 6: Documentation & Self-Hosting

### Task 11: Write self-hosting docs

**Files:**

- Create: `docs/self-hosting-oauth.md`

Document:

1. How to fork and deploy the Worker (`wrangler deploy`)
2. How to register OAuth apps with each provider
3. How to configure `SAURIA_AUTH_URL` in Sauria
4. How to add custom OAuth providers

**Commit:**

```bash
git add docs/self-hosting-oauth.md
git commit -m "docs: add self-hosting guide for OAuth proxy Worker"
```

---

## Phase 7: Verification & Build

### Task 12: Full integration test

**Step 1:** `pnpm -r build` — all packages build
**Step 2:** `pnpm -F @sauria/daemon test` — 261+ tests pass
**Step 3:** `pnpm -r typecheck` — no type errors
**Step 4:** Full production build: `cd apps/desktop && pnpm run build`
**Step 5:** Install and test: connect one remote MCP integration (e.g., Notion), verify tools appear

---

## OAuth Provider Registration Checklist

When deploying the Worker, register OAuth apps at these URLs:

| Provider      | Developer Portal                          | What to Register                                                |
| ------------- | ----------------------------------------- | --------------------------------------------------------------- |
| **Google**    | console.cloud.google.com/apis/credentials | OAuth 2.0 Client ID (Web app), enable Gmail/Calendar/Drive APIs |
| **X/Twitter** | developer.x.com                           | User Authentication Settings, OAuth 2.0 with PKCE               |
| **Reddit**    | reddit.com/prefs/apps                     | Web app, redirect to Worker callback                            |
| **LinkedIn**  | linkedin.com/developers/apps              | OAuth 2.0 Settings, request Products                            |
| **Zendesk**   | Admin Center > Apps > OAuth Clients       | OAuth client per subdomain                                      |

For remote MCP services (27 services), NO registration needed — the provider handles everything.

---

## Summary

| Phase | What                          | Services Covered                                  |
| ----- | ----------------------------- | ------------------------------------------------- |
| 1-2   | Types + Remote MCP client     | 27 services (Notion, Stripe, GitHub, Slack...)    |
| 3     | OAuth 2.1 + PKCE desktop flow | All OAuth services                                |
| 4     | Desktop UI one-click connect  | All OAuth services                                |
| 5     | Worker proxy                  | 5 services (Google, X, Reddit, LinkedIn, Zendesk) |
| 6     | Self-hosting docs             | —                                                 |
| 7     | Full verification             | All                                               |

**Total: 32 zero-friction OAuth integrations, 3 token paste (Discord, Basecamp, Evernote), rest API key/local.**
