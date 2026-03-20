import { readFileSync, existsSync } from 'node:fs';
import type { IntegrationInstance } from '@sauria/types';
import type {
  CanvasGraph,
  OwnerIdentity,
  AgentNode,
  Edge,
  Workspace,
  AutonomyLevel,
  AgentRole,
  CodeModeConfig,
} from './orchestrator/types.js';
import { createEmptyGraph } from './orchestrator/types.js';
import type { SauriaConfig } from './config/schema.js';
import { paths } from './config/paths.js';
import { getLogger } from './utils/logger.js';

// ─── Raw types from desktop canvas (simplified schema) ───────────────

interface RawNode {
  readonly id: string;
  readonly platform: string;
  readonly label: string;
  readonly photo: string | null;
  readonly position: { readonly x: number; readonly y: number };
  readonly status: string;
  readonly credentials: string;
  readonly meta: Record<string, string>;
  readonly workspaceId?: string | null;
  readonly role?: string;
  readonly autonomy?: string | number;
  readonly instructions?: string;
  readonly behavior?: AgentNode['behavior'];
  readonly integrations?: readonly string[];
  readonly codeMode?: CodeModeConfig;
}

interface RawEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly label?: string;
  readonly edgeType?: Edge['edgeType'];
  readonly rules?: Edge['rules'];
}

interface RawWorkspace {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly purpose: string;
  readonly topics: readonly string[];
  readonly budget: number | Workspace['budget'];
  readonly position: { readonly x: number; readonly y: number };
  readonly size: {
    readonly w?: number;
    readonly h?: number;
    readonly width?: number;
    readonly height?: number;
  };
  readonly checkpoints?: Workspace['checkpoints'];
  readonly groups?: Workspace['groups'];
  readonly models?: Workspace['models'];
}

interface RawGraph {
  readonly version?: number;
  readonly globalInstructions?: string;
  readonly nodes?: readonly RawNode[];
  readonly edges?: readonly RawEdge[];
  readonly workspaces?: readonly RawWorkspace[];
  readonly instances?: readonly IntegrationInstance[];
  readonly personalMcp?: CanvasGraph['personalMcp'];
  readonly viewport?: { readonly x: number; readonly y: number; readonly zoom: number };
}

const VALID_AUTONOMY_LEVELS = new Set<string>(['full', 'supervised', 'approval', 'manual']);
const VALID_ROLES = new Set<string>(['lead', 'specialist', 'observer', 'coordinator', 'assistant']);
const VALID_STATUSES = new Set<string>(['connected', 'disconnected', 'error']);

function normalizeNode(raw: RawNode): AgentNode {
  let autonomy: AutonomyLevel = 'supervised';
  if (typeof raw.autonomy === 'string' && VALID_AUTONOMY_LEVELS.has(raw.autonomy)) {
    autonomy = raw.autonomy as AutonomyLevel;
  }

  const role: AgentRole =
    typeof raw.role === 'string' && VALID_ROLES.has(raw.role)
      ? (raw.role as AgentRole)
      : 'assistant';

  const status = VALID_STATUSES.has(raw.status)
    ? (raw.status as AgentNode['status'])
    : 'disconnected';

  return {
    id: raw.id,
    platform: raw.platform as AgentNode['platform'],
    label: raw.label,
    photo: raw.photo,
    position: raw.position,
    status,
    credentials: raw.credentials,
    meta: raw.meta,
    workspaceId: raw.workspaceId ?? null,
    role,
    autonomy,
    instructions: raw.instructions ?? '',
    behavior: raw.behavior,
    integrations: raw.integrations,
    codeMode: raw.codeMode,
  };
}

function normalizeEdge(raw: RawEdge): Edge {
  return {
    id: raw.id,
    from: raw.from,
    to: raw.to,
    label: raw.label,
    edgeType: raw.edgeType ?? 'manual',
    rules: raw.rules ?? [{ type: 'always', action: 'forward' }],
  };
}

function normalizeWorkspace(raw: RawWorkspace): Workspace {
  const width = raw.size.width ?? raw.size.w ?? 400;
  const height = raw.size.height ?? raw.size.h ?? 320;

  const budget: Workspace['budget'] =
    typeof raw.budget === 'number' ? { dailyLimitUsd: raw.budget, preferCheap: true } : raw.budget;

  return {
    id: raw.id,
    name: raw.name,
    color: raw.color,
    purpose: raw.purpose,
    topics: [...raw.topics],
    budget,
    position: raw.position,
    size: { width, height },
    checkpoints: raw.checkpoints ?? [],
    groups: raw.groups ?? [],
    models: raw.models,
  };
}

export function loadCanvasGraph(): CanvasGraph {
  if (!existsSync(paths.canvas)) {
    return createEmptyGraph();
  }
  try {
    const raw = readFileSync(paths.canvas, 'utf-8');
    const parsed = JSON.parse(raw) as RawGraph;
    return {
      version: 2,
      globalInstructions:
        typeof parsed.globalInstructions === 'string' ? parsed.globalInstructions : '',
      nodes: (parsed.nodes ?? []).map(normalizeNode),
      edges: (parsed.edges ?? []).map(normalizeEdge),
      workspaces: (parsed.workspaces ?? []).map(normalizeWorkspace),
      instances: parsed.instances ?? [],
      personalMcp: parsed.personalMcp ?? [],
      viewport: parsed.viewport ?? { x: 0, y: 0, zoom: 1 },
    };
  } catch (error: unknown) {
    getLogger().warn('Failed to load canvas graph, falling back to empty', {
      path: paths.canvas,
      error: error instanceof Error ? error.message : String(error),
    });
    return createEmptyGraph();
  }
}

export function buildOwnerIdentity(config: SauriaConfig): OwnerIdentity {
  return {
    telegram: config.owner.telegram,
    slack: config.owner.slack,
    whatsapp: config.owner.whatsapp,
  };
}
