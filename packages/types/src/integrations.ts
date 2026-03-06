/**
 * Enterprise integration types — catalog, status, tools.
 */

export type IntegrationCategory =
  | 'communication'
  | 'project_management'
  | 'development'
  | 'productivity'
  | 'infrastructure'
  | 'monitoring'
  | 'ecommerce'
  | 'design'
  | 'data'
  | 'crm'
  | 'automation'
  | 'content'
  | 'storage'
  | 'social'
  | 'marketing'
  | 'support'
  | 'cms';

export interface CategoryMeta {
  readonly id: IntegrationCategory;
  readonly label: string;
  readonly order: number;
}

export interface McpServerTemplate {
  readonly package: string;
  readonly envMapping: Readonly<Record<string, string>>;
  /** Template transforms for env vars needing value wrapping. Key = credential key, value = template with {value} placeholder. */
  readonly envValueTemplate?: Readonly<Record<string, string>>;
}

export interface McpRemoteServer {
  readonly url: string;
  readonly authorizationUrl?: string;
  readonly tokenUrl?: string;
}

export interface IntegrationDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  readonly category: IntegrationCategory;
  readonly authType: 'api_key' | 'oauth' | 'token';
  readonly credentialKeys: readonly string[];
  readonly mcpServer: McpServerTemplate;
  readonly mcpRemote?: McpRemoteServer;
  /** Worker proxy provider key (e.g. 'google'). Used when authType='oauth' but no mcpRemote. */
  readonly oauthProxy?: string;
}

export interface IntegrationStatus {
  readonly id: string;
  readonly definition: IntegrationDefinition;
  readonly connected: boolean;
  readonly tools: readonly IntegrationTool[];
  readonly error?: string;
}

export interface IntegrationInstance {
  readonly id: string;
  readonly integrationId: string;
  readonly label: string;
  readonly connectedAt: string;
}

export interface IntegrationTool {
  readonly instanceId: string;
  readonly integrationId: string;
  readonly integrationName: string;
  readonly name: string;
  readonly description?: string;
}
