import * as Phaser from 'phaser';
import { FACINGS, type Facing } from '@navor/shared';
import { assets, characterSpritePath, objectSpritePath, TextureKeys } from '../../assets/index.ts';
import { content } from '../../content.ts';
import { sessionClassId } from '../session.ts';

export const animKey = (classId: string, state: 'idle' | 'walk', facing: Facing) => `${classId}-${state}-${facing}`;

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  preload(): void {
    const { width, height } = this.scale;
    const label = this.add.text(width / 2, height / 2, 'Carregando...', { fontSize: '12px', color: '#e5e7eb' });
    label.setOrigin(0.5);

    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      label.setText(`Erro ao carregar "${file.key}" (${file.url}).`);
      label.setColor('#fca5a5');
    });

    this.load.image(TextureKeys.tileset, assets.tileset.path);
    for (const sprite of new Set(content.objects.objects.map((o) => o.sprite))) {
      this.load.image(TextureKeys.object(sprite), objectSpritePath(sprite));
    }
    const classId = sessionClassId(this);
    const { frameWidth, frameHeight } = assets.characters;
    for (const facing of FACINGS) {
      this.load.spritesheet(TextureKeys.character(classId, facing), characterSpritePath(classId, facing), {
        frameWidth,
        frameHeight,
      });
    }
  }

  create(): void {
    const classId = sessionClassId(this);
    const loaded = FACINGS.every((f) => this.textures.exists(TextureKeys.character(classId, f)));
    if (!loaded || !this.textures.exists(TextureKeys.tileset)) return;
    this.createCharacterAnimations(classId);
    this.scene.start('World', { mapId: content.world.startMap });
  }

  /** Cada direção é uma tira horizontal: "idle" e "walk" escolhem colunas dela. */
  private createCharacterAnimations(classId: string): void {
    const { frames, walkFrameRate } = assets.characters;
    for (const facing of FACINGS) {
      const key = TextureKeys.character(classId, facing);
      const at = (frame: number) => ({ key, frame });
      this.anims.create({ key: animKey(classId, 'idle', facing), frames: [at(frames.idle)] });
      this.anims.create({
        key: animKey(classId, 'walk', facing),
        frames: frames.walk.map(at),
        frameRate: walkFrameRate,
        repeat: -1,
      });
    }
  }
}
