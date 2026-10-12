import type { PointerSnapshot } from '../core/types';
type PointerListener = (snapshot: PointerSnapshot) => void;

export class InputController {
  private readonly listeners = new Set<PointerListener>();
  private activePointerId: number | null = null;

  public constructor(private readonly target: HTMLElement) {
    target.addEventListener('pointerdown', this.onPointerDown, { passive: false });
    target.addEventListener('pointermove', this.onPointerMove, { passive: false });
    target.addEventListener('pointerup', this.onPointerUp, { passive: false });
    target.addEventListener('pointercancel', this.onPointerCancel, { passive: false });
    target.addEventListener('lostpointercapture', this.onLostPointerCapture);
    target.addEventListener('contextmenu', this.preventContextMenu);
  }

  public subscribe(listener: PointerListener): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  public destroy(): void {
    this.target.removeEventListener('pointerdown', this.onPointerDown);
    this.target.removeEventListener('pointermove', this.onPointerMove);
    this.target.removeEventListener('pointerup', this.onPointerUp);
    this.target.removeEventListener('pointercancel', this.onPointerCancel);
    this.target.removeEventListener('lostpointercapture', this.onLostPointerCapture);
    this.target.removeEventListener('contextmenu', this.preventContextMenu);
    this.listeners.clear();
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    event.preventDefault();
    if (this.activePointerId !== null) return;
    this.activePointerId = event.pointerId;
    this.target.setPointerCapture(event.pointerId);
    this.emit(event, true, false);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointerId) return;
    event.preventDefault();
    this.emit(event, true, false);
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointerId) return;
    event.preventDefault();
    this.emit(event, false, false);
    this.releasePointer(event.pointerId);
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointerId) return;
    event.preventDefault();
    this.emit(event, false, true);
    this.releasePointer(event.pointerId);
  };

  private readonly onLostPointerCapture = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointerId) return;
    this.activePointerId = null;
    this.emit(event, false, true);
  };

  private releasePointer(pointerId: number): void {
    const hadCapture = this.target.hasPointerCapture(pointerId);
    this.activePointerId = null;
    if (hadCapture) this.target.releasePointerCapture(pointerId);
  }

  private emit(event: PointerEvent, isDown: boolean, cancelled: boolean): void {
    const rect = this.target.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const snapshot: PointerSnapshot = {
      id: event.pointerId,
      x,
      y,
      normalizedX: (x / width) * 2 - 1,
      normalizedY: 1 - (y / height) * 2,
      isDown,
      cancelled,
      pressure: event.pressure,
      timestamp: event.timeStamp
    };
    for (const listener of this.listeners) listener(snapshot);
  }

  private readonly preventContextMenu = (event: MouseEvent): void => { event.preventDefault(); };
}
