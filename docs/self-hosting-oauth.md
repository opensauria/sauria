# Self-Hosting the OAuth Proxy Worker

Sauria uses a Cloudflare Worker as an OAuth proxy for services that don't expose a remote MCP server (Gmail, Google Calendar, Google Drive, X, Reddit, LinkedIn, Zendesk). The Worker holds your OAuth client secrets and exchanges authorization codes on behalf of the desktop app.

By default, Sauria connects to `https://auth.sauria.dev`. You can deploy your own Worker for full control over credentials.

## 1. Deploy the Worker

```bash
cd workers/oauth-proxy
pnpm install
npx wrangler deploy
```

Note the deployed URL (e.g. `https://sauria-oauth-proxy.<your-account>.workers.dev`).

## 2. Register OAuth Apps

For each provider you want to support, register an OAuth application:

| Provider | Developer Console | Redirect URI |
|----------|-------------------|--------------|
| Google | console.cloud.google.com | `https://<your-worker>/callback/google` |
| X | developer.x.com | `https://<your-worker>/callback/x` |
| Reddit | reddit.com/prefs/apps | `https://<your-worker>/callback/reddit` |
| LinkedIn | linkedin.com/developers | `https://<your-worker>/callback/linkedin` |
| Zendesk | `<subdomain>.zendesk.com/admin/apps-integrations/apis` | `https://<your-worker>/callback/zendesk` |

## 3. Configure Worker Secrets

Set client IDs and secrets as Worker secrets (never in `wrangler.toml`):

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put X_CLIENT_ID
npx wrangler secret put X_CLIENT_SECRET
npx wrangler secret put REDDIT_CLIENT_ID
npx wrangler secret put REDDIT_CLIENT_SECRET
npx wrangler secret put LINKEDIN_CLIENT_ID
npx wrangler secret put LINKEDIN_CLIENT_SECRET
npx wrangler secret put ZENDESK_CLIENT_ID
npx wrangler secret put ZENDESK_CLIENT_SECRET
```

## 4. Point Sauria to Your Worker

In your Sauria config (`~/.sauria/config.json`):

```json
{
  "authProxyUrl": "https://sauria-oauth-proxy.<your-account>.workers.dev"
}
```

## 5. Adding Custom Providers

Edit `workers/oauth-proxy/src/providers.ts`:

```typescript
myservice: {
  authorizeUrl: 'https://myservice.com/oauth/authorize',
  tokenUrl: 'https://myservice.com/oauth/token',
  defaultScopes: 'read write',
  pkce: true,
},
```

Then add the corresponding catalog entry in `apps/daemon/src/integrations/catalog.ts` with `oauthProxy: 'myservice'`.

Set the Worker secrets:

```bash
npx wrangler secret put MYSERVICE_CLIENT_ID
npx wrangler secret put MYSERVICE_CLIENT_SECRET
npx wrangler deploy
```

## How It Works

1. User clicks "Connect" on an OAuth integration in the desktop app
2. Desktop opens browser to `<authProxyUrl>/connect/<provider>?state=...&code_challenge=...`
3. Worker redirects to the provider's authorization page
4. User authorizes; provider redirects back to `<authProxyUrl>/callback/<provider>`
5. Worker exchanges the code for tokens (using its stored client_secret)
6. Worker redirects to `sauria://oauth/callback` with tokens as query params
7. Desktop receives tokens via deep link, stores in vault, connects the integration

Tokens stay local to your machine. The Worker only sees them transiently during the redirect.
