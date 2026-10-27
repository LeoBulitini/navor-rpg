import * as Phaser from 'phaser';
import {
  attackFor,
  createRng,
  defenseFor,
  exitAt,
  facingVector,
  generateCave,
  levelThresholds,
  pathOfClass,
  pathStatsFor,
  placeChests,
  placeDecor,
  placeMonsters,
  rollDamage,
  rollHit,
  statsForLevel,
  parseAsciiMap,
  placeResourceNodes,
  toTileIndexGrid,
  type AsciiMap,
  type GridPoint,
  type MapExit,
  type NodeContent,
  type ParsedMap,
  type PlacedObject,
  type BasicAttack,
  type CharacterStats,
  type Rng,
} from '@navor/shared';
import { content } from '../../content.ts';
import { itemTexture, TextureKeys, usesPlaceholderArt } from '../../assets/index.ts';
import { friendlyError } from '../../services/errors.ts';
import { getBackend, getInventory, getProgress, type ChestResult, type ExplorationRun, type KillResult } from '../backend.ts';
import { CombatHud, type Vitals } from '../ui/CombatHud.ts';
import { Monster } from '../entities/Monster.ts';
import { InventoryPanel } from '../ui/InventoryPanel.ts';
import { Player } from '../entities/Player.ts';
import { DirectionKeys } from '../systems/input.ts';
import { DebugOverlay } from '../ui/DebugOverlay.ts';
import { getSession, sessionClassId } from '../session.ts';

export interface WorldSceneData {
  mapId: string;
  /** Célula onde o jogador aparece; sem ela, usa o ponto de nascimento do mapa. */
  arriveAt?: GridPoint;
  /** Só para áreas geradas (Gruta, Floresta): a entrada que o servidor criou, com a seed e os pontos de coleta. */
  run?: ExplorationRun;
}

interface ResourceNode {
  content: NodeContent;
  cell: GridPoint;
  sprite: Phaser.GameObjects.Image;
  state: 'ready' | 'busy' | 'done';
}

interface Chest {
  index: number;
  cell: GridPoint;
  sprite: Phaser.GameObjects.Image;
  state: 'closed' | 'busy' | 'open';
}

/** O que está ao alcance da tecla E: um ponto de coleta ou um baú. */
type Interactable = { kind: 'node'; node: ResourceNode } | { kind: 'chest'; chest: Chest };

