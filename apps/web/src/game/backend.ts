import * as Phaser from 'phaser';
import {
  createRng,
  creatureById,
  levelForXp,
  levelThresholds,
  exchange,
  canEquip,
  canUpgrade,
  gatherBlock,
  gearSellPrice,
  maxUpgrade,
  pathOfClass,
  upgradeCost,
  rollChestContents,
  rollChestCount,
  rollKillRewards,
  rollMonsters,
  rollResourceNodes,
  sellPrice,
  shopBuys,
  type GearPiece,
  type MonsterSpawn,
  type NodeContent,
} from '@navor/shared';
import { content } from '../content.ts';
import type { PlaySession } from '../menu/menu.ts';
import { exchangeCurrency, shopBuy, shopSell, tavernRest, useItem } from '../services/economy.ts';
import { craftItem, equipGear, listGear, sellGear, unequipGear, upgradeGear, type GearRow } from '../services/gear.ts';
import { collectNode, endExploration, killMonster, listInventory, openChest, startExploration } from '../services/exploration.ts';

/** Uma entrada numa área gerada: a seed do mapa, o que cada ponto de coleta dá, quais monstros e quantos baús há. */
export interface ExplorationRun {
  /** id no servidor; null no modo offline */
  id: string | null;
  areaId: string;
  seed: number;
  nodes: NodeContent[];
  monsters: MonsterSpawn[];
  chests: number;
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

export interface ChestResult {
  opened: boolean;
  copperGained: number;
  copper: number;
  goldGained: number;
  gold: number;
  drops: { itemId: string; quantity: number; total: number }[];
}

export interface Wallet {
  copper: number;
  gold: number;
}

/** Resultado de comprar ou vender: o total do item no inventário e as moedas depois da operação. */
export interface TradeResult extends Wallet {
  itemId: string;
  total: number;
  /** cobre recebido (só na venda) */
  earned?: number;
  /** equipamento comprado: a peça nova */
  gear?: GearPiece;
}

export interface CraftResult extends Wallet {
  itemId: string;
  /** total do item no inventário (0 quando o resultado é uma peça) */
  total: number;
  gear?: GearPiece;
  materials: { itemId: string; total: number }[];
}

export interface UpgradeResult extends Wallet {
  gear: GearPiece;
  material: { itemId: string; total: number };
}

export interface GearSaleResult extends Wallet {
  gearId: string;
  earned: number;
}

export interface EquipResult {
  gear: GearPiece;
  /** peça que saiu do espaço, se havia */
  unequipped: string | null;
}

export interface UseResult {
  itemId: string;
  total: number;
  hp: number;
  mana: number;
}

/** XP, nível, cobre e ouro do personagem, como o servidor gravou. */
export interface ProgressState {
  level: number;
  xp: number;
  copper: number;
  gold: number;
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
  openChest(run: ExplorationRun, chestIndex: number): Promise<ChestResult>;
  /** Morte ou volta à cidade: encerra a entrada no servidor. */
  endExploration(run: ExplorationRun): Promise<void>;
  buy(shopId: string, itemId: string, quantity: number): Promise<TradeResult>;
  sell(shopId: string, itemId: string, quantity: number): Promise<TradeResult>;
  useItem(itemId: string): Promise<UseResult>;
  rest(shopId: string): Promise<Wallet>;
  exchange(shopId: string, to: 'gold' | 'copper', amount: number): Promise<Wallet>;
  loadInventory(): Promise<Map<string, number>>;
  loadGear(): Promise<GearPiece[]>;
  craft(recipeId: string): Promise<CraftResult>;
  upgrade(shopId: string, gearId: string): Promise<UpgradeResult>;
  sellGear(shopId: string, gearId: string): Promise<GearSaleResult>;
  equip(gearId: string): Promise<EquipResult>;
  unequip(gearId: string): Promise<GearPiece>;
}

const fromRow = (r: GearRow): GearPiece => ({ id: r.id, itemId: r.item_id, upgrade: r.upgrade, slot: r.slot });

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
      chests: Number(r.chests ?? 0),
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

