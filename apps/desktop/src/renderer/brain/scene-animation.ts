import {
  Points,
  BufferGeometry,
  Float32BufferAttribute,
  PointsMaterial,
  AdditiveBlending,
  Scene,
} from 'three';
import type { BrainNode, BrainEdge, TierConfig } from './scene-types.js';
import { getNeuronMesh } from './scene-nodes.js';
import { getEdgeMaterial } from './scene-edges.js';

let impulsePoints: Points | null = null;
let impulsePositions: Float32Array | null = null;
let impulseProgress: Float32Array | null = null;
let impulseEdgeIndices: Uint16Array | null = null;
let impulseSpeed: Float32Array | null = null;
let maxImpulses = 0;
let clock = 0;

const PULSE_SPEED = 0.015;
const IMPULSE_BASE_SPEED = 0.004;

export function initAnimation(
  scene: Scene,
  _nodes: readonly BrainNode[],
  edges: readonly BrainEdge[],
  tier: TierConfig,
): void {
  maxImpulses = Math.min(tier.maxImpulses, edges.length);
  if (maxImpulses === 0) return;

  impulsePositions = new Float32Array(maxImpulses * 3);
  impulseProgress = new Float32Array(maxImpulses);
  impulseEdgeIndices = new Uint16Array(maxImpulses);
  impulseSpeed = new Float32Array(maxImpulses);

  for (let i = 0; i < maxImpulses; i++) {
    impulseEdgeIndices[i] = Math.floor(Math.random() * edges.length);
    impulseProgress[i] = Math.random();
    impulseSpeed[i] = IMPULSE_BASE_SPEED + Math.random() * IMPULSE_BASE_SPEED;
  }

  const geometry = new BufferGeometry();
  const posAttr = new Float32BufferAttribute(impulsePositions, 3);
  posAttr.setUsage(35048); /* DynamicDrawUsage */
  geometry.setAttribute('position', posAttr);

  const material = new PointsMaterial({
    size: 1.2,
    color: 0x038b9a,
    transparent: true,
    opacity: 0.7,
    blending: AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });

  impulsePoints = new Points(geometry, material);
  impulsePoints.frustumCulled = false;
  scene.add(impulsePoints);
}

export function updatePulse(): void {
  clock += PULSE_SPEED;
  const mesh = getNeuronMesh();
  if (!mesh) return;

  /* Subtle scale oscillation driven by clock — applied via the
     mesh's overall scale to avoid per-instance overhead. The
     visual effect is a gentle "breathing" of all neurons. */
  const pulse = 1 + Math.sin(clock) * 0.015;
  mesh.scale.setScalar(pulse);
}

export function updateShimmer(): void {
  const mat = getEdgeMaterial();
  if (mat) {
    mat.uniforms['uTime'].value = clock;
  }
}

export function updateImpulses(nodes: readonly BrainNode[], edges: readonly BrainEdge[]): void {
  if (
    !impulsePoints ||
    !impulsePositions ||
    !impulseProgress ||
    !impulseEdgeIndices ||
    !impulseSpeed
  )
    return;

  const edgeCount = edges.length;
  if (edgeCount === 0) return;

  for (let i = 0; i < maxImpulses; i++) {
    impulseProgress[i] += impulseSpeed[i];

    if (impulseProgress[i] >= 1) {
      impulseProgress[i] = 0;
      impulseEdgeIndices[i] = Math.floor(Math.random() * edgeCount);
      impulseSpeed[i] = IMPULSE_BASE_SPEED + Math.random() * IMPULSE_BASE_SPEED;
    }

    const edge = edges[impulseEdgeIndices[i]];
    if (!edge) continue;

    const a = nodes[edge.from];
    const b = nodes[edge.to];
    if (!a || !b) continue;

    const t = impulseProgress[i];
    const idx = i * 3;
    impulsePositions[idx] = a.x + (b.x - a.x) * t;
    impulsePositions[idx + 1] = a.y + (b.y - a.y) * t;
    impulsePositions[idx + 2] = a.z + (b.z - a.z) * t;
  }

  const posAttr = impulsePoints.geometry.getAttribute('position');
  (posAttr as Float32BufferAttribute).needsUpdate = true;
}

export function disposeAnimation(): void {
  if (impulsePoints) {
    impulsePoints.geometry.dispose();
    (impulsePoints.material as PointsMaterial).dispose();
    impulsePoints.parent?.remove(impulsePoints);
    impulsePoints = null;
  }
  impulsePositions = null;
  impulseProgress = null;
  impulseEdgeIndices = null;
  impulseSpeed = null;
  maxImpulses = 0;
  clock = 0;
}
