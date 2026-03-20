export interface TelegramBot {
  readonly nodeId?: string;
  readonly label?: string;
  readonly connected: boolean;
  readonly photo?: string;
  readonly profile?: { readonly username: string; readonly photo?: string };
}

export interface TelegramStatus {
  readonly bots: readonly TelegramBot[];
}

export interface ChannelBot {
  readonly nodeId?: string;
  readonly label?: string;
  readonly connected: boolean;
  readonly teamName?: string;
}

export interface ChannelStatus {
  readonly bots: readonly ChannelBot[];
}

export interface ConnectResult {
  readonly success: boolean;
  readonly error?: string;
  readonly nodeId?: string;
  readonly botUsername?: string;
  readonly photo?: string;
  readonly botId?: string;
  readonly firstName?: string;
  readonly teamName?: string;
  readonly botUserId?: string;
  readonly teamId?: string;
  readonly displayName?: string;
  readonly phoneNumberId?: string;
  readonly email?: string;
}

export interface StatusResult {
  readonly connected: boolean;
  readonly provider?: string;
  readonly authMethod?: string;
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
  readonly category: string;
  readonly authType: 'api_key' | 'oauth' | 'token' | 'both';
  readonly credentialKeys: readonly string[];
  readonly mcpRemote?: McpRemoteServer;
  readonly oauthProxy?: string;
}

export interface IntegrationTool {
  readonly name: string;
  readonly description?: string;
}

export interface IntegrationStatus {
  readonly id: string;
  readonly definition: IntegrationDefinition;
  readonly connected: boolean;
  readonly tools: readonly IntegrationTool[];
  readonly error?: string;
}

interface PersonalMcpBase {
  readonly id: string;
  readonly name: string;
  readonly connectedAt: string;
  readonly toolCount?: number;
}

export interface PersonalMcpStdio extends PersonalMcpBase {
  readonly transport: 'stdio';
  readonly command: string;
  readonly args: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
}

export interface PersonalMcpRemote extends PersonalMcpBase {
  readonly transport: 'remote';
  readonly url: string;
  readonly accessToken?: string;
}

export type PersonalMcpEntry = PersonalMcpStdio | PersonalMcpRemote;
