import { BufferGeometry, Float32BufferAttribute, LineSegments, ShaderMaterial, Scene } from 'three';
import type { BrainNode, BrainEdge, TierConfig } from './scene-types.js';

let edgeMesh: LineSegments | null = null;
let edgeMaterial: ShaderMaterial | null = null;
let positionAttr: Float32BufferAttribute | null = null;

const VERT = `
  attribute float aOpacity;
  varying float vOpacity;
  void main() {
    vOpacity = aOpacity;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = `
  uniform float uTime;
  uniform vec3 uColor;
  varying float vOpacity;
  void main() {
    float shimmer = 0.7 + 0.3 * sin(uTime * 2.0 + gl_FragCoord.x * 0.02);
    gl_FragColor = vec4(uColor, vOpacity * shimmer);
  }
`;

export function createEdges(
  scene: Scene,
  nodes: readonly BrainNode[],
  edges: readonly BrainEdge[],
  _tier: TierConfig,
): void {
  const count = edges.length;
  if (count === 0) return;

  const positions = new Float32Array(count * 6);
  const opacities = new Float32Array(count * 2);

  for (let i = 0; i < count; i++) {
    const edge = edges[i];
    const a = nodes[edge.from];
    const b = nodes[edge.to];
    if (!a || !b) continue;

    const idx = i * 6;
    positions[idx] = a.x;
    positions[idx + 1] = a.y;
    positions[idx + 2] = a.z;
    positions[idx + 3] = b.x;
    positions[idx + 4] = b.y;
    positions[idx + 5] = b.z;

    const opacity = 0.08 + edge.strength * 0.2;
    opacities[i * 2] = opacity;
    opacities[i * 2 + 1] = opacity;
  }

  const geometry = new BufferGeometry();
  positionAttr = new Float32BufferAttribute(positions, 3);
  positionAttr.setUsage(35048); /* DynamicDrawUsage */
  geometry.setAttribute('position', positionAttr);
  geometry.setAttribute('aOpacity', new Float32BufferAttribute(opacities, 1));

  edgeMaterial = new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: [1.0, 1.0, 1.0] },
    },
    transparent: true,
    depthWrite: false,
  });

  edgeMesh = new LineSegments(geometry, edgeMaterial);
  edgeMesh.frustumCulled = false;
  scene.add(edgeMesh);
}

export function updateEdgePositions(
  nodes: readonly BrainNode[],
  edges: readonly BrainEdge[],
): void {
  if (!positionAttr) return;
  const arr = positionAttr.array as Float32Array;

  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    const a = nodes[edge.from];
    const b = nodes[edge.to];
    if (!a || !b) continue;

    const idx = i * 6;
    arr[idx] = a.x;
    arr[idx + 1] = a.y;
    arr[idx + 2] = a.z;
    arr[idx + 3] = b.x;
    arr[idx + 4] = b.y;
    arr[idx + 5] = b.z;
  }

  positionAttr.needsUpdate = true;
}

export function getEdgeMaterial(): ShaderMaterial | null {
  return edgeMaterial;
}

export function disposeEdges(): void {
  if (edgeMesh) {
    edgeMesh.geometry.dispose();
    edgeMesh.parent?.remove(edgeMesh);
    edgeMesh = null;
  }
  if (edgeMaterial) {
    edgeMaterial.dispose();
    edgeMaterial = null;
  }
  positionAttr = null;
}
