import * as Phaser from 'phaser';
import { createRng, rollResourceNodes, type NodeContent } from '@navor/shared';
import { content } from '../content.ts';
import type { PlaySession } from '../menu/menu.ts';
import { collectNode, listInventory, startExploration } from '../services/exploration.ts';

/** Uma entrada numa área gerada: a seed do mapa e o que cada ponto de coleta dá. */
export interface ExplorationRun {
  /** id no servidor; null no modo offline */
  id: string | null;
  areaId: string;
  seed: number;
  nodes: NodeContent[];
}

export interface CollectResult {
  itemId: string;
  quantity: number;
  collected: boolean;
  total: number;
}

/**
 * O que o jogo pede ao "servidor". Online, cada chamada vai ao Supabase, que decide e grava.
 * Offline, a mesma regra roda no navegador e nada é salvo.
 */
export interface GameBackend {
  readonly saves: boolean;
  startExploration(areaId: string): Promise<ExplorationRun>;
  collect(run: ExplorationRun, nodeIndex: number): Promise<CollectResult>;
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
    };
  }

  async collect(run: ExplorationRun, nodeIndex: number): Promise<CollectResult> {
    const r = await collectNode(run.id!, nodeIndex);
    return { itemId: r.item_id, quantity: r.quantity, collected: r.collected, total: Number(r.total) };
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
  private runs = 0;

  async startExploration(areaId: string): Promise<ExplorationRun> {
    const area = content.procedural.areas.find((a) => a.id === areaId);
    if (!area) throw new Error(`Área desconhecida: ${areaId}`);
    // ?seed=N fixa o mapa (para testes); sem ela, uma seed nova a cada entrada
    const urlSeed = new URLSearchParams(window.location.search).get('seed');
    const seed = urlSeed !== null ? Number(urlSeed) >>> 0 : crypto.getRandomValues(new Uint32Array(1))[0]!;
    const nodes = area.resources ? rollResourceNodes(area.resources, content.items, createRng(seed)) : [];
    this.runs++;
    return { id: `offline-${this.runs}`, areaId, seed, nodes };
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
