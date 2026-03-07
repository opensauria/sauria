import { PLATFORM_ICONS } from '../constants.js';
import { escapeHtml, capitalize } from '../helpers.js';

export interface DragHost {
  getBoundingClientRect(): DOMRect;
  dispatchEvent(event: Event): boolean;
}

export class CoverflowDragHandler {
  private isDragging = false;
  private dragPlatform: string | null = null;
  private ghost: HTMLDivElement | null = null;
  private readonly boundMouseMove: (e: MouseEvent) => void;
  private readonly boundMouseUp: (e: MouseEvent) => void;
  private readonly boundBlur: () => void;

  constructor(private readonly host: DragHost) {
    this.boundMouseMove = this.handleDocMouseMove.bind(this);
    this.boundMouseUp = this.handleDocMouseUp.bind(this);
    this.boundBlur = this.handleBlur.bind(this);
  }

  attach(): void {
    document.addEventListener('mousemove', this.boundMouseMove);
    document.addEventListener('mouseup', this.boundMouseUp);
    window.addEventListener('blur', this.boundBlur);
  }

  detach(): void {
    document.removeEventListener('mousemove', this.boundMouseMove);
    document.removeEventListener('mouseup', this.boundMouseUp);
    window.removeEventListener('blur', this.boundBlur);
  }

  handleTrackMouseDown(e: MouseEvent): void {
    const card = (e.target as HTMLElement).closest('.coverflow-card') as HTMLElement | null;
    if (!card || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    this.dragPlatform = card.dataset.platform!;
    this.isDragging = true;

    this.ghost = document.createElement('div');
    this.ghost.className = 'coverflow-ghost';
    this.ghost.innerHTML =
      '<div class="cf-icon">' +
      (PLATFORM_ICONS[this.dragPlatform] ?? '') +
      '</div>' +
      '<div class="cf-name">' +
      escapeHtml(capitalize(this.dragPlatform)) +
      '</div>';
    this.ghost.style.left = e.clientX - 48 + 'px';
    this.ghost.style.top = e.clientY - 64 + 'px';
    document.body.appendChild(this.ghost);
  }

  private handleDocMouseMove(e: MouseEvent): void {
    if (!this.isDragging || !this.ghost) return;
    this.ghost.style.left = e.clientX - 48 + 'px';
    this.ghost.style.top = e.clientY - 64 + 'px';

    const dockRect = this.host.getBoundingClientRect();
    if (e.clientY < dockRect.top) {
      this.ghost.classList.add('above-dock');
    } else {
      this.ghost.classList.remove('above-dock');
    }
  }

  private handleDocMouseUp(e: MouseEvent): void {
    if (!this.isDragging) return;
    this.isDragging = false;

    const dockRect = this.host.getBoundingClientRect();
    const isDroppedAboveDock = e.clientY < dockRect.top;

    if (this.ghost) {
      this.ghost.remove();
      this.ghost = null;
    }

    if (isDroppedAboveDock && this.dragPlatform) {
      this.host.dispatchEvent(
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
    if (!this.isDragging || !this.ghost) return;
    this.ghost.remove();
    this.ghost = null;
    this.isDragging = false;
    this.dragPlatform = null;
  }
}
