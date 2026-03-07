import { PROVIDERS } from './providers';

interface Env {
  readonly ALLOWED_REDIRECT: string;
  readonly [key: string]: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/connect/')) {
      return handleConnect(url, env);
    }

    if (url.pathname.startsWith('/callback/')) {
      return handleCallback(url, env);
    }

    if (url.pathname === '/health') {
      return new Response('ok');
    }

    return new Response('Not found', { status: 404 });
  },
};

function handleConnect(url: URL, env: Env): Response {
  const provider = url.pathname.split('/')[2];
  if (!provider) return new Response('Missing provider', { status: 400 });

  const config = PROVIDERS[provider];
  if (!config) return new Response('Unknown provider', { status: 404 });

  const state = url.searchParams.get('state') ?? '';
  const codeChallenge = url.searchParams.get('code_challenge') ?? '';
  const scopes = url.searchParams.get('scopes') ?? config.defaultScopes;
  const redirectUri = `${url.origin}/callback/${provider}`;

  const clientId = env[`${provider.toUpperCase()}_CLIENT_ID`];
  if (!clientId) return new Response('Provider not configured', { status: 500 });

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
  authUrl.searchParams.set('access_type', 'offline');

  return Response.redirect(authUrl.toString(), 302);
}

async function handleCallback(url: URL, env: Env): Promise<Response> {
  const provider = url.pathname.split('/')[2];
  if (!provider) return new Response('Missing provider', { status: 400 });

  const config = PROVIDERS[provider];
  if (!config) return new Response('Unknown provider', { status: 404 });

  const code = url.searchParams.get('code') ?? '';
  const state = url.searchParams.get('state') ?? '';

  if (!code) return new Response('Missing authorization code', { status: 400 });

  const clientId = env[`${provider.toUpperCase()}_CLIENT_ID`];
  const clientSecret = env[`${provider.toUpperCase()}_CLIENT_SECRET`];
  if (!clientId || !clientSecret) return new Response('Provider not configured', { status: 500 });

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

  if (!tokenResp.ok) {
    const body = await tokenResp.text();
    return new Response(`Token exchange failed: ${body}`, { status: 502 });
  }

  const tokens = (await tokenResp.json()) as Record<string, unknown>;
  const accessToken = tokens['access_token'] as string | undefined;
  if (!accessToken) return new Response('No access_token in response', { status: 502 });

  const refreshToken = (tokens['refresh_token'] as string) ?? '';
  const expiresIn = (tokens['expires_in'] as number) ?? 3600;

  const deepLink = `${env.ALLOWED_REDIRECT}?state=${encodeURIComponent(state)}&access_token=${encodeURIComponent(accessToken)}&refresh_token=${encodeURIComponent(refreshToken)}&expires_in=${expiresIn}`;

  return new Response(
    `<!DOCTYPE html>
<html>
<head><title>Sauria - Authorization Complete</title></head>
<body>
  <p>Authorization complete. Redirecting to Sauria...</p>
  <script>window.location.href = ${JSON.stringify(deepLink)};</script>
  <noscript><a href="${deepLink}">Click here to return to Sauria</a></noscript>
</body>
</html>`,
    { headers: { 'Content-Type': 'text/html' } },
  );
}
