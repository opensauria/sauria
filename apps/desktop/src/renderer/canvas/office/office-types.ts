/**
 * Types for the pixel art office view mode.
 */

export type ViewMode = 'graph' | 'office';

/** A single frame of a pixel art sprite (palette-indexed grid). */
export interface SpriteFrame {
  readonly width: number;
  readonly height: number;
  /** Row-major 2D grid of palette indices. 0 = transparent. */
  readonly pixels: readonly (readonly number[])[];
}

/** Named sprite with one or more animation frames. */
export interface SpriteDef {
  readonly id: string;
  readonly frames: readonly SpriteFrame[];
}

/** A desk slot assigned to an agent within a room or lobby. */
export interface DeskSlot {
  readonly agentId: string;
  readonly label: string;
  readonly platform: string;
  readonly role: string;
  readonly isOwner: boolean;
  readonly photo: string | null;
  /** Current render position (moves during walks). */
  x: number;
  y: number;
  /** Walk target position. */
  targetX: number;
  targetY: number;
  /** Home desk position (returns here after walk). */
  readonly homeX: number;
  readonly homeY: number;
  animState: 'idle' | 'typing' | 'walking';
  frameIndex: number;
  /** 0..1 interpolation progress during walk. */
  walkProgress: number;
  /** Walk origin for interpolation. */
  walkStartX: number;
  walkStartY: number;
}

/** A room/department in the office, mapped from a workspace. */
export interface Room {
  readonly workspaceId: string;
  readonly name: string;
  readonly color: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly desks: readonly DeskSlot[];
}

/** The outer shell of the building (bounding rect). */
export interface BuildingShell {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Full office layout computed from the canvas graph. */
export interface OfficeLayout {
  readonly rooms: readonly Room[];
  readonly lobby: readonly DeskSlot[];
  readonly building: BuildingShell;
  readonly breakRoom: Room;
  readonly floorWidth: number;
  readonly floorHeight: number;
}

/** Resolved palette for a character sprite (15 indices + transparent). */
export interface CharacterPalette {
  readonly hair: string;
  readonly hairDark: string;
  readonly hairLight: string;
  readonly skin: string;
  readonly skinShadow: string;
  readonly shirt: string;
  readonly shirtDark: string;
  readonly shirtLight: string;
  readonly pants: string;
  readonly pantsDark: string;
  readonly shoes: string;
  readonly accessory: string;
  readonly outline: string;
  readonly blush: string;
  readonly eye: string;
}

/** An active interaction between two agents (speech bubble). */
export interface AgentInteraction {
  readonly fromId: string;
  readonly toId: string;
  readonly preview: string;
  startedAt: number;
  /** Duration in ms before the interaction fades. */
  readonly durationMs: number;
}
