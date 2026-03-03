import { Raycaster, Vector2, PerspectiveCamera, WebGLRenderer } from 'three';
import type { BrainNode, SceneCallbacks } from './scene-types.js';
import { getNeuronMesh } from './scene-nodes.js';

let raycaster: Raycaster | null = null;
let mouse = new Vector2(-999, -999);
let hoveredIndex = -1;
let lastMoveTime = 0;
let boundMouseMove: ((e: MouseEvent) => void) | null = null;
let boundClick: ((e: MouseEvent) => void) | null = null;
let containerRef: HTMLElement | null = null;

const THROTTLE_MS = 33; /* ~30fps */

export function setupInteraction(
  renderer: WebGLRenderer,
  camera: PerspectiveCamera,
  nodes: readonly BrainNode[],
  tooltip: HTMLElement,
  container: HTMLElement,
  callbacks: SceneCallbacks,
): void {
  raycaster = new Raycaster();
  raycaster.params.Points = { threshold: 2 };
  containerRef = container;

  boundMouseMove = (e: MouseEvent): void => {
    const now = performance.now();
    if (now - lastMoveTime < THROTTLE_MS) return;
    lastMoveTime = now;

    const rect = container.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    if (!raycaster) return;
    raycaster.setFromCamera(mouse, camera);

    const mesh = getNeuronMesh();
    if (!mesh) return;

    const intersects = raycaster.intersectObject(mesh);
    if (intersects.length > 0) {
      const idx = intersects[0].instanceId;
      if (idx !== undefined && idx !== hoveredIndex) {
        hoveredIndex = idx;
        const node = nodes[idx];
        callbacks.onNodeHover(node ? node.id : null);
        showTooltip(tooltip, e.clientX, e.clientY, node);
      }
      container.style.cursor = 'pointer';
    } else {
      if (hoveredIndex !== -1) {
        hoveredIndex = -1;
        callbacks.onNodeHover(null);
        hideTooltip(tooltip);
      }
      container.style.cursor = 'default';
    }
  };

  boundClick = (e: MouseEvent): void => {
    if (!raycaster) return;
    const rect = container.getBoundingClientRect();
    const clickMouse = new Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(clickMouse, camera);

    const mesh = getNeuronMesh();
    if (!mesh) return;

    const intersects = raycaster.intersectObject(mesh);
    if (intersects.length > 0) {
      const idx = intersects[0].instanceId;
      if (idx !== undefined) {
        const node = nodes[idx];
        if (node) {
          callbacks.onNodeClick(node.id);
          hideTooltip(tooltip);
        }
      }
    }
  };

  renderer.domElement.addEventListener('mousemove', boundMouseMove);
  renderer.domElement.addEventListener('click', boundClick);
}

function showTooltip(
  tooltip: HTMLElement,
  clientX: number,
  clientY: number,
  node: BrainNode | undefined,
): void {
  if (!node || !containerRef) return;
  const rect = containerRef.getBoundingClientRect();
  tooltip.textContent = node.name + ' (' + node.type + ')';
  tooltip.style.display = 'block';
  tooltip.style.left = clientX - rect.left + 16 + 'px';
  tooltip.style.top = clientY - rect.top - 8 + 'px';
}

function hideTooltip(tooltip: HTMLElement): void {
  tooltip.style.display = 'none';
}

export function disposeInteraction(): void {
  if (containerRef && boundMouseMove) {
    const canvas = containerRef.querySelector('canvas');
    if (canvas) {
      canvas.removeEventListener('mousemove', boundMouseMove);
      if (boundClick) canvas.removeEventListener('click', boundClick);
    }
  }
  raycaster = null;
  boundMouseMove = null;
  boundClick = null;
  containerRef = null;
  hoveredIndex = -1;
}
