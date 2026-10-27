import * as Phaser from 'phaser';
import { exitAt, generateCave, parseAsciiMap, toTileIndexGrid, type AsciiMap, type GridPoint, type MapExit, type ParsedMap, type PlacedObject } from '@navor/shared';
import { content } from '../../content.ts';
import { TextureKeys, usesPlaceholderArt } from '../../assets/index.ts';
import { Player } from '../entities/Player.ts';
import { DirectionKeys } from '../systems/input.ts';
import { DebugOverlay } from '../ui/DebugOverlay.ts';
import { getSession, sessionClassId } from '../session.ts';

export interface WorldSceneData {
  mapId: string;
  /** Célula onde o jogador aparece; sem ela, usa o ponto de nascimento do mapa. */
  arriveAt?: GridPoint;
  /** Só para áreas geradas (Gruta): sem seed, sorteia uma nova a cada entrada. */
  seed?: number;
}

const FADE_MS = 250;

/** Qualquer mapa de content/maps: chão, objetos com colisão, portas e saídas para outros mapas. */
export class WorldScene extends Phaser.Scene {
  private player!: Player;
  private keys!: DirectionKeys;
  private debug!: DebugOverlay;
  private map!: ParsedMap;
  private doorText!: Phaser.GameObjects.Text;
  private leaving = false;
  private seed: number | null = null;

  constructor() {
    super('World');
  }

  create(data: WorldSceneData): void {
    const T = content.balance.tileSize;
    this.map = parseAsciiMap(this.resolveMap(data), content.tiles, content.objects, T);
    this.leaving = false;

    const tilemap = this.make.tilemap({ data: toTileIndexGrid(this.map, content.tiles), tileWidth: T, tileHeight: T });
    const tileset = tilemap.addTilesetImage(TextureKeys.tileset, TextureKeys.tileset, T, T, 0, 0);
    if (!tileset) throw new Error('Falha ao criar o tileset');
    const ground = tilemap.createLayer(0, tileset, 0, 0);
    if (!ground) throw new Error('Falha ao criar a camada do mapa');
    ground.setCollision(content.tiles.tiles.filter((t) => t.solid).map((t) => t.index));

    const worldW = this.map.width * T;
    const worldH = this.map.height * T;
    this.physics.world.setBounds(0, 0, worldW, worldH);

    const solids = this.physics.add.staticGroup();
    for (const obj of this.map.objects) this.addObject(obj, solids);

    const start = data.arriveAt ?? this.map.spawn;
    this.player = new Player(this, start.x * T + T / 2, start.y * T + T / 2, sessionClassId(this));
    this.physics.add.collider(this.player, ground);
    this.physics.add.collider(this.player, solids);

    this.cameras.main.setBounds(0, 0, worldW, worldH);
    this.cameras.main.startFollow(this.player, true);
    this.cameras.main.setRoundPixels(true);
    this.cameras.main.fadeIn(FADE_MS);

    this.keys = new DirectionKeys(this);
    this.debug = new DebugOverlay(this, this.player, this.map, T);
    this.addHud();
    this.exposeForTests();
  }

  update(): void {
    if (this.leaving) return;
    this.player.move(this.keys.read());
    // A profundidade segue o "pé": o jogador passa atrás de telhados e copas e na frente das bases.
    this.player.setDepth(this.player.body.bottom);
    this.updateDoorMessage();
    const exit = exitAt(this.map, this.playerCell());
    if (exit) this.leaveThrough(exit);
    this.debug.update();
  }

  /**
   * Mapa fixo de content/maps, ou área gerada de content/procedural.json. A área é gerada uma vez,
   * ao entrar, e não muda até o jogador sair (GDD 7.3).
   */
  private resolveMap(data: WorldSceneData): AsciiMap {
    this.seed = null;
    const fixed = content.maps[data.mapId];
    if (fixed) return fixed;
    const area = content.procedural.areas.find((a) => a.id === data.mapId);
    if (!area) throw new Error(`Mapa "${data.mapId}" não existe em content/maps nem em procedural.json`);
    const urlSeed = new URLSearchParams(window.location.search).get('seed');
    const requested = data.seed ?? (urlSeed !== null ? Number(urlSeed) >>> 0 : crypto.getRandomValues(new Uint32Array(1))[0]!);
    const cave = generateCave(area, content.tiles, requested);
    this.seed = cave.seed;
    return cave.map;
  }

