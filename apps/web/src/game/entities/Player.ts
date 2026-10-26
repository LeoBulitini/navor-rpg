import * as Phaser from 'phaser';
import { facingFromVelocity, velocityFromInput, type DirectionInput, type Facing } from '@navor/shared';
import { content } from '../../content.ts';
import { TextureKeys } from '../../assets/index.ts';
import { animKey } from '../scenes/PreloadScene.ts';

export class Player extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;
  private facing: Facing = 'down';
  private readonly speed: number;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, TextureKeys.mage, 0);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    const { player, tileSize } = content.balance;
    this.speed = player.moveSpeedTilesPerSecond * tileSize;
    // Caixa de colisão pequena nos pés: no top-down 3/4 o corpo "pisa" o chão,
    // então a cabeça pode passar na frente de muros e árvores sem travar.
    this.body.setSize(player.hitbox.width, player.hitbox.height);
    this.body.setOffset(player.hitbox.offsetX, player.hitbox.offsetY);
    this.setCollideWorldBounds(true);
    this.play(animKey('idle', this.facing));
  }

  move(input: DirectionInput): void {
    const v = velocityFromInput(input, this.speed);
    this.setVelocity(v.vx, v.vy);
    this.facing = facingFromVelocity(v, this.facing);
    const moving = v.vx !== 0 || v.vy !== 0;
    this.play(animKey(moving ? 'walk' : 'idle', this.facing), true);
  }

  getFacing(): Facing {
    return this.facing;
  }
}
