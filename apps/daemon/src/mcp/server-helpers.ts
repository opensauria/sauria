import type { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Entity } from '../db/types.js';

const MAX_RESPONSE_SIZE = 100 * 1024;

function capResponse(text: string): string {
  if (text.length <= MAX_RESPONSE_SIZE) return text;
  return text.slice(0, MAX_RESPONSE_SIZE) + '\n...[truncated]';
}

export type ToolResult = { content: Array<{ type: 'text'; text: string }> };

export function textResult(text: string): ToolResult {
  return { content: [{ type: 'text', text: capResponse(text) }] };
}

export function formatEntity(entity: Entity): string {
  const props = entity.properties
    ? Object.entries(entity.properties)
        .map(([k, v]) => `  ${k}: ${v}`)
        .join('\n')
    : '';
  return [
    `[${entity.type}] ${entity.name} (id: ${entity.id})`,
    entity.summary ? `Summary: ${entity.summary}` : '',
    `Importance: ${entity.importanceScore} | Mentions: ${entity.mentionCount}`,
    props ? `Properties:\n${props}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function isObservationRow(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row['content'] === 'string' && typeof row['created_at'] === 'string';
}

type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;

/**
 * Bypasses TS2589 deep type recursion in MCP SDK generics.
 * Schemas are still passed for tool discovery; validation uses validateToolInput.
 */
export function registerTool(
  server: McpServer,
  name: string,
  description: string,
  schema: Record<string, z.ZodTypeAny>,
  handler: ToolHandler,
): void {
  const register = server.tool.bind(server) as (
    n: string,
    d: string,
    s: Record<string, z.ZodTypeAny>,
    h: ToolHandler,
  ) => void;
  register(name, description, schema, handler);
}