  async openChest(run: ExplorationRun, chestIndex: number): Promise<ChestResult> {
    const r = await openChest(run.id!, chestIndex);
    return {
      opened: r.opened,
      copperGained: r.copper_gained,
      copper: Number(r.copper),
      goldGained: r.gold_gained,
      gold: Number(r.gold),
      drops: (r.drops ?? []).map((d) => ({ itemId: d.item_id, quantity: d.quantity, total: Number(d.total) })),
    };
  }

  async endExploration(run: ExplorationRun): Promise<void> {
    await endExploration(run.id!);
  }

  async buy(shopId: string, itemId: string, quantity: number): Promise<TradeResult> {
    const r = await shopBuy(this.characterId, shopId, itemId, quantity);
    return { itemId: r.item_id, total: Number(r.total), copper: Number(r.copper), gold: Number(r.gold), gear: r.gear ? fromRow(r.gear) : undefined };
  }

  async sell(shopId: string, itemId: string, quantity: number): Promise<TradeResult> {
    const r = await shopSell(this.characterId, shopId, itemId, quantity);
    return { itemId: r.item_id, total: Number(r.total), copper: Number(r.copper), gold: Number(r.gold), earned: Number(r.earned) };
  }

  async useItem(itemId: string): Promise<UseResult> {
    const r = await useItem(this.characterId, itemId);
    return { itemId: r.item_id, total: Number(r.total), hp: r.hp, mana: r.mana };
  }

  async rest(shopId: string): Promise<Wallet> {
    const r = await tavernRest(this.characterId, shopId);
    return { copper: Number(r.copper), gold: Number(r.gold) };
  }

  async exchange(shopId: string, to: 'gold' | 'copper', amount: number): Promise<Wallet> {
    const r = await exchangeCurrency(this.characterId, shopId, to, amount);
    return { copper: Number(r.copper), gold: Number(r.gold) };
  }

  async loadInventory(): Promise<Map<string, number>> {
    const rows = await listInventory(this.characterId);
    return new Map(rows.map((r) => [r.item_id, Number(r.quantity)]));
  }

  async loadGear(): Promise<GearPiece[]> {
    return (await listGear(this.characterId)).map(fromRow);
  }

  async craft(recipeId: string): Promise<CraftResult> {
    const r = await craftItem(this.characterId, recipeId);
    return {
      itemId: r.item_id,
      total: Number(r.total),
      gear: r.gear ? fromRow(r.gear) : undefined,
      materials: r.materials.map((m) => ({ itemId: m.item_id, total: Number(m.total) })),
      copper: Number(r.copper),
      gold: Number(r.gold),
    };
  }

  async upgrade(shopId: string, gearId: string): Promise<UpgradeResult> {
    const r = await upgradeGear(this.characterId, shopId, gearId);
    return { gear: fromRow(r.gear), material: { itemId: r.material.item_id, total: Number(r.material.total) }, copper: Number(r.copper), gold: Number(r.gold) };
  }

  async sellGear(shopId: string, gearId: string): Promise<GearSaleResult> {
    const r = await sellGear(this.characterId, shopId, gearId);
    return { gearId: r.gear_id, earned: Number(r.earned), copper: Number(r.copper), gold: Number(r.gold) };
  }

  async equip(gearId: string): Promise<EquipResult> {
    const r = await equipGear(this.characterId, gearId);
    return { gear: fromRow(r.gear), unequipped: r.unequipped };
  }

  async unequip(gearId: string): Promise<GearPiece> {
    return fromRow((await unequipGear(this.characterId, gearId)).gear);
  }
}

export class OfflineBackend implements GameBackend {
  readonly saves = false;
  private readonly inventory = new Map<string, number>();
  private readonly gear: GearPiece[] = [];
  private readonly itemById = new Map(content.items.items.map((i) => [i.id, i]));
  private pieces = 0;

