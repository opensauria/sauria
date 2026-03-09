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

import { entityColors } from '@sauria/design-tokens';

function hexToNum(hex: string): number {
  return parseInt(hex.slice(1), 16);
}

export const TYPE_COLORS: Record<string, number> = {
  person: hexToNum(entityColors.person),
  project: hexToNum(entityColors.project),
  company: hexToNum(entityColors.company),
  event: hexToNum(entityColors.event),
  document: hexToNum(entityColors.document),
  goal: hexToNum(entityColors.goal),
  place: hexToNum(entityColors.place),
  concept: hexToNum(entityColors.concept),
};

export const TYPE_COLOR_STRINGS: Record<string, string> = {
  person: entityColors.person,
  project: entityColors.project,
  company: entityColors.company,
  event: entityColors.event,
  document: entityColors.document,
  goal: entityColors.goal,
  place: entityColors.place,
  concept: entityColors.concept,
};

export const DEFAULT_COLOR = 0x888888;
