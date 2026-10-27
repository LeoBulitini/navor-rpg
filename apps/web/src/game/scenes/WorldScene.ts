import * as Phaser from 'phaser';
import {
  exitAt,
  generateCave,
  parseAsciiMap,
  placeResourceNodes,
  toTileIndexGrid,
  type AsciiMap,
  type GridPoint,
  type MapExit,
  type NodeContent,
  type ParsedMap,
  type PlacedObject,
} from '@navor/shared';
import { content } from '../../content.ts';
import { itemTexture, TextureKeys, usesPlaceholderArt } from '../../assets/index.ts';
import { friendlyError } from '../../services/errors.ts';
import { getBackend, getInventory, type ExplorationRun } from '../backend.ts';
import { InventoryPanel } from '../ui/InventoryPanel.ts';
import { Player } from '../entities/Player.ts';
import { DirectionKeys } from '../systems/input.ts';
import { DebugOverlay } from '../ui/DebugOverlay.ts';
import { getSession, sessionClassId } from '../session.ts';

export interface WorldSceneData {
  mapId: string;
  /** Célula onde o jogador aparece; sem ela, usa o ponto de nascimento do mapa. */
  arriveAt?: GridPoint;
  /** Só para áreas geradas (Gruta): a entrada que o servidor criou, com a seed e os pontos de coleta. */
  run?: ExplorationRun;
}

interface ResourceNode {
  content: NodeContent;
  cell: GridPoint;
  sprite: Phaser.GameObjects.Image;
  state: 'ready' | 'busy' | 'done';
}

const FADE_MS = 250;
/** Distância (em pixels, do centro do jogador ao centro do ponto) para poder coletar. */
const COLLECT_RANGE = 40;

/** Qualquer mapa de content/maps: chão, objetos com colisão, portas e saídas para outros mapas. */
export class WorldScene extends Phaser.Scene {
  private player!: Player;
  private keys!: DirectionKeys;
  private debug!: DebugOverlay;
  private map!: ParsedMap;
  private doorText!: Phaser.GameObjects.Text;
  private leaving = false;
  private seed: number | null = null;
  private run: ExplorationRun | null = null;
  private nodes: ResourceNode[] = [];
  private promptText!: Phaser.GameObjects.Text;
  private noticeText!: Phaser.GameObjects.Text;
  private noticeTimer?: Phaser.Time.TimerEvent;
  private inventoryPanel!: InventoryPanel;
  /** E apertado desde o último quadro (evento, para não perder um toque rápido) */
  private collectPressed = false;
  /** Saída que falhou (ex.: servidor fora do ar): só volta a valer depois que o jogador sai dela. */
  private heldExit: MapExit | null = null;

  constructor() {
    super('World');
  }

  create(data: WorldSceneData): void {
    const T = content.balance.tileSize;
    this.map = parseAsciiMap(this.resolveMap(data), content.tiles, content.objects, T);
    this.leaving = false;
    this.heldExit = null;

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

    this.addResourceNodes();
    this.keys = new DirectionKeys(this);
    this.collectPressed = false;
    this.input.keyboard?.on('keydown-E', () => (this.collectPressed = true));
    this.input.keyboard?.on('keydown-I', () => !this.leaving && this.inventoryPanel.toggle());
    this.debug = new DebugOverlay(this, this.player, this.map, T);
    this.addHud();
    this.inventoryPanel = new InventoryPanel(this, getInventory(this)!, getBackend(this).saves);
    this.exposeForTests();
  }

  update(): void {
    if (this.leaving) return;
    this.player.move(this.keys.read());
    // A profundidade segue o "pé": o jogador passa atrás de telhados e copas e na frente das bases.
    this.player.setDepth(this.player.body.bottom);
    this.updateDoorMessage();
    this.updateCollectPrompt();
    const exit = exitAt(this.map, this.playerCell());
    if (exit !== this.heldExit) this.heldExit = null;
    if (exit && !this.heldExit) this.leaveThrough(exit);
    this.debug.update();
  }

  /**
   * Mapa fixo de content/maps, ou área gerada de content/procedural.json a partir da seed que o
   * servidor deu ao entrar. A área não muda até o jogador sair (GDD 7.3).
   */
  private resolveMap(data: WorldSceneData): AsciiMap {
    this.seed = null;
    this.run = null;
    const fixed = content.maps[data.mapId];
    if (fixed) return fixed;
    const area = content.procedural.areas.find((a) => a.id === data.mapId);
    if (!area) throw new Error(`Mapa "${data.mapId}" não existe em content/maps nem em procedural.json`);
    if (!data.run) throw new Error(`Área "${data.mapId}" precisa de uma entrada criada pelo servidor`);
    const cave = generateCave(area, content.tiles, data.run.seed);
    this.seed = cave.seed;
    this.run = data.run;
    return cave.map;
  }

  /** Pontos de coleta da entrada atual: o conteúdo veio do servidor, a posição sai da seed. */
  private addResourceNodes(): void {
    this.nodes = [];
    const area = content.procedural.areas.find((a) => a.id === this.map.id);
    if (!this.run || !area?.resources || this.seed === null) return;
    const T = this.map.tileSize;
    const cells = placeResourceNodes(this.map, this.seed, this.run.nodes.length, area.resources);
    this.nodes = this.run.nodes.map((node, i) => {
      const cell = cells[i]!;
      const sprite = this.add.image(cell.x * T + T / 2, cell.y * T + T / 2, itemTexture(node.itemId)).setDepth(cell.y * T + T - 4);
      return { content: node, cell, sprite, state: 'ready' as const };
    });
  }

