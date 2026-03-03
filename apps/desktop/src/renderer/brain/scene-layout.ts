import type { BrainNode, BrainEdge } from './scene-types.js';

const REPULSION = 800;
const ATTRACTION = 0.005;
const DAMPING = 0.92;
const MIN_ALPHA = 0.001;
const CENTER_GRAVITY = 0.002;
const MAX_ITERATIONS = 600;

let alpha = 1;
let iteration = 0;

/* ── Octree for Barnes-Hut ────────────────── */

interface OctNode {
  cx: number;
  cy: number;
  cz: number;
  mass: number;
  children: (OctNode | null)[];
  bodyIndex: number;
  size: number;
  ox: number;
  oy: number;
  oz: number;
}

function createOctNode(ox: number, oy: number, oz: number, size: number): OctNode {
  return { cx: 0, cy: 0, cz: 0, mass: 0, children: [], bodyIndex: -1, size, ox, oy, oz };
}

function octant(node: OctNode, x: number, y: number, z: number): number {
  const half = node.size / 2;
  let idx = 0;
  if (x > node.ox + half) idx += 1;
  if (y > node.oy + half) idx += 2;
  if (z > node.oz + half) idx += 4;
  return idx;
}

function insertBody(
  node: OctNode,
  bx: number,
  by: number,
  bz: number,
  idx: number,
  nodes: readonly BrainNode[],
): void {
  if (node.mass === 0) {
    node.cx = bx;
    node.cy = by;
    node.cz = bz;
    node.mass = 1;
    node.bodyIndex = idx;
    return;
  }

  if (node.children.length === 0) {
    node.children = new Array(8).fill(null);
    const old = node.bodyIndex;
    if (old >= 0) {
      const ob = nodes[old];
      const oi = octant(node, ob.x, ob.y, ob.z);
      const half = node.size / 2;
      if (!node.children[oi]) {
        node.children[oi] = createOctNode(
          node.ox + (oi & 1 ? half : 0),
          node.oy + (oi & 2 ? half : 0),
          node.oz + (oi & 4 ? half : 0),
          half,
        );
      }
      insertBody(node.children[oi]!, ob.x, ob.y, ob.z, old, nodes);
      node.bodyIndex = -1;
    }
  }

  const ci = octant(node, bx, by, bz);
  const half = node.size / 2;
  if (!node.children[ci]) {
    node.children[ci] = createOctNode(
      node.ox + (ci & 1 ? half : 0),
      node.oy + (ci & 2 ? half : 0),
      node.oz + (ci & 4 ? half : 0),
      half,
    );
  }
  insertBody(node.children[ci]!, bx, by, bz, idx, nodes);

  const totalMass = node.mass + 1;
  node.cx = (node.cx * node.mass + bx) / totalMass;
  node.cy = (node.cy * node.mass + by) / totalMass;
  node.cz = (node.cz * node.mass + bz) / totalMass;
  node.mass = totalMass;
}

const THETA = 0.8;

function applyRepulsion(
  node: OctNode,
  bx: number,
  by: number,
  bz: number,
  fx: { v: number },
  fy: { v: number },
  fz: { v: number },
): void {
  if (node.mass === 0) return;

  const dx = bx - node.cx;
  const dy = by - node.cy;
  const dz = bz - node.cz;
  const distSq = dx * dx + dy * dy + dz * dz + 0.01;

  if (node.children.length === 0 || (node.size * node.size) / distSq < THETA * THETA) {
    const force = (REPULSION * node.mass) / distSq;
    const dist = Math.sqrt(distSq);
    fx.v += (dx / dist) * force;
    fy.v += (dy / dist) * force;
    fz.v += (dz / dist) * force;
    return;
  }

  for (let i = 0; i < 8; i++) {
    if (node.children[i]) {
      applyRepulsion(node.children[i]!, bx, by, bz, fx, fy, fz);
    }
  }
}

/* ── Golden spiral initial placement ──────── */

export function initLayout(nodes: BrainNode[], _edges: readonly BrainEdge[]): void {
  alpha = 1;
  iteration = 0;
  const n = nodes.length;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const radius = Math.cbrt(n) * 5;

  for (let i = 0; i < n; i++) {
    const t = i / Math.max(n - 1, 1);
    const inclination = Math.acos(1 - 2 * t);
    const azimuth = goldenAngle * i;
    const r = radius * Math.cbrt(t + 0.1);

    nodes[i].x = r * Math.sin(inclination) * Math.cos(azimuth);
    nodes[i].y = r * Math.sin(inclination) * Math.sin(azimuth);
    nodes[i].z = r * Math.cos(inclination);
    nodes[i].vx = 0;
    nodes[i].vy = 0;
    nodes[i].vz = 0;
  }
}

export function stepLayout(nodes: BrainNode[], edges: readonly BrainEdge[]): void {
  if (alpha < MIN_ALPHA || iteration >= MAX_ITERATIONS) return;

  const n = nodes.length;
  if (n === 0) return;

  /* Build octree */
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;

  for (let i = 0; i < n; i++) {
    if (nodes[i].x < minX) minX = nodes[i].x;
    if (nodes[i].y < minY) minY = nodes[i].y;
    if (nodes[i].z < minZ) minZ = nodes[i].z;
    if (nodes[i].x > maxX) maxX = nodes[i].x;
    if (nodes[i].y > maxY) maxY = nodes[i].y;
    if (nodes[i].z > maxZ) maxZ = nodes[i].z;
  }

  const size = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1) + 2;
  const root = createOctNode(minX - 1, minY - 1, minZ - 1, size);

  for (let i = 0; i < n; i++) {
    insertBody(root, nodes[i].x, nodes[i].y, nodes[i].z, i, nodes);
  }

  /* Repulsion via Barnes-Hut */
  const fx = { v: 0 };
  const fy = { v: 0 };
  const fz = { v: 0 };

  for (let i = 0; i < n; i++) {
    fx.v = 0;
    fy.v = 0;
    fz.v = 0;
    applyRepulsion(root, nodes[i].x, nodes[i].y, nodes[i].z, fx, fy, fz);
    nodes[i].vx += fx.v * alpha;
    nodes[i].vy += fy.v * alpha;
    nodes[i].vz += fz.v * alpha;
  }

  /* Attraction along edges */
  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    const a = nodes[edge.from];
    const b = nodes[edge.to];
    if (!a || !b) continue;

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.01;
    const force = ATTRACTION * dist * (0.5 + edge.strength * 0.5);

    const fx2 = (dx / dist) * force;
    const fy2 = (dy / dist) * force;
    const fz2 = (dz / dist) * force;

    a.vx += fx2 * alpha;
    a.vy += fy2 * alpha;
    a.vz += fz2 * alpha;
    b.vx -= fx2 * alpha;
    b.vy -= fy2 * alpha;
    b.vz -= fz2 * alpha;
  }

  /* Center gravity + damping + apply */
  for (let i = 0; i < n; i++) {
    nodes[i].vx -= nodes[i].x * CENTER_GRAVITY;
    nodes[i].vy -= nodes[i].y * CENTER_GRAVITY;
    nodes[i].vz -= nodes[i].z * CENTER_GRAVITY;

    nodes[i].vx *= DAMPING;
    nodes[i].vy *= DAMPING;
    nodes[i].vz *= DAMPING;

    nodes[i].x += nodes[i].vx;
    nodes[i].y += nodes[i].vy;
    nodes[i].z += nodes[i].vz;
  }

  alpha *= 0.995;
  iteration++;
}

export function isSettled(): boolean {
  return alpha < MIN_ALPHA || iteration >= MAX_ITERATIONS;
}
