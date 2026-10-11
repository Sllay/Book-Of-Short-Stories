import type { TypographySettings } from '../pagination/types';
import type { ReadingSessionState } from '../reader/ReadingSession';

interface ReaderControlsCallbacks {
  readonly onImport: (file: File) => Promise<void>;
  readonly onTypography: (patch: Partial<TypographySettings>) => Promise<void>;
}

export class ReaderControls {
  private readonly root = document.createElement('div');
  private readonly importButton = document.createElement('button');
  private readonly typeButton = document.createElement('button');
  private readonly fileInput = document.createElement('input');
  private readonly panel = document.createElement('div');
  private readonly status = document.createElement('div');
  private debounceTimer: number | null = null;

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

    this.fileInput.type = 'file';
    this.fileInput.accept = '.txt,text/plain';
    this.fileInput.hidden = true;

    const toolbar = document.createElement('div');
    toolbar.className = 'reader-toolbar';
    toolbar.append(this.importButton, this.typeButton);

    this.panel.className = 'typography-panel';
    this.panel.hidden = true;
    this.buildTypographyPanel(settings);

    this.status.className = 'reader-status';
    this.status.textContent = 'Preparando leitor…';

    this.root.append(toolbar, this.panel, this.status, this.fileInput);
    host.append(this.root);

    this.importButton.addEventListener('click', this.openFilePicker);
    this.fileInput.addEventListener('change', this.handleFileSelected);
    this.typeButton.addEventListener('click', this.toggleTypographyPanel);
  }

  public setState(state: ReadingSessionState): void {
    this.importButton.disabled = state.busy;
    this.typeButton.disabled = state.busy;
    const pages = state.pageCount > 0 ? ` • pág. ${state.page}/${state.pageCount}` : '';
    this.status.textContent = state.busy ? state.message : `${state.title}${pages}`;
    this.status.classList.toggle('is-busy', state.busy);
  }

  public showError(message: string): void {
    this.status.textContent = message;
    this.status.classList.add('is-error');
    window.setTimeout(() => this.status.classList.remove('is-error'), 2800);
  }

  public destroy(): void {
    if (this.debounceTimer !== null) window.clearTimeout(this.debounceTimer);
    this.importButton.removeEventListener('click', this.openFilePicker);
    this.fileInput.removeEventListener('change', this.handleFileSelected);
    this.typeButton.removeEventListener('click', this.toggleTypographyPanel);
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

  private readonly openFilePicker = (): void => {
    this.fileInput.click();
  };

  private readonly handleFileSelected = (): void => {
    const file = this.fileInput.files?.[0];
    this.fileInput.value = '';
    if (!file) return;
    void this.callbacks.onImport(file).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Não foi possível abrir o TXT.';
      this.showError(message);
    });
  };

  private readonly toggleTypographyPanel = (): void => {
    this.panel.hidden = !this.panel.hidden;
    this.typeButton.classList.toggle('is-active', !this.panel.hidden);
  };
}
