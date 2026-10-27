import * as Phaser from 'phaser';
import { parseAsciiMap, toTileIndexGrid, type ParsedMap } from '@navor/shared';
import { content } from '../../content.ts';
import { TextureKeys, usesPlaceholderArt } from '../../assets/index.ts';
import { Player } from '../entities/Player.ts';
import { DirectionKeys } from '../systems/input.ts';
import { DebugOverlay } from '../ui/DebugOverlay.ts';
import { getSession, sessionClassId } from '../session.ts';

const MAP_ID = 'test-map';

/** Cena de teste da Fase 1: mapa feito à mão, personagem andando e colidindo. */
export class TestScene extends Phaser.Scene {
  private player!: Player;
  private keys!: DirectionKeys;
  private debug!: DebugOverlay;
  private map!: ParsedMap;

  constructor() {
    super('Test');
  }

  create(): void {
    const T = content.balance.tileSize;
    const asciiMap = content.maps[MAP_ID];
    if (!asciiMap) throw new Error(`Mapa "${MAP_ID}" não encontrado em content/maps`);
    this.map = parseAsciiMap(asciiMap, content.tiles);

    const tilemap = this.make.tilemap({ data: toTileIndexGrid(this.map), tileWidth: T, tileHeight: T });
    const tileset = tilemap.addTilesetImage(TextureKeys.tileset, TextureKeys.tileset, T, T, 0, 0);
    if (!tileset) throw new Error('Falha ao criar o tileset');
    const ground = tilemap.createLayer(0, tileset, 0, 0);
    if (!ground) throw new Error('Falha ao criar a camada do mapa');
    ground.setCollision(content.tiles.tiles.filter((t) => t.solid).map((t) => t.index));

    const worldW = this.map.width * T;
    const worldH = this.map.height * T;
    this.physics.world.setBounds(0, 0, worldW, worldH);

    const { spawn } = this.map;
    this.player = new Player(this, spawn.x * T + T / 2, spawn.y * T + T / 2, sessionClassId(this));
    this.physics.add.collider(this.player, ground);

    this.cameras.main.setBounds(0, 0, worldW, worldH);
    this.cameras.main.startFollow(this.player, true);
    this.cameras.main.setRoundPixels(true);

    this.keys = new DirectionKeys(this);
    this.debug = new DebugOverlay(this, this.player, this.map, T);
    this.addHud();
    this.exposeForTests();
  }

  update(): void {
    this.player.move(this.keys.read());
    // A profundidade segue o "pé" do personagem, pronto para objetos em pé (árvores, NPCs) nas próximas fases.
    this.player.setDepth(this.player.body.bottom);
    this.debug.update();
  }

  private addHud(): void {
    const { width, height } = this.scale;
    const style = { fontSize: '10px', color: '#e5e7eb', backgroundColor: '#000000aa', padding: { x: 3, y: 2 } };
    this.add
      .text(width - 4, height - 4, 'Setas/WASD: mover   F3: depuração', style)
      .setOrigin(1, 1)
      .setScrollFactor(0)
      .setDepth(1000);
    const session = getSession(this);
    const who =
      session?.mode === 'online'
        ? `${session.character.name} · nível ${session.character.level}`
        : 'Modo offline (nada é salvo)';
    this.add.text(4, height - 4, who, style).setOrigin(0, 1).setScrollFactor(0).setDepth(1000);
    if (usesPlaceholderArt(sessionClassId(this))) {
      this.add
        .text(width - 4, 4, 'ARTE PLACEHOLDER (PH)', { ...style, color: '#ff66ff' })
        .setOrigin(1, 0)
        .setScrollFactor(0)
        .setDepth(1000);
    }
  }

  /** Só com ?test na URL: expõe o estado para o teste de fumaça automatizado. */
  private exposeForTests(): void {
    if (!new URLSearchParams(window.location.search).has('test')) return;
    const T = content.balance.tileSize;
    (window as unknown as { __navor: unknown }).__navor = {
      ready: true,
      tileSize: T,
      spawn: this.map.spawn,
      player: () => ({
        x: this.player.body.center.x,
        y: this.player.body.center.y,
        facing: this.player.getFacing(),
        texture: this.player.texture.key,
      }),
      isSolidAt: (px: number, py: number) =>
        this.map.tiles[Math.floor(py / T)]?.[Math.floor(px / T)]?.solid ?? true,
      zoom: () => this.scale.zoom,
      debugEnabled: () => this.debug.isEnabled(),
      session: () => this.registry.get('session'),
    };
  }
}
