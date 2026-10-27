import * as Phaser from 'phaser';
import { FACINGS, type Facing } from '@navor/shared';
import {
  assets,
  characterSpritePath,
  creatureSpritePath,
  effectSpritePath,
  itemIconPath,
  itemIcons,
  objectSpritePath,
  TextureKeys,
} from '../../assets/index.ts';
import { creatureAnimKey } from '../entities/Monster.ts';
import { friendlyError } from '../../services/errors.ts';
import { getBackend, Inventory } from '../backend.ts';
import { content } from '../../content.ts';
import { sessionClassId } from '../session.ts';

export const animKey = (classId: string, state: 'idle' | 'walk', facing: Facing) => `${classId}-${state}-${facing}`;

export class PreloadScene extends Phaser.Scene {
  private label!: Phaser.GameObjects.Text;

  constructor() {
    super('Preload');
  }

  preload(): void {
    const { width, height } = this.scale;
    const label = this.add.text(width / 2, height / 2, 'Carregando...', { fontSize: '12px', color: '#e5e7eb' });
    label.setOrigin(0.5);
    this.label = label;

    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      label.setText(`Erro ao carregar "${file.key}" (${file.url}).`);
      label.setColor('#fca5a5');
    });

    this.load.image(TextureKeys.tileset, assets.tileset.path);
    for (const sprite of new Set(content.objects.objects.map((o) => o.sprite))) {
      this.load.image(TextureKeys.object(sprite), objectSpritePath(sprite));
    }
    for (const icon of itemIcons()) this.load.image(TextureKeys.item(icon), itemIconPath(icon));
    const { frameWidth: cw, frameHeight: ch } = assets.creatures;
    for (const sprite of new Set(content.creatures.creatures.map((c) => c.sprite))) {
      this.load.spritesheet(TextureKeys.creature(sprite), creatureSpritePath(sprite), { frameWidth: cw, frameHeight: ch });
    }
    const bolt = content.combat.basicAttack.sprite;
    this.load.image(TextureKeys.effect(bolt), effectSpritePath(bolt));
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
    this.createCreatureAnimations();
    const label = this.label.setText('Carregando inventário...');
    getBackend(this)
      .loadInventory()
      .then((counts) => {
        this.registry.set('inventory', new Inventory(counts));
        this.scene.start('World', { mapId: content.world.startMap });
      })
      .catch((err: unknown) => {
        label.setText(`Não foi possível carregar o inventário.\n${friendlyError(err)}\nRecarregue a página.`).setColor('#fca5a5').setAlign('center');
      });
  }

  /** Quadro 0 parado; os demais quadros da tira formam o andar. */
  private createCreatureAnimations(): void {
    for (const sprite of new Set(content.creatures.creatures.map((c) => c.sprite))) {
      const key = TextureKeys.creature(sprite);
      const frames = this.textures.get(key).frameTotal - 1; // frameTotal inclui o quadro __BASE
      this.anims.create({ key: creatureAnimKey(sprite, 'idle'), frames: [{ key, frame: 0 }] });
      this.anims.create({
        key: creatureAnimKey(sprite, 'walk'),
        frames: this.anims.generateFrameNumbers(key, { start: 0, end: Math.max(0, frames - 1) }),
        frameRate: assets.creatures.walkFrameRate,
        repeat: -1,
      });
    }
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
