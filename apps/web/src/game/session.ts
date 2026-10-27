import type * as Phaser from 'phaser';
import type { PlaySession } from '../menu/menu.ts';
import { OFFLINE_CLASS_ID } from '../assets/index.ts';

export function getSession(scene: Phaser.Scene): PlaySession | undefined {
  return scene.registry.get('session') as PlaySession | undefined;
}

/** Classe do personagem em jogo: a do personagem online, ou o Mago no modo offline. */
export function sessionClassId(scene: Phaser.Scene): string {
  const session = getSession(scene);
  return session?.mode === 'online' ? session.character.class_id : OFFLINE_CLASS_ID;
}
