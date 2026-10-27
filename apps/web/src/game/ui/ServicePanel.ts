import './panel.css';

/** Um botão de uma linha. `run` pode ser assíncrono; enquanto roda, todos os botões ficam desligados. */
export interface PanelAction {
  label: string;
  /** recebe o valor atual de cada campo da linha (`inputs`), pelo id */
  run: (values: Record<string, string>) => unknown;
  disabled?: boolean;
}

/** Campo da linha: número (quantidade, preço), texto (nome) ou lista de opções (moeda). */
export interface PanelInput {
  id: string;
  label: string;
  value: string;
  /** texto livre; sem isso, número */
  text?: { maxLength: number };
  min?: number;
  max?: number;
  options?: { value: string; label: string }[];
}

export interface PanelRow {
  icon?: string;
  name: string;
  /** cor do nome (raridade) */
  color?: string;
  detail?: string;
  /** campos antes dos botões; o valor digitado fica guardado enquanto a janela está aberta */
  inputs?: PanelInput[];
  /** identifica a linha para guardar os campos (padrão: o nome) */
  key?: string;
  actions: PanelAction[];
}

export interface PanelSection {
  title: string;
  rows: PanelRow[];
  /** texto quando não há linhas */
  empty?: string;
  note?: string;
}

export interface PanelContent {
  title: string;
  /** linha à direita do título (ex.: moedas) */
  subtitle?: string;
  sections: PanelSection[];
}

/**
 * Janela HTML por cima do jogo para os serviços da cidade. Quem abre passa uma função que monta o
 * conteúdo; depois de cada ação a janela é montada de novo, já com os valores que o servidor devolveu.
 * Esc ou "Fechar" fecham. Enquanto está aberta, o teclado do jogo fica desligado.
 */
export class ServicePanel {
  private root: HTMLDivElement | null = null;
  private status = { text: '', kind: '' };
  private busy = false;
  private build: (() => PanelContent) | null = null;
  private readonly values = new Map<string, string>();
  private readonly onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') this.close();
  };

  constructor(private readonly onClosed: () => void) {}

  isOpen(): boolean {
    return this.root !== null;
  }

  open(build: () => PanelContent): void {
    this.close(false);
    this.build = build;
    this.values.clear();
    this.status = { text: '', kind: '' };
    this.root = document.createElement('div');
    this.root.className = 'service-panel';
    this.root.setAttribute('role', 'dialog');
    document.body.appendChild(this.root);
    window.addEventListener('keydown', this.onKey);
    this.render();
  }

  close(notify = true): void {
    if (!this.root) return;
    this.root.remove();
    this.root = null;
    this.build = null;
    window.removeEventListener('keydown', this.onKey);
    if (notify) this.onClosed();
  }

  /** Mensagem de resultado (verde) ou erro (vermelho) embaixo da janela. */
  say(text: string, kind: 'ok' | 'error'): void {
    this.status = { text, kind };
    this.render();
  }

  render(): void {
    if (!this.root || !this.build) return;
    const c = this.build();
    const box = el('div', 'box');
    const header = el('header');
    header.append(el('h2', '', c.title), el('span', 'wallet', c.subtitle ?? ''));
    box.append(header);
    for (const section of c.sections) {
      box.append(el('h3', '', section.title));
      if (section.rows.length === 0) box.append(el('div', 'empty', section.empty ?? 'Nada aqui.'));
      for (const row of section.rows) box.append(this.renderRow(row));
      if (section.note) box.append(el('div', 'note', section.note));
    }
    box.append(el('div', `status ${this.status.kind}`, this.status.text));
    const close = el('button', 'secondary', 'Fechar (Esc)');
    close.addEventListener('click', () => this.close());
    box.append(close);
    this.root.replaceChildren(box);
  }

  private renderRow(row: PanelRow): HTMLElement {
    const line = el('div', 'row');
    if (row.icon) {
      const img = document.createElement('img');
      img.src = row.icon;
      img.alt = '';
      line.append(img);
    }
    const name = el('span', 'name', row.name);
    if (row.color) name.style.color = row.color;
    if (row.detail) name.append(el('span', 'detail', row.detail));
    const actions = el('span', 'actions');
    const rowKey = row.key ?? row.name;
    const values = () => Object.fromEntries((row.inputs ?? []).map((i) => [i.id, this.values.get(`${rowKey}|${i.id}`) ?? i.value]));
    for (const input of row.inputs ?? []) {
      const key = `${rowKey}|${input.id}`;
      const field = input.options ? document.createElement('select') : document.createElement('input');
      if (field instanceof HTMLSelectElement) {
        for (const o of input.options!) field.append(new Option(o.label, o.value));
      } else if (input.text) {
        field.type = 'text';
        field.maxLength = input.text.maxLength;
        field.className = 'text';
      } else {
        field.type = 'number';
        if (input.min !== undefined) field.min = String(input.min);
        if (input.max !== undefined) field.max = String(input.max);
      }
      field.value = this.values.get(key) ?? input.value;
      field.setAttribute('aria-label', `${input.label}: ${row.name}`);
      field.title = input.label;
      field.addEventListener('input', () => this.values.set(key, field.value));
      // o jogo escuta o teclado na janela e segura teclas como W, A, S, D e espaço: o campo fica com elas
      field.addEventListener('keydown', (e: Event) => {
        if ((e as KeyboardEvent).key !== 'Escape') e.stopPropagation();
      });
      actions.append(field);
    }
    for (const a of row.actions) {
      const b = el('button', '', a.label) as HTMLButtonElement;
      b.disabled = this.busy || Boolean(a.disabled);
      b.setAttribute('aria-label', `${a.label}: ${row.name}`);
      b.addEventListener('click', () => void this.run(a, values()));
      actions.append(b);
    }
    line.append(name, actions);
    return line;
  }

  private async run(action: PanelAction, values: Record<string, string>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.render();
    try {
      await action.run(values);
    } finally {
      this.busy = false;
      this.render();
    }
  }
}

function el(tag: string, className = '', text = ''): HTMLElement {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  return e;
}