  private nearestNode(): ResourceNode | undefined {
    const c = this.player.body.center;
    let best: ResourceNode | undefined;
    let bestDist = COLLECT_RANGE;
    for (const n of this.nodes) {
      if (n.state === 'done') continue;
      const d = Phaser.Math.Distance.Between(c.x, c.y, n.sprite.x, n.sprite.y);
      if (d <= bestDist) {
        best = n;
        bestDist = d;
      }
    }
    return best;
  }

  private updateCollectPrompt(): void {
    const pressed = this.collectPressed;
    this.collectPressed = false;
    const node = this.nearestNode();
    this.promptText.setVisible(Boolean(node));
    if (!node) return;
    const name = content.items.items.find((i) => i.id === node.content.itemId)?.name ?? node.content.itemId;
    this.promptText.setText(node.state === 'busy' ? 'Coletando...' : `E: coletar ${name}`);
    if (node?.state === 'ready' && pressed) this.collect(node);
  }

  /** O servidor confere e grava; o ponto só some depois da resposta. */
  private collect(node: ResourceNode): void {
    node.state = 'busy';
    const run = this.run!;
    getBackend(this)
      .collect(run, node.content.index)
      .then((result) => {
        if (this.run !== run) return; // o jogador já saiu desta entrada
        node.state = 'done';
        node.sprite.destroy();
        getInventory(this)!.set(result.itemId, result.total);
        if (result.collected) this.floatGain(node, result.itemId, result.quantity);
      })
      .catch((err: unknown) => {
        if (this.run !== run) return;
        node.state = 'ready';
        this.showNotice(friendlyError(err));
      });
  }

  private floatGain(node: ResourceNode, itemId: string, quantity: number): void {
    const def = content.items.items.find((i) => i.id === itemId);
    const color = content.rarities.rarities.find((r) => r.id === def?.rarity)?.color ?? '#e5e7eb';
    const text = this.add
      .text(node.sprite.x, node.sprite.y - 12, `+${quantity} ${def?.name ?? itemId}`, { fontSize: '10px', color, stroke: '#000000', strokeThickness: 3 })
      .setOrigin(0.5, 1)
      .setDepth(9000);
    this.tweens.add({ targets: text, y: text.y - 18, alpha: 0, duration: 1200, onComplete: () => text.destroy() });
  }

  private showNotice(message: string): void {
    this.noticeText.setText(message).setVisible(true);
    this.noticeTimer?.remove();
    this.noticeTimer = this.time.delayedCall(3000, () => this.noticeText.setVisible(false));
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

  /** Para entrar numa área gerada, o servidor cria a entrada (seed e pontos) durante o escurecer. */
  private leaveThrough(exit: MapExit): void {
    this.leaving = true;
    this.player.setVelocity(0, 0);
    this.promptText.setVisible(false);
    const generated = content.procedural.areas.some((a) => a.id === exit.to);
    const run: Promise<ExplorationRun | undefined> = generated ? getBackend(this).startExploration(exit.to) : Promise.resolve(undefined);
    const faded = new Promise<void>((resolve) => {
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => resolve());
      this.cameras.main.fadeOut(FADE_MS);
    });
    Promise.all([run, faded]).then(
      ([started]) => this.scene.restart({ mapId: exit.to, arriveAt: exit.arriveAt, run: started } satisfies WorldSceneData),
      (err: unknown) => {
        // Não deu para entrar: volta a imagem e espera o jogador sair da passagem para tentar de novo.
        void faded.then(() => {
          this.cameras.main.fadeIn(FADE_MS);
          this.heldExit = exit;
          this.leaving = false;
          this.showNotice(`Não foi possível entrar: ${friendlyError(err)}`);
        });
      },
    );
  }

  private addHud(): void {
    const { width, height } = this.scale;
    const style = { fontSize: '10px', color: '#e5e7eb', backgroundColor: '#000000aa', padding: { x: 3, y: 2 } };
    this.add
      .text(width - 4, 4, 'Setas/WASD: mover   E: coletar   I: inventário   F3: depuração', style)
      .setOrigin(1, 0)
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
    this.promptText = this.add
      .text(width / 2, height - 28, '', { ...style, fontSize: '12px', color: '#a7f3d0' })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(10000)
      .setVisible(false);
    this.noticeText = this.add
      .text(width / 2, height - 48, '', { ...style, fontSize: '12px', color: '#fca5a5' })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(10000)
      .setVisible(false);
    if (usesPlaceholderArt(sessionClassId(this))) {
      this.add
        .text(width - 4, 20, 'ARTE PLACEHOLDER (PH)', { ...style, color: '#ff66ff' })
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
      runId: this.run?.id ?? null,
      nodes: () =>
        this.nodes.map((n) => ({ index: n.content.index, x: n.cell.x, y: n.cell.y, itemId: n.content.itemId, quantity: n.content.quantity, state: n.state })),
      collectPrompt: () => (this.promptText.visible ? this.promptText.text : null),
      notice: () => (this.noticeText.visible ? this.noticeText.text : null),
      inventory: () => Object.fromEntries(getInventory(this)!.entries()),
      inventoryOpen: () => this.inventoryPanel.isOpen(),
      zoom: () => this.scale.zoom,
      debugEnabled: () => this.debug.isEnabled(),
      session: () => this.registry.get('session'),
    };
  }
}
