import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  AmbientLight,
  DirectionalLight,
  Color,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { BrainNode, BrainEdge, SceneCallbacks, TierConfig } from './scene-types.js';
import { TIER_DESKTOP, TIER_LOW } from './scene-types.js';
import { createNodes, updateNodeTransforms, disposeNodes } from './scene-nodes.js';
import { createEdges, updateEdgePositions, disposeEdges } from './scene-edges.js';
import { initLayout, stepLayout, isSettled } from './scene-layout.js';
import { setupInteraction, disposeInteraction } from './scene-interaction.js';
import {
  initAnimation,
  updatePulse,
  updateShimmer,
  updateImpulses,
  disposeAnimation,
} from './scene-animation.js';

interface SceneState {
  scene: Scene;
  camera: PerspectiveCamera;
  renderer: WebGLRenderer;
  controls: OrbitControls;
  nodes: BrainNode[];
  edges: readonly BrainEdge[];
  tier: TierConfig;
  animId: number;
  disposed: boolean;
  settleFrame: number;
}

let state: SceneState | null = null;

function detectTier(): TierConfig {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  if (!gl) return TIER_LOW;
  const glCtx = gl as WebGLRenderingContext;
  const maxTex = glCtx.getParameter(glCtx.MAX_TEXTURE_SIZE) as number;
  const cores = navigator.hardwareConcurrency || 2;
  canvas.remove();
  if (maxTex < 4096 || cores <= 4) return TIER_LOW;
  return TIER_DESKTOP;
}

export function initScene(
  container: HTMLElement,
  tooltip: HTMLElement,
  nodes: BrainNode[],
  edges: readonly BrainEdge[],
  callbacks: SceneCallbacks,
): void {
  disposeScene();

  const tier = detectTier();
  const { width, height } = container.getBoundingClientRect();

  const scene = new Scene();
  scene.background = new Color(0x1a1a1a);

  const camera = new PerspectiveCamera(60, width / height, 0.1, 2000);
  camera.position.set(0, 0, 80);

  const renderer = new WebGLRenderer({
    antialias: tier.pixelRatio <= 1,
    alpha: true,
    powerPreference: 'default',
  });
  renderer.setSize(width, height);
  renderer.setPixelRatio(tier.pixelRatio);
  container.appendChild(renderer.domElement);

  const ambient = new AmbientLight(0xffffff, 0.4);
  scene.add(ambient);

  const directional = new DirectionalLight(0xffffff, 0.6);
  directional.position.set(40, 60, 80);
  scene.add(directional);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.3;
  controls.minDistance = 20;
  controls.maxDistance = 300;
  controls.enablePan = false;

  controls.addEventListener('start', () => {
    controls.autoRotate = false;
  });

  createNodes(scene, nodes, tier);
  createEdges(scene, nodes, edges, tier);
  initLayout(nodes, edges);
  initAnimation(scene, nodes, edges, tier);
  setupInteraction(renderer, camera, nodes, tooltip, container, callbacks);

  state = {
    scene,
    camera,
    renderer,
    controls,
    nodes,
    edges,
    tier,
    animId: 0,
    disposed: false,
    settleFrame: 0,
  };

  const onResize = (): void => {
    if (!state || state.disposed) return;
    const rect = container.getBoundingClientRect();
    state.camera.aspect = rect.width / rect.height;
    state.camera.updateProjectionMatrix();
    state.renderer.setSize(rect.width, rect.height);
  };

  window.addEventListener('resize', onResize);

  function animate(): void {
    if (!state || state.disposed) return;
    state.animId = requestAnimationFrame(animate);

    const settled = isSettled();
    const steps = settled ? 0 : state.tier.layoutStepsPerFrame;
    for (let i = 0; i < steps; i++) {
      stepLayout(state.nodes, state.edges);
    }
    if (!settled) state.settleFrame++;

    updateNodeTransforms(state.nodes);
    updateEdgePositions(state.nodes, state.edges);
    updatePulse();
    updateShimmer();
    updateImpulses(state.nodes, state.edges);

    state.controls.update();
    state.renderer.render(state.scene, state.camera);
  }

  animate();
}

export function disposeScene(): void {
  if (!state) return;
  state.disposed = true;
  cancelAnimationFrame(state.animId);

  disposeInteraction();
  disposeAnimation();
  disposeNodes();
  disposeEdges();

  state.controls.dispose();
  state.renderer.domElement.remove();
  state.renderer.dispose();

  state = null;
}
