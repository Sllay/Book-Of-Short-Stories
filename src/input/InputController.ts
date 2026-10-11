import type { PointerSnapshot } from '../core/types';
type PointerListener = (snapshot: PointerSnapshot) => void;

export class InputController {
  private readonly listeners = new Set<PointerListener>();
  private activePointerId: number | null = null;

  public constructor(private readonly target: HTMLElement) {
    target.addEventListener('pointerdown', this.onPointerDown, { passive: false });
    target.addEventListener('pointermove', this.onPointerMove, { passive: false });
    target.addEventListener('pointerup', this.onPointerUp, { passive: false });
    target.addEventListener('pointercancel', this.onPointerUp, { passive: false });
    target.addEventListener('contextmenu', this.preventContextMenu);
  }

  public subscribe(listener: PointerListener): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  public destroy(): void {
    this.target.removeEventListener('pointerdown', this.onPointerDown);
    this.target.removeEventListener('pointermove', this.onPointerMove);
    this.target.removeEventListener('pointerup', this.onPointerUp);
    this.target.removeEventListener('pointercancel', this.onPointerUp);
    this.target.removeEventListener('contextmenu', this.preventContextMenu);
    this.listeners.clear();
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    event.preventDefault();
    if (this.activePointerId !== null) return;
    this.activePointerId = event.pointerId;
    this.target.setPointerCapture(event.pointerId);
    this.emit(event, true);
  };
  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointerId) return;
    event.preventDefault();
    this.emit(event, true);
  };
  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointerId) return;
    event.preventDefault();
    this.emit(event, false);
    if (this.target.hasPointerCapture(event.pointerId)) this.target.releasePointerCapture(event.pointerId);
    this.activePointerId = null;
  };

  private emit(event: PointerEvent, isDown: boolean): void {
    const rect = this.target.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const snapshot: PointerSnapshot = {
      id: event.pointerId, x, y,
      normalizedX: (x / width) * 2 - 1,
      normalizedY: 1 - (y / height) * 2,
      isDown, pressure: event.pressure, timestamp: event.timeStamp
    };
    for (const listener of this.listeners) listener(snapshot);
  }
  private readonly preventContextMenu = (event: MouseEvent): void => { event.preventDefault(); };
}
