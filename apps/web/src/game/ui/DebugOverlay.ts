import * as Phaser from 'phaser';
import type { ParsedMap } from '@navor/shared';
import type { Player } from '../entities/Player.ts';

/** F3 liga/desliga: caixas de colisão, células bloqueadas destacadas, posição e FPS. */
export class DebugOverlay {
  private enabled = false;
  private readonly text: Phaser.GameObjects.Text;
  private readonly solids: Phaser.GameObjects.Graphics;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly player: Player,
    private readonly map: ParsedMap,
    private readonly tileSize: number,
  ) {
    this.text = scene.add
      .text(4, 4, '', { fontSize: '10px', color: '#fde047', backgroundColor: '#000000aa', padding: { x: 3, y: 2 } })
      .setScrollFactor(0)
      .setDepth(1000)
      .setVisible(false);
    this.solids = scene.add.graphics().setDepth(999).setVisible(false);
    this.drawSolids();
    scene.input.keyboard?.on('keydown-F3', (e: KeyboardEvent) => {
      e.preventDefault();
      this.toggle();
    });
  }

  toggle(): void {
    this.enabled = !this.enabled;
    const world = this.scene.physics.world;
    if (!world.debugGraphic) world.createDebugGraphic();
    world.drawDebug = this.enabled;
    world.debugGraphic.clear();
    this.text.setVisible(this.enabled);
    this.solids.setVisible(this.enabled);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  update(): void {
    if (!this.enabled) return;
    const b = this.player.body;
    const tx = Math.floor(b.center.x / this.tileSize);
    const ty = Math.floor(b.center.y / this.tileSize);
    this.text.setText(
      [
        `FPS ${Math.round(this.scene.game.loop.actualFps)}`,
        `pos ${Math.round(b.center.x)},${Math.round(b.center.y)}  tile ${tx},${ty}`,
        `dir ${this.player.getFacing()}  vel ${Math.round(b.velocity.x)},${Math.round(b.velocity.y)}`,
      ].join('\n'),
    );
  }

  private drawSolids(): void {
    this.solids.lineStyle(1, 0xff3b3b, 0.8);
    this.map.blocked.forEach((row, y) =>
      row.forEach((blocked, x) => {
        if (blocked) this.solids.strokeRect(x * this.tileSize + 0.5, y * this.tileSize + 0.5, this.tileSize - 1, this.tileSize - 1);
      }),
    );
  }
}
