import { html, nothing } from 'lit';
import { LightDomElement } from '../light-dom-element.js';
import { customElement, property } from 'lit/decorators.js';
import type { AgentNode, Edge } from '../types.js';
import { computeEdgeGeometry } from '../helpers.js';

const MAX_EDGE_ANIMS = 3;
const ANIM_DURATION_MS = 800;
const BUBBLE_LINGER_MS = 2500;
const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Activity animation overlay — traveling dots and floating bubbles.
 * Light DOM for SVG coordinate consistency.
 */
@customElement('edge-activity')
export class EdgeActivity extends LightDomElement {
  @property({ attribute: false }) edges: Edge[] = [];
  @property({ attribute: false }) nodes: AgentNode[] = [];
  @property({ attribute: false }) worldEl: HTMLElement | null = null;

  private edgeAnimCounts = new Map<string, number>();
  private edgeActiveCounts = new Map<string, number>();

  render() {
    return nothing;
  }

  updated(): void {
    if (!this.querySelector('#activity-svg')) {
      const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
      svg.id = 'activity-svg';
      svg.classList.add('activity-svg');

      const defs = document.createElementNS(SVG_NS, 'defs');
      const filter = document.createElementNS(SVG_NS, 'filter');
      filter.id = 'activity-glow';
      filter.setAttribute('x', '-50%');
      filter.setAttribute('y', '-50%');
      filter.setAttribute('width', '200%');
      filter.setAttribute('height', '200%');

      const blur = document.createElementNS(SVG_NS, 'feGaussianBlur');
      blur.setAttribute('stdDeviation', '3');
      blur.setAttribute('result', 'glow');
      filter.appendChild(blur);

      const merge = document.createElementNS(SVG_NS, 'feMerge');
      const mn1 = document.createElementNS(SVG_NS, 'feMergeNode');
      mn1.setAttribute('in', 'glow');
      const mn2 = document.createElementNS(SVG_NS, 'feMergeNode');
      mn2.setAttribute('in', 'SourceGraphic');
      merge.appendChild(mn1);
      merge.appendChild(mn2);
      filter.appendChild(merge);
      defs.appendChild(filter);
      svg.appendChild(defs);

      this.prepend(svg);
    }
  }

  /** Animate a traveling dot along an edge. */
  animateEdgeTravel(fromId: string, toId: string, preview: string): void {
    const activitySvg = this.querySelector('#activity-svg') as SVGSVGElement | null;
    if (!activitySvg || !this.worldEl) return;
    if (fromId === toId) return;

    const edgeKey = fromId + '->' + toId;
    const currentCount = this.edgeAnimCounts.get(edgeKey) ?? 0;
    if (currentCount >= MAX_EDGE_ANIMS) return;
    this.edgeAnimCounts.set(edgeKey, currentCount + 1);

    const matchedEdge = this.edges.find(
      (e) => (e.from === fromId && e.to === toId) || (e.from === toId && e.to === fromId),
    );
    const isReverse = matchedEdge ? matchedEdge.from !== fromId : false;

    let edgeGroupEl: Element | null = null;
    const edgeSvg = this.worldEl.querySelector('#edge-svg');
    if (matchedEdge && edgeSvg) {
      edgeGroupEl = edgeSvg.querySelector(`[data-edge-id="${matchedEdge.id}"].edge-group`);
      if (edgeGroupEl) {
        edgeGroupEl.classList.add('edge-active');
        const activeCount = (this.edgeActiveCounts.get(matchedEdge.id) ?? 0) + 1;
        this.edgeActiveCounts.set(matchedEdge.id, activeCount);
      }
    }

    const geoFrom = isReverse ? toId : fromId;
    const geoTo = isReverse ? fromId : toId;
    const fromNode = this.nodes.find((n) => n.id === geoFrom);
    const toNode = this.nodes.find((n) => n.id === geoTo);
    if (!fromNode || !toNode) {
      this.decrementAnimCount(edgeKey, matchedEdge?.id, edgeGroupEl);
      return;
    }

    const geo = computeEdgeGeometry(fromNode, toNode, this.worldEl);
    if (!geo) {
      this.decrementAnimCount(edgeKey, matchedEdge?.id, edgeGroupEl);
      return;
    }

    const tempPath = document.createElementNS(SVG_NS, 'path') as SVGPathElement;
    tempPath.setAttribute('d', geo.d);
    tempPath.setAttribute('fill', 'none');
    tempPath.setAttribute('stroke', 'none');
    activitySvg.appendChild(tempPath);
    const totalLength = tempPath.getTotalLength();

    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('r', '4');
    circle.classList.add('activity-dot');
    circle.setAttribute('filter', 'url(#activity-glow)');
    activitySvg.appendChild(circle);

    const bubble = document.createElement('div');
    bubble.className = 'activity-bubble';
    bubble.textContent = preview;
    bubble.style.left = geo.midX + 'px';
    bubble.style.top = geo.midY + 'px';
    bubble.addEventListener('click', () => {
      this.dispatchEvent(
        new CustomEvent('bubble-click', {
          bubbles: true,
          composed: true,
          detail: { fromId, toId },
        }),
      );
    });
    this.worldEl.appendChild(bubble);

    const startTime = performance.now();
    let bubbleShown = false;
    let bubbleHidden = false;

    const step = (now: number): void => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / ANIM_DURATION_MS, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const point = tempPath.getPointAtLength(
        isReverse ? (1 - eased) * totalLength : eased * totalLength,
      );
      circle.setAttribute('cx', String(point.x));
      circle.setAttribute('cy', String(point.y));

      if (!bubbleShown && t >= 0.3) {
        bubble.classList.add('visible');
        bubbleShown = true;
      }

      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        cleanup();
      }
    };

    const cleanup = (): void => {
      circle.remove();
      tempPath.remove();
      this.decrementAnimCount(edgeKey, matchedEdge?.id, edgeGroupEl);

      if (!bubbleHidden) {
        bubbleHidden = true;
        setTimeout(() => {
          bubble.classList.remove('visible');
          setTimeout(() => bubble.remove(), 300);
        }, BUBBLE_LINGER_MS);
      }
    };

    requestAnimationFrame(step);
  }

  private decrementAnimCount(
    edgeKey: string,
    matchedEdgeId: string | undefined,
    edgeGroupEl: Element | null,
  ): void {
    this.edgeAnimCounts.set(edgeKey, (this.edgeAnimCounts.get(edgeKey) ?? 1) - 1);
    if (matchedEdgeId && edgeGroupEl) {
      const remaining = (this.edgeActiveCounts.get(matchedEdgeId) ?? 1) - 1;
      this.edgeActiveCounts.set(matchedEdgeId, remaining);
      if (remaining <= 0) edgeGroupEl.classList.remove('edge-active');
    }
  }
}
