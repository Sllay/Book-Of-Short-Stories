import type { PageTheme, TypographySettings } from '../pagination/types';
import type { PdfViewMode } from '../pdf/PdfTypes';
import type { ReadingSessionState } from '../reader/ReadingSession';

interface ReaderControlsCallbacks {
  readonly onImport: (file: File) => Promise<void>;
  readonly onTypography: (patch: Partial<TypographySettings>) => Promise<void>;
  readonly onPageTheme: (theme: PageTheme) => Promise<void> | void;
  readonly onPdfMode: (mode: PdfViewMode) => Promise<PdfViewMode>;
  readonly onToggleBookmark: () => Promise<boolean>;
  readonly onFocusMode: (enabled: boolean) => Promise<void> | void;
  readonly onAudioEnabled: (enabled: boolean) => Promise<void> | void;
}

export class ReaderControls {
  private readonly root = document.createElement('div');
  private readonly drawer = document.createElement('div');
  private readonly drawerToggle = document.createElement('button');
  private readonly importButton = document.createElement('button');
  private readonly pdfModeButton = document.createElement('button');
  private readonly typeButton = document.createElement('button');
  private readonly themeButton = document.createElement('button');
  private readonly bookmarkButton = document.createElement('button');
  private readonly focusButton = document.createElement('button');
  private readonly audioButton = document.createElement('button');
  private readonly fileInput = document.createElement('input');
  private readonly panel = document.createElement('div');
  private readonly status = document.createElement('div');
  private debounceTimer: number | null = null;
  private statusTimer: number | null = null;
  private focusEnabled = false;
  private audioEnabled = true;
  private pageTheme: PageTheme;
  private pdfMode: PdfViewMode | null = null;
  private drawerOpen = false;
  private fixedLayout = false;

  public constructor(
    host: HTMLElement,
    settings: TypographySettings,
    private readonly callbacks: ReaderControlsCallbacks
  ) {
    this.root.className = 'reader-controls';
    this.pageTheme = settings.pageTheme ?? 'light';

    this.importButton.type = 'button';
    this.importButton.className = 'reader-tool-button';
    this.importButton.textContent = '📖 TXT/PDF';
    this.importButton.title = 'Abrir livro TXT ou PDF';

    this.pdfModeButton.type = 'button';
    this.pdfModeButton.className = 'reader-tool-button';
    this.pdfModeButton.hidden = true;
    this.pdfModeButton.setAttribute('aria-label', 'Alternar modo do PDF');

    this.typeButton.type = 'button';
    this.typeButton.className = 'reader-tool-button';
    this.typeButton.textContent = 'Aa';
    this.typeButton.title = 'Tipografia';

    this.themeButton.type = 'button';
    this.themeButton.className = 'reader-tool-button';
    this.setPageTheme(this.pageTheme);

    this.bookmarkButton.type = 'button';
    this.bookmarkButton.className = 'reader-tool-button';
    this.bookmarkButton.textContent = '☆';
    this.bookmarkButton.title = 'Adicionar bookmark nesta página';

    this.focusButton.type = 'button';
    this.focusButton.className = 'reader-tool-button focus-button';
    this.focusButton.textContent = '◐';
    this.focusButton.title = 'Focus Mode';

    this.audioButton.type = 'button';
    this.audioButton.className = 'reader-tool-button';
    this.audioButton.textContent = '🔊';
    this.audioButton.title = 'Som de página';

    this.drawerToggle.type = 'button';
    this.drawerToggle.className = 'reader-drawer-toggle';
    this.drawerToggle.textContent = '›';
    this.drawerToggle.title = 'Abrir controles';
    this.drawerToggle.setAttribute('aria-label', 'Abrir controles do leitor');
    this.drawerToggle.setAttribute('aria-expanded', 'false');

    this.fileInput.type = 'file';
    this.fileInput.accept = '.txt,.pdf,text/plain,application/pdf';
    this.fileInput.hidden = true;

    const toolbar = document.createElement('div');
    toolbar.className = 'reader-toolbar';
    toolbar.append(
      this.importButton,
      this.pdfModeButton,
      this.typeButton,
      this.themeButton,
      this.bookmarkButton,
      this.focusButton,
      this.audioButton
    );

    this.drawer.className = 'reader-drawer';
    this.drawer.append(toolbar, this.drawerToggle);

    this.panel.className = 'typography-panel';
    this.panel.hidden = true;
    this.buildTypographyPanel(settings);

    this.status.className = 'reader-status';
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');

    this.root.append(this.drawer, this.panel, this.status, this.fileInput);
    host.append(this.root);

    this.importButton.addEventListener('click', this.openFilePicker);
    this.pdfModeButton.addEventListener('click', this.togglePdfMode);
    this.fileInput.addEventListener('change', this.handleFileSelected);
    this.typeButton.addEventListener('click', this.toggleTypographyPanel);
    this.themeButton.addEventListener('click', this.togglePageTheme);
    this.bookmarkButton.addEventListener('click', this.toggleBookmark);
    this.focusButton.addEventListener('click', this.toggleFocusMode);
    this.audioButton.addEventListener('click', this.toggleAudio);
    this.drawerToggle.addEventListener('click', this.toggleDrawer);

    this.setDrawerOpen(false);
  }

