import type { IntegrationDefinition } from '@opensauria/types';

export const INTEGRATION_CATALOG: readonly IntegrationDefinition[] = [
  // ── Communication ──────────────────────────────
  {
    id: 'slack-tools',
    name: 'Slack',
    description: 'Team messaging and collaboration tools',
    icon: 'slack',
    category: 'communication',
    authType: 'token',
    credentialKeys: ['token'],
    mcpServer: {
      package: 'slack-mcp-server',
      envMapping: { token: 'SLACK_BOT_TOKEN' },
    },
  },

  // ── Project Management ─────────────────────────
  {
    id: 'linear',
    name: 'Linear',
    description: 'Issue tracking and project management',
    icon: 'linear',
    category: 'project_management',
    authType: 'api_key',
    credentialKeys: ['apiKey'],
    mcpServer: {
      package: 'mcp-linear',
      envMapping: { apiKey: 'LINEAR_API_KEY' },
    },
  },
  {
    id: 'jira',
    name: 'Jira',
    description: 'Project tracking and agile management',
    icon: 'jira',
    category: 'project_management',
    authType: 'api_key',
    credentialKeys: ['url', 'email', 'apiKey'],
    mcpServer: {
      package: 'mcp-atlassian',
      envMapping: {
        url: 'JIRA_URL',
        email: 'JIRA_EMAIL',
        apiKey: 'JIRA_API_TOKEN',
      },
    },
  },
  {
    id: 'trello',
    name: 'Trello',
    description: 'Visual project boards and task management',
    icon: 'trello',
    category: 'project_management',
    authType: 'api_key',
    credentialKeys: ['apiKey', 'token'],
    mcpServer: {
      package: 'trello-mcp-server',
      envMapping: { apiKey: 'TRELLO_API_KEY', token: 'TRELLO_TOKEN' },
    },
  },
  {
    id: 'asana',
    name: 'Asana',
    description: 'Work management and team coordination',
    icon: 'asana',
    category: 'project_management',
    authType: 'token',
    credentialKeys: ['token'],
    mcpServer: {
      package: '@roychri/mcp-server-asana',
      envMapping: { token: 'ASANA_ACCESS_TOKEN' },
    },
  },
  {
    id: 'clickup',
    name: 'ClickUp',
    description: 'All-in-one project management platform',
    icon: 'clickup',
    category: 'project_management',
    authType: 'api_key',
    credentialKeys: ['apiKey'],
    mcpServer: {
      package: 'clickup-mcp-server',
      envMapping: { apiKey: 'CLICKUP_API_KEY' },
    },
  },

  // ── Development ────────────────────────────────
  {
    id: 'github',
    name: 'GitHub',
    description: 'Code hosting, issues, and pull requests',
    icon: 'github',
    category: 'development',
    authType: 'token',
    credentialKeys: ['token'],
    mcpServer: {
      package: '@modelcontextprotocol/server-github',
      envMapping: { token: 'GITHUB_PERSONAL_ACCESS_TOKEN' },
    },
  },
  {
    id: 'gitlab',
    name: 'GitLab',
    description: 'DevOps platform with Git repository management',
    icon: 'gitlab',
    category: 'development',
    authType: 'token',
    credentialKeys: ['token', 'url'],
    mcpServer: {
      package: '@modelcontextprotocol/server-gitlab',
      envMapping: { token: 'GITLAB_TOKEN', url: 'GITLAB_URL' },
    },
  },
  {
    id: 'circleci',
    name: 'CircleCI',
    description: 'Continuous integration and delivery platform',
    icon: 'circleci',
    category: 'development',
    authType: 'token',
    credentialKeys: ['token'],
    mcpServer: {
      package: '@circleci/mcp-server-circleci',
      envMapping: { token: 'CIRCLECI_TOKEN' },
    },
  },
  {
    id: 'vercel',
    name: 'Vercel',
    description: 'Frontend deployment and serverless platform',
    icon: 'vercel',
    category: 'development',
    authType: 'token',
    credentialKeys: ['token'],
    mcpServer: {
      package: 'vercel-mcp-server',
      envMapping: { token: 'VERCEL_TOKEN' },
    },
  },
  {
    id: 'netlify',
    name: 'Netlify',
    description: 'Web hosting and serverless backend services',
    icon: 'netlify',
    category: 'development',
    authType: 'token',
    credentialKeys: ['token'],
    mcpServer: {
      package: '@netlify/mcp',
      envMapping: { token: 'NETLIFY_TOKEN' },
    },
  },

  // ── Productivity ───────────────────────────────
  {
    id: 'notion',
    name: 'Notion',
    description: 'Workspace for notes, docs, and project management',
    icon: 'notion',
    category: 'productivity',
    authType: 'api_key',
    credentialKeys: ['apiKey'],
    mcpServer: {
      package: '@notionhq/notion-mcp-server',
      envMapping: { apiKey: 'OPENAPI_MCP_HEADERS' },
    },
  },
  {
    id: 'confluence',
    name: 'Confluence',
    description: 'Team wiki and documentation platform',
    icon: 'confluence',
    category: 'productivity',
    authType: 'api_key',
    credentialKeys: ['url', 'email', 'apiKey'],
    mcpServer: {
      package: 'mcp-atlassian',
      envMapping: {
        url: 'CONFLUENCE_URL',
        email: 'CONFLUENCE_EMAIL',
        apiKey: 'CONFLUENCE_API_TOKEN',
      },
    },
  },
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    description: 'Calendar events and scheduling',
    icon: 'googlecalendar',
    category: 'productivity',
    authType: 'oauth',
    credentialKeys: ['clientId', 'clientSecret', 'refreshToken'],
    mcpServer: {
      package: 'google-calendar-mcp',
      envMapping: {
        clientId: 'GCAL_CLIENT_ID',
        clientSecret: 'GCAL_CLIENT_SECRET',
        refreshToken: 'GCAL_REFRESH_TOKEN',
      },
    },
  },
  {
    id: 'obsidian',
    name: 'Obsidian',
    description: 'Knowledge base and note-taking with Markdown',
    icon: 'obsidian',
    category: 'productivity',
    authType: 'api_key',
    credentialKeys: ['vaultPath'],
    mcpServer: {
      package: 'obsidian-mcp-server',
      envMapping: { vaultPath: 'OBSIDIAN_VAULT_PATH' },
    },
  },
  {
    id: 'airtable',
    name: 'Airtable',
    description: 'Spreadsheet-database hybrid for teams',
    icon: 'airtable',
    category: 'productivity',
    authType: 'api_key',
    credentialKeys: ['apiKey'],
    mcpServer: {
      package: 'airtable-mcp-server',
      envMapping: { apiKey: 'AIRTABLE_API_KEY' },
    },
  },

  // ── Infrastructure ─────────────────────────────
  {
    id: 'azure',
    name: 'Azure',
    description: 'Microsoft Azure cloud computing platform',
    icon: 'azure',
    category: 'infrastructure',
    authType: 'api_key',
    credentialKeys: ['subscriptionId', 'tenantId', 'clientId', 'clientSecret'],
    mcpServer: {
      package: '@azure/mcp',
      envMapping: {
        subscriptionId: 'AZURE_SUBSCRIPTION_ID',
        tenantId: 'AZURE_TENANT_ID',
        clientId: 'AZURE_CLIENT_ID',
        clientSecret: 'AZURE_CLIENT_SECRET',
      },
    },
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    description: 'CDN, DNS, and edge computing platform',
    icon: 'cloudflare',
    category: 'infrastructure',
    authType: 'api_key',
    credentialKeys: ['apiKey'],
    mcpServer: {
      package: '@cloudflare/mcp-server-cloudflare',
      envMapping: { apiKey: 'CLOUDFLARE_API_KEY' },
    },
  },
  {
    id: 'kubernetes',
    name: 'Kubernetes',
    description: 'Container orchestration and cluster management',
    icon: 'kubernetes',
    category: 'infrastructure',
    authType: 'token',
    credentialKeys: ['kubeconfig'],
    mcpServer: {
      package: 'kubernetes-mcp-server',
      envMapping: { kubeconfig: 'KUBECONFIG' },
    },
  },

  // ── Monitoring ─────────────────────────────────
  {
    id: 'sentry',
    name: 'Sentry',
    description: 'Error tracking and performance monitoring',
    icon: 'sentry',
    category: 'monitoring',
    authType: 'token',
    credentialKeys: ['token'],
    mcpServer: {
      package: '@sentry/mcp-server',
      envMapping: { token: 'SENTRY_AUTH_TOKEN' },
    },
  },
  {
    id: 'datadog',
    name: 'Datadog',
    description: 'Cloud monitoring and security platform',
    icon: 'datadog',
    category: 'monitoring',
    authType: 'api_key',
    credentialKeys: ['apiKey', 'appKey'],
    mcpServer: {
      package: 'datadog-mcp-server',
      envMapping: { apiKey: 'DATADOG_API_KEY', appKey: 'DATADOG_APP_KEY' },
    },
  },

  // ── E-commerce ─────────────────────────────────
  {
    id: 'stripe',
    name: 'Stripe',
    description: 'Payment processing and billing analytics',
    icon: 'stripe',
    category: 'ecommerce',
    authType: 'api_key',
    credentialKeys: ['apiKey'],
    mcpServer: {
      package: '@stripe/mcp',
      envMapping: { apiKey: 'STRIPE_API_KEY' },
    },
  },
  {
    id: 'paypal',
    name: 'PayPal',
    description: 'Online payments and money transfers',
    icon: 'paypal',
    category: 'ecommerce',
    authType: 'api_key',
    credentialKeys: ['clientId', 'clientSecret'],
    mcpServer: {
      package: '@paypal/mcp',
      envMapping: {
        clientId: 'PAYPAL_CLIENT_ID',
        clientSecret: 'PAYPAL_CLIENT_SECRET',
      },
    },
  },

  // ── Design ─────────────────────────────────────
  {
    id: 'figma',
    name: 'Figma',
    description: 'Design collaboration and prototyping',
    icon: 'figma',
    category: 'design',
    authType: 'token',
    credentialKeys: ['token'],
    mcpServer: {
      package: 'figma-mcp-server',
      envMapping: { token: 'FIGMA_ACCESS_TOKEN' },
    },
  },

  // ── Data ───────────────────────────────────────
  {
    id: 'postgresql',
    name: 'PostgreSQL',
    description: 'Relational database access and queries',
    icon: 'postgresql',
    category: 'data',
    authType: 'token',
    credentialKeys: ['connectionString'],
    mcpServer: {
      package: '@modelcontextprotocol/server-postgres',
      envMapping: { connectionString: 'POSTGRES_CONNECTION_STRING' },
    },
  },
  {
    id: 'mongodb',
    name: 'MongoDB',
    description: 'Document database for modern applications',
    icon: 'mongodb',
    category: 'data',
    authType: 'token',
    credentialKeys: ['connectionString'],
    mcpServer: {
      package: 'mongodb-mcp-server',
      envMapping: { connectionString: 'MONGODB_CONNECTION_STRING' },
    },
  },
  {
    id: 'mysql',
    name: 'MySQL',
    description: 'Open source relational database',
    icon: 'mysql',
    category: 'data',
    authType: 'token',
    credentialKeys: ['connectionString'],
    mcpServer: {
      package: 'mysql-mcp-server',
      envMapping: { connectionString: 'MYSQL_CONNECTION_STRING' },
    },
  },

  // ── CRM ────────────────────────────────────────
  {
    id: 'hubspot',
    name: 'HubSpot',
    description: 'CRM, marketing, and sales platform',
    icon: 'hubspot',
    category: 'crm',
    authType: 'api_key',
    credentialKeys: ['apiKey'],
    mcpServer: {
      package: 'hubspot-mcp-server',
      envMapping: { apiKey: 'HUBSPOT_API_KEY' },
    },
  },
  {
    id: 'pipedrive',
    name: 'Pipedrive',
    description: 'Sales CRM and pipeline management',
    icon: 'pipedrive',
    category: 'crm',
    authType: 'api_key',
    credentialKeys: ['apiKey'],
    mcpServer: {
      package: 'pipedrive-mcp-server',
      envMapping: { apiKey: 'PIPEDRIVE_API_KEY' },
    },
  },

  // ── Automation ─────────────────────────────────
  {
    id: 'zapier',
    name: 'Zapier',
    description: 'No-code automation between web apps',
    icon: 'zapier',
    category: 'automation',
    authType: 'api_key',
    credentialKeys: ['apiKey'],
    mcpServer: {
      package: '@zapier/mcp-integration',
      envMapping: { apiKey: 'ZAPIER_API_KEY' },
    },
  },

  // ── Content ────────────────────────────────────
  {
    id: 'contentful',
    name: 'Contentful',
    description: 'Headless CMS for digital experiences',
    icon: 'contentful',
    category: 'content',
    authType: 'api_key',
    credentialKeys: ['spaceId', 'accessToken'],
    mcpServer: {
      package: '@contentful/mcp-server',
      envMapping: {
        spaceId: 'CONTENTFUL_SPACE_ID',
        accessToken: 'CONTENTFUL_ACCESS_TOKEN',
      },
    },
  },
  {
    id: 'sanity',
    name: 'Sanity',
    description: 'Structured content platform for developers',
    icon: 'sanity',
    category: 'content',
    authType: 'token',
    credentialKeys: ['projectId', 'token'],
    mcpServer: {
      package: '@sanity/mcp-server',
      envMapping: {
        projectId: 'SANITY_PROJECT_ID',
        token: 'SANITY_TOKEN',
      },
    },
  },

  // ── Storage ────────────────────────────────────
  {
    id: 'google-drive',
    name: 'Google Drive',
    description: 'Cloud file storage and sharing',
    icon: 'googledrive',
    category: 'storage',
    authType: 'oauth',
    credentialKeys: ['clientId', 'clientSecret', 'refreshToken'],
    mcpServer: {
      package: 'gdrive-mcp',
      envMapping: {
        clientId: 'GDRIVE_CLIENT_ID',
        clientSecret: 'GDRIVE_CLIENT_SECRET',
        refreshToken: 'GDRIVE_REFRESH_TOKEN',
      },
    },
  },
] as const;
