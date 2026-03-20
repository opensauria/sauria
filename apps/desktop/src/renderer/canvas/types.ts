export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface AgentNode {
  id: string;
  platform: string;
  label: string;
  photo: string | null;
  position: { x: number; y: number };
  status: string;
  credentials: string;
  meta: Record<string, string>;
  workspaceId?: string | null;
  role?: string;
  autonomy?: number | string;
  instructions?: string;
  description?: string;
  behavior?: {
    proactive?: boolean;
    ownerResponse?: boolean;
    peer?: boolean;
  };
  _formData?: Record<string, string>;
  _statusMsg?: string;
  _statusType?: string;
  _animateIn?: boolean;
  _editing?: boolean;
  integrations?: string[];
  aiProvider?: {
    type: 'claude' | 'openai' | 'local';
    model?: string;
    modelTier?: 'sonnet' | 'opus' | 'haiku';
    baseUrl?: string;
    sessionId?: string;
  };
  /** @deprecated Use `aiProvider.modelTier` */
  modelTier?: 'sonnet' | 'opus' | 'haiku';
  /** @deprecated Use `aiProvider.sessionId` */
  cliSessionId?: string;
  codeMode?: {
    enabled?: boolean;
    projectPath?: string;
    permissionMode?: string;
    sessionId?: string;
    terminalActive?: boolean;
  };
}

export interface Edge {
  id: string;
  from: string;
  to: string;
  edgeType: string;
  rules: unknown[];
}

export interface Workspace {
  id: string;
  name: string;
  color: string;
  purpose?: string;
  topics?: string[];
  budget?: number;
  position: { x: number; y: number };
  size: { width: number; height: number };
  checkpoints: unknown[];
  groups: unknown[];
  locked?: boolean;
}

export interface IntegrationInstance {
  id: string;
  integrationId: string;
  label: string;
  connectedAt: string;
}

export interface IntegrationDef {
  id: string;
  name: string;
  icon: string;
}

export interface PersonalMcpEntry {
  id: string;
  name: string;
  transport: 'stdio' | 'remote';
  connectedAt: string;
}

export interface CanvasGraph {
  nodes: AgentNode[];
  edges: Edge[];
  workspaces: Workspace[];
  instances?: IntegrationInstance[];
  personalMcp?: PersonalMcpEntry[];
  globalInstructions: string;
  language?: string;
  viewport: Viewport;
}

export interface OwnerProfile {
  fullName: string;
  photo: string | null;
  customInstructions: string;
}

export type { ConnectResult } from '../shared/types.js';

export interface PlatformField {
  key: string;
  label: string;
  type: string;
  placeholder: string;
  hint: string;
}

export interface EdgeGeometry {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly d: string;
  readonly midX: number;
  readonly midY: number;
}

export interface ConvMessage {
  readonly id: string;
  readonly from: string;
  readonly fromLabel: string;
  readonly to: string;
  readonly toLabel: string;
  readonly content: string;
  readonly actionType: string;
  readonly timestamp: string;
}
