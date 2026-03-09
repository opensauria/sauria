import { colors } from '@sauria/design-tokens';
import { TYPE_COLOR_STRINGS as TYPE_COLORS } from './scene-types.js';
import { brainListEntities } from './ipc.js';
import { escHtml, truncate, formatTs } from './brain-helpers.js';
import { t } from '../i18n.js';

const LIB_SCROLL_THRESHOLD = 50;

export class BrainLibraryController {
  private entities: Array<Record<string, unknown>> = [];
  private filtered: Array<Record<string, unknown>> = [];
  private activeIndex = 0;
  private currentIndex = 0;
  private velocity = 0;
  private animating = false;
  private dirty = true;
  private scrollAccum = 0;
  private scrollTimer: ReturnType<typeof setTimeout> | null = null;
  private searchTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly container: HTMLDivElement,
    private readonly track: HTMLDivElement,
    private readonly emptyEl: HTMLDivElement,
    private readonly searchInput: HTMLInputElement,
    private readonly onEntitySelect: (id: string) => void,
  ) {
    this.bindEvents();
  }

  markDirty(): void {
    this.dirty = true;
  }

  async load(): Promise<void> {
    if (!this.dirty && this.entities.length > 0) {
      this.applyFilter();
      return;
    }

    try {
      const result = await brainListEntities({ limit: 200 });
      this.entities = result.rows;
      this.dirty = false;
      this.applyFilter();
    } catch {
      this.entities = [];
      this.filtered = [];
      this.renderCards();
    }
  }

  handleKeyDown(e: KeyboardEvent): void {
    if (document.activeElement === this.searchInput) return;

    if (e.key === 'ArrowLeft' && this.activeIndex > 0) {
      e.preventDefault();
      this.activeIndex--;
      this.startAnimation();
    } else if (e.key === 'ArrowRight' && this.activeIndex < this.filtered.length - 1) {
      e.preventDefault();
      this.activeIndex++;
      this.startAnimation();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const entity = this.filtered[this.activeIndex];
      if (entity) this.onEntitySelect(entity.id as string);
    }
  }

  private applyFilter(): void {
    const search = this.searchInput.value.trim().toLowerCase();
    this.filtered = search
      ? this.entities.filter(
          (e) =>
            (e.name && (e.name as string).toLowerCase().includes(search)) ||
            (e.type && (e.type as string).toLowerCase().includes(search)) ||
            (e.summary && (e.summary as string).toLowerCase().includes(search)),
        )
      : this.entities.slice();

    this.activeIndex =
      this.filtered.length === 0 ? 0 : Math.min(this.activeIndex, this.filtered.length - 1);
    this.currentIndex = this.activeIndex;
    this.velocity = 0;
    this.renderCards();
  }

  private renderCards(): void {
    this.track.innerHTML = '';
    if (this.filtered.length === 0) {
      this.emptyEl.style.display = 'flex';
      return;
    }
    this.emptyEl.style.display = 'none';

    for (let i = 0; i < this.filtered.length; i++) {
      const entity = this.filtered[i];
      const card = document.createElement('div');
      card.className = 'brain-library-card';
      card.dataset['index'] = String(i);
      card.dataset['entityId'] = entity.id as string;

      const color = TYPE_COLORS[entity.type as string] || colors.textDim;
      const initial = ((entity.name as string) || '?').charAt(0).toUpperCase();
      const score =
        typeof entity.importance_score === 'number'
          ? Math.round(entity.importance_score * 100) + '%'
          : '';

      card.innerHTML =
        '<div class="brain-library-card-dot" style="background:' +
        color +
        '22;color:' +
        color +
        '">' +
        escHtml(initial) +
        '</div>' +
        '<div class="brain-library-card-name">' +
        escHtml((entity.name as string) || (entity.id as string)) +
        '</div>' +
        '<span class="brain-library-card-type type-badge type-' +
        escHtml(entity.type) +
        '">' +
        escHtml(entity.type) +
        '</span>' +
        '<div class="brain-library-card-summary">' +
        escHtml(truncate((entity.summary as string) || '', 120)) +
        '</div>' +
        '<div class="brain-library-card-meta">' +
        (score ? score + ' ' + t('brain.importance') : '') +
        (entity.last_updated_at ? ' \u00b7 ' + formatTs(entity.last_updated_at as string) : '') +
        '</div>';

      this.track.appendChild(card);
    }
    this.updateTransforms();
  }

  private updateTransforms(): void {
    const cards = this.track.querySelectorAll('.brain-library-card');
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i] as HTMLDivElement;
      const offset = i - this.currentIndex;
      const absOffset = Math.abs(offset);
      const sign = offset > 0 ? 1 : -1;
      const translateX = offset * 220;
      const translateZ = 80 - absOffset * 160;
      const rotateY = absOffset < 0.01 ? 0 : -sign * Math.min(absOffset, 1.2) * 45;
      const scale = Math.max(0.82, 1.06 - absOffset * 0.14);
      const opacity = Math.max(0, 1 - absOffset * 0.28);
      const zIndex = Math.max(0, 10 - Math.round(absOffset));

      card.style.transform = `translateX(${translateX}px) translateZ(${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`;
      card.style.opacity = String(opacity);
      card.style.zIndex = String(zIndex);
      card.style.pointerEvents = absOffset > 3 ? 'none' : 'auto';
    }
  }

  private springTick = (): void => {
    const stiffness = 0.06;
    const damping = 0.78;
    const force = (this.activeIndex - this.currentIndex) * stiffness;
    this.velocity = (this.velocity + force) * damping;
    this.currentIndex += this.velocity;

    if (Math.abs(this.currentIndex - this.activeIndex) < 0.002 && Math.abs(this.velocity) < 0.002) {
      this.currentIndex = this.activeIndex;
      this.velocity = 0;
      this.animating = false;
      this.updateTransforms();
      return;
    }

    this.updateTransforms();
    requestAnimationFrame(this.springTick);
  };

  private startAnimation(): void {
    if (!this.animating) {
      this.animating = true;
      requestAnimationFrame(this.springTick);
    }
  }

  private bindEvents(): void {
    this.container.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        this.scrollAccum += delta;

        if (this.scrollTimer) clearTimeout(this.scrollTimer);
        this.scrollTimer = setTimeout(() => {
          this.scrollAccum = 0;
        }, 150);

        if (Math.abs(this.scrollAccum) >= LIB_SCROLL_THRESHOLD) {
          const steps = Math.round(this.scrollAccum / LIB_SCROLL_THRESHOLD);
          this.activeIndex = Math.max(
            0,
            Math.min(this.filtered.length - 1, this.activeIndex + steps),
          );
          this.scrollAccum = this.scrollAccum % LIB_SCROLL_THRESHOLD;
          this.startAnimation();
        }
      },
      { passive: false },
    );

    this.track.addEventListener('click', (e) => {
      const card = (e.target as HTMLElement).closest(
        '.brain-library-card',
      ) as HTMLDivElement | null;
      if (!card) return;
      const idx = parseInt(card.dataset['index']!, 10);
      if (idx !== this.activeIndex) {
        this.activeIndex = idx;
        this.startAnimation();
      } else {
        const entityId = card.dataset['entityId'];
        if (entityId) this.onEntitySelect(entityId);
      }
    });

    this.searchInput.addEventListener('input', () => {
      if (this.searchTimeout) clearTimeout(this.searchTimeout);
      this.searchTimeout = setTimeout(() => this.applyFilter(), 200);
    });

    this.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.searchInput.value = '';
        this.searchInput.blur();
        this.applyFilter();
        e.stopPropagation();
      }
    });
  }
}