  /** `pathId`: caminho da classe escolhida (as armas conferem). */
  constructor(private readonly pathId: string) {}
  private readonly collected = new Set<string>();
  private readonly killed = new Set<string>();
  private readonly opened = new Set<string>();
  private readonly startedAt = new Map<string, number>();
  /** entrada aberta (fora da cidade); as lojas recusam enquanto houver uma, como no servidor */
  private activeRun: string | null = null;
  private readonly progress: ProgressState = { level: 0, xp: 0, copper: 0, gold: 0 };
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
    const chests = area.chests ? rollChestCount(area.chests, rng) : 0;
    this.runs++;
    const id = `offline-${this.runs}`;
    this.startedAt.set(id, performance.now());
    this.activeRun = id;
    return { id, areaId, seed, nodes, monsters, chests };
  }

  async collect(run: ExplorationRun, nodeIndex: number): Promise<CollectResult> {
    const node = run.nodes[nodeIndex];
    if (!node) throw new Error('Ponto de coleta inválido');
    const key = `${run.id}:${nodeIndex}`;
    const collected = !this.collected.has(key);
    // mesma regra de collect_node: depósito raro pede a ferramenta equipada
    if (collected && gatherBlock(this.itemById.get(node.itemId)!, this.gear, this.itemById, content.equipment)) {
      throw new Error('Você precisa de uma ferramenta melhor equipada para este depósito.');
    }
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

  async openChest(run: ExplorationRun, chestIndex: number): Promise<ChestResult> {
    const config = content.procedural.areas.find((a) => a.id === run.areaId)?.chests;
    if (!config || chestIndex < 0 || chestIndex >= run.chests) throw new Error('Baú inválido');
    const key = `${run.id}:${chestIndex}`;
    const p = this.progress;
    if (this.opened.has(key)) return { opened: false, copperGained: 0, copper: p.copper, goldGained: 0, gold: p.gold, drops: [] };
    // mesma regra de open_chest: o baú só abre alguns segundos depois da entrada
    if (performance.now() - (this.startedAt.get(run.id!) ?? 0) < config.minSecondsAfterStart * 1000) {
      throw new Error('O baú está emperrado. Tente de novo em alguns segundos.');
    }
    this.opened.add(key);
    const got = rollChestContents(config, this.rng);
    p.copper += got.copper;
    p.gold += got.gold;
    const drops = got.drops.map((d) => {
      const total = (this.inventory.get(d.itemId) ?? 0) + d.quantity;
      this.inventory.set(d.itemId, total);
      return { ...d, total };
    });
    return { opened: true, copperGained: got.copper, copper: p.copper, goldGained: got.gold, gold: p.gold, drops };
  }

  async endExploration(run: ExplorationRun): Promise<void> {
    if (this.activeRun === run.id) this.activeRun = null;
  }

  /** Só para o teste de fumaça (?test, modo offline): dá moedas para testar as lojas. */
  testGrant(copper: number, gold = 0): ProgressState {
    this.progress.copper += copper;
    this.progress.gold += gold;
    return { ...this.progress };
  }

  /** Só para o teste de fumaça: dá materiais para testar a fabricação. */
  testGrantItem(itemId: string, quantity: number): number {
    return this.addItem(itemId, quantity);
  }

  /** Mesmas regras de shop_buy, shop_sell, use_item, tavern_rest e exchange_currency (migration economy). */
  private inTown(): void {
    if (this.activeRun) throw new Error('Volte para a cidade para usar este serviço.');
  }

  private shop(shopId: string) {
    const shop = content.shops.shops.find((s) => s.id === shopId);
    if (!shop) throw new Error('Loja desconhecida');
    return shop;
  }

  private addItem(itemId: string, delta: number): number {
    const total = (this.inventory.get(itemId) ?? 0) + delta;
    if (total < 0) throw new Error('Você não tem itens suficientes.');
    this.inventory.set(itemId, total);
    return total;
  }

  async buy(shopId: string, itemId: string, quantity: number): Promise<TradeResult> {
    this.inTown();
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw new Error('Quantidade inválida');
    const offer = this.shop(shopId).sells.find((x) => x.item === itemId);
    if (!offer) throw new Error('Este item não está à venda aqui.');
    const isGear = Boolean(this.itemById.get(itemId)?.equip);
    if (isGear && quantity !== 1) throw new Error('Equipamentos são comprados um de cada vez.');
    const cost = offer.price * quantity;
    const p = this.progress;
    if (p[offer.currency] < cost) throw new Error(offer.currency === 'gold' ? 'Ouro insuficiente.' : 'Cobre insuficiente.');
    if (isGear) {
      const gear = this.addGear(itemId);
      p[offer.currency] -= cost;
      return { itemId, total: 0, gear: { ...gear }, copper: p.copper, gold: p.gold };
    }
    p[offer.currency] -= cost;
    return { itemId, total: this.addItem(itemId, quantity), copper: p.copper, gold: p.gold };
  }

  async sell(shopId: string, itemId: string, quantity: number): Promise<TradeResult> {
    this.inTown();
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) throw new Error('Quantidade inválida');
    const item = content.items.items.find((i) => i.id === itemId);
    if (!item || item.equip || !shopBuys(this.shop(shopId), item)) throw new Error('Este NPC não compra esse item.');
    const total = this.addItem(itemId, -quantity);
    const earned = sellPrice(item, content.rarities, content.shops) * quantity;
    this.progress.copper += earned;
    return { itemId, total, earned, copper: this.progress.copper, gold: this.progress.gold };
  }

  async useItem(itemId: string): Promise<UseResult> {
    const item = content.items.items.find((i) => i.id === itemId);
    if (!item?.use || (item.use.hp === 0 && item.use.mana === 0)) throw new Error('Este item não pode ser usado.');
    return { itemId, total: this.addItem(itemId, -1), hp: item.use.hp, mana: item.use.mana };
  }

  async rest(shopId: string): Promise<Wallet> {
    this.inTown();
    const price = this.shop(shopId).rest?.price;
    if (price === undefined) throw new Error('Não há dormitório aqui.');
    if (this.progress.copper < price) throw new Error('Cobre insuficiente.');
    this.progress.copper -= price;
    return { copper: this.progress.copper, gold: this.progress.gold };
  }

  async exchange(shopId: string, to: 'gold' | 'copper', amount: number): Promise<Wallet> {
    this.inTown();
    if (!this.shop(shopId).exchange) throw new Error('Não há câmbio aqui.');
    const w = exchange(this.progress, to, amount, content.shops.copperPerGold);
    Object.assign(this.progress, w);
    return w;
  }

  async loadInventory(): Promise<Map<string, number>> {
    return new Map(this.inventory);
  }

  /** Mesmas regras de craft_item, upgrade_gear, sell_gear, equip_gear e unequip_gear (migration equipment). */
  private addGear(itemId: string): GearPiece {
    if (this.gear.length >= content.equipment.maxPieces) throw new Error('Sua bolsa de equipamentos está cheia. Venda alguma peça no Ferreiro.');
    const piece: GearPiece = { id: `offline-gear-${++this.pieces}`, itemId, upgrade: 0, slot: null };
    this.gear.push(piece);
    return piece;
  }

  private piece(gearId: string): GearPiece {
    const g = this.gear.find((x) => x.id === gearId);
    if (!g) throw new Error('Peça não encontrada');
    return g;
  }

  async loadGear(): Promise<GearPiece[]> {
    return this.gear.map((g) => ({ ...g }));
  }

  async craft(recipeId: string): Promise<CraftResult> {
    this.inTown();
    const recipe = content.recipes.recipes.find((r) => r.id === recipeId);
    if (!recipe) throw new Error('Receita desconhecida.');
    const p = this.progress;
    if (p.copper < recipe.copper) throw new Error('Cobre insuficiente.');
    if (p.gold < recipe.gold) throw new Error('Ouro insuficiente.');
    if (recipe.materials.some((m) => (this.inventory.get(m.item) ?? 0) < m.quantity)) throw new Error('Faltam materiais para esta receita.');
    const isGear = Boolean(this.itemById.get(recipe.item)?.equip);
    const gear = isGear ? this.addGear(recipe.item) : undefined;
    const materials = [...recipe.materials].sort((a, b) => a.item.localeCompare(b.item)).map((m) => ({ itemId: m.item, total: this.addItem(m.item, -m.quantity) }));
    p.copper -= recipe.copper;
    p.gold -= recipe.gold;
    const total = isGear ? 0 : this.addItem(recipe.item, 1);
    return { itemId: recipe.item, total, gear: gear && { ...gear }, materials, copper: p.copper, gold: p.gold };
  }

  async upgrade(shopId: string, gearId: string): Promise<UpgradeResult> {
    this.inTown();
    if (!this.shop(shopId).upgrades) throw new Error('Este NPC não melhora equipamentos.');
    const g = this.piece(gearId);
    const item = this.itemById.get(g.itemId)!;
    if (!item.equip?.upgradeMaterial) throw new Error('Esta peça não pode ser melhorada.');
    if (!canUpgrade(item, g.upgrade, content.equipment)) throw new Error('Esta peça já está no nível máximo.');
    const cost = upgradeCost(item, g.upgrade, content.equipment)!;
    const p = this.progress;
    if (p.copper < cost.copper) throw new Error('Cobre insuficiente.');
    if (p.gold < cost.gold) throw new Error('Ouro insuficiente.');
    if ((this.inventory.get(cost.material) ?? 0) < cost.materials) throw new Error('Faltam materiais para a melhoria.');
    const total = this.addItem(cost.material, -cost.materials);
    p.copper -= cost.copper;
    p.gold -= cost.gold;
    g.upgrade = Math.min(g.upgrade + 1, maxUpgrade(content.equipment));
    return { gear: { ...g }, material: { itemId: cost.material, total }, copper: p.copper, gold: p.gold };
  }

  async sellGear(shopId: string, gearId: string): Promise<GearSaleResult> {
    this.inTown();
    const g = this.piece(gearId);
    const item = this.itemById.get(g.itemId)!;
    if (!shopBuys(this.shop(shopId), item)) throw new Error('Este NPC não compra esse item.');
    const earned = gearSellPrice(item, g.upgrade, content.rarities, content.shops, content.equipment);
    this.gear.splice(this.gear.indexOf(g), 1);
    this.progress.copper += earned;
    return { gearId, earned, copper: this.progress.copper, gold: this.progress.gold };
  }

  async equip(gearId: string): Promise<EquipResult> {
    const g = this.piece(gearId);
    const item = this.itemById.get(g.itemId)!;
    if (!canEquip(item, this.pathId)) throw new Error('Sua classe não usa esta peça.');
    const slot = item.equip!.slot;
    const old = this.gear.find((x) => x.slot === slot && x !== g);
    if (old) old.slot = null;
    g.slot = slot;
    return { gear: { ...g }, unequipped: old?.id ?? null };
  }

  async unequip(gearId: string): Promise<GearPiece> {
    const g = this.piece(gearId);
    g.slot = null;
    return { ...g };
  }
}

