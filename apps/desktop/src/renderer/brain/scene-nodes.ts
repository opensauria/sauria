import {
  InstancedMesh,
  SphereGeometry,
  MeshStandardMaterial,
  MeshBasicMaterial,
  Matrix4,
  Color,
  Scene,
} from 'three';
import type { BrainNode, TierConfig } from './scene-types.js';
import { TYPE_COLORS, DEFAULT_COLOR } from './scene-types.js';

let neuronMesh: InstancedMesh | null = null;
let glowMesh: InstancedMesh | null = null;

const tempMatrix = new Matrix4();
const tempColor = new Color();

function nodeScale(importance: number): number {
  return 0.5 + importance * 3.0;
}

export function createNodes(scene: Scene, nodes: readonly BrainNode[], tier: TierConfig): void {
  const count = nodes.length;
  if (count === 0) return;

  const geometry = new SphereGeometry(1, tier.sphereWidthSegments, tier.sphereHeightSegments);

  const material = new MeshStandardMaterial({
    metalness: 0.3,
    roughness: 0.6,
  });

  neuronMesh = new InstancedMesh(geometry, material, count);
  neuronMesh.frustumCulled = false;

  for (let i = 0; i < count; i++) {
    const node = nodes[i];
    const s = nodeScale(node.importance);
    tempMatrix.makeScale(s, s, s);
    tempMatrix.setPosition(node.x, node.y, node.z);
    neuronMesh.setMatrixAt(i, tempMatrix);

    const hex = TYPE_COLORS[node.type] ?? DEFAULT_COLOR;
    tempColor.setHex(hex);
    neuronMesh.setColorAt(i, tempColor);
  }

  neuronMesh.instanceMatrix.needsUpdate = true;
  if (neuronMesh.instanceColor) neuronMesh.instanceColor.needsUpdate = true;
  scene.add(neuronMesh);

  if (tier.enableGlow) {
    const glowGeo = new SphereGeometry(1.3, tier.sphereWidthSegments, tier.sphereHeightSegments);

    const glowMat = new MeshBasicMaterial({
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
    });

    glowMesh = new InstancedMesh(glowGeo, glowMat, count);
    glowMesh.frustumCulled = false;

    for (let i = 0; i < count; i++) {
      const node = nodes[i];
      const s = nodeScale(node.importance);
      tempMatrix.makeScale(s, s, s);
      tempMatrix.setPosition(node.x, node.y, node.z);
      glowMesh.setMatrixAt(i, tempMatrix);

      const hex = TYPE_COLORS[node.type] ?? DEFAULT_COLOR;
      tempColor.setHex(hex);
      glowMesh.setColorAt(i, tempColor);
    }

    glowMesh.instanceMatrix.needsUpdate = true;
    if (glowMesh.instanceColor) glowMesh.instanceColor.needsUpdate = true;
    scene.add(glowMesh);
  }
}

export function updateNodeTransforms(nodes: readonly BrainNode[]): void {
  if (!neuronMesh) return;
  const count = nodes.length;

  for (let i = 0; i < count; i++) {
    const node = nodes[i];
    const s = nodeScale(node.importance);
    tempMatrix.makeScale(s, s, s);
    tempMatrix.setPosition(node.x, node.y, node.z);
    neuronMesh.setMatrixAt(i, tempMatrix);

    if (glowMesh) {
      glowMesh.setMatrixAt(i, tempMatrix);
    }
  }

  neuronMesh.instanceMatrix.needsUpdate = true;
  if (glowMesh) glowMesh.instanceMatrix.needsUpdate = true;
}

export function getNeuronMesh(): InstancedMesh | null {
  return neuronMesh;
}

export function disposeNodes(): void {
  if (neuronMesh) {
    neuronMesh.geometry.dispose();
    (neuronMesh.material as MeshStandardMaterial).dispose();
    neuronMesh.parent?.remove(neuronMesh);
    neuronMesh = null;
  }
  if (glowMesh) {
    glowMesh.geometry.dispose();
    (glowMesh.material as MeshBasicMaterial).dispose();
    glowMesh.parent?.remove(glowMesh);
    glowMesh = null;
  }
}
