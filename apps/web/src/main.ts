import * as Phaser from 'phaser';
import type { PlaySession } from './menu/menu.ts';

function showFatal(err: unknown): void {
  console.error(err);
  const el = document.createElement('pre');
  el.id = 'boot-error';
  el.textContent = `Falha ao iniciar o Navor RPG:\n\n${(err as Error).message}`;
  document.getElementById('game')?.replaceWith(el);
}

async function boot(): Promise<void> {
  try {
    // Importados aqui para que um erro de conteúdo ou de configuração apareça na tela, não só no console.
    const { runMenu } = await import('./menu/menu.ts');
    const session: PlaySession = await runMenu(document.body);
    const { createGameConfig } = await import('./game/config.ts');
    const game = new Phaser.Game(createGameConfig('game', session));
    window.addEventListener('resize', () => game.scale.setMaxZoom());
  } catch (err) {
    showFatal(err);
  }
}

void boot();
