import { AudioEngine } from '../audio/AudioEngine';
import { createSampleBookDocument } from '../document/SampleBook';
import { importTxt } from '../import/TxtImporter';
import { InputController } from '../input/InputController';
import { SelectionGuard } from '../input/SelectionGuard';
import type { PageTheme, TypographySettings } from '../pagination/types';
import { FrameMetrics } from '../performance/FrameMetrics';
import { PerformanceGovernor } from '../performance/PerformanceGovernor';
import { createPdfBookId } from '../pdf/PdfDocumentLoader';
import type { PdfViewMode } from '../pdf/PdfTypes';
import { ReadingSession, type ReadingProgressSnapshot } from '../reader/ReadingSession';
import { ReaderRenderer } from '../render/ReaderRenderer';
import { RenderScheduler } from '../runtime/RenderScheduler';
import { LocalBookStore } from '../storage/LocalBookStore';
import { detectBookSourceType, sourceTypeLabel } from '../storage/SourceTypes';
import { DebugHud } from '../ui/DebugHud';
import { ReaderControls } from '../ui/ReaderControls';
import { ZoomControl } from '../ui/ZoomControl';
import type { PointerSnapshot } from './types';

interface ScreenWakeLockSentinel {
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
}

interface ScreenWakeLockManager {
  request(type: 'screen'): Promise<ScreenWakeLockSentinel>;
}

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
  private readonly storage = new LocalBookStore();
  private readonly audio = new AudioEngine();
  private readonly resizeObserver: ResizeObserver;
  private readonly reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  private lastPointerX = 0;
  private lastPointerY = 0;
  private pointerIsDown = false;
  private focusModeEnabled = false;
  private wakeLock: ScreenWakeLockSentinel | null = null;
  private wakeLockRequestPending = false;
  private started = false;
  private persistedBookId: string | null = null;
  private progressSaveTimer: number | null = null;
  private bookmarkRefreshToken = 0;

  public constructor(private readonly root: HTMLElement) {
    this.shell = document.createElement('div');
    this.shell.className = 'reader-shell';

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'reader-canvas';
    this.canvas.setAttribute('aria-label', 'Área de leitura física virtual');
    this.canvas.tabIndex = 0;

    const label = document.createElement('div');
    label.className = 'foundation-label';
    label.textContent = 'V2.1.3 • PDF Original + Reader';

    const hint = document.createElement('div');
    hint.className = 'interaction-hint';
    hint.textContent = 'Seu livro, progresso e bookmarks ficam neste dispositivo';

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
      if (this.scheduler.currentMode === 'interactive') {
        this.governor.reportAverageFrameTime(stats.averageFrameTimeMs, now);
      }
      this.updateDebug(stats);

      if (!stillInteracting && !this.pointerIsDown && this.scheduler.currentMode === 'interactive') {
        this.shell.classList.remove('is-interacting');
        this.governor.endCriticalInteraction();
        this.scheduler.setMode(this.idleRenderMode());
        this.metrics.reset();
      }
    });
    this.session.setVisualInvalidationListener(() => this.scheduler.invalidate());

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
      onTypography: this.handleTypography,
      onPageTheme: this.handlePageTheme,
      onPdfMode: this.handlePdfMode,
      onToggleBookmark: this.handleToggleBookmark,
      onFocusMode: this.handleFocusMode,
      onAudioEnabled: this.handleAudioEnabled
    });

    this.session.setStateListener((state) => {
      this.controls.setState(state);
      if (!state.busy) {
        this.controls.setPageTheme(this.session.typography.pageTheme);
        void this.refreshBookmark();
      }
    });
    this.session.setProgressListener(this.handleProgress);

    this.renderer.setTurnMotionListener((motion) => this.audio.updatePageDrag(motion));
    this.renderer.setTurnCompleteListener((direction) => this.audio.playPageSettle(direction));
    this.renderer.setReducedMotion(this.reducedMotionQuery.matches);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.shell);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    window.addEventListener('orientationchange', this.handleViewportChange);
    window.addEventListener('resize', this.handleViewportChange);
    window.addEventListener('error', this.handleWindowError);
    window.addEventListener('unhandledrejection', this.handleUnhandledRejection);
    this.reducedMotionQuery.addEventListener('change', this.handleReducedMotionChange);
  }

  public start(): void {
    if (this.started) return;
    this.started = true;
    this.resize();
    this.scheduler.setMode(document.hidden ? 'hidden' : this.idleRenderMode());
    this.scheduler.invalidate();
    void this.bootstrap();
  }

  public destroy(): void {
    if (this.progressSaveTimer !== null) window.clearTimeout(this.progressSaveTimer);
    void this.persistCurrentProgress();
    void this.releaseWakeLock();
    this.scheduler.stop();
    this.resizeObserver.disconnect();
    this.input.destroy();
    this.selectionGuard.destroy();
    this.zoomControl.destroy();
    this.controls.destroy();
    this.session.dispose();
    this.renderer.setTurnMotionListener(null);
    this.renderer.setTurnCompleteListener(null);
    this.renderer.dispose();
    this.audio.dispose();
    this.debugHud.destroy();
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.removeEventListener('orientationchange', this.handleViewportChange);
    window.removeEventListener('resize', this.handleViewportChange);
    window.removeEventListener('error', this.handleWindowError);
    window.removeEventListener('unhandledrejection', this.handleUnhandledRejection);
    this.reducedMotionQuery.removeEventListener('change', this.handleReducedMotionChange);
    this.shell.remove();
  }

  private async bootstrap(): Promise<void> {
    try {
      const focusMode = await this.storage.getPreference<boolean>('focusMode') ?? false;
      const audioEnabled = await this.storage.getPreference<boolean>('audioEnabled') ?? true;
      this.applyFocusMode(focusMode);
      this.applyAudioEnabled(audioEnabled);

      const recent = await this.storage.getRecentBookSource();
      if (recent?.book.sourceType === 'txt') {
        this.persistedBookId = recent.book.id;
        const progress = await this.storage.getProgress(recent.book.id);
        const sourceText = await recent.source.text();
        await this.session.openTxtSource(recent.book.sourceName, sourceText, {
          anchor: progress?.anchor,
          typography: progress?.typography
        });
        this.controls.showMessage(`${recent.book.title} • restaurado do dispositivo`);
      } else if (recent?.book.sourceType === 'pdf') {
        this.persistedBookId = recent.book.id;
        const progress = await this.storage.getProgress(recent.book.id);
        const bytes = new Uint8Array(await recent.source.arrayBuffer());
        const publication = await this.session.openPdfSource(recent.book.sourceName, bytes, {
          anchor: progress?.anchor,
          typography: progress?.typography,
          pdfMode: progress?.pdfMode ?? 'reader'
        }, recent.book.id);
        this.controls.showMessage(`${recent.book.title} • ${publication.mode === 'reader' ? 'Reader Mode' : 'PDF Original'} restaurado`);
      } else {
        if (recent) {
          this.controls.showMessage(`${sourceTypeLabel(recent.book.sourceType)} salvo localmente • suporte entra em uma próxima versão`);
        }
        await this.loadSampleBook();
      }
    } catch (error: unknown) {
      this.persistedBookId = null;
      await this.storage.clearRecentBook().catch(() => undefined);
      this.controls.showError(error instanceof Error ? error.message : 'Não foi possível restaurar a última sessão.');
      await this.loadSampleBook();
    } finally {
      this.scheduler.invalidate();
    }
  }

  private async loadSampleBook(): Promise<void> {
    this.persistedBookId = null;
    this.controls.setBookmarked(false);
    await this.session.loadDocument(createSampleBookDocument());
  }

  private readonly handleImport = async (file: File): Promise<void> => {
    const sourceType = detectBookSourceType(file.name, file.type);

    if (sourceType === 'txt') {
      const sourceText = await file.text();
      const documentModel = importTxt(file.name, sourceText);
      const previousProgress = await this.storage.getProgress(documentModel.id);

      await this.session.loadDocument(documentModel, previousProgress?.anchor ?? null, previousProgress?.typography ?? null);
      await this.storage.saveBookSource({
        id: documentModel.id,
        title: documentModel.metadata.title,
        sourceName: file.name,
        sourceType,
        mimeType: file.type || 'text/plain'
      }, file);
      this.persistedBookId = documentModel.id;
    } else if (sourceType === 'pdf') {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const bookId = await createPdfBookId(bytes);
      const previousProgress = await this.storage.getProgress(bookId);
      const publication = await this.session.openPdfSource(file.name, bytes, {
        anchor: previousProgress?.anchor,
        typography: previousProgress?.typography,
        pdfMode: previousProgress?.pdfMode ?? 'reader'
      }, bookId);

      await this.storage.saveBookSource({
        id: publication.id,
        title: publication.title,
        sourceName: file.name,
        sourceType,
        mimeType: file.type || 'application/pdf'
      }, file);
      this.persistedBookId = publication.id;
      this.controls.showMessage(
        publication.mode === 'reader'
          ? `${publication.title} • Reader Mode • ${publication.pageCount} páginas`
          : `${publication.title} • PDF Original • ${publication.pageCount} páginas`
      );
    } else if (sourceType === 'epub') {
      throw new Error('EPUB foi reconhecido, mas entra depois do PDF na V2.x.');
    } else {
      throw new Error('Formato ainda não suportado. Use TXT ou PDF.');
    }

    await this.persistCurrentProgress();
    await this.refreshBookmark();
    this.metrics.reset();
    this.scheduler.resetTiming();
    this.scheduler.invalidate();
  };

  private readonly handleTypography = async (patch: Partial<TypographySettings>): Promise<void> => {
    await this.session.updateTypography(patch);
    await this.persistCurrentProgress();
    this.metrics.reset();
    this.scheduler.resetTiming();
    this.scheduler.invalidate();
  };

  private readonly handlePageTheme = async (theme: PageTheme): Promise<void> => {
    await this.handleTypography({ pageTheme: theme });
  };

  private readonly handlePdfMode = async (mode: PdfViewMode): Promise<PdfViewMode> => {
    const actualMode = await this.session.setPdfMode(mode);
    await this.persistCurrentProgress();
    await this.refreshBookmark();
    this.metrics.reset();
    this.scheduler.resetTiming();
    this.scheduler.invalidate();
    return actualMode;
  };

  private readonly handleToggleBookmark = async (): Promise<boolean> => {
    const snapshot = this.session.snapshotProgress();
    if (!snapshot || snapshot.bookId !== this.persistedBookId) {
      throw new Error('Importe um TXT ou PDF para salvar bookmarks deste livro.');
    }
    return this.storage.toggleBookmark(snapshot.bookId, snapshot.anchor);
  };

  private readonly handleFocusMode = async (enabled: boolean): Promise<void> => {
    this.applyFocusMode(enabled);
    await this.storage.setPreference('focusMode', enabled);
  };

  private readonly handleAudioEnabled = async (enabled: boolean): Promise<void> => {
    this.applyAudioEnabled(enabled);
    await this.storage.setPreference('audioEnabled', enabled);
  };

  private applyFocusMode(enabled: boolean): void {
    this.focusModeEnabled = enabled;
    this.shell.classList.toggle('focus-mode', enabled);
    this.renderer.setFocusMode(enabled);
    this.controls.setFocusMode(enabled);

    if (enabled) void this.acquireWakeLock();
    else void this.releaseWakeLock();

    if (!document.hidden && !this.pointerIsDown && this.scheduler.currentMode !== 'interactive') {
      this.scheduler.setMode(this.idleRenderMode());
    }
    this.scheduler.invalidate();
  }

  private async acquireWakeLock(): Promise<void> {
    if (!this.focusModeEnabled || document.hidden || this.wakeLock || this.wakeLockRequestPending) return;

    const manager = (navigator as Navigator & { wakeLock?: ScreenWakeLockManager }).wakeLock;
    if (!manager) return;

    this.wakeLockRequestPending = true;
    try {
      const sentinel = await manager.request('screen');
      if (!this.focusModeEnabled || document.hidden) {
        await sentinel.release().catch(() => undefined);
        return;
      }

      this.wakeLock = sentinel;
      sentinel.addEventListener('release', () => {
        if (this.wakeLock === sentinel) this.wakeLock = null;
      });
    } catch {
      // Wake Lock can be denied by battery saver/system policy. Focus mode still works.
    } finally {
      this.wakeLockRequestPending = false;
    }
  }

  private async releaseWakeLock(): Promise<void> {
    const sentinel = this.wakeLock;
    this.wakeLock = null;
    if (!sentinel) return;
    await sentinel.release().catch(() => undefined);
  }

  private applyAudioEnabled(enabled: boolean): void {
    this.audio.setEnabled(enabled);
    this.controls.setAudioEnabled(enabled);
  }

  private readonly handleProgress = (snapshot: ReadingProgressSnapshot): void => {
    if (snapshot.bookId !== this.persistedBookId) return;
    if (this.progressSaveTimer !== null) window.clearTimeout(this.progressSaveTimer);
    this.progressSaveTimer = window.setTimeout(() => {
      this.progressSaveTimer = null;
      void this.storage.saveProgress(snapshot).catch(() => undefined);
    }, 180);
    void this.refreshBookmark();
  };

  private async persistCurrentProgress(): Promise<void> {
    const snapshot = this.session.snapshotProgress();
    if (!snapshot || snapshot.bookId !== this.persistedBookId) return;
    await this.storage.saveProgress(snapshot);
  }

  private async refreshBookmark(): Promise<void> {
    const token = ++this.bookmarkRefreshToken;
    const snapshot = this.session.snapshotProgress();
    if (!snapshot || snapshot.bookId !== this.persistedBookId) {
      if (token === this.bookmarkRefreshToken) this.controls.setBookmarked(false);
      return;
    }

    const bookmarked = await this.storage.isBookmarked(snapshot.bookId, snapshot.anchor);
    if (token === this.bookmarkRefreshToken) this.controls.setBookmarked(bookmarked);
  }

  private readonly handlePointer = (pointer: PointerSnapshot): void => {
    this.lastPointerX = pointer.normalizedX;
    this.lastPointerY = pointer.normalizedY;
    this.pointerIsDown = pointer.isDown;
    if (pointer.isDown) {
      this.audio.unlockFromGesture();
      if (this.focusModeEnabled && !this.wakeLock) void this.acquireWakeLock();
    }

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
      this.scheduler.setMode(this.idleRenderMode());
      this.metrics.reset();
    }

    this.scheduler.invalidate();
  };

  private readonly handleVisibilityChange = (): void => {
    if (document.hidden) {
      void this.releaseWakeLock();
      this.pointerIsDown = false;
      this.renderer.cancelInteraction();
      this.shell.classList.remove('is-interacting');
      this.governor.endCriticalInteraction();
      this.scheduler.setMode('hidden');
      this.scheduler.resetTiming();
      this.metrics.reset();
      this.audio.setHidden(true);
      if (this.progressSaveTimer !== null) {
        window.clearTimeout(this.progressSaveTimer);
        this.progressSaveTimer = null;
      }
      void this.persistCurrentProgress();
      return;
    }

    this.audio.setHidden(false);
    if (this.focusModeEnabled) void this.acquireWakeLock();
    this.governor.resetAfterViewportChange();
    this.scheduler.resetTiming();
    this.scheduler.setMode(this.idleRenderMode());
    this.scheduler.invalidate();
  };

  private readonly handleViewportChange = (): void => {
    requestAnimationFrame(this.resize);
  };

  private readonly handleReducedMotionChange = (event: MediaQueryListEvent): void => {
    this.renderer.setReducedMotion(event.matches);
    if (!document.hidden && !this.pointerIsDown && this.scheduler.currentMode !== 'interactive') {
      this.scheduler.resetTiming();
      this.scheduler.setMode(this.idleRenderMode());
      this.scheduler.invalidate();
    }
  };

  private readonly handleWindowError = (): void => {
    this.controls.showError('O leitor encontrou um erro visual. Sua sessão local foi preservada.');
  };

  private readonly handleUnhandledRejection = (): void => {
    this.controls.showError('Uma operação falhou, mas o leitor continua disponível.');
  };

  private readonly resize = (): void => {
    const rect = this.shell.getBoundingClientRect();
    this.metrics.reset();
    this.scheduler.resetTiming();
    this.governor.resetAfterViewportChange();
    this.renderer.resize(rect.width, rect.height);
    this.scheduler.invalidate();
  };

  private idleRenderMode(): 'static' | 'ambient' {
    return this.focusModeEnabled || this.reducedMotionQuery.matches ? 'static' : 'ambient';
  }

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
