import { content } from '../../content.ts';
import type { ChatMessage, GameBackend, PresenceInfo } from '../backend.ts';
import { friendlyError } from '../../services/errors.ts';
import './chat.css';

const VISIBLE = 8;
const GUILD_PREFIX = /^\/g(uilda)?\s+/i;

/**
 * Chat por cima do jogo (canto inferior esquerdo): canal geral e da guilda (mensagem começando com /g).
 * Enter abre o campo, Enter envia, Esc cancela. As mensagens de outros chegam pelo Realtime; quem está
 * jogando agora vem da Presence. Tudo que é gravado passa por chat_send no servidor.
 */
export class ChatBox {
  private readonly root = document.createElement('div');
  private readonly online = document.createElement('div');
  private readonly log = document.createElement('div');
  private readonly input = document.createElement('input');
  private readonly status = document.createElement('div');
  private readonly messages: ChatMessage[] = [];
  private readonly seen = new Set<string>();
  private unsubscribe: (() => void) | null = null;
  private onlineList: PresenceInfo[] = [];

  constructor(
    private readonly backend: GameBackend,
    private readonly hasGuild: () => boolean,
    /** o campo abriu ou fechou: o jogo desliga ou religa o teclado */
    private readonly onFocus: (focused: boolean) => void,
  ) {
    this.root.className = 'chat-box';
    this.online.className = 'chat-online';
    this.log.className = 'chat-log';
    this.log.setAttribute('role', 'log');
    this.log.setAttribute('aria-label', 'Chat');
    this.input.type = 'text';
    this.input.maxLength = content.social.chat.maxLength;
    this.input.placeholder = 'Mensagem (/g para a guilda) · Enter envia · Esc cancela';
    this.input.setAttribute('aria-label', 'Mensagem do chat');
    this.input.hidden = true;
    this.status.className = 'chat-status';
    this.root.append(this.online, this.log, this.status, this.input);
    document.body.append(this.root);

    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation(); // o jogo não recebe as letras digitadas
      if (e.key === 'Enter') void this.send();
      else if (e.key === 'Escape') {
        this.input.value = ''; // Esc cancela a mensagem
        this.say('');
        this.close();
      }
    });
    this.input.addEventListener('blur', () => this.close());
  }

  async start(): Promise<void> {
    try {
      for (const m of await this.backend.loadChat()) this.add(m);
    } catch (err) {
      this.say(friendlyError(err));
    }
    this.unsubscribe = this.backend.onChat((m) => this.add(m));
  }

  isOpen(): boolean {
    return !this.input.hidden;
  }

  open(): void {
    this.input.hidden = false;
    this.root.classList.add('open');
    this.input.focus();
    this.onFocus(true);
  }

  close(): void {
    if (this.input.hidden) return;
    this.input.hidden = true;
    this.root.classList.remove('open');
    this.input.blur();
    this.onFocus(false);
  }

  setOnline(list: PresenceInfo[]): void {
    this.onlineList = list;
    const names = list.map((p) => `${p.name} (nível ${p.level})`).join(', ');
    this.online.textContent = `${list.length} online`;
    this.online.title = names;
    this.online.setAttribute('aria-label', `${list.length} online: ${names}`);
  }

  get onlineNow(): PresenceInfo[] {
    return this.onlineList;
  }

  /** Mensagens na tela, da mais antiga para a mais nova (para o teste de fumaça). */
  lines(): string[] {
    return [...this.log.children].map((el) => el.textContent ?? '');
  }

  destroy(): void {
    this.unsubscribe?.();
    this.root.remove();
  }

  private async send(): Promise<void> {
    const raw = this.input.value;
    const guild = GUILD_PREFIX.test(raw);
    const body = guild ? raw.replace(GUILD_PREFIX, '') : raw;
    if (!body.trim()) {
      this.close();
      return;
    }
    if (guild && !this.hasGuild()) {
      this.say('Você não está numa guilda.');
      return;
    }
    try {
      this.add(await this.backend.sendChat(guild ? 'guild' : 'global', body));
      this.input.value = '';
      this.say('');
      this.close();
    } catch (err) {
      this.say(friendlyError(err));
    }
  }

  private say(text: string): void {
    this.status.textContent = text;
  }

  private add(m: ChatMessage): void {
    if (this.seen.has(m.id)) return; // a própria mensagem volta pelo Realtime
    this.seen.add(m.id);
    this.messages.push(m);
    this.messages.sort((a, b) => a.at - b.at);
    const recent = this.messages.slice(-VISIBLE);
    this.log.replaceChildren(
      ...recent.map((x) => {
        const line = document.createElement('div');
        line.className = x.channel === 'guild' ? 'guild' : '';
        const who = document.createElement('b');
        who.textContent = `${x.channel === 'guild' ? '[Guilda] ' : ''}${x.author}: `;
        line.append(who, x.body); // texto puro, nunca HTML
        return line;
      }),
    );
  }
}
