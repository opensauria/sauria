/**
 * Fixed office floor plan layout.
 *
 * The office is a large rectangle with fixed rooms:
 *   - Kitchen (top-left)
 *   - Open Space (center) — agents sit here at desks
 *   - Meeting Room (top-right)
 *   - WC (mid-left)
 *   - Lounge (mid-right)
 *   - Entrance Hall (bottom strip)
 *
 * Workspaces from the graph map to desk clusters in the open space.
 * Unassigned agents sit in the entrance/lobby area.
 */

import type { CanvasGraph, AgentNode } from '../types.js';
import type { OfficeLayout, Room, DeskSlot, BuildingShell } from './office-types.js';

/** Desk spacing in the open space. */
const DESK_CELL_W = 120;
const DESK_CELL_H = 168;

/* ── Fixed dimensions (pixels) ───────────────────────────────────────── */

const BLDG_W = 1200;
const BLDG_H = 800;

const WALL_H = 36;
const KITCHEN_W = 200;
const KITCHEN_H = 280;
const MEETING_W = 280;
const MEETING_H = 280;
const WC_W = 200;
const WC_H = 200;
const LOUNGE_W = 280;
const LOUNGE_H = 200;
const ENTRANCE_H = 100;

export function mapGraphToOfficeLayout(graph: CanvasGraph): OfficeLayout {
  // Fixed rooms
  const kitchen: Room = {
    workspaceId: '__kitchen',
    name: 'Kitchen',
    color: '#ffcc80',
    x: 0,
    y: WALL_H,
    width: KITCHEN_W,
    height: KITCHEN_H,
    desks: [],
  };

  const meetingRoom: Room = {
    workspaceId: '__meeting',
    name: 'Meeting Room',
    color: '#90caf9',
    x: BLDG_W - MEETING_W,
    y: WALL_H,
    width: MEETING_W,
    height: MEETING_H,
    desks: [],
  };

  const wc: Room = {
    workspaceId: '__wc',
    name: 'WC',
    color: '#b0bec5',
    x: 0,
    y: WALL_H + KITCHEN_H,
    width: WC_W,
    height: WC_H,
    desks: [],
  };

  const lounge: Room = {
    workspaceId: '__lounge',
    name: 'Lounge',
    color: '#ce93d8',
    x: BLDG_W - LOUNGE_W,
    y: WALL_H + MEETING_H,
    width: LOUNGE_W,
    height: LOUNGE_H,
    desks: [],
  };

  const entrance: Room = {
    workspaceId: '__entrance',
    name: 'Entrance',
    color: '#a1887f',
    x: 0,
    y: BLDG_H - ENTRANCE_H,
    width: BLDG_W,
    height: ENTRANCE_H,
    desks: [],
  };

  // Open space: center area between fixed rooms
  const openSpaceX = KITCHEN_W + 16;
  const openSpaceY = WALL_H + 16;
  const openSpaceW = BLDG_W - KITCHEN_W - MEETING_W - 32;
  const openSpaceH = BLDG_H - ENTRANCE_H - WALL_H - 32;

  // All agents go in the open space
  const agents = graph.nodes;
  const cols = Math.max(1, Math.floor(openSpaceW / DESK_CELL_W));
  const desks = agents.map((agent, i) =>
    buildDesk(agent, openSpaceX + 40, openSpaceY + 40, i, cols),
  );

  const openSpace: Room = {
    workspaceId: '__openspace',
    name: 'Open Space',
    color: '#c4a882',
    x: openSpaceX,
    y: openSpaceY,
    width: openSpaceW,
    height: openSpaceH,
    desks,
  };

  const building: BuildingShell = { x: 0, y: 0, width: BLDG_W, height: BLDG_H };

  const rooms = [kitchen, meetingRoom, wc, lounge, entrance, openSpace];
  const breakRoom = kitchen; // kitchen doubles as break room for movement targets

  return { rooms, lobby: [], building, breakRoom, floorWidth: BLDG_W, floorHeight: BLDG_H };
}

/* ── Desk builder ────────────────────────────────────────────────────── */

function buildDesk(
  agent: AgentNode,
  originX: number,
  originY: number,
  index: number,
  cols: number,
): DeskSlot {
  const col = index % cols;
  const row = Math.floor(index / cols);

  return {
    agentId: agent.id,
    label: agent.label,
    platform: agent.platform,
    role: agent.role ?? 'assistant',
    isOwner: agent.platform === 'owner',
    photo: agent.photo ?? null,
    x: originX + col * DESK_CELL_W,
    y: originY + row * DESK_CELL_H,
    targetX: 0,
    targetY: 0,
    homeX: originX + col * DESK_CELL_W,
    homeY: originY + row * DESK_CELL_H,
    animState: 'idle',
    frameIndex: 0,
    walkProgress: 0,
    walkStartX: 0,
    walkStartY: 0,
  };
}
