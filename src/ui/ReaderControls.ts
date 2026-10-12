import type { TypographySettings } from '../pagination/types';
import type { ReadingSessionState } from '../reader/ReadingSession';

interface ReaderControlsCallbacks {
  readonly onImport: (file: File) => Promise<void>;
  readonly onTypography: (patch: Partial<TypographySettings>) => Promise<void>;
  readonly onToggleBookmark: () => Promise<boolean>;
  readonly onFocusMode: (enabled: boolean) => Promise<void> | void;
  readonly onAudioEnabled: (enabled: boolean) => Promise<void> | void;
}

export class ReaderControls {
  private readonly root = document.createElement('div');
  private readonly drawer = document.createElement('div');
  private readonly drawerToggle = document.createElement('button');
  private readonly importButton = document.createElement('button');
  private readonly typeButton = document.createElement('button');
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
  private drawerOpen = false;

  public constructor(
    host: HTMLElement,
    settings: TypographySettings,
    private readonly callbacks: ReaderControlsCallbacks
  ) {
    this.root.className = 'reader-controls';

    this.importButton.type = 'button';
    this.importButton.className = 'reader-tool-button';
    this.importButton.textContent = '📖 TXT';
    this.importButton.title = 'Abrir livro TXT';

    this.typeButton.type = 'button';
    this.typeButton.className = 'reader-tool-button';
    this.typeButton.textContent = 'Aa';
    this.typeButton.title = 'Tipografia';

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
    this.fileInput.accept = '.txt,text/plain';
    this.fileInput.hidden = true;

    const toolbar = document.createElement('div');
    toolbar.className = 'reader-toolbar';
    toolbar.append(this.importButton, this.typeButton, this.bookmarkButton, this.focusButton, this.audioButton);

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
    this.fileInput.addEventListener('change', this.handleFileSelected);
    this.typeButton.addEventListener('click', this.toggleTypographyPanel);
    this.bookmarkButton.addEventListener('click', this.toggleBookmark);
    this.focusButton.addEventListener('click', this.toggleFocusMode);
    this.audioButton.addEventListener('click', this.toggleAudio);
    this.drawerToggle.addEventListener('click', this.toggleDrawer);

    this.setDrawerOpen(false);
  }

  public setState(state: ReadingSessionState): void {
    this.importButton.disabled = state.busy;
    this.typeButton.disabled = state.busy;
    this.bookmarkButton.disabled = state.busy;

    if (state.busy) {
      this.showStatus(state.message, 'busy', 0);
    } else if (this.status.classList.contains('is-busy')) {
      this.hideStatus();
    }
  }

  public setBookmarked(bookmarked: boolean): void {
    this.bookmarkButton.textContent = bookmarked ? '🔖' : '☆';
    this.bookmarkButton.classList.toggle('is-active', bookmarked);
    this.bookmarkButton.title = bookmarked ? 'Remover bookmark desta página' : 'Adicionar bookmark desta página';
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

  public showError(message: string): void {
    this.showStatus(message, 'error', 3400);
  }

  public showMessage(message: string): void {
    this.showStatus(message, 'message', 2300);
  }

  public destroy(): void {
    if (this.debounceTimer !== null) window.clearTimeout(this.debounceTimer);
    if (this.statusTimer !== null) window.clearTimeout(this.statusTimer);
    this.importButton.removeEventListener('click', this.openFilePicker);
    this.fileInput.removeEventListener('change', this.handleFileSelected);
    this.typeButton.removeEventListener('click', this.toggleTypographyPanel);
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

    const fontSize = this.createRange(settings.fontSize, 20, 38, 1, (value) => ({ fontSize: value }));
    const lineHeight = this.createRange(settings.lineHeight, 1.2, 1.8, 0.05, (value) => ({ lineHeight: value }));
    const margin = this.createRange(settings.marginX, 58, 128, 2, (value) => ({ marginX: value }));
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
    this.panel.hidden = !this.panel.hidden;
    this.typeButton.classList.toggle('is-active', !this.panel.hidden);
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
