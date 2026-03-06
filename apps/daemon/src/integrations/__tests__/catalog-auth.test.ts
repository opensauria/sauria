import { describe, it, expect } from 'vitest';
import type { IntegrationCategory, IntegrationDefinition } from '@sauria/types';
import { INTEGRATION_CATALOG } from '../catalog.js';

const VALID_AUTH_TYPES = ['api_key', 'oauth', 'token', 'both'] as const;

const VALID_CATEGORIES: readonly IntegrationCategory[] = [
  'communication',
  'project_management',
  'development',
  'productivity',
  'infrastructure',
  'monitoring',
  'ecommerce',
  'design',
  'data',
  'crm',
  'automation',
  'content',
  'storage',
  'social',
  'marketing',
  'support',
  'cms',
];

const KEBAB_CASE_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

function findById(id: string): IntegrationDefinition | undefined {
  return INTEGRATION_CATALOG.find((i) => i.id === id);
}

describe('integration catalog structure', () => {
  it('every integration has a valid authType', () => {
    for (const integration of INTEGRATION_CATALOG) {
      expect(
        VALID_AUTH_TYPES.includes(integration.authType),
        `${integration.id} has invalid authType: ${integration.authType}`,
      ).toBe(true);
    }
  });

  it('every oauth integration has mcpRemote or oauthProxy', () => {
    const oauthIntegrations = INTEGRATION_CATALOG.filter(
      (i) => i.authType === 'oauth',
    );

    for (const integration of oauthIntegrations) {
      const hasMcpRemote = integration.mcpRemote !== undefined;
      const hasOauthProxy = integration.oauthProxy !== undefined;
      expect(
        hasMcpRemote || hasOauthProxy,
        `${integration.id} has authType 'oauth' but neither mcpRemote nor oauthProxy`,
      ).toBe(true);
    }
  });

  it('every both integration has mcpRemote and non-empty credentialKeys', () => {
    const bothIntegrations = INTEGRATION_CATALOG.filter(
      (i) => i.authType === 'both',
    );

    for (const integration of bothIntegrations) {
      expect(
        integration.mcpRemote,
        `${integration.id} has authType 'both' but no mcpRemote`,
      ).toBeDefined();
      expect(
        integration.credentialKeys.length,
        `${integration.id} has authType 'both' but empty credentialKeys`,
      ).toBeGreaterThan(0);
    }
  });

  it('every api_key or token integration has non-empty credentialKeys', () => {
    const manualIntegrations = INTEGRATION_CATALOG.filter(
      (i) => i.authType === 'api_key' || i.authType === 'token',
    );

    for (const integration of manualIntegrations) {
      expect(
        integration.credentialKeys.length,
        `${integration.id} has authType '${integration.authType}' but empty credentialKeys`,
      ).toBeGreaterThan(0);
    }
  });

  it('no integration requiring manual credentials has empty credentialKeys', () => {
    const manualAuthTypes = new Set(['api_key', 'token', 'both']);

    for (const integration of INTEGRATION_CATALOG) {
      if (manualAuthTypes.has(integration.authType)) {
        expect(
          integration.credentialKeys.length,
          `${integration.id} requires manual credentials but credentialKeys is empty`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it('every credentialKey has a matching entry in mcpServer.envMapping', () => {
    for (const integration of INTEGRATION_CATALOG) {
      const { envMapping } = integration.mcpServer;

      for (const key of integration.credentialKeys) {
        expect(
          key in envMapping,
          `${integration.id}: credentialKey '${key}' has no matching key in envMapping`,
        ).toBe(true);
      }
    }
  });
});

describe('oauth-specific validations', () => {
  it('all mcpRemote URLs are valid HTTPS URLs', () => {
    const withRemote = INTEGRATION_CATALOG.filter(
      (i) => i.mcpRemote !== undefined,
    );

    for (const integration of withRemote) {
      const { url } = integration.mcpRemote!;
      expect(
        () => new URL(url),
        `${integration.id}: mcpRemote url is not a valid URL: ${url}`,
      ).not.toThrow();

      const parsed = new URL(url);
      expect(
        parsed.protocol,
        `${integration.id}: mcpRemote url must be HTTPS: ${url}`,
      ).toBe('https:');
    }
  });

  it('all oauthProxy values are non-empty strings', () => {
    const withProxy = INTEGRATION_CATALOG.filter(
      (i) => i.oauthProxy !== undefined,
    );

    for (const integration of withProxy) {
      expect(
        integration.oauthProxy!.length,
        `${integration.id}: oauthProxy is empty`,
      ).toBeGreaterThan(0);
    }
  });

  it('no integration has both mcpRemote and oauthProxy', () => {
    for (const integration of INTEGRATION_CATALOG) {
      const hasBoth =
        integration.mcpRemote !== undefined &&
        integration.oauthProxy !== undefined;
      expect(
        hasBoth,
        `${integration.id} has both mcpRemote and oauthProxy (mutually exclusive)`,
      ).toBe(false);
    }
  });
});

describe('catalog consistency', () => {
  it('all IDs are unique', () => {
    const ids = INTEGRATION_CATALOG.map((i) => i.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('all IDs are kebab-case', () => {
    for (const integration of INTEGRATION_CATALOG) {
      expect(
        KEBAB_CASE_RE.test(integration.id),
        `${integration.id} is not kebab-case`,
      ).toBe(true);
    }
  });

  it('all categories are valid IntegrationCategory values', () => {
    for (const integration of INTEGRATION_CATALOG) {
      expect(
        VALID_CATEGORIES.includes(integration.category),
        `${integration.id} has invalid category: ${integration.category}`,
      ).toBe(true);
    }
  });

  it('every integration has a non-empty name, description, and icon', () => {
    for (const integration of INTEGRATION_CATALOG) {
      expect(
        integration.name.length,
        `${integration.id}: name is empty`,
      ).toBeGreaterThan(0);
      expect(
        integration.description.length,
        `${integration.id}: description is empty`,
      ).toBeGreaterThan(0);
      expect(
        integration.icon.length,
        `${integration.id}: icon is empty`,
      ).toBeGreaterThan(0);
    }
  });

  it('every mcpServer has a non-empty package name', () => {
    for (const integration of INTEGRATION_CATALOG) {
      expect(
        integration.mcpServer.package.length,
        `${integration.id}: mcpServer.package is empty`,
      ).toBeGreaterThan(0);
    }
  });
});

describe('known OAuth services (dynamic registration)', () => {
  const DYNAMIC_OAUTH_IDS = [
    'linear',
    'jira',
    'monday',
    'notion',
    'cloudflare',
    'sentry',
    'stripe',
    'paypal',
    'canva',
    'contentful',
  ] as const;

  for (const id of DYNAMIC_OAUTH_IDS) {
    it(`${id} has authType 'oauth'`, () => {
      const integration = findById(id);
      expect(integration, `${id} not found in catalog`).toBeDefined();
      expect(integration!.authType).toBe('oauth');
    });
  }
});

describe('known services with both auth paths (oauth + api_key fallback)', () => {
  const BOTH_AUTH_IDS = [
    'slack-tools',
    'asana',
    'clickup',
    'todoist',
    'github',
    'vercel',
    'netlify',
    'supabase',
    'azure',
    'datadog',
    'pagerduty',
    'miro',
    'figma',
    'hubspot',
    'salesforce',
    'zapier',
  ] as const;

  for (const id of BOTH_AUTH_IDS) {
    it(`${id} has authType 'both'`, () => {
      const integration = findById(id);
      expect(integration, `${id} not found in catalog`).toBeDefined();
      expect(integration!.authType).toBe('both');
    });
  }
});

describe('known OAuth services with oauthProxy', () => {
  const PROXY_OAUTH_IDS = [
    'gmail',
    'google-calendar',
    'google-drive',
    'x',
    'reddit',
    'linkedin',
    'zendesk',
  ] as const;

  for (const id of PROXY_OAUTH_IDS) {
    it(`${id} has authType 'oauth' with oauthProxy defined`, () => {
      const integration = findById(id);
      expect(integration, `${id} not found in catalog`).toBeDefined();
      expect(integration!.authType).toBe('oauth');
      expect(
        integration!.oauthProxy,
        `${id} is missing oauthProxy`,
      ).toBeDefined();
      expect(
        typeof integration!.oauthProxy,
        `${id} oauthProxy is not a string`,
      ).toBe('string');
    });
  }
});
