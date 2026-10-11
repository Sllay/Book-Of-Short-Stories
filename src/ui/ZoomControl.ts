const STORAGE_KEY = 'book-of-short-stories:zoom';
const DEFAULT_ZOOM = 0.55;
const STEP = 0.05;

type ZoomListener = (value: number) => void;

export class ZoomControl {
  private readonly root: HTMLDivElement;
  private readonly thumb: HTMLDivElement;
  private readonly listener: ZoomListener;
  private activePointerId: number | null = null;
  private value = DEFAULT_ZOOM;

  public constructor(parent: HTMLElement, listener: ZoomListener) {
    this.listener = listener;
    this.value = this.readStoredValue();

    this.root = document.createElement('div');
    this.root.className = 'zoom-control';
    this.root.setAttribute('aria-label', 'Zoom do livro');

    const rail = document.createElement('div');
    rail.className = 'zoom-rail';

    this.thumb = document.createElement('div');
    this.thumb.className = 'zoom-thumb';
    this.thumb.textContent = '🔎';
    this.thumb.tabIndex = 0;
    this.thumb.setAttribute('role', 'slider');
    this.thumb.setAttribute('aria-label', 'Aproximar ou afastar o livro');
    this.thumb.setAttribute('aria-valuemin', '0');
    this.thumb.setAttribute('aria-valuemax', '100');

    this.root.append(rail, this.thumb);
    parent.append(this.root);

    this.root.addEventListener('pointerdown', this.handlePointerDown, { passive: false });
    this.root.addEventListener('pointermove', this.handlePointerMove, { passive: false });
    this.root.addEventListener('pointerup', this.handlePointerUp, { passive: false });
    this.root.addEventListener('pointercancel', this.handlePointerUp, { passive: false });
    this.thumb.addEventListener('keydown', this.handleKeyDown);

    this.apply(false);
  }

  public destroy(): void {
    this.root.removeEventListener('pointerdown', this.handlePointerDown);
    this.root.removeEventListener('pointermove', this.handlePointerMove);
    this.root.removeEventListener('pointerup', this.handlePointerUp);
    this.root.removeEventListener('pointercancel', this.handlePointerUp);
    this.thumb.removeEventListener('keydown', this.handleKeyDown);
    this.root.remove();
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    event.preventDefault();
    event.stopPropagation();

    if (this.activePointerId !== null) return;
    this.activePointerId = event.pointerId;
    this.root.setPointerCapture(event.pointerId);
    this.updateFromPointer(event.clientY);
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointerId) return;
    event.preventDefault();
    this.updateFromPointer(event.clientY);
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointerId) return;
    event.preventDefault();
    this.updateFromPointer(event.clientY);

    if (this.root.hasPointerCapture(event.pointerId)) this.root.releasePointerCapture(event.pointerId);
    this.activePointerId = null;
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight' || event.key === '+') {
      event.preventDefault();
      this.setValue(this.value + STEP);
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === '-') {
      event.preventDefault();
      this.setValue(this.value - STEP);
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      this.setValue(0);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      this.setValue(1);
    }
  };

  private updateFromPointer(clientY: number): void {
    const rect = this.root.getBoundingClientRect();
    const relative = (clientY - rect.top) / Math.max(1, rect.height);
    this.setValue(1 - relative);
  }

  private setValue(value: number): void {
    this.value = Math.min(1, Math.max(0, value));
    this.apply(true);
  }

  private apply(store: boolean): void {
    const topPercent = (1 - this.value) * 100;
    this.thumb.style.top = `${topPercent}%`;
    this.thumb.setAttribute('aria-valuenow', String(Math.round(this.value * 100)));

    if (store) {
      try { localStorage.setItem(STORAGE_KEY, String(this.value)); } catch { /* Storage is optional. */ }
    }

    this.listener(this.value);
  }

  private readStoredValue(): number {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) return DEFAULT_ZOOM;
      const parsed = Number.parseFloat(raw);
      return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : DEFAULT_ZOOM;
    } catch {
      return DEFAULT_ZOOM;
    }
  }
}
