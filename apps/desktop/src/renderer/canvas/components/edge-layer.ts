import { html, nothing } from 'lit';
import { LightDomElement } from '../light-dom-element.js';
import { customElement, property } from 'lit/decorators.js';
import type { AgentNode, Edge } from '../types.js';
import { computeEdgeGeometry } from '../helpers.js';
import { fire } from '../fire.js';

/**
 * SVG edge layer — Light DOM for coordinate consistency with canvas-world.
 * Renders gradient edges between connected nodes.
 */
@customElement('edge-layer')
export class EdgeLayer extends LightDomElement {
  @property({ attribute: false }) edges: Edge[] = [];
  @property({ attribute: false }) nodes: AgentNode[] = [];
  @property({ attribute: false }) worldEl: HTMLElement | null = null;

  private hoveredEdgeId: string | null = null;
  private edgeHideTimeout: ReturnType<typeof setTimeout> | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener('mouseover', this.handleMouseOver);
    this.addEventListener('mouseout', this.handleMouseOut);
    this.addEventListener('click', this.handleClick);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.removeEventListener('mouseover', this.handleMouseOver);
    this.removeEventListener('mouseout', this.handleMouseOut);
    this.removeEventListener('click', this.handleClick);
    if (this.edgeHideTimeout) clearTimeout(this.edgeHideTimeout);
  }

  private handleMouseOver = (e: Event): void => {
    const hit = (e.target as HTMLElement).closest('.edge-hit') as HTMLElement | null;
    if (!hit) return;
    if (this.edgeHideTimeout) clearTimeout(this.edgeHideTimeout);
    this.hoveredEdgeId = hit.dataset.edgeId ?? null;
    if (this.hoveredEdgeId) {
      fire(this, 'edge-hover', { edgeId: this.hoveredEdgeId });
    }
  };

  private handleMouseOut = (e: Event): void => {
    const hit = (e.target as HTMLElement).closest('.edge-hit') as HTMLElement | null;
    if (!hit) return;
    this.edgeHideTimeout = setTimeout(() => {
      this.hoveredEdgeId = null;
      fire(this, 'edge-hover-leave');
    }, 300);
  };

  private handleClick = (e: Event): void => {
    const hit = (e.target as HTMLElement).closest('.edge-hit') as HTMLElement | null;
    if (!hit) return;
    const edgeId = hit.dataset.edgeId;
    if (!edgeId) return;
    const edge = this.edges.find((ed) => ed.id === edgeId);
    if (!edge) return;
    fire(this, 'edge-click', { fromId: edge.from, toId: edge.to });
  };

  render() {
    return nothing;
  }

  updated(): void {
    let svg = this.querySelector('#edge-svg') as SVGSVGElement | null;
    if (!svg) {
      const ns = 'http://www.w3.org/2000/svg';
      svg = document.createElementNS(ns, 'svg') as SVGSVGElement;
      svg.id = 'edge-svg';
      svg.classList.add('edge-svg');
      svg.setAttribute('width', '10000');
      svg.setAttribute('height', '10000');
      svg.setAttribute('viewBox', '-5000 -5000 10000 10000');
      this.prepend(svg);
    }
    this.rebuildSvg(svg);
  }

  private rebuildSvg(svg: SVGSVGElement): void {
    if (!this.worldEl) return;

    let defs = '';
    let paths = '';

    for (const edge of this.edges) {
      const fromNode = this.nodes.find((n) => n.id === edge.from);
      const toNode = this.nodes.find((n) => n.id === edge.to);
      if (!fromNode || !toNode) continue;

      const geo = computeEdgeGeometry(fromNode, toNode, this.worldEl);
      if (!geo) continue;

      const gid = 'eg-' + edge.id;
      const fid = 'ef-' + edge.id;
      const gradientAttrs = `" gradientUnits="userSpaceOnUse" x1="${geo.x1}" y1="${geo.y1}" x2="${geo.x2}" y2="${geo.y2}">`;

      defs +=
        `<linearGradient id="${gid}${gradientAttrs}` +
        '<stop offset="0%" stop-color="rgba(255,255,255,0)" />' +
        '<stop offset="20%" stop-color="rgba(255,255,255,0.14)" />' +
        '<stop offset="50%" stop-color="rgba(255,255,255,0.18)" />' +
        '<stop offset="80%" stop-color="rgba(255,255,255,0.14)" />' +
        '<stop offset="100%" stop-color="rgba(255,255,255,0)" />' +
        '</linearGradient>';

      defs +=
        `<linearGradient id="${fid}${gradientAttrs}` +
        '<stop offset="0%" stop-color="rgba(255,255,255,0)" />' +
        '<stop offset="15%" stop-color="rgba(255,255,255,0.35)" />' +
        '<stop offset="85%" stop-color="rgba(255,255,255,0.35)" />' +
        '<stop offset="100%" stop-color="rgba(255,255,255,0)" />' +
        '</linearGradient>';

      paths +=
        `<g class="edge-group" data-edge-id="${edge.id}">` +
        `<path class="edge-hit" data-edge-id="${edge.id}" d="${geo.d}" />` +
        `<path class="edge-line" d="${geo.d}" stroke="url(#${gid})" />` +
        `<path class="edge-flow" d="${geo.d}" stroke="url(#${fid})" />` +
        '</g>';
    }

    const tempLine = svg.querySelector('.edge-temp');
    svg.innerHTML = '<defs>' + defs + '</defs>' + paths;
    if (tempLine) svg.appendChild(tempLine);
  }

  /** Public method: get midpoint of an edge for delete button positioning. */
  getEdgeMidpoint(edgeId: string): { x: number; y: number } | null {
    if (!this.worldEl) return null;
    const edge = this.edges.find((e) => e.id === edgeId);
    if (!edge) return null;
    const fromNode = this.nodes.find((n) => n.id === edge.from);
    const toNode = this.nodes.find((n) => n.id === edge.to);
    if (!fromNode || !toNode) return null;
    const geo = computeEdgeGeometry(fromNode, toNode, this.worldEl);
    if (!geo) return null;
    return { x: geo.midX, y: geo.midY };
  }
}
