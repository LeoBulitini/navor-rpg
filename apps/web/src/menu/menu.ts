// Menu inicial em HTML (login, seleção e criação de personagem), antes de abrir o Phaser.
import './menu.css';
import { supabase } from '../services/supabase.ts';
import { getSession, signIn, signOut, signUp } from '../services/auth.ts';
import { createCharacter, listMyCharacters, listStartingClasses, type Character } from '../services/characters.ts';
import { friendlyError } from '../services/errors.ts';

export type PlaySession =
  | { mode: 'online'; character: Character }
  | { mode: 'offline' };

const h = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & Record<string, unknown> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag);
  Object.assign(el, props);
  el.append(...children);
  return el;
};

/** Mostra o menu e resolve quando o jogador escolhe com que personagem jogar. */
export function runMenu(host: HTMLElement): Promise<PlaySession> {
  return new Promise((resolve) => {
    const root = h('div', { className: 'menu' });
    host.append(root);
    const finish = (s: PlaySession) => {
      root.remove();
      resolve(s);
    };
    const panel = (...children: Node[]) => {
      root.replaceChildren(h('div', { className: 'menu-panel' }, h('h1', {}, 'NAVOR RPG'), ...children));
    };
    const message = () => h('div', { className: 'msg', role: 'status' });
    const setMsg = (el: HTMLElement, text: string, kind: 'error' | 'ok' | '' = '') => {
      el.textContent = text;
      el.className = `msg ${kind}`;
    };
    const busy = async (buttons: HTMLButtonElement[], fn: () => Promise<void>) => {
      buttons.forEach((b) => (b.disabled = true));
      try {
        await fn();
      } finally {
        buttons.forEach((b) => (b.disabled = false));
      }
    };

    // ---------- sem backend configurado ----------
    const showOffline = () => {
      const play = h('button', { type: 'button' }, 'Jogar offline (sem salvar)');
      play.onclick = () => finish({ mode: 'offline' });
      panel(
        h('h2', {}, 'Servidor não configurado'),
        h('p', { className: 'note' },
          'Faltam VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY (veja apps/web/.env.example). ',
          'Dá para testar a cena sem login, mas nada é salvo.'),
        h('div', { className: 'row' }, play),
      );
    };

    // ---------- login / cadastro ----------
    const showLogin = (notice = '') => {
      const email = h('input', { type: 'email', id: 'email', autocomplete: 'email', required: true });
      const password = h('input', { type: 'password', id: 'password', autocomplete: 'current-password', required: true, minLength: 8 });
      const enter = h('button', { type: 'submit' }, 'Entrar');
      const create = h('button', { type: 'button', className: 'secondary' }, 'Criar conta');
      const msg = message();
      if (notice) setMsg(msg, notice, 'ok');
      const form = h('form', {},
        h('label', { htmlFor: 'email' }, 'E-mail'), email,
        h('label', { htmlFor: 'password' }, 'Senha (mínimo 8 caracteres)'), password,
        h('div', { className: 'row' }, enter, create),
        msg,
      );
      form.onsubmit = (ev) => {
        ev.preventDefault();
        void busy([enter, create], async () => {
          try {
            await signIn(email.value.trim(), password.value);
            await showCharacters();
          } catch (err) {
            setMsg(msg, friendlyError(err), 'error');
          }
        });
      };
      create.onclick = () => {
        if (!form.reportValidity()) return;
        void busy([enter, create], async () => {
          try {
            const active = await signUp(email.value.trim(), password.value);
            if (active) await showCharacters();
            else setMsg(msg, 'Conta criada. Abra o link de confirmação enviado ao seu e-mail e depois entre.', 'ok');
          } catch (err) {
            setMsg(msg, friendlyError(err), 'error');
          }
        });
      };
      panel(h('h2', {}, 'Entrar'), form);
      email.focus();
    };

    // ---------- personagens ----------
    const showCharacters = async () => {
      panel(h('h2', {}, 'Carregando personagens...'));
      let characters: Character[];
      let classes: { id: string; name: string }[];
      try {
        [characters, classes] = await Promise.all([listMyCharacters(), listStartingClasses()]);
      } catch (err) {
        const retry = h('button', { type: 'button' }, 'Tentar de novo');
        retry.onclick = () => void showCharacters();
        const msg = message();
        setMsg(msg, friendlyError(err), 'error');
        panel(h('h2', {}, 'Personagens'), msg, h('div', { className: 'row' }, retry));
        return;
      }
      const className = (id: string) => classes.find((c) => c.id === id)?.name ?? id;

      const list = h('ul', { className: 'chars' });
      for (const c of characters) {
        const btn = h('button', { type: 'button' }, h('span', {}, c.name), h('span', {}, `${className(c.class_id)} · nível ${c.level}`));
        btn.onclick = () => finish({ mode: 'online', character: c });
        list.append(h('li', {}, btn));
      }

      const name = h('input', { id: 'char-name', required: true, minLength: 3, maxLength: 16, pattern: '[A-Za-zÀ-ÖØ-öø-ÿ0-9]{3,16}', title: 'De 3 a 16 letras ou números, sem espaços' });
      const cls = h('select', { id: 'char-class' }, ...classes.map((c) => h('option', { value: c.id }, c.name)));
      const createBtn = h('button', { type: 'submit' }, 'Criar personagem');
      const msg = message();
      const form = h('form', {},
        h('label', { htmlFor: 'char-name' }, 'Nome (3 a 16 letras ou números)'), name,
        h('label', { htmlFor: 'char-class' }, 'Classe inicial'), cls,
        h('div', { className: 'row' }, createBtn),
        msg,
      );
      form.onsubmit = (ev) => {
        ev.preventDefault();
        void busy([createBtn], async () => {
          try {
            await createCharacter(name.value.trim(), cls.value);
            await showCharacters();
          } catch (err) {
            setMsg(msg, friendlyError(err), 'error');
          }
        });
      };

      const logout = h('button', { type: 'button', className: 'secondary' }, 'Sair da conta');
      logout.onclick = () => void busy([logout], async () => {
        await signOut().catch(() => undefined);
        showLogin();
      });

      panel(
        h('h2', {}, 'Escolha seu personagem'),
        characters.length ? list : h('p', { className: 'empty' }, 'Você ainda não tem personagens.'),
        h('hr'),
        form,
        h('p', { className: 'note' }, 'No protótipo só o Mago está disponível.'),
        h('div', { className: 'row' }, logout),
      );
    };

    if (!supabase) {
      showOffline();
      return;
    }
    panel(h('h2', {}, 'Conectando...'));
    getSession()
      .then((session) => (session ? showCharacters() : showLogin()))
      .catch((err) => {
        console.error(err);
        showLogin();
      });
  });
}
