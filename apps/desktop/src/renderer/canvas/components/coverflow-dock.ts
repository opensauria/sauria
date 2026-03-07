import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { CF_PLATFORMS, PLATFORM_ICONS } from '../constants.js';
import { escapeHtml, capitalize } from '../helpers.js';

const STIFFNESS = 0.06;
const DAMPING = 0.78;
const SCROLL_THRESHOLD = 50;

/**
 * Coverflow dock — drag-to-canvas agent platform selector with spring physics.
 */
@customElement('coverflow-dock')
export class CoverflowDock extends LitElement {
  @property({ type: Boolean }) collapsed = true;

  @state() private activeIndex = 0;
  private currentIndex = 0;
  private velocity = 0;
  private isAnimating = false;
  private scrollAccum = 0;
  private scrollTimer: ReturnType<typeof setTimeout> | null = null;

  /* Drag-from-dock state */
  private isDragging = false;
  private dragPlatform: string | null = null;
  private ghost: HTMLDivElement | null = null;

  /* Bound handlers for document-level events */
  private boundMouseMove = this.handleDocMouseMove.bind(this);
  private boundMouseUp = this.handleDocMouseUp.bind(this);
  private boundBlur = this.handleBlur.bind(this);

  createRenderRoot() {
    return this;
  }

  connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener('mousemove', this.boundMouseMove);
    document.addEventListener('mouseup', this.boundMouseUp);
    window.addEventListener('blur', this.boundBlur);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('mousemove', this.boundMouseMove);
    document.removeEventListener('mouseup', this.boundMouseUp);
    window.removeEventListener('blur', this.boundBlur);
    if (this.scrollTimer) clearTimeout(this.scrollTimer);
  }

  render() {
    return html``;
  }

  updated(): void {
    this.className = 'coverflow-dock' + (this.collapsed ? ' collapsed' : '');
    this.buildTrack();
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
      track.addEventListener('mousedown', this.handleTrackMouseDown.bind(this));
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
    requestAnimationFrame(this.springTick);
  };

  private startAnimation(): void {
    if (!this.isAnimating) {
      this.isAnimating = true;
      requestAnimationFrame(this.springTick);
    }
  }

  /** Reset spring to a given index (instant). */
  resetToIndex(idx: number): void {
    this.activeIndex = idx;
    this.currentIndex = idx;
    this.velocity = 0;
    this.updateTransforms();
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

  private handleTrackMouseDown(e: MouseEvent): void {
    const card = (e.target as HTMLElement).closest('.coverflow-card') as HTMLElement | null;
    if (!card || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    this.dragPlatform = card.dataset.platform!;
    this.isDragging = true;

    this.ghost = document.createElement('div');
    this.ghost.className = 'coverflow-ghost';
    this.ghost.innerHTML =
      '<div class="cf-icon">' + (PLATFORM_ICONS[this.dragPlatform] ?? '') + '</div>' +
      '<div class="cf-name">' + escapeHtml(capitalize(this.dragPlatform)) + '</div>';
    this.ghost.style.left = e.clientX - 48 + 'px';
    this.ghost.style.top = e.clientY - 64 + 'px';
    document.body.appendChild(this.ghost);
  }

  private handleDocMouseMove(e: MouseEvent): void {
    if (!this.isDragging || !this.ghost) return;
    this.ghost.style.left = e.clientX - 48 + 'px';
    this.ghost.style.top = e.clientY - 64 + 'px';

    const dockRect = this.getBoundingClientRect();
    if (e.clientY < dockRect.top) {
      this.ghost.classList.add('above-dock');
    } else {
      this.ghost.classList.remove('above-dock');
    }
  }

  private handleDocMouseUp(e: MouseEvent): void {
    if (!this.isDragging) return;
    this.isDragging = false;

    const dockRect = this.getBoundingClientRect();
    const droppedAboveDock = e.clientY < dockRect.top;

    if (this.ghost) {
      this.ghost.remove();
      this.ghost = null;
    }

    if (droppedAboveDock && this.dragPlatform) {
      this.dispatchEvent(
        new CustomEvent('platform-drop', {
          bubbles: true,
          composed: true,
          detail: {
            platform: this.dragPlatform,
            clientX: e.clientX,
            clientY: e.clientY,
          },
        }),
      );
    }

    this.dragPlatform = null;
  }

  private handleBlur(): void {
    if (this.isDragging && this.ghost) {
      this.ghost.remove();
      this.ghost = null;
      this.isDragging = false;
      this.dragPlatform = null;
    }
  }
}