  public setState(state: ReadingSessionState): void {
    this.fixedLayout = state.fixedLayout;
    this.pdfMode = state.pdfMode;
    const pdfOpen = state.pdfMode !== null;
    const customizable = !pdfOpen || state.pdfMode === 'reader';

    this.importButton.disabled = state.busy;
    this.pdfModeButton.hidden = !pdfOpen;
    this.pdfModeButton.disabled = state.busy || !pdfOpen;
    this.typeButton.disabled = state.busy || !customizable;
    this.themeButton.disabled = state.busy || !customizable;
    this.bookmarkButton.disabled = state.busy;
    this.typeButton.title = customizable ? 'Tipografia' : 'Use Reader Mode para alterar a tipografia do PDF';
    this.updatePdfModeButton();
    this.setPageTheme(this.pageTheme);

    if (!customizable && !this.panel.hidden) {
      this.panel.hidden = true;
      this.typeButton.classList.remove('is-active');
    }

    if (state.busy) {
      this.showStatus(state.message, 'busy', 0);
    } else if (this.status.classList.contains('is-busy')) {
      this.hideStatus();
    }
  }

  public setBookmarked(bookmarked: boolean): void {
    this.bookmarkButton.textContent = bookmarked ? '🔖' : '☆';
    this.bookmarkButton.classList.toggle('is-active', bookmarked);
    this.bookmarkButton.title = bookmarked ? 'Remover bookmark desta página' : 'Adicionar bookmark nesta página';
  }

  public setFocusMode(enabled: boolean): void {
    this.focusEnabled = enabled;
    this.focusButton.classList.toggle('is-active', enabled);
    this.focusButton.textContent = enabled ? '●' : '◐';
  }

  public setAudioEnabled(enabled: boolean): void {
    this.audioEnabled = enabled;
    this.audioButton.classList.toggle('is-active', enabled);
    this.audioButton.textContent = enabled ? '🔊' : '🔇';
  }

  public setPageTheme(theme: PageTheme): void {
    this.pageTheme = theme;
    if (this.fixedLayout) {
      this.themeButton.classList.remove('is-active');
      this.themeButton.textContent = '◧';
      this.themeButton.title = 'PDF Original preserva as cores da página';
      this.themeButton.setAttribute('aria-label', this.themeButton.title);
      this.themeButton.setAttribute('aria-pressed', 'false');
      return;
    }

    const dark = theme === 'dark';
    this.themeButton.classList.toggle('is-active', dark);
    this.themeButton.textContent = dark ? '☀' : '☾';
    this.themeButton.title = dark ? 'Usar papel claro' : 'Usar papel escuro';
    this.themeButton.setAttribute('aria-label', this.themeButton.title);
    this.themeButton.setAttribute('aria-pressed', String(dark));
  }

  public showError(message: string): void {
    this.showStatus(message, 'error', 3900);
  }

  public showMessage(message: string): void {
    this.showStatus(message, 'message', 2600);
  }

  public destroy(): void {
    if (this.debounceTimer !== null) window.clearTimeout(this.debounceTimer);
    if (this.statusTimer !== null) window.clearTimeout(this.statusTimer);
    this.importButton.removeEventListener('click', this.openFilePicker);
    this.pdfModeButton.removeEventListener('click', this.togglePdfMode);
    this.fileInput.removeEventListener('change', this.handleFileSelected);
    this.typeButton.removeEventListener('click', this.toggleTypographyPanel);
    this.themeButton.removeEventListener('click', this.togglePageTheme);
    this.bookmarkButton.removeEventListener('click', this.toggleBookmark);
    this.focusButton.removeEventListener('click', this.toggleFocusMode);
    this.audioButton.removeEventListener('click', this.toggleAudio);
    this.drawerToggle.removeEventListener('click', this.toggleDrawer);
    this.root.remove();
  }

