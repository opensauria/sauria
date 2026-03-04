/**
 * Enterprise integration types — catalog, status, tools.
 */

export type IntegrationCategory =
  | 'project_management'
  | 'communication'
  | 'development'
  | 'productivity'
  | 'storage'
  | 'crm'
  | 'analytics';

export interface McpServerTemplate {
  readonly package: string;
  readonly envMapping: Readonly<Record<string, string>>;
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
}

export interface IntegrationStatus {
  readonly id: string;
  readonly definition: IntegrationDefinition;
  readonly connected: boolean;
  readonly tools: readonly IntegrationTool[];
  readonly error?: string;
}

export interface IntegrationTool {
  readonly integrationId: string;
  readonly integrationName: string;
  readonly name: string;
  readonly description?: string;
}
