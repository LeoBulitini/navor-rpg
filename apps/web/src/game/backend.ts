import * as Phaser from 'phaser';
import {
  createRng,
  creatureById,
  levelForXp,
  levelThresholds,
  rollKillRewards,
  rollMonsters,
  rollResourceNodes,
  type MonsterSpawn,
  type NodeContent,
} from '@navor/shared';
import { content } from '../content.ts';
import type { PlaySession } from '../menu/menu.ts';
import { collectNode, endExploration, killMonster, listInventory, startExploration } from '../services/exploration.ts';

/** Uma entrada numa área gerada: a seed do mapa, o que cada ponto de coleta dá e quais monstros há. */
export interface ExplorationRun {
  /** id no servidor; null no modo offline */
  id: string | null;
  areaId: string;
  seed: number;
  nodes: NodeContent[];
  monsters: MonsterSpawn[];
}

export interface CollectResult {
  itemId: string;
  quantity: number;
  collected: boolean;
  total: number;
}

export interface KillResult {
  killed: boolean;
  creatureId: string;
  xpGained: number;
  xp: number;
  level: number;
  leveledUp: boolean;
  copperGained: number;
  copper: number;
  drops: { itemId: string; quantity: number; total: number }[];
}

/** XP, nível e cobre do personagem, como o servidor gravou. */
export interface ProgressState {
  level: number;
  xp: number;
  copper: number;
}

/**
 * O que o jogo pede ao "servidor". Online, cada chamada vai ao Supabase, que decide e grava.
 * Offline, a mesma regra roda no navegador e nada é salvo.
 */
export interface GameBackend {
  readonly saves: boolean;
  startExploration(areaId: string): Promise<ExplorationRun>;
  collect(run: ExplorationRun, nodeIndex: number): Promise<CollectResult>;
  killMonster(run: ExplorationRun, monsterIndex: number): Promise<KillResult>;
  /** Morte: encerra a entrada no servidor. */
  endExploration(run: ExplorationRun): Promise<void>;
  loadInventory(): Promise<Map<string, number>>;
}

class OnlineBackend implements GameBackend {
  readonly saves = true;
  constructor(private readonly characterId: string) {}

  async startExploration(areaId: string): Promise<ExplorationRun> {
    const r = await startExploration(this.characterId, areaId);
    return {
      id: r.exploration_id,
      areaId,
      seed: Number(r.seed),
      nodes: r.nodes.map((n) => ({ index: n.index, itemId: n.item_id, quantity: n.quantity })),
      monsters: (r.monsters ?? []).map((m) => ({ index: m.index, creatureId: m.creature_id })),
    };
  }

  async collect(run: ExplorationRun, nodeIndex: number): Promise<CollectResult> {
    const r = await collectNode(run.id!, nodeIndex);
    return { itemId: r.item_id, quantity: r.quantity, collected: r.collected, total: Number(r.total) };
  }

  async killMonster(run: ExplorationRun, monsterIndex: number): Promise<KillResult> {
    const r = await killMonster(run.id!, monsterIndex);
    return {
      killed: r.killed,
      creatureId: r.creature_id,
      xpGained: r.xp_gained,
      xp: Number(r.xp),
      level: r.level,
      leveledUp: r.leveled_up,
      copperGained: r.copper_gained,
      copper: Number(r.copper),
      drops: (r.drops ?? []).map((d) => ({ itemId: d.item_id, quantity: d.quantity, total: Number(d.total) })),
    };
  }

  async endExploration(run: ExplorationRun): Promise<void> {
    await endExploration(run.id!);
  }

  async loadInventory(): Promise<Map<string, number>> {
    const rows = await listInventory(this.characterId);
    return new Map(rows.map((r) => [r.item_id, Number(r.quantity)]));
  }
}

class OfflineBackend implements GameBackend {
  readonly saves = false;
  private readonly inventory = new Map<string, number>();
  private readonly collected = new Set<string>();
  private readonly killed = new Set<string>();
  private readonly progress: ProgressState = { level: 0, xp: 0, copper: 0 };
  private readonly thresholds = levelThresholds(content.progression.xpCurve, content.classes.maxLevel);
  private readonly rng = createRng(crypto.getRandomValues(new Uint32Array(1))[0]!);
  private runs = 0;

