export interface BrainNode {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly importance: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

export interface BrainEdge {
  readonly from: number;
  readonly to: number;
  readonly type: string;
  readonly strength: number;
}

export interface TierConfig {
  readonly sphereWidthSegments: number;
  readonly sphereHeightSegments: number;
  readonly enableGlow: boolean;
  readonly maxImpulses: number;
  readonly pixelRatio: number;
  readonly layoutStepsPerFrame: number;
}

export interface SceneCallbacks {
  readonly onNodeClick: (id: string) => void;
  readonly onNodeHover: (id: string | null) => void;
}

export const TIER_DESKTOP: TierConfig = {
  sphereWidthSegments: 16,
  sphereHeightSegments: 12,
  enableGlow: true,
  maxImpulses: 30,
  pixelRatio: Math.min(window.devicePixelRatio, 2),
  layoutStepsPerFrame: 3,
};

export const TIER_LOW: TierConfig = {
  sphereWidthSegments: 8,
  sphereHeightSegments: 6,
  enableGlow: false,
  maxImpulses: 10,
  pixelRatio: 1,
  layoutStepsPerFrame: 1,
};

export const TYPE_COLORS: Record<string, number> = {
  person: 0x3b82f6,
  project: 0x34d399,
  company: 0xa78bfa,
  event: 0xf59e0b,
  document: 0x6b7280,
  goal: 0x038b9a,
  place: 0xeab308,
  concept: 0xec4899,
};

export const TYPE_COLOR_STRINGS: Record<string, string> = {
  person: '#3b82f6',
  project: '#34d399',
  company: '#a78bfa',
  event: '#f59e0b',
  document: '#6b7280',
  goal: '#038b9a',
  place: '#eab308',
  concept: '#ec4899',
};

export const DEFAULT_COLOR = 0x888888;
