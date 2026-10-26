import * as Phaser from 'phaser';
import { content } from '../content.ts';
import { PreloadScene } from './scenes/PreloadScene.ts';
import { TestScene } from './scenes/TestScene.ts';
import type { PlaySession } from '../menu/menu.ts';

export function createGameConfig(parent: string, session: PlaySession): Phaser.Types.Core.GameConfig {
  const { width, height } = content.balance.viewport;
  return {
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#0b0d12',
    // pixelArt desliga a suavização e arredonda posições: pixels nítidos.
    pixelArt: true,
    scale: {
      // Resolução interna fixa, ampliada pelo maior fator INTEIRO que cabe na janela.
      mode: Phaser.Scale.NONE,
      width,
      height,
      zoom: Phaser.Scale.MAX_ZOOM,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    physics: {
      default: 'arcade',
      arcade: { gravity: { x: 0, y: 0 }, debug: false },
    },
    scene: [PreloadScene, TestScene],
    // A sessão (personagem escolhido ou modo offline) fica no registry, visível a todas as cenas.
    callbacks: { preBoot: (game) => game.registry.set('session', session) },
  };
}
