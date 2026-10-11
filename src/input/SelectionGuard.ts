const SELECTABLE_TEXT_SELECTOR = '[data-reader-selectable="true"]';

export class SelectionGuard {
  public constructor(private readonly root: HTMLElement) {
    root.addEventListener('selectstart', this.handleSelectStart);
    root.addEventListener('dragstart', this.handleDragStart);
    root.addEventListener('contextmenu', this.handleContextMenu);
  }

  public destroy(): void {
    this.root.removeEventListener('selectstart', this.handleSelectStart);
    this.root.removeEventListener('dragstart', this.handleDragStart);
    this.root.removeEventListener('contextmenu', this.handleContextMenu);
  }

  private readonly handleSelectStart = (event: Event): void => {
    if (!this.canUseNativeTextInteraction(event.target)) event.preventDefault();
  };

  private readonly handleDragStart = (event: DragEvent): void => {
    // Native dragging of DOM/images conflicts with page gestures. Text selection itself
    // remains available on explicitly selectable, stationary page text.
    event.preventDefault();
  };

  private readonly handleContextMenu = (event: MouseEvent): void => {
    if (!this.canUseNativeTextInteraction(event.target)) event.preventDefault();
  };

  private canUseNativeTextInteraction(target: EventTarget | null): boolean {
    if (this.root.classList.contains('is-interacting')) return false;
    if (!(target instanceof Element)) return false;
    return target.closest(SELECTABLE_TEXT_SELECTOR) !== null;
  }
}