  private addObject(obj: PlacedObject, solids: Phaser.Physics.Arcade.StaticGroup): void {
    const base = obj.collider.y + obj.collider.h;
    this.add.image(obj.x, obj.y, TextureKeys.object(obj.def.sprite)).setOrigin(0, 0).setDepth(base);
    const c = obj.collider;
    const zone = this.add.zone(c.x + c.w / 2, c.y + c.h / 2, c.w, c.h);
    solids.add(zone);
  }

  private playerCell(): GridPoint {
    const T = this.map.tileSize;
    const b = this.player.body;
    return { x: Math.floor(b.center.x / T), y: Math.floor(b.center.y / T) };
  }

  /** Mostra o aviso da porta enquanto os pés do jogador estão na frente dela. */
  private updateDoorMessage(): void {
    const b = this.player.body;
    const door = this.map.objects.find(
      (o) => o.door && b.right > o.door.x && b.x < o.door.x + o.door.w && b.bottom > o.door.y && b.y < o.door.y + o.door.h,
    )?.door;
    this.doorText.setVisible(Boolean(door));
    if (door) this.doorText.setText(door.message);
  }

  private leaveThrough(exit: MapExit): void {
    this.leaving = true;
    this.player.setVelocity(0, 0);
    this.cameras.main.fadeOut(FADE_MS);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.restart({ mapId: exit.to, arriveAt: exit.arriveAt } satisfies WorldSceneData);
    });
  }

  private addHud(): void {
    const { width, height } = this.scale;
    const style = { fontSize: '10px', color: '#e5e7eb', backgroundColor: '#000000aa', padding: { x: 3, y: 2 } };
    this.add
      .text(width - 4, height - 4, 'Setas/WASD: mover   F3: depuração', style)
      .setOrigin(1, 1)
      .setScrollFactor(0)
      .setDepth(10000);
    const session = getSession(this);
    const who =
      session?.mode === 'online'
        ? `${session.character.name} · nível ${session.character.level}`
        : 'Modo offline (nada é salvo)';
    const place = this.seed === null ? this.map.name : `${this.map.name} (seed ${this.seed})`;
    this.add.text(4, height - 4, `${who} · ${place}`, style).setOrigin(0, 1).setScrollFactor(0).setDepth(10000);
    this.doorText = this.add
      .text(width / 2, height - 28, '', { ...style, fontSize: '12px', color: '#fde68a' })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(10000)
      .setVisible(false);
    if (usesPlaceholderArt(sessionClassId(this))) {
      this.add
        .text(width - 4, 4, 'ARTE PLACEHOLDER (PH)', { ...style, color: '#ff66ff' })
        .setOrigin(1, 0)
        .setScrollFactor(0)
        .setDepth(10000);
    }
  }

  /** Só com ?test na URL: expõe o estado para o teste de fumaça automatizado. */
  private exposeForTests(): void {
    if (!new URLSearchParams(window.location.search).has('test')) return;
    const T = this.map.tileSize;
    (window as unknown as { __navor: unknown }).__navor = {
      ready: true,
      mapId: this.map.id,
      seed: this.seed,
      rows: this.map.tiles.map((row) => row.map((t) => t.id).join(',')),
      tileSize: T,
      spawn: this.map.spawn,
      exits: this.map.exits,
      doors: this.map.objects.filter((o) => o.door).map((o) => ({ id: o.def.id, ...o.door })),
      player: () => ({
        x: this.player.body.center.x,
        y: this.player.body.center.y,
        bottom: this.player.body.bottom,
        facing: this.player.getFacing(),
        texture: this.player.texture.key,
      }),
      /** Coloca o jogador numa célula (para testar pontos distantes do mapa sem andar até lá). */
      teleport: (x: number, y: number) => this.player.body.reset(x * T + T / 2, y * T + T / 2),
      isBlockedAt: (px: number, py: number) => this.map.blocked[Math.floor(py / T)]?.[Math.floor(px / T)] ?? true,
      doorMessage: () => (this.doorText.visible ? this.doorText.text : null),
      zoom: () => this.scale.zoom,
      debugEnabled: () => this.debug.isEnabled(),
      session: () => this.registry.get('session'),
    };
  }
}