  private buildTypographyPanel(settings: TypographySettings): void {
    const font = document.createElement('select');
    font.className = 'reader-select';
    for (const value of ['Georgia, serif', 'Palatino, serif', 'Times New Roman, serif', 'system-ui, sans-serif']) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value.split(',')[0];
      option.selected = value === settings.fontFamily;
      font.append(option);
    }
    font.addEventListener('change', () => this.applyTypography({ fontFamily: font.value }));

    const fontSize = this.createRange(settings.fontSize, 20, 42, 1, (value) => ({ fontSize: value }));
    const lineHeight = this.createRange(settings.lineHeight, 1.2, 1.9, 0.05, (value) => ({ lineHeight: value }));
    const margin = this.createRange(settings.marginX, 48, 140, 2, (value) => ({ marginX: value }));
    const pageNumberScale = this.createRange(settings.pageNumberScale ?? 1, 0.65, 2.25, 0.05, (value) => ({ pageNumberScale: value }));
    const pageTurnTranslucency = this.createToggle(
      settings.pageTurnTranslucency ?? false,
      (checked) => ({ pageTurnTranslucency: checked })
    );

    const paper = document.createElement('select');
    paper.className = 'reader-select';
    const tones: Array<[string, string]> = [
      ['Creme', '#f2ead7'],
      ['Marfim', '#f5f0e3'],
      ['Papel antigo', '#e8dcc1'],
      ['Branco suave', '#f4f3ee']
    ];
    for (const [label, value] of tones) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      option.selected = value === settings.paperTone;
      paper.append(option);
    }
    paper.addEventListener('change', () => this.applyTypography({ paperTone: paper.value }));

    this.panel.append(
      this.createField('Fonte', font),
      this.createField('Tamanho', fontSize),
      this.createField('Entrelinhas', lineHeight),
      this.createField('Margens', margin),
      this.createField('Numeração', pageNumberScale),
      this.createField('Translucidez', pageTurnTranslucency),
      this.createField('Papel', paper)
    );
  }

  private createRange(
    value: number,
    min: number,
    max: number,
    step: number,
    createPatch: (value: number) => Partial<TypographySettings>
  ): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.className = 'reader-range';
    input.addEventListener('input', () => {
      if (this.debounceTimer !== null) window.clearTimeout(this.debounceTimer);
      this.debounceTimer = window.setTimeout(() => {
        this.debounceTimer = null;
        this.applyTypography(createPatch(Number(input.value)));
      }, 220);
    });
    return input;
  }

  private createToggle(
    checked: boolean,
    createPatch: (checked: boolean) => Partial<TypographySettings>
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'reader-toggle';
    button.setAttribute('role', 'switch');
    button.setAttribute('aria-label', 'Translucidez da folha durante a virada');

    const knob = document.createElement('span');
    knob.className = 'reader-toggle-knob';
    button.append(knob);

    const setChecked = (value: boolean): void => {
      button.classList.toggle('is-checked', value);
      button.setAttribute('aria-checked', String(value));
    };

    setChecked(checked);
    button.addEventListener('click', () => {
      const next = button.getAttribute('aria-checked') !== 'true';
      setChecked(next);
      this.applyTypography(createPatch(next));
    });
    return button;
  }

  private createField(labelText: string, control: HTMLElement): HTMLElement {
    const label = document.createElement('label');
    label.className = 'typography-field';
    const caption = document.createElement('span');
    caption.textContent = labelText;
    label.append(caption, control);
    return label;
  }

  private applyTypography(patch: Partial<TypographySettings>): void {
    void this.callbacks.onTypography(patch).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Não foi possível repaginar o livro.';
      this.showError(message);
    });
  }

  private setDrawerOpen(open: boolean): void {
    this.drawerOpen = open;
    this.root.classList.toggle('is-open', open);
    this.drawerToggle.textContent = open ? '‹' : '›';
    this.drawerToggle.title = open ? 'Recolher controles' : 'Abrir controles';
    this.drawerToggle.setAttribute('aria-label', open ? 'Recolher controles do leitor' : 'Abrir controles do leitor');
    this.drawerToggle.setAttribute('aria-expanded', String(open));

    if (!open) {
      this.panel.hidden = true;
      this.typeButton.classList.remove('is-active');
    }
  }

  private updatePdfModeButton(): void {
    if (!this.pdfMode) {
      this.pdfModeButton.hidden = true;
      this.pdfModeButton.classList.remove('is-active');
      return;
    }

    this.pdfModeButton.hidden = false;
    const reader = this.pdfMode === 'reader';
    this.pdfModeButton.classList.toggle('is-active', reader);
    this.pdfModeButton.textContent = reader ? 'PDF' : 'Aa+';
    this.pdfModeButton.title = reader
      ? 'Mudar para PDF Original'
      : 'Extrair o texto e usar Reader Mode';
    this.pdfModeButton.setAttribute('aria-label', this.pdfModeButton.title);
    this.pdfModeButton.setAttribute('aria-pressed', String(reader));
  }

  private showStatus(message: string, kind: 'busy' | 'error' | 'message', durationMs: number): void {
    if (this.statusTimer !== null) {
      window.clearTimeout(this.statusTimer);
      this.statusTimer = null;
    }

    this.status.textContent = message;
    this.status.classList.toggle('is-busy', kind === 'busy');
    this.status.classList.toggle('is-error', kind === 'error');
    this.status.classList.add('is-visible');

    if (durationMs > 0) {
      this.statusTimer = window.setTimeout(() => {
        this.statusTimer = null;
        this.hideStatus();
      }, durationMs);
    }
  }

  private hideStatus(): void {
    if (this.statusTimer !== null) {
      window.clearTimeout(this.statusTimer);
      this.statusTimer = null;
    }
    this.status.classList.remove('is-visible', 'is-busy', 'is-error');
  }

  private readonly toggleDrawer = (): void => {
    this.setDrawerOpen(!this.drawerOpen);
  };

  private readonly openFilePicker = (): void => {
    this.fileInput.click();
  };

  private readonly handleFileSelected = (): void => {
    const file = this.fileInput.files?.[0];
    this.fileInput.value = '';
    if (!file) return;
    void this.callbacks.onImport(file).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Não foi possível abrir o livro.';
      this.showError(message);
    });
  };

  private readonly toggleTypographyPanel = (): void => {
    if (this.fixedLayout) return;
    this.panel.hidden = !this.panel.hidden;
    this.typeButton.classList.toggle('is-active', !this.panel.hidden);
  };

  private readonly togglePageTheme = (): void => {
    if (this.fixedLayout) return;
    const previous = this.pageTheme;
    const next: PageTheme = previous === 'dark' ? 'light' : 'dark';
    this.setPageTheme(next);
    this.showMessage(next === 'dark' ? 'Papel escuro ativado' : 'Papel claro ativado');
    void Promise.resolve(this.callbacks.onPageTheme(next)).catch((error: unknown) => {
      this.setPageTheme(previous);
      this.showError(error instanceof Error ? error.message : 'Não foi possível alterar a cor do papel.');
    });
  };

  private readonly togglePdfMode = (): void => {
    if (!this.pdfMode) return;
    const previous = this.pdfMode;
    const requested: PdfViewMode = previous === 'reader' ? 'original' : 'reader';
    this.pdfModeButton.disabled = true;
    void this.callbacks.onPdfMode(requested)
      .then((actualMode) => {
        this.pdfMode = actualMode;
        this.updatePdfModeButton();
        if (actualMode !== requested) {
          this.showMessage('Sem texto extraível: mantendo PDF Original');
        } else {
          this.showMessage(actualMode === 'reader' ? 'Reader Mode ativado' : 'PDF Original ativado');
        }
      })
      .catch((error: unknown) => {
        this.pdfMode = previous;
        this.updatePdfModeButton();
        this.showError(error instanceof Error ? error.message : 'Não foi possível trocar o modo do PDF.');
      })
      .finally(() => {
        this.pdfModeButton.disabled = false;
      });
  };

  private readonly toggleBookmark = (): void => {
    void this.callbacks.onToggleBookmark()
      .then((bookmarked) => {
        this.setBookmarked(bookmarked);
        this.showMessage(bookmarked ? 'Bookmark salvo' : 'Bookmark removido');
      })
      .catch((error: unknown) => {
        this.showError(error instanceof Error ? error.message : 'Não foi possível alterar o bookmark.');
      });
  };

  private readonly toggleFocusMode = (): void => {
    const enabled = !this.focusEnabled;
    this.setFocusMode(enabled);
    this.showMessage(enabled ? 'Focus Mode ligado' : 'Focus Mode desligado');
    void Promise.resolve(this.callbacks.onFocusMode(enabled)).catch(() => this.setFocusMode(!enabled));
  };

  private readonly toggleAudio = (): void => {
    const enabled = !this.audioEnabled;
    this.setAudioEnabled(enabled);
    this.showMessage(enabled ? 'Som de página ligado' : 'Som de página desligado');
    void Promise.resolve(this.callbacks.onAudioEnabled(enabled)).catch(() => this.setAudioEnabled(!enabled));
  };
}
