import * as Phaser from 'phaser';

async function boot(): Promise<void> {
  try {
    // Importado aqui para que um erro de conteúdo inválido apareça na tela, não só no console.
    const { createGameConfig } = await import('./game/config.ts');
    const game = new Phaser.Game(createGameConfig('game'));
    window.addEventListener('resize', () => game.scale.setMaxZoom());
  } catch (err) {
    console.error(err);
    const el = document.createElement('pre');
    el.id = 'boot-error';
    el.textContent = `Falha ao iniciar o Navor RPG:\n\n${(err as Error).message}`;
    document.getElementById('game')!.replaceWith(el);
  }
}

void boot();
