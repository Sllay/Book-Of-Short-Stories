import { createSampleBookDocument } from '../document/SampleBook';
import { InputController } from '../input/InputController';
import { SelectionGuard } from '../input/SelectionGuard';
import type { TypographySettings } from '../pagination/types';
import { FrameMetrics } from '../performance/FrameMetrics';
import { PerformanceGovernor } from '../performance/PerformanceGovernor';
import { ReadingSession } from '../reader/ReadingSession';
import { ReaderRenderer } from '../render/ReaderRenderer';
import { RenderScheduler } from '../runtime/RenderScheduler';
import { DebugHud } from '../ui/DebugHud';
import { ReaderControls } from '../ui/ReaderControls';
import { ZoomControl } from '../ui/ZoomControl';
import type { PointerSnapshot } from './types';

export class App {
  private readonly shell: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: ReaderRenderer;
  private readonly input: InputController;
  private readonly selectionGuard: SelectionGuard;
  private readonly metrics = new FrameMetrics();
  private readonly governor = new PerformanceGovernor();
  private readonly scheduler: RenderScheduler;
  private readonly debugHud: DebugHud;
  private readonly zoomControl: ZoomControl;
  private readonly session: ReadingSession;
  private readonly controls: ReaderControls;
  private readonly resizeObserver: ResizeObserver;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private pointerIsDown = false;
  private started = false;

  public constructor(private readonly root: HTMLElement) {
    this.shell = document.createElement('div');
    this.shell.className = 'reader-shell';

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'reader-canvas';
    this.canvas.setAttribute('aria-label', 'Área de leitura física virtual');
    this.canvas.tabIndex = 0;

    const label = document.createElement('div');
    label.className = 'foundation-label';
    label.textContent = 'V1.3 • Text Pagination';

    const hint = document.createElement('div');
    hint.className = 'interaction-hint';
    hint.textContent = 'Arraste a folha • abra um TXT em 📖 TXT';

    this.shell.append(this.canvas, label, hint);
    this.root.append(this.shell);

    this.renderer = new ReaderRenderer(this.canvas, this.governor.current);
    this.input = new InputController(this.canvas);
    this.selectionGuard = new SelectionGuard(this.shell);
    this.debugHud = new DebugHud(this.shell);
    this.session = new ReadingSession(this.renderer);

    this.scheduler = new RenderScheduler(({ now, deltaMs }) => {
      const stillInteracting = this.renderer.update(deltaMs);
      this.renderer.render();

      const stats = this.metrics.record(deltaMs);
      this.governor.reportAverageFrameTime(stats.averageFrameTimeMs, now);
      this.updateDebug(stats);

      if (!stillInteracting && !this.pointerIsDown && this.scheduler.currentMode === 'interactive') {
        this.shell.classList.remove('is-interacting');
        this.governor.endCriticalInteraction();
        this.scheduler.setMode('static');
        this.metrics.reset();
      }
    });

    this.input.subscribe(this.handlePointer);

    this.governor.subscribe((profile) => {
      this.renderer.setQuality(profile);
      this.scheduler.setAmbientFps(profile.ambientFps);
      this.scheduler.invalidate();
    });

    this.zoomControl = new ZoomControl(this.shell, (value) => {
      this.renderer.setZoom(value);
      this.scheduler.invalidate();
    });

    this.controls = new ReaderControls(this.shell, this.session.typography, {
      onImport: this.handleImport,
      onTypography: this.handleTypography
    });
    this.session.setStateListener((state) => this.controls.setState(state));

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.shell);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    window.addEventListener('orientationchange', this.handleViewportChange);
    window.addEventListener('resize', this.handleViewportChange);
  }

  public start(): void {
    if (this.started) return;
    this.started = true;
    this.resize();
    this.scheduler.setMode(document.hidden ? 'hidden' : 'static');
    this.scheduler.invalidate();

    void this.session.loadDocument(createSampleBookDocument())
      .then(() => this.scheduler.invalidate())
      .catch((error: unknown) => {
        this.controls.showError(error instanceof Error ? error.message : 'Falha ao preparar o livro de demonstração.');
      });
  }

  public destroy(): void {
    this.scheduler.stop();
    this.resizeObserver.disconnect();
    this.input.destroy();
    this.selectionGuard.destroy();
    this.zoomControl.destroy();
    this.controls.destroy();
    this.session.dispose();
    this.renderer.dispose();
    this.debugHud.destroy();
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.removeEventListener('orientationchange', this.handleViewportChange);
    window.removeEventListener('resize', this.handleViewportChange);
    this.shell.remove();
  }

  private readonly handleImport = async (file: File): Promise<void> => {
    await this.session.importTxtFile(file);
    this.metrics.reset();
    this.scheduler.resetTiming();
    this.scheduler.invalidate();
  };

  private readonly handleTypography = async (patch: Partial<TypographySettings>): Promise<void> => {
    await this.session.updateTypography(patch);
    this.metrics.reset();
    this.scheduler.resetTiming();
    this.scheduler.invalidate();
  };

  private readonly handlePointer = (pointer: PointerSnapshot): void => {
    this.lastPointerX = pointer.normalizedX;
    this.lastPointerY = pointer.normalizedY;
    this.pointerIsDown = pointer.isDown;

    const wasInteractive = this.scheduler.currentMode === 'interactive';
    const active = this.renderer.updatePointer(pointer);
    this.shell.classList.toggle('is-interacting', active);

    if (active) {
      if (!wasInteractive) {
        this.metrics.reset();
        this.scheduler.resetTiming();
        this.governor.beginCriticalInteraction();
      }
      this.scheduler.setMode('interactive');
    } else if (!pointer.isDown) {
      this.governor.endCriticalInteraction();
      this.scheduler.setMode('static');
      this.metrics.reset();
    }

    this.scheduler.invalidate();
  };

  private readonly handleVisibilityChange = (): void => {
    if (document.hidden) {
      this.pointerIsDown = false;
      this.renderer.cancelInteraction();
      this.shell.classList.remove('is-interacting');
      this.governor.endCriticalInteraction();
      this.scheduler.setMode('hidden');
      this.scheduler.resetTiming();
      this.metrics.reset();
      return;
    }

    this.governor.resetAfterViewportChange();
    this.scheduler.resetTiming();
    this.scheduler.setMode('static');
    this.scheduler.invalidate();
  };

  private readonly handleViewportChange = (): void => {
    requestAnimationFrame(this.resize);
  };

  private readonly resize = (): void => {
    const rect = this.shell.getBoundingClientRect();
    this.metrics.reset();
    this.scheduler.resetTiming();
    this.governor.resetAfterViewportChange();
    this.renderer.resize(rect.width, rect.height);
    this.scheduler.invalidate();
  };

  private updateDebug(stats = this.metrics.snapshot()): void {
    this.debugHud.update({
      stats,
      quality: this.governor.current,
      mode: this.scheduler.currentMode,
      pointerX: this.lastPointerX,
      pointerY: this.lastPointerY
    });
  }
}
