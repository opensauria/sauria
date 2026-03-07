import { nothing } from 'lit';
import { LightDomElement } from '../light-dom-element.js';
import { customElement, property, state } from 'lit/decorators.js';
import { CF_PLATFORMS, PLATFORM_ICONS } from '../constants.js';
import { escapeHtml } from '../helpers.js';
import { CoverflowDragHandler } from './coverflow-drag-handler.js';

const STIFFNESS = 0.06;
const DAMPING = 0.78;
const SCROLL_THRESHOLD = 50;

@customElement('coverflow-dock')
export class CoverflowDock extends LightDomElement {
  @property({ type: Boolean }) collapsed = true;

  @state() private activeIndex = 0;
  private currentIndex = 0;
  private velocity = 0;
  private isAnimating = false;
  private scrollAccum = 0;
  private scrollTimer: ReturnType<typeof setTimeout> | null = null;
  private rafHandle = 0;
  private readonly dragHandler = new CoverflowDragHandler(this);

  connectedCallback(): void {
    super.connectedCallback();
    this.dragHandler.attach();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.dragHandler.detach();
    cancelAnimationFrame(this.rafHandle);
    if (this.scrollTimer) clearTimeout(this.scrollTimer);
  }

  render() {
    return nothing;
  }

  updated(): void {
    this.className = 'coverflow-dock' + (this.collapsed ? ' collapsed' : '');
    this.buildTrack();
  }

  resetToIndex(idx: number): void {
    this.activeIndex = idx;
    this.currentIndex = idx;
    this.velocity = 0;
    this.updateTransforms();
  }

  private buildTrack(): void {
    let track = this.querySelector('.coverflow-track') as HTMLDivElement | null;
    if (!track) {
      track = document.createElement('div');
      track.className = 'coverflow-track';
      track.id = 'coverflow-track';
      track.style.perspective = '600px';
      this.appendChild(track);

      track.addEventListener('wheel', this.handleWheel.bind(this), { passive: false });
      track.addEventListener('click', this.handleTrackClick.bind(this));
      track.addEventListener('mousedown', (e) => { this.dragHandler.handleTrackMouseDown(e); });
    }

    if (track.children.length !== CF_PLATFORMS.length) {
      track.innerHTML = '';
      CF_PLATFORMS.forEach((p, i) => {
        const card = document.createElement('div');
        card.className = 'coverflow-card';
        card.dataset.platform = p.id;
        card.dataset.index = String(i);
        card.innerHTML =
          '<div class="cf-icon">' + (PLATFORM_ICONS[p.id] ?? '') + '</div>' +
          '<div class="cf-name">' + escapeHtml(p.name) + '</div>' +
          '<div class="cf-hint">' + escapeHtml(p.hint) + '</div>';
        track!.appendChild(card);
      });
    }

    this.updateTransforms();
  }

  private updateTransforms(): void {
    const track = this.querySelector('.coverflow-track');
    if (!track) return;
    const cards = track.querySelectorAll('.coverflow-card') as NodeListOf<HTMLElement>;
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const offset = i - this.currentIndex;
      const absOffset = Math.abs(offset);
      const sign = offset > 0 ? 1 : -1;

      const translateX = offset * 100;
      const translateZ = 60 - absOffset * 120;
      const rotateY = absOffset < 0.01 ? 0 : -sign * Math.min(absOffset, 1.2) * 40;
      const scale = Math.max(0.85, 1.08 - absOffset * 0.16);
      const opacity = Math.max(0, 1 - absOffset * 0.3);
      const zIndex = Math.max(0, 5 - Math.round(absOffset));

      card.style.transform =
        `translateX(${translateX}px) translateZ(${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`;
      card.style.opacity = String(opacity);
      card.style.zIndex = String(zIndex);
      card.style.pointerEvents = absOffset > 2.5 ? 'none' : 'auto';
    }
  }

  private springTick = (): void => {
    const force = (this.activeIndex - this.currentIndex) * STIFFNESS;
    this.velocity = (this.velocity + force) * DAMPING;
    this.currentIndex += this.velocity;

    if (Math.abs(this.currentIndex - this.activeIndex) < 0.002 && Math.abs(this.velocity) < 0.002) {
      this.currentIndex = this.activeIndex;
      this.velocity = 0;
      this.isAnimating = false;
      this.updateTransforms();
      return;
    }

    this.updateTransforms();
    this.rafHandle = requestAnimationFrame(this.springTick);
  };

  private startAnimation(): void {
    if (this.isAnimating) return;
    this.isAnimating = true;
    this.rafHandle = requestAnimationFrame(this.springTick);
  }

  private handleWheel(e: WheelEvent): void {
    e.preventDefault();
    e.stopPropagation();
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    this.scrollAccum += delta;

    if (this.scrollTimer) clearTimeout(this.scrollTimer);
    this.scrollTimer = setTimeout(() => { this.scrollAccum = 0; }, 150);

    if (Math.abs(this.scrollAccum) >= SCROLL_THRESHOLD) {
      const steps = Math.round(this.scrollAccum / SCROLL_THRESHOLD);
      this.activeIndex = Math.max(0, Math.min(CF_PLATFORMS.length - 1, this.activeIndex + steps));
      this.scrollAccum = this.scrollAccum % SCROLL_THRESHOLD;
      this.startAnimation();
    }
  }

  private handleTrackClick(e: MouseEvent): void {
    const card = (e.target as HTMLElement).closest('.coverflow-card') as HTMLElement | null;
    if (!card) return;
    const idx = parseInt(card.dataset.index!, 10);
    if (idx !== this.activeIndex) {
      this.activeIndex = idx;
      this.startAnimation();
    }
  }
}
