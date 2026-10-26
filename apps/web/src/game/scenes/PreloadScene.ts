import * as Phaser from 'phaser';
import type { Facing } from '@navor/shared';
import { assets, TextureKeys } from '../../assets/index.ts';

export const animKey = (state: 'idle' | 'walk', facing: Facing) => `mage-${state}-${facing}`;

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  preload(): void {
    const { width, height } = this.scale;
    const label = this.add.text(width / 2, height / 2, 'Carregando...', { fontSize: '12px', color: '#e5e7eb' });
    label.setOrigin(0.5);

    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      label.setText(`Erro ao carregar "${file.key}" (${file.url}).\nVerifique se rodou "npm run placeholders".`);
      label.setColor('#fca5a5');
    });

    this.load.image(TextureKeys.tileset, assets.tileset.path);
    this.load.spritesheet(TextureKeys.mage, assets.mage.path, {
      frameWidth: assets.mage.frameWidth,
      frameHeight: assets.mage.frameHeight,
    });
  }

  create(): void {
    if (!this.textures.exists(TextureKeys.mage) || !this.textures.exists(TextureKeys.tileset)) return;
    this.createMageAnimations();
    this.scene.start('Test');
  }

  private createMageAnimations(): void {
    const { rows, frames, walkFrameRate } = assets.mage;
    const columns = frames.walk.length > 0 ? Math.max(frames.idle, ...frames.walk) + 1 : 1;
    rows.forEach((facing, row) => {
      const at = (col: number) => ({ key: TextureKeys.mage, frame: row * columns + col });
      this.anims.create({ key: animKey('idle', facing as Facing), frames: [at(frames.idle)] });
      this.anims.create({
        key: animKey('walk', facing as Facing),
        frames: frames.walk.map(at),
        frameRate: walkFrameRate,
        repeat: -1,
      });
    });
  }
}
