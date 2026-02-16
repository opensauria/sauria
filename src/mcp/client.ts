import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { AuditLogger } from '../security/audit.js';
import { SECURITY_LIMITS } from '../security/rate-limiter.js';

interface McpServerConfig {
  readonly name: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
}

interface ConnectedClient {
  readonly name: string;
  readonly client: Client;
  readonly transport: StdioClientTransport;
}

interface ToolInfo {
  readonly name: string;
  readonly description?: string;
}

interface TextContent {
  readonly type: 'text';
  readonly text: string;
}

function isTextContent(value: unknown): value is TextContent {
  if (value === null || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return record['type'] === 'text' && typeof record['text'] === 'string';
}

export class McpClientManager {
  private readonly clients = new Map<string, ConnectedClient>();

  constructor(private readonly audit: AuditLogger) {}

  async connect(config: McpServerConfig): Promise<void> {
    if (this.clients.has(config.name)) {
      throw new Error(`Server "${config.name}" is already connected.`);
    }

    if (this.clients.size >= SECURITY_LIMITS.mcp.maxConcurrentClients) {
      throw new Error(
        `Maximum concurrent MCP clients (${SECURITY_LIMITS.mcp.maxConcurrentClients}) reached.`,
      );
    }

    const transport = new StdioClientTransport({
      command: config.command,
      args: [...config.args],
      env: config.env ? { ...config.env } : undefined,
    });

    const client = new Client(
      { name: 'openwind', version: '0.1.0' },
      { capabilities: {} },
    );

    await client.connect(transport);

    this.clients.set(config.name, { name: config.name, client, transport });
    this.audit.logAction('mcp:client_connect', { server: config.name });
  }

  async disconnect(name: string): Promise<void> {
    const entry = this.clients.get(name);
    if (!entry) {
      throw new Error(`Server "${name}" is not connected.`);
    }

    await entry.client.close();
    this.clients.delete(name);
    this.audit.logAction('mcp:client_disconnect', { server: name });
  }

  async disconnectAll(): Promise<void> {
    const names = [...this.clients.keys()];
    for (const name of names) {
      await this.disconnect(name);
    }
  }

  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const entry = this.clients.get(serverName);
    if (!entry) {
      throw new Error(`Server "${serverName}" is not connected.`);
    }

    const queryHash = this.audit.hashContent(JSON.stringify({ toolName, args }));
    this.audit.logAction('mcp:client_tool_call', {
      server: serverName,
      tool: toolName,
    }, { promptHash: queryHash });

    const result = await entry.client.callTool({ name: toolName, arguments: args });
    const record = result as Record<string, unknown>;

    if (record['isError'] === true) {
      const errorText = Array.isArray(record['content'])
        ? (record['content'] as unknown[]).filter(isTextContent).map((c) => c.text).join('\n')
        : 'Unknown error';
      this.audit.logAction('mcp:client_tool_error', {
        server: serverName,
        tool: toolName,
      }, { success: false });
      throw new Error(`MCP tool "${toolName}" on "${serverName}" failed: ${errorText}`);
    }

    const contentArray = record['content'];
    if (!Array.isArray(contentArray)) return record['toolResult'];

    const textParts = (contentArray as unknown[]).filter(isTextContent).map((c) => c.text);
    if (textParts.length === 1) return parseJsonSafe(textParts[0] ?? '');
    return textParts;
  }

  async listTools(serverName: string): Promise<ToolInfo[]> {
    const entry = this.clients.get(serverName);
    if (!entry) {
      throw new Error(`Server "${serverName}" is not connected.`);
    }

    const result = await entry.client.listTools();
    return result.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
    }));
  }

  getConnectedServers(): string[] {
    return [...this.clients.keys()];
  }
}

function parseJsonSafe(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}
