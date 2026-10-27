import type * as Phaser from 'phaser';
import type { PlaySession } from '../menu/menu.ts';

export function getSession(scene: Phaser.Scene): PlaySession | undefined {
  return scene.registry.get('session') as PlaySession | undefined;
}

/** Classe do personagem em jogo: a do personagem online, ou a escolhida no modo offline. */
export function sessionClassId(scene: Phaser.Scene): string {
  const session = getSession(scene);
  if (!session) return 'mage';
  return session.mode === 'online' ? session.character.class_id : session.classId;
}
