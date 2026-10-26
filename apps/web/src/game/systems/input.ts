import * as Phaser from 'phaser';
import type { DirectionInput } from '@navor/shared';

/** Teclado: setas e WASD. Devolve só "quais direções estão pressionadas"; a física fica em Player. */
export class DirectionKeys {
  private readonly keys: Record<keyof DirectionInput, Phaser.Input.Keyboard.Key[]>;

  constructor(scene: Phaser.Scene) {
    const kb = scene.input.keyboard;
    if (!kb) throw new Error('Teclado indisponível nesta cena');
    const K = Phaser.Input.Keyboard.KeyCodes;
    const add = (...codes: number[]) => codes.map((c) => kb.addKey(c));
    this.keys = {
      left: add(K.LEFT, K.A),
      right: add(K.RIGHT, K.D),
      up: add(K.UP, K.W),
      down: add(K.DOWN, K.S),
    };
  }

  read(): DirectionInput {
    const down = (list: Phaser.Input.Keyboard.Key[]) => list.some((k) => k.isDown);
    return {
      left: down(this.keys.left),
      right: down(this.keys.right),
      up: down(this.keys.up),
      down: down(this.keys.down),
    };
  }
}
