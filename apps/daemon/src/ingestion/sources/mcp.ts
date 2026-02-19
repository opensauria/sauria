import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { McpServerConfig } from '../../config/schema.js';

export class McpSourceClient {
  private constructor(
    private readonly client: Client,
    private readonly transport: StdioClientTransport,
  ) {}

  static async connect(config: McpServerConfig): Promise<McpSourceClient> {
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
    });

    const client = new Client({ name: 'opensauria', version: '0.1.0' }, { capabilities: {} });

    await client.connect(transport);

    return new McpSourceClient(client, transport);
  }

  async listTools(): Promise<string[]> {
    const result = await this.client.listTools();
    return result.tools.map((tool) => tool.name);
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const result = await this.client.callTool({ name, arguments: args });
    const record = result as Record<string, unknown>;

    if (!('content' in result)) {
      return record['toolResult'];
    }

    const contentArray = record['content'];
    if (!Array.isArray(contentArray)) {
      return result;
    }

    if (record['isError'] === true) {
      const errorText = extractTextParts(contentArray).join('\n');
      throw new Error(`MCP tool "${name}" failed: ${errorText}`);
    }

    const textParts = extractTextParts(contentArray);

    if (textParts.length === 1) {
      return parseJsonSafe(textParts[0] ?? '');
    }

    return textParts;
  }

  async disconnect(): Promise<void> {
    await this.transport.close();
  }
}

interface TextContent {
  readonly type: 'text';
  readonly text: string;
}

function isTextContent(value: unknown): value is TextContent {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return record['type'] === 'text' && typeof record['text'] === 'string';
}

function extractTextParts(content: unknown[]): string[] {
  return content.filter(isTextContent).map((c) => c.text);
}

function parseJsonSafe(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function connectToMcpSource(config: McpServerConfig): Promise<McpSourceClient> {
  return McpSourceClient.connect(config);
}