const FADE_MS = 250;
/** Depois de cair, quanto tempo a mensagem fica na tela antes de voltar para a cidade. */
const DEATH_DELAY_MS = 1800;
const THRESHOLDS = levelThresholds(content.progression.xpCurve, content.classes.maxLevel);
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
  private monsters: Monster[] = [];
  private monsterCells: GridPoint[] = [];
  /** bichos só de enfeite (Esquilos): fogem, mas não são alvo */
  private critters: Monster[] = [];
  private chests: Chest[] = [];
  private bolts!: Phaser.Physics.Arcade.Group;
  private stats!: CharacterStats;
  private vitals!: Vitals;
  private hud!: CombatHud;
  private firePressed = false;
  private lastShot = -Infinity;
  private invulnerableUntil = 0;
  private dead = false;
  private rng: Rng = createRng(crypto.getRandomValues(new Uint32Array(1))[0]!);

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
    this.setupCombat(ground, solids);
    this.keys = new DirectionKeys(this);
    this.collectPressed = false;
    this.firePressed = false;
    this.input.keyboard?.on('keydown-E', () => (this.collectPressed = true));
    this.input.keyboard?.on('keydown-SPACE', () => (this.firePressed = true));
    this.input.keyboard?.on('keydown-I', () => !this.leaving && this.inventoryPanel.toggle());
    this.debug = new DebugOverlay(this, this.player, this.map, T);
    this.addHud();
    this.inventoryPanel = new InventoryPanel(this, getInventory(this)!, getBackend(this).saves);
    this.exposeForTests();
  }

  update(time: number, delta: number): void {
    if (this.leaving) {
      for (const m of [...this.monsters, ...this.critters]) if (m.state === 'alive') m.setVelocity(0, 0);
      return;
    }
    this.player.move(this.keys.read());
    this.updateCombat(time, delta);
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

  /** Baús da entrada atual: quantos há veio do servidor; a posição sai da seed, no fundo da área. */
  private addChests(): void {
    this.chests = [];
    const area = content.procedural.areas.find((a) => a.id === this.map.id);
    if (!this.run || !area?.chests || this.seed === null || this.run.chests === 0) return;
    const T = this.map.tileSize;
    const avoid = [...this.nodes.map((n) => n.cell), ...this.monsterCells];
    const cells = placeChests(this.map, this.seed, this.run.chests, area.chests, avoid);
    this.chests = cells.map((cell, index) => ({
      index,
      cell,
      sprite: this.add.image(cell.x * T + T / 2, cell.y * T + T / 2, TextureKeys.effect('chest')).setDepth(cell.y * T + T - 4),
      state: 'closed' as const,
    }));
  }

  /** O ponto de coleta ou baú mais perto, dentro do alcance. */
  private nearestInteractable(): Interactable | undefined {
    const c = this.player.body.center;
    let best: Interactable | undefined;
    let bestDist = COLLECT_RANGE;
    const consider = (target: Interactable, sprite: Phaser.GameObjects.Image) => {
      const d = Phaser.Math.Distance.Between(c.x, c.y, sprite.x, sprite.y);
      if (d <= bestDist) {
        best = target;
        bestDist = d;
      }
    };
    for (const node of this.nodes) if (node.state !== 'done') consider({ kind: 'node', node }, node.sprite);
    for (const chest of this.chests) if (chest.state !== 'open') consider({ kind: 'chest', chest }, chest.sprite);
    return best;
  }

  private updateCollectPrompt(): void {
    const pressed = this.collectPressed;
    this.collectPressed = false;
    const target = this.nearestInteractable();
    this.promptText.setVisible(Boolean(target));
    if (!target) return;
    if (target.kind === 'chest') {
      const { chest } = target;
      this.promptText.setText(chest.state === 'busy' ? 'Abrindo...' : 'E: abrir o baú');
      if (chest.state === 'closed' && pressed) this.openChest(chest);
      return;
    }
    const { node } = target;
    const name = content.items.items.find((i) => i.id === node.content.itemId)?.name ?? node.content.itemId;
    this.promptText.setText(node.state === 'busy' ? 'Coletando...' : `E: coletar ${name}`);
    if (node.state === 'ready' && pressed) this.collect(node);
  }

  /** O servidor sorteia o conteúdo; o baú só aparece aberto depois da resposta. */
  private openChest(chest: Chest): void {
    chest.state = 'busy';
    const run = this.run!;
    getBackend(this)
      .openChest(run, chest.index)
      .then((result) => {
        if (this.run !== run) return;
        chest.state = 'open';
        chest.sprite.setTexture(TextureKeys.effect('chest-open'));
        this.applyChest(chest, result);
      })
      .catch((err: unknown) => {
        if (this.run !== run) return;
        chest.state = 'closed';
        this.showNotice(friendlyError(err));
      });
  }

  private applyChest(chest: Chest, r: ChestResult): void {
    getProgress(this).set({ ...getProgress(this).state, copper: r.copper, gold: r.gold });
    for (const d of r.drops) getInventory(this)!.set(d.itemId, d.total);
    if (!r.opened) return;
    const { x, y } = chest.sprite;
    const gains = [`+${r.copperGained} cobre`, ...(r.goldGained > 0 ? [`+${r.goldGained} ouro`] : [])];
    this.floatText(x, y - 14, gains.join('  '), r.goldGained > 0 ? '#fde047' : '#fde68a');
    r.drops.forEach((d, i) => {
      const def = content.items.items.find((it) => it.id === d.itemId);
      const color = content.rarities.rarities.find((rr) => rr.id === def?.rarity)?.color ?? '#e5e7eb';
      this.floatText(x, y - 26 - i * 12, `+${d.quantity} ${def?.name ?? d.itemId}`, color);
    });
    if (r.goldGained > 0) this.showNotice('Uma moeda de ouro!', '#fde047');
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

  private showNotice(message: string, color = '#fca5a5'): void {
    this.noticeText.setText(message).setColor(color).setVisible(true);
    this.noticeTimer?.remove();
    this.noticeTimer = this.time.delayedCall(3000, () => this.noticeText.setVisible(false));
  }

  /**
   * Vida e mana não são gravadas no servidor: na cidade enchem; entre mapas, seguem iguais.
   * Monstros só existem nas áreas geradas; a posição sai da seed e o tipo veio do servidor.
   * Os bichos de enfeite (Esquilos) saem só da seed e não entram no combate.
   */
  private setupCombat(ground: NonNullable<ReturnType<Phaser.Tilemaps.Tilemap['createLayer']>>, solids: Phaser.Physics.Arcade.StaticGroup): void {
    this.dead = false;
    this.lastShot = -Infinity;
    this.invulnerableUntil = 0;
    this.stats = this.currentStats();
    const saved = this.registry.get('vitals') as { hp: number; mana: number } | undefined;
    const inTown = this.run === null;
    this.vitals = {
      hp: inTown || !saved ? this.stats.maxHp : Math.min(saved.hp, this.stats.maxHp),
      maxHp: this.stats.maxHp,
      mana: inTown || !saved ? this.stats.maxMana : Math.min(saved.mana, this.stats.maxMana),
      maxMana: this.stats.maxMana,
    };

    this.bolts = this.physics.add.group({ allowGravity: false });
    this.physics.add.collider(this.bolts, ground, (bolt) => (bolt as Phaser.GameObjects.Image).destroy());
    this.physics.add.collider(this.bolts, solids, (bolt) => (bolt as Phaser.GameObjects.Image).destroy());

    this.monsters = [];
    this.monsterCells = [];
    this.critters = [];
    this.chests = [];
    const area = content.procedural.areas.find((a) => a.id === this.map.id);
    const defOf = (id: string) => content.creatures.creatures.find((c) => c.id === id)!;
    if (this.run && area?.creatures && this.seed !== null) {
      const avoid = this.nodes.map((n) => n.cell);
      const spawns = this.run.monsters;
      this.monsterCells = placeMonsters(this.map, this.seed, spawns.length, area.creatures, avoid, (i) => defOf(spawns[i]!.creatureId).placement === 'deep');
      this.monsters = spawns.map((m, i) => new Monster(this, m.index, defOf(m.creatureId), this.monsterCells[i]!));
      this.addChests();
      const taken = [...avoid, ...this.monsterCells, ...this.chests.map((ch) => ch.cell)];
      this.critters = placeDecor(this.map, this.seed, area.creatures, taken).map((d) => new Monster(this, -1, defOf(d.creatureId), d.cell));
      const critters = this.physics.add.group(this.critters);
      this.physics.add.collider(critters, ground);
      this.physics.add.collider(critters, solids);
      const group = this.physics.add.group(this.monsters);
      this.physics.add.collider(group, ground);
      this.physics.add.collider(group, solids);
      this.physics.add.collider(group, group);
      this.physics.add.overlap(this.bolts, group, (bolt, monster) => {
        const m = monster as Monster;
        if (m.state !== 'alive') return;
        (bolt as Phaser.GameObjects.Image).destroy();
        this.hitMonster(m);
      });
    }
    this.hud = new CombatHud(this);
  }

  /** Atributos do caminho da classe (Magia, Corpo a corpo, Distância) no nível atual. */
  private currentStats(): CharacterStats {
    const path = pathOfClass(content.classes, sessionClassId(this));
    const stats = statsForLevel(pathStatsFor(content.progression, path), getProgress(this).state.level);
    this.player.setSpeedTiles(stats.moveSpeedTilesPerSecond);
    return stats;
  }

  private basicAttack(): BasicAttack {
    return content.combat.basicAttacks[pathOfClass(content.classes, sessionClassId(this))]!;
  }

  private updateCombat(time: number, delta: number): void {
    const { combat } = content;
    this.vitals.mana = Math.min(this.vitals.maxMana, this.vitals.mana + (combat.manaRegenPerSecond * delta) / 1000);
    const fire = this.firePressed;
    this.firePressed = false;
    if (fire) this.shoot(time);

    const range = this.basicAttack().rangeTiles * this.map.tileSize;
    for (const obj of [...this.bolts.getChildren()]) {
      const bolt = obj as Phaser.Physics.Arcade.Image;
      const from = bolt.getData('from') as { x: number; y: number };
      // Confere o trecho percorrido desde o último quadro: com poucos FPS, um projétil rápido
      // pularia por cima do monstro e a sobreposição da física não o pegaria.
      const prev = (bolt.getData('prev') as { x: number; y: number } | undefined) ?? from;
      const path = new Phaser.Geom.Line(prev.x, prev.y, bolt.x, bolt.y);
      bolt.setData('prev', { x: bolt.x, y: bolt.y });
      const struck = this.monsters.find((m) => {
        if (m.state !== 'alive') return false;
        const b = m.body;
        return Phaser.Geom.Intersects.LineToRectangle(path, new Phaser.Geom.Rectangle(b.x - 4, b.y - 4, b.width + 8, b.height + 8));
      });
      if (struck) {
        bolt.destroy();
        this.hitMonster(struck);
      } else if (Phaser.Math.Distance.Between(from.x, from.y, bolt.x, bolt.y) > range) {
        bolt.destroy();
      }
    }

    const c = this.player.body.center;
    const noCrit = { critChance: 0, critDamage: 1 };
    for (const m of this.critters) m.think(time, { x: c.x, y: c.y });
    for (const m of this.monsters) {
      if (!m.think(time, { x: c.x, y: c.y })) continue;
      const { attack, damageType } = m.def.stats;
      this.hurtPlayer(rollDamage(attack, defenseFor(this.stats, damageType), noCrit, combat, this.rng).amount);
    }
    const level = getProgress(this).state.level;
    this.hud.draw(this.vitals, getProgress(this).state, [THRESHOLDS[level]!, THRESHOLDS[Math.min(level + 1, THRESHOLDS.length - 1)]!]);
  }

  /** Ataque básico da classe na direção em que o jogador está virado: projétil (Mago, Arqueiro) ou golpe (Guerreiro). */
  private shoot(time: number): void {
    const attack = this.basicAttack();
    if (time - this.lastShot < attack.cooldownMs) return;
    if (this.vitals.mana < attack.manaCost) {
      this.showNotice('Sem mana.');
      return;
    }
    this.lastShot = time;
    this.vitals.mana -= attack.manaCost;
    const c = this.player.body.center;
    const dir = facingVector(this.player.getFacing());
    const angle = Math.atan2(dir.vy, dir.vx);
    const T = this.map.tileSize;
    if (attack.kind === 'melee') {
      // Golpe em arco à frente: acerta todo monstro vivo dentro do alcance e do ângulo.
      const reach = attack.rangeTiles * T;
      const slash = this.add.image(c.x + dir.vx * T * 0.6, c.y + dir.vy * T * 0.6, TextureKeys.effect(attack.sprite));
      slash.setRotation(angle).setDepth(9000);
      this.tweens.add({ targets: slash, alpha: 0, duration: 180, onComplete: () => slash.destroy() });
      for (const m of this.monsters) {
        if (m.state !== 'alive') continue;
        const mc = m.body.center;
        const d = Phaser.Math.Distance.Between(c.x, c.y, mc.x, mc.y);
        const off = Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(mc.y - c.y, mc.x - c.x) - angle));
        if (d <= reach && (d < T * 0.5 || off <= Phaser.Math.DegToRad(attack.arcDegrees / 2))) this.hitMonster(m);
      }
      return;
    }
    const speed = attack.projectileSpeedTilesPerSecond * T;
    const bolt = this.bolts.create(c.x, c.y, TextureKeys.effect(attack.sprite)) as Phaser.Physics.Arcade.Image;
    bolt.setDepth(9000).setRotation(angle).setData('from', { x: c.x, y: c.y });
    bolt.body!.setCircle(4, bolt.width / 2 - 4, bolt.height / 2 - 4);
    bolt.setVelocity(dir.vx * speed, dir.vy * speed);
  }

  private hitMonster(m: Monster): void {
    const { combat } = content;
    if (!rollHit(this.stats.precision, combat, this.rng)) {
      this.floatText(m.x, m.y - 14, 'Errou', '#9ca3af');
      return;
    }
    const type = this.basicAttack().damageType;
    const hit = rollDamage(attackFor(this.stats, type), defenseFor(m.def.stats, type), this.stats, combat, this.rng);
    m.hp = Math.max(0, m.hp - hit.amount);
    m.flash();
    this.floatText(m.x, m.y - 14, `${hit.amount}${hit.crit ? '!' : ''}`, hit.crit ? '#fde047' : '#ffffff');
    if (m.hp === 0) this.killMonster(m);
  }

  /** O monstro cai na hora; XP, cobre e itens só entram quando o servidor confirma o abate. */
  private killMonster(m: Monster): void {
    m.state = 'dying';
    m.setVelocity(0, 0);
    m.body.enable = false;
    this.tweens.add({ targets: m, alpha: 0, duration: 400, onComplete: () => m.setVisible(false) });
    const run = this.run!;
    getBackend(this)
      .killMonster(run, m.index)
      .then((result) => {
        m.state = 'dead';
        if (this.run !== run) return;
        this.applyKill(m, result);
      })
      .catch((err: unknown) => {
        m.state = 'dead';
        if (this.run === run) this.showNotice(friendlyError(err));
      });
  }

  private applyKill(m: Monster, r: KillResult): void {
    getProgress(this).set({ ...getProgress(this).state, level: r.level, xp: r.xp, copper: r.copper });
    for (const d of r.drops) getInventory(this)!.set(d.itemId, d.total);
    if (!r.killed) return;
    const gains = [`+${r.xpGained} XP`, ...(r.copperGained > 0 ? [`+${r.copperGained} cobre`] : [])];
    this.floatText(m.x, m.y - 14, gains.join('  '), '#fde68a');
    r.drops.forEach((d, i) => {
      const def = content.items.items.find((it) => it.id === d.itemId);
      const color = content.rarities.rarities.find((x) => x.id === def?.rarity)?.color ?? '#e5e7eb';
      this.floatText(m.x, m.y - 26 - i * 12, `+${d.quantity} ${def?.name ?? d.itemId}`, color);
    });
    if (r.leveledUp) {
      // Subir de nível recalcula os atributos e enche vida e mana.
      this.stats = this.currentStats();
      this.vitals = { hp: this.stats.maxHp, maxHp: this.stats.maxHp, mana: this.stats.maxMana, maxMana: this.stats.maxMana };
      this.showNotice(`Subiu para o nível ${r.level}!`, '#fde047');
    }
  }

  /** `force` ignora a invulnerabilidade (gancho de teste). */
  private hurtPlayer(amount: number, force = false): void {
    if (this.dead || this.leaving) return;
    const now = this.time.now;
    if (!force && now < this.invulnerableUntil) return;
    this.invulnerableUntil = now + content.combat.invulnerableAfterHitMs;
    this.vitals.hp = Math.max(0, this.vitals.hp - amount);
    this.player.flash();
    this.floatText(this.player.x, this.player.y - 18, `-${amount}`, '#f87171');
    if (this.vitals.hp === 0) this.die();
  }

  /**
   * Morte (decisão provisória): a entrada é encerrada no servidor e o jogador volta à cidade com
   * vida e mana cheias. Não perde itens nem XP; o que ainda não foi coletado na Gruta se perde.
   */
  private die(): void {
    this.dead = true;
    this.leaving = true;
    this.player.setVelocity(0, 0);
    this.promptText.setVisible(false);
    this.registry.remove('vitals');
    this.showNotice('Você foi derrotado. Voltando para a cidade...');
    const run = this.run;
    const ended = run ? getBackend(this).endExploration(run).catch(() => undefined) : Promise.resolve();
    this.time.delayedCall(DEATH_DELAY_MS, () => {
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        void ended.then(() => this.scene.restart({ mapId: content.world.startMap } satisfies WorldSceneData));
      });
      this.cameras.main.fadeOut(FADE_MS);
    });
  }

  private floatText(x: number, y: number, message: string, color: string): void {
    const text = this.add
      .text(x, y, message, { fontSize: '10px', color, stroke: '#000000', strokeThickness: 3 })
      .setOrigin(0.5, 1)
      .setDepth(9500);
    this.tweens.add({ targets: text, y: y - 18, alpha: 0, duration: 1000, onComplete: () => text.destroy() });
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
    this.registry.set('vitals', { hp: this.vitals.hp, mana: this.vitals.mana });
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
      .text(width - 4, 4, 'Setas/WASD: mover   Espaço: atacar   E: coletar/abrir   I: inventário   F3: depuração', style)
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(10000);
    const session = getSession(this);
    const who = session?.mode === 'online' ? session.character.name : 'Modo offline (nada é salvo)';
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
      monsters: () =>
        this.monsters.map((m) => ({
          index: m.index,
          creatureId: m.def.id,
          x: m.body.center.x,
          y: m.body.center.y,
          cell: { x: Math.floor(m.body.center.x / T), y: Math.floor(m.body.center.y / T) },
          hp: m.hp,
          state: m.state,
          intent: m.intent,
          alpha: m.alpha,
        })),
      critters: () => this.critters.map((m) => ({ creatureId: m.def.id, x: m.body.center.x, y: m.body.center.y, intent: m.intent })),
      chests: () => this.chests.map((ch) => ({ index: ch.index, x: ch.cell.x, y: ch.cell.y, state: ch.state })),
      vitals: () => ({ ...this.vitals }),
      stats: () => ({ ...this.stats }),
      progress: () => ({ ...getProgress(this).state }),
      bolts: () => this.bolts.countActive(),
      dead: () => this.dead,
      /** Dano direto no jogador (para testar a morte sem esperar os monstros). */
      hurtPlayer: (amount: number) => this.hurtPlayer(amount, true),
      /** Enche a vida (para testes que não devem depender dos golpes dos monstros). */
      heal: () => (this.vitals.hp = this.vitals.maxHp),
      zoom: () => this.scale.zoom,
      debugEnabled: () => this.debug.isEnabled(),
      session: () => this.registry.get('session'),
    };
  }
}