export function createBackend(session: PlaySession): GameBackend {
  return session.mode === 'online' ? new OnlineBackend(session.character.id) : new OfflineBackend(pathOfClass(content.classes, session.classId));
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

/** Peças de equipamento em memória, sempre iguais ao último valor que o servidor devolveu. */
export class GearBag extends Phaser.Events.EventEmitter {
  constructor(private pieces: GearPiece[]) {
    super();
  }

  list(): GearPiece[] {
    return this.pieces;
  }

  equipped(): GearPiece[] {
    return this.pieces.filter((g) => g.slot);
  }

  /** Grava a peça como o servidor devolveu; `unequipped` volta para a bolsa. */
  put(piece: GearPiece, unequipped: string | null = null): void {
    this.pieces = this.pieces.filter((g) => g.id !== piece.id).map((g) => (g.id === unequipped ? { ...g, slot: null } : g));
    this.pieces.push(piece);
    this.emit('change');
  }

  remove(id: string): void {
    this.pieces = this.pieces.filter((g) => g.id !== id);
    this.emit('change');
  }
}

export const getGear = (scene: Phaser.Scene): GearBag => scene.registry.get('gear') as GearBag;

/** XP, nível, cobre e ouro em memória, sempre iguais ao último valor que o servidor devolveu. */
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
  if (session.mode !== 'online') return { level: 0, xp: 0, copper: 0, gold: 0 };
  const c = session.character;
  return { level: c.level, xp: Number(c.xp), copper: Number(c.copper), gold: Number(c.gold) };
}

export const getProgress = (scene: Phaser.Scene): Progress => scene.registry.get('progress') as Progress;