  async startExploration(areaId: string): Promise<ExplorationRun> {
    const area = content.procedural.areas.find((a) => a.id === areaId);
    if (!area) throw new Error(`Área desconhecida: ${areaId}`);
    // ?seed=N fixa o mapa (para testes); sem ela, uma seed nova a cada entrada
    const urlSeed = new URLSearchParams(window.location.search).get('seed');
    const seed = urlSeed !== null ? Number(urlSeed) >>> 0 : crypto.getRandomValues(new Uint32Array(1))[0]!;
    const rng = createRng(seed);
    const nodes = area.resources ? rollResourceNodes(area.resources, content.items, rng) : [];
    const monsters = area.creatures ? rollMonsters(area.creatures, rng) : [];
    this.runs++;
    return { id: `offline-${this.runs}`, areaId, seed, nodes, monsters };
  }

  async collect(run: ExplorationRun, nodeIndex: number): Promise<CollectResult> {
    const node = run.nodes[nodeIndex];
    if (!node) throw new Error('Ponto de coleta inválido');
    const key = `${run.id}:${nodeIndex}`;
    const collected = !this.collected.has(key);
    if (collected) {
      this.collected.add(key);
      this.inventory.set(node.itemId, (this.inventory.get(node.itemId) ?? 0) + node.quantity);
    }
    return { itemId: node.itemId, quantity: node.quantity, collected, total: this.inventory.get(node.itemId) ?? 0 };
  }

  async killMonster(run: ExplorationRun, monsterIndex: number): Promise<KillResult> {
    const monster = run.monsters[monsterIndex];
    if (!monster) throw new Error('Monstro inválido');
    const key = `${run.id}:${monsterIndex}`;
    const p = this.progress;
    if (this.killed.has(key)) {
      return { killed: false, creatureId: monster.creatureId, xpGained: 0, xp: p.xp, level: p.level, leveledUp: false, copperGained: 0, copper: p.copper, drops: [] };
    }
    this.killed.add(key);
    const reward = rollKillRewards(creatureById(content.creatures, monster.creatureId), this.rng);
    const before = p.level;
    p.xp += reward.xp;
    p.level = levelForXp(p.xp, this.thresholds);
    p.copper += reward.copper;
    const drops = reward.drops.map((d) => {
      const total = (this.inventory.get(d.itemId) ?? 0) + d.quantity;
      this.inventory.set(d.itemId, total);
      return { ...d, total };
    });
    return { killed: true, creatureId: monster.creatureId, xpGained: reward.xp, xp: p.xp, level: p.level, leveledUp: p.level > before, copperGained: reward.copper, copper: p.copper, drops };
  }

  async endExploration(): Promise<void> {}

  async loadInventory(): Promise<Map<string, number>> {
    return new Map(this.inventory);
  }
}

export function createBackend(session: PlaySession): GameBackend {
  return session.mode === 'online' ? new OnlineBackend(session.character.id) : new OfflineBackend();
}

export const getBackend = (scene: Phaser.Scene): GameBackend => scene.registry.get('backend') as GameBackend;

/** Inventário em memória, sempre igual ao último valor que o servidor devolveu. */
export class Inventory extends Phaser.Events.EventEmitter {
  constructor(private readonly counts: Map<string, number>) {
    super();
  }

  entries(): [string, number][] {
    return [...this.counts.entries()].filter(([, q]) => q > 0);
  }

  set(itemId: string, total: number): void {
    this.counts.set(itemId, total);
    this.emit('change');
  }
}

export const getInventory = (scene: Phaser.Scene): Inventory | undefined => scene.registry.get('inventory') as Inventory | undefined;

/** XP, nível e cobre em memória, sempre iguais ao último valor que o servidor devolveu. */
export class Progress extends Phaser.Events.EventEmitter {
  constructor(public state: ProgressState) {
    super();
  }

  set(state: ProgressState): void {
    this.state = state;
    this.emit('change');
  }
}

export function initialProgress(session: PlaySession): ProgressState {
  if (session.mode !== 'online') return { level: 0, xp: 0, copper: 0 };
  const c = session.character;
  return { level: c.level, xp: Number(c.xp), copper: Number(c.copper) };
}

export const getProgress = (scene: Phaser.Scene): Progress => scene.registry.get('progress') as Progress;
