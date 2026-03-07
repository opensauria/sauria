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
