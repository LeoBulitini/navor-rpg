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
  learnBlock,
  nextClass,
  evolutionCost,
  findSkill,
  gradeCost,
  skillEffects,
  spentPoints,
  totalPoints,
  type LearnedSkills,
  gameDay,
  pickDailyQuests,
  questProgress,
  type QuestEvent,
  chatMessage,
  guildNameError,
  tidyText,
  trainingMinutes,
  trainingXp,
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
import { evolveClass, learnSkill, listSkills } from '../services/skills.ts';
import { claimQuest, listDailyQuests } from '../services/quests.ts';
import { listListings, listStorage, marketBuy, marketCancel, marketList, storageDeposit, storageWithdraw, type ListingRow } from '../services/market.ts';
import {
  chatHistory,
  chatSend,
  guildCreate,
  guildInfo,
  guildJoin,
  guildKick,
  guildLeave,
  joinPresence,
  onChatMessage,
  ranking,
  trainingClaim,
  trainingStart,
  trainingStatus,
  type ChatRow,
  type PresenceInfo,
  type TrainingRow,
} from '../services/social.ts';
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

export interface LearnResult {
  skillId: string;
  grade: number;
  pointsLeft: number;
  /** pergaminho gasto no foco, com o total que sobrou */
  scroll: { itemId: string; total: number } | null;
}

export interface EvolveResult extends Wallet {
  classId: string;
}

/** Uma missão do dia: qual é (quests.json), quanto já foi feito e se a recompensa já saiu. */
export interface DailyQuest {
  slot: number;
  questId: string;
  progress: number;
  claimed: boolean;
}

export interface QuestBoard {
  /** dia do jogo ('AAAA-MM-DD', Brasília) */
  day: string;
  quests: DailyQuest[];
  /** áreas diárias já usadas hoje (Covil do Dragão) */
  dailyAreas: string[];
}

export interface ClaimResult extends Wallet {
  slot: number;
  questId: string;
  xpGained: number;
  xp: number;
  level: number;
  leveledUp: boolean;
  copperGained: number;
  items: { itemId: string; quantity: number; total: number }[];
}

/** Um anúncio do mercado entre jogadores. */
export interface Listing {
  id: string;
  itemId: string;
  quantity: number;
  price: number;
  currency: 'copper' | 'gold';
  sellerName: string;
  /** instante em que vence (ms) */
  expiresAt: number;
  mine: boolean;
}

export interface MarketBoard {
  /** anúncios ativos de outros jogadores, do mais barato ao mais caro */
  offers: Listing[];
  /** anúncios abertos deste personagem (inclusive vencidos, para recolher) */
  mine: Listing[];
}

export interface StorageResult {
  itemId: string;
  /** total no inventário */
  total: number;
  /** total no armazém */
  stored: number;
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
/** Treino no Salão. `startedAt` já vem no relógio local (corrigido pela diferença para o servidor). */
export interface TrainingState {
  training: boolean;
  startedAt: number;
  level: number;
  minutes: number;
  xp: number;
}

export interface TrainingClaim {
  minutes: number;
  xpGained: number;
  xp: number;
  level: number;
  leveledUp: boolean;
}

export interface GuildMember {
  name: string;
  classId: string;
  level: number;
  role: 'leader' | 'member';
}

export interface GuildBoard {
  maxMembers: number;
  mine: { id: string; name: string; tag: string; role: 'leader' | 'member'; members: GuildMember[] } | null;
  guilds: { id: string; name: string; tag: string; members: number; totalLevel: number }[];
}

export interface Ranking {
  players: { name: string; classId: string; level: number; xp: number; guildTag: string | null }[];
  guilds: { name: string; tag: string; members: number; totalLevel: number }[];
}

export interface ChatMessage {
  id: string;
  channel: 'global' | 'guild';
  author: string;
  body: string;
  at: number;
}

export type { PresenceInfo };

export interface Presence {
  update(info: Partial<PresenceInfo>): void;
  leave(): void;
}

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
  loadSkills(): Promise<LearnedSkills>;
  learn(skillId: string): Promise<LearnResult>;
  evolve(): Promise<EvolveResult>;
  loadQuests(): Promise<QuestBoard>;
  claimQuest(slot: number): Promise<ClaimResult>;
  loadMarket(): Promise<MarketBoard>;
  listOnMarket(shopId: string, itemId: string, quantity: number, price: number, currency: 'copper' | 'gold'): Promise<{ itemId: string; total: number }>;
  buyFromMarket(shopId: string, listingId: string, quantity: number): Promise<TradeResult>;
  cancelListing(shopId: string, listingId: string): Promise<{ itemId: string; total: number; returned: number }>;
  loadStorage(): Promise<Map<string, number>>;
  deposit(shopId: string, itemId: string, quantity: number): Promise<StorageResult>;
  withdraw(shopId: string, itemId: string, quantity: number): Promise<StorageResult>;
  loadTraining(): Promise<TrainingState>;
  startTraining(): Promise<TrainingState>;
  claimTraining(): Promise<TrainingClaim>;
  loadGuilds(): Promise<GuildBoard>;
  createGuild(name: string, tag: string): Promise<Wallet & { name: string; tag: string }>;
  joinGuild(guildId: string): Promise<void>;
  leaveGuild(): Promise<void>;
  kickMember(name: string): Promise<void>;
  loadRanking(): Promise<Ranking>;
  loadChat(): Promise<ChatMessage[]>;
  sendChat(channel: 'global' | 'guild', body: string): Promise<ChatMessage>;
  /** mensagens novas de outros jogadores; devolve a função que cancela */
  onChat(handler: (m: ChatMessage) => void): () => void;
  /** quem está jogando agora (só para mostrar) */
  joinPresence(info: PresenceInfo, onChange: (online: PresenceInfo[]) => void): Presence;
}

/** Recusa de uma regra do jogo no modo offline, com o mesmo código dos erros das funções do banco (P0001). */
class RuleError extends Error {
  readonly code = 'P0001';
}

const fromListing = (r: ListingRow, characterId: string): Listing => ({
  id: r.id,
  itemId: r.item_id,
  quantity: r.quantity,
  price: r.price,
  currency: r.currency,
  sellerName: r.seller_name,
  expiresAt: Date.parse(r.expires_at),
  mine: r.seller_id === characterId,
});

const fromTraining = (r: TrainingRow): TrainingState => {
  // o tempo conta pelo relógio do servidor: traz o começo para o relógio local
  const offset = Date.now() - Date.parse(r.now);
  return {
    training: r.training,
    startedAt: r.started_at ? Date.parse(r.started_at) + offset : 0,
    level: r.level ?? 0,
    minutes: r.minutes ?? 0,
    xp: r.xp ?? 0,
  };
};

const fromChat = (r: ChatRow): ChatMessage => ({
  id: String(r.id),
  channel: r.guild_id ? 'guild' : 'global',
  author: r.author,
  body: r.body,
  at: Date.parse(r.created_at),
});

const fromRow = (r: GearRow): GearPiece => ({ id: r.id, itemId: r.item_id, upgrade: r.upgrade, slot: r.slot });

class OnlineBackend implements GameBackend {
  readonly saves = true;
  constructor(private readonly characterId: string) {}

  async loadTraining(): Promise<TrainingState> {
    return fromTraining(await trainingStatus(this.characterId));
  }

  async startTraining(): Promise<TrainingState> {
    return fromTraining(await trainingStart(this.characterId));
  }

  async claimTraining(): Promise<TrainingClaim> {
    const r = await trainingClaim(this.characterId);
    return { minutes: Number(r.minutes), xpGained: Number(r.xp_gained), xp: Number(r.xp), level: r.level, leveledUp: r.leveled_up };
  }

  async loadGuilds(): Promise<GuildBoard> {
    const r = await guildInfo(this.characterId);
    return {
      maxMembers: r.max_members,
      mine: r.mine && {
        id: r.mine.id,
        name: r.mine.name,
        tag: r.mine.tag,
        role: r.mine.role,
        members: r.mine.members.map((m) => ({ name: m.name, classId: m.class_id, level: m.level, role: m.role })),
      },
      guilds: r.guilds.map((g) => ({ id: g.id, name: g.name, tag: g.tag, members: Number(g.members), totalLevel: Number(g.total_level) })),
    };
  }

  async createGuild(name: string, tag: string): Promise<Wallet & { name: string; tag: string }> {
    const r = await guildCreate(this.characterId, name, tag);
    return { name: r.name, tag: r.tag, copper: Number(r.copper), gold: Number(r.gold) };
  }

  async joinGuild(guildId: string): Promise<void> {
    await guildJoin(this.characterId, guildId);
  }

  async leaveGuild(): Promise<void> {
    await guildLeave(this.characterId);
  }

  async kickMember(name: string): Promise<void> {
    await guildKick(this.characterId, name);
  }

  async loadRanking(): Promise<Ranking> {
    const r = await ranking();
    return {
      players: r.players.map((p) => ({ name: p.name, classId: p.class_id, level: p.level, xp: Number(p.xp), guildTag: p.guild_tag })),
      guilds: r.guilds.map((g) => ({ name: g.name, tag: g.tag, members: Number(g.members), totalLevel: Number(g.total_level) })),
    };
  }

  async loadChat(): Promise<ChatMessage[]> {
    return (await chatHistory(content.social.chat.history)).map(fromChat);
  }

  async sendChat(channel: 'global' | 'guild', body: string): Promise<ChatMessage> {
    return fromChat(await chatSend(this.characterId, channel, body));
  }

  onChat(handler: (m: ChatMessage) => void): () => void {
    return onChatMessage((r) => handler(fromChat(r)));
  }

  joinPresence(info: PresenceInfo, onChange: (online: PresenceInfo[]) => void): Presence {
    return joinPresence(this.characterId, info, onChange);
  }

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

  async loadSkills(): Promise<LearnedSkills> {
    return new Map((await listSkills(this.characterId)).map((r) => [r.skill_id, r.grade]));
  }

  async learn(skillId: string): Promise<LearnResult> {
    const r = await learnSkill(this.characterId, skillId);
    return { skillId: r.skill_id, grade: r.grade, pointsLeft: r.points_left, scroll: r.scroll && { itemId: r.scroll.item_id, total: Number(r.scroll.total) } };
  }

  async evolve(): Promise<EvolveResult> {
    const r = await evolveClass(this.characterId);
    return { classId: r.class_id, copper: Number(r.copper), gold: Number(r.gold) };
  }

  async loadQuests(): Promise<QuestBoard> {
    const r = await listDailyQuests(this.characterId);
    return {
      day: r.day,
      quests: r.quests.map((q) => ({ slot: q.slot, questId: q.quest_id, progress: q.progress, claimed: q.claimed })),
      dailyAreas: r.daily_areas,
    };
  }

  async loadMarket(): Promise<MarketBoard> {
    const rows = (await listListings()).map((r) => fromListing(r, this.characterId));
    const now = Date.now();
    return { offers: rows.filter((l) => !l.mine && l.quantity > 0 && l.expiresAt > now), mine: rows.filter((l) => l.mine) };
  }

  async listOnMarket(shopId: string, itemId: string, quantity: number, price: number, currency: 'copper' | 'gold'): Promise<{ itemId: string; total: number }> {
    const r = await marketList(this.characterId, shopId, itemId, quantity, price, currency);
    return { itemId: r.item_id, total: Number(r.total) };
  }

  async buyFromMarket(shopId: string, listingId: string, quantity: number): Promise<TradeResult> {
    const r = await marketBuy(this.characterId, shopId, listingId, quantity);
    return { itemId: r.item_id, total: Number(r.total), copper: Number(r.copper), gold: Number(r.gold) };
  }

  async cancelListing(shopId: string, listingId: string): Promise<{ itemId: string; total: number; returned: number }> {
    const r = await marketCancel(this.characterId, shopId, listingId);
    return { itemId: r.item_id, total: Number(r.total), returned: r.returned };
  }

  async loadStorage(): Promise<Map<string, number>> {
    return new Map((await listStorage()).map((r) => [r.item_id, Number(r.quantity)]));
  }

  async deposit(shopId: string, itemId: string, quantity: number): Promise<StorageResult> {
    const r = await storageDeposit(this.characterId, shopId, itemId, quantity);
    return { itemId: r.item_id, total: Number(r.total), stored: Number(r.stored) };
  }

  async withdraw(shopId: string, itemId: string, quantity: number): Promise<StorageResult> {
    const r = await storageWithdraw(this.characterId, shopId, itemId, quantity);
    return { itemId: r.item_id, total: Number(r.total), stored: Number(r.stored) };
  }

  async claimQuest(slot: number): Promise<ClaimResult> {
    const r = await claimQuest(this.characterId, slot);
    return {
      slot: r.slot,
      questId: r.quest_id,
      xpGained: r.xp_gained,
      xp: Number(r.xp),
      level: r.level,
      leveledUp: r.leveled_up,
      copperGained: r.copper_gained,
      copper: Number(r.copper),
      gold: Number(r.gold),
      items: r.items.map((i) => ({ itemId: i.item_id, quantity: i.quantity, total: Number(i.total) })),
    };
  }
}

export class OfflineBackend implements GameBackend {
  readonly saves = false;
  private readonly inventory = new Map<string, number>();
  private readonly gear: GearPiece[] = [];
  private readonly itemById = new Map(content.items.items.map((i) => [i.id, i]));
  private pieces = 0;

  private readonly learned: LearnedSkills = new Map();
  private readonly dailyEntries = new Set<string>();
  private questDay = '';
  private quests: DailyQuest[] = [];

  /** `classId`: classe escolhida (as armas e as habilidades conferem). */
  constructor(private classId: string) {}

  private get pathId(): string {
    return pathOfClass(content.classes, this.classId);
  }

  /** Coleta de Caça e Saque Especializado: mesma regra de skill_drop_bonus. */
  private dropMultiplier(): number {
    return 1 + skillEffects(content.skills, this.learned).dropChancePercent / 100;
  }
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
    if (!area) throw new RuleError(`Área desconhecida: ${areaId}`);
    // mesmas regras de start_exploration (migration daily): nível mínimo e uma entrada por dia
    if (this.progress.level < area.minLevel) throw new RuleError(`Você precisa estar no nível ${area.minLevel} para entrar aqui.`);
    // gatilho explorations_block_training (migration social)
    if (this.training) throw new RuleError('Você está treinando no Salão. Encerre o treino para sair da cidade.');
    if (area.daily) {
      const key = `${gameDay(new Date())}:${areaId}`;
      if (this.dailyEntries.has(key)) throw new RuleError('Você já entrou aqui hoje. Volte amanhã (o dia vira à meia-noite, horário de Brasília).');
      this.dailyEntries.add(key);
    }
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
    if (!node) throw new RuleError('Ponto de coleta inválido');
    const key = `${run.id}:${nodeIndex}`;
    const collected = !this.collected.has(key);
    // mesma regra de collect_node: depósito raro pede a ferramenta equipada
    if (collected && gatherBlock(this.itemById.get(node.itemId)!, this.gear, this.itemById, content.equipment)) {
      throw new RuleError('Você precisa de uma ferramenta melhor equipada para este depósito.');
    }
    if (collected) {
      this.collected.add(key);
      this.inventory.set(node.itemId, (this.inventory.get(node.itemId) ?? 0) + node.quantity);
      this.advanceQuests({ kind: 'collect', itemId: node.itemId, quantity: node.quantity });
    }
    return { itemId: node.itemId, quantity: node.quantity, collected, total: this.inventory.get(node.itemId) ?? 0 };
  }

  async killMonster(run: ExplorationRun, monsterIndex: number): Promise<KillResult> {
    const monster = run.monsters[monsterIndex];
    if (!monster) throw new RuleError('Monstro inválido');
    const key = `${run.id}:${monsterIndex}`;
    const p = this.progress;
    if (this.killed.has(key)) {
      return { killed: false, creatureId: monster.creatureId, xpGained: 0, xp: p.xp, level: p.level, leveledUp: false, copperGained: 0, copper: p.copper, drops: [] };
    }
    this.killed.add(key);
    this.advanceQuests({ kind: 'kill', creatureId: monster.creatureId });
    const reward = rollKillRewards(creatureById(content.creatures, monster.creatureId), this.rng, this.dropMultiplier());
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
    if (!config || chestIndex < 0 || chestIndex >= run.chests) throw new RuleError('Baú inválido');
    const key = `${run.id}:${chestIndex}`;
    const p = this.progress;
    if (this.opened.has(key)) return { opened: false, copperGained: 0, copper: p.copper, goldGained: 0, gold: p.gold, drops: [] };
    // mesma regra de open_chest: o baú só abre alguns segundos depois da entrada
    if (performance.now() - (this.startedAt.get(run.id!) ?? 0) < config.minSecondsAfterStart * 1000) {
      throw new RuleError('O baú está emperrado. Tente de novo em alguns segundos.');
    }
    this.opened.add(key);
    const got = rollChestContents(config, this.rng, this.dropMultiplier());
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

  /** Só para o teste de fumaça: põe o personagem num nível (para testar pontos de habilidade e evolução). */
  testSetLevel(level: number): ProgressState {
    this.progress.level = level;
    this.progress.xp = this.thresholds[level] ?? this.progress.xp;
    return { ...this.progress };
  }

  /** Só para o teste de fumaça: dá materiais para testar a fabricação. */
  testGrantItem(itemId: string, quantity: number): number {
    return this.addItem(itemId, quantity);
  }

  /** Mesmas regras de shop_buy, shop_sell, use_item, tavern_rest e exchange_currency (migration economy). */
  private inTown(): void {
    if (this.activeRun) throw new RuleError('Volte para a cidade para usar este serviço.');
  }

  private shop(shopId: string) {
    const shop = content.shops.shops.find((s) => s.id === shopId);
    if (!shop) throw new RuleError('Loja desconhecida');
    return shop;
  }

  private addItem(itemId: string, delta: number): number {
    const total = (this.inventory.get(itemId) ?? 0) + delta;
    if (total < 0) throw new RuleError('Você não tem itens suficientes.');
    this.inventory.set(itemId, total);
    return total;
  }

  async buy(shopId: string, itemId: string, quantity: number): Promise<TradeResult> {
    this.inTown();
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw new RuleError('Quantidade inválida');
    const offer = this.shop(shopId).sells.find((x) => x.item === itemId);
    if (!offer) throw new RuleError('Este item não está à venda aqui.');
    const isGear = Boolean(this.itemById.get(itemId)?.equip);
    if (isGear && quantity !== 1) throw new RuleError('Equipamentos são comprados um de cada vez.');
    const cost = offer.price * quantity;
    const p = this.progress;
    if (p[offer.currency] < cost) throw new RuleError(offer.currency === 'gold' ? 'Ouro insuficiente.' : 'Cobre insuficiente.');
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
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) throw new RuleError('Quantidade inválida');
    const item = content.items.items.find((i) => i.id === itemId);
    if (!item || item.equip || !shopBuys(this.shop(shopId), item)) throw new RuleError('Este NPC não compra esse item.');
    const total = this.addItem(itemId, -quantity);
    const earned = sellPrice(item, content.rarities, content.shops) * quantity;
    this.progress.copper += earned;
    return { itemId, total, earned, copper: this.progress.copper, gold: this.progress.gold };
  }

  async useItem(itemId: string): Promise<UseResult> {
    const item = content.items.items.find((i) => i.id === itemId);
    if (!item?.use || (item.use.hp === 0 && item.use.mana === 0)) throw new RuleError('Este item não pode ser usado.');
    return { itemId, total: this.addItem(itemId, -1), hp: item.use.hp, mana: item.use.mana };
  }

  async rest(shopId: string): Promise<Wallet> {
    this.inTown();
    const price = this.shop(shopId).rest?.price;
    if (price === undefined) throw new RuleError('Não há dormitório aqui.');
    if (this.progress.copper < price) throw new RuleError('Cobre insuficiente.');
    this.progress.copper -= price;
    return { copper: this.progress.copper, gold: this.progress.gold };
  }

  async exchange(shopId: string, to: 'gold' | 'copper', amount: number): Promise<Wallet> {
    this.inTown();
    if (!this.shop(shopId).exchange) throw new RuleError('Não há câmbio aqui.');
    const w = exchange(this.progress, to, amount, content.shops.copperPerGold);
    Object.assign(this.progress, w);
    return w;
  }

  async loadInventory(): Promise<Map<string, number>> {
    return new Map(this.inventory);
  }

  /** Mesmas regras de craft_item, upgrade_gear, sell_gear, equip_gear e unequip_gear (migration equipment). */
  private addGear(itemId: string): GearPiece {
    if (this.gear.length >= content.equipment.maxPieces) throw new RuleError('Sua bolsa de equipamentos está cheia. Venda alguma peça no Ferreiro.');
    const piece: GearPiece = { id: `offline-gear-${++this.pieces}`, itemId, upgrade: 0, slot: null };
    this.gear.push(piece);
    return piece;
  }

  private piece(gearId: string): GearPiece {
    const g = this.gear.find((x) => x.id === gearId);
    if (!g) throw new RuleError('Peça não encontrada');
    return g;
  }

  async loadGear(): Promise<GearPiece[]> {
    return this.gear.map((g) => ({ ...g }));
  }

  async craft(recipeId: string): Promise<CraftResult> {
    this.inTown();
    const recipe = content.recipes.recipes.find((r) => r.id === recipeId);
    if (!recipe) throw new RuleError('Receita desconhecida.');
    const p = this.progress;
    if (p.copper < recipe.copper) throw new RuleError('Cobre insuficiente.');
    if (p.gold < recipe.gold) throw new RuleError('Ouro insuficiente.');
    if (recipe.materials.some((m) => (this.inventory.get(m.item) ?? 0) < m.quantity)) throw new RuleError('Faltam materiais para esta receita.');
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
    if (!this.shop(shopId).upgrades) throw new RuleError('Este NPC não melhora equipamentos.');
    const g = this.piece(gearId);
    const item = this.itemById.get(g.itemId)!;
    if (!item.equip?.upgradeMaterial) throw new RuleError('Esta peça não pode ser melhorada.');
    if (!canUpgrade(item, g.upgrade, content.equipment)) throw new RuleError('Esta peça já está no nível máximo.');
    const cost = upgradeCost(item, g.upgrade, content.equipment)!;
    const p = this.progress;
    if (p.copper < cost.copper) throw new RuleError('Cobre insuficiente.');
    if (p.gold < cost.gold) throw new RuleError('Ouro insuficiente.');
    if ((this.inventory.get(cost.material) ?? 0) < cost.materials) throw new RuleError('Faltam materiais para a melhoria.');
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
    if (!shopBuys(this.shop(shopId), item)) throw new RuleError('Este NPC não compra esse item.');
    const earned = gearSellPrice(item, g.upgrade, content.rarities, content.shops, content.equipment);
    this.gear.splice(this.gear.indexOf(g), 1);
    this.progress.copper += earned;
    return { gearId, earned, copper: this.progress.copper, gold: this.progress.gold };
  }

  async equip(gearId: string): Promise<EquipResult> {
    const g = this.piece(gearId);
    const item = this.itemById.get(g.itemId)!;
    if (!canEquip(item, this.pathId)) throw new RuleError('Sua classe não usa esta peça.');
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

  /** Mesmas regras de learn_skill e evolve_class (migration skills). */
  async loadSkills(): Promise<LearnedSkills> {
    return new Map(this.learned);
  }

  async learn(skillId: string): Promise<LearnResult> {
    const block = learnBlock(content.skills, content.classes, this.classId, this.progress.level, this.learned, skillId, (id) => (this.inventory.get(id) ?? 0) > 0);
    if (block) throw new RuleError(block);
    const grade = (this.learned.get(skillId) ?? 0) + 1;
    const cost = gradeCost(content.skills, findSkill(content.skills, skillId)!.def, grade);
    const scroll = cost.scroll ? { itemId: cost.scroll, total: this.addItem(cost.scroll, -1) } : null;
    this.learned.set(skillId, grade);
    const left = totalPoints(content.skills, this.progress.level) - spentPoints(content.skills, this.learned);
    return { skillId, grade, pointsLeft: left, scroll };
  }

  async evolve(): Promise<EvolveResult> {
    this.inTown();
    const next = nextClass(content.classes, this.classId);
    if (!next) throw new RuleError('Sua classe já é a última do caminho.');
    if (this.progress.level < next.level) throw new RuleError('Nível insuficiente para evoluir.');
    const cost = evolutionCost(content.skills, next.level);
    if (!cost) throw new RuleError('Evolução indisponível.');
    if (this.progress.copper < cost.copper) throw new RuleError('Cobre insuficiente.');
    if (this.progress.gold < cost.gold) throw new RuleError('Ouro insuficiente.');
    this.progress.copper -= cost.copper;
    this.progress.gold -= cost.gold;
    this.classId = next.classId;
    return { classId: next.classId, copper: this.progress.copper, gold: this.progress.gold };
  }

  /** Mesmas regras de ensure_daily_quests, quest_advance, list_daily_quests e claim_quest (migration daily). */
  private todayQuests(): DailyQuest[] {
    const day = gameDay(new Date());
    if (day !== this.questDay) {
      this.questDay = day;
      this.quests = pickDailyQuests(content.quests, this.progress.level, this.rng).map((t, slot) => ({ slot, questId: t.id, progress: 0, claimed: false }));
    }
    return this.quests;
  }

  private advanceQuests(e: QuestEvent): void {
    for (const q of this.todayQuests()) {
      const t = content.quests.templates.find((x) => x.id === q.questId)!;
      if (!q.claimed) q.progress = Math.min(t.count, q.progress + questProgress(t, e));
    }
  }

  async loadQuests(): Promise<QuestBoard> {
    const quests = this.todayQuests().map((q) => ({ ...q }));
    const prefix = `${this.questDay}:`;
    return { day: this.questDay, quests, dailyAreas: [...this.dailyEntries].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length)) };
  }

  async claimQuest(slot: number): Promise<ClaimResult> {
    this.inTown();
    const q = this.todayQuests().find((x) => x.slot === slot);
    if (!q) throw new RuleError('Missão não encontrada.');
    if (q.claimed) throw new RuleError('Você já recebeu esta recompensa.');
    const t = content.quests.templates.find((x) => x.id === q.questId)!;
    if (q.progress < t.count) throw new RuleError('A missão ainda não foi concluída.');
    q.claimed = true;
    const p = this.progress;
    const before = p.level;
    p.xp += t.reward.xp;
    p.level = levelForXp(p.xp, this.thresholds);
    p.copper += t.reward.copper;
    const items = [...t.reward.items].sort((a, b) => a.item.localeCompare(b.item)).map((r) => ({ itemId: r.item, quantity: r.quantity, total: this.addItem(r.item, r.quantity) }));
    return { slot, questId: t.id, xpGained: t.reward.xp, xp: p.xp, level: p.level, leveledUp: p.level > before, copperGained: t.reward.copper, copper: p.copper, gold: p.gold, items };
  }

  /** Mesmas regras de market_list, market_buy, market_cancel, storage_deposit e storage_withdraw (migration market). */
  private readonly listings: (Listing & { closed: boolean })[] = [];
  private readonly storage = new Map<string, number>();
  private listingSeq = 0;

  private service(shopId: string, kind: 'playerMarket' | 'storage'): void {
    if (!this.shop(shopId)[kind]) throw new RuleError('Este serviço não fica aqui.');
  }

  private tradable(itemId: string): void {
    const item = this.itemById.get(itemId);
    if (!item) throw new RuleError('Item desconhecido.');
    if (item.equip) throw new RuleError('Equipamentos ainda não podem ir ao mercado nem ao armazém.');
  }

  async loadMarket(): Promise<MarketBoard> {
    // offline não há outros jogadores: só os próprios anúncios
    return { offers: [], mine: this.listings.filter((l) => !l.closed).map(({ closed: _, ...l }) => ({ ...l })) };
  }

  async listOnMarket(shopId: string, itemId: string, quantity: number, price: number, currency: 'copper' | 'gold'): Promise<{ itemId: string; total: number }> {
    this.inTown();
    this.service(shopId, 'playerMarket');
    this.tradable(itemId);
    const rules = content.shops.market;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) throw new RuleError('Quantidade inválida');
    if (!Number.isInteger(price) || price < 1 || price > rules.maxPricePerUnit) throw new RuleError(`Preço inválido (de 1 a ${rules.maxPricePerUnit}).`);
    const now = Date.now();
    if (this.listings.filter((l) => !l.closed && l.quantity > 0 && l.expiresAt > now).length >= rules.maxListings) {
      throw new RuleError(`Você já tem ${rules.maxListings} anúncios ativos.`);
    }
    const total = this.addItem(itemId, -quantity);
    this.listings.push({ id: `offline-listing-${++this.listingSeq}`, itemId, quantity, price, currency, sellerName: 'Você', expiresAt: now + rules.expiresHours * 3600_000, mine: true, closed: false });
    return { itemId, total };
  }

  async buyFromMarket(shopId: string, listingId: string): Promise<TradeResult> {
    this.inTown();
    this.service(shopId, 'playerMarket');
    const l = this.listings.find((x) => x.id === listingId && !x.closed && x.expiresAt > Date.now());
    if (!l) throw new RuleError('Este anúncio não está mais disponível.');
    throw new RuleError('Você não pode comprar os próprios anúncios.');
  }

  async cancelListing(shopId: string, listingId: string): Promise<{ itemId: string; total: number; returned: number }> {
    this.inTown();
    this.service(shopId, 'playerMarket');
    const l = this.listings.find((x) => x.id === listingId);
    if (!l) throw new RuleError('Anúncio não encontrado.');
    if (l.closed) throw new RuleError('Este anúncio já foi encerrado.');
    l.closed = true;
    const total = l.quantity > 0 ? this.addItem(l.itemId, l.quantity) : (this.inventory.get(l.itemId) ?? 0);
    return { itemId: l.itemId, total, returned: l.quantity };
  }

  async loadStorage(): Promise<Map<string, number>> {
    return new Map(this.storage);
  }

  async deposit(shopId: string, itemId: string, quantity: number): Promise<StorageResult> {
    this.inTown();
    this.service(shopId, 'storage');
    this.tradable(itemId);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 9999) throw new RuleError('Quantidade inválida');
    const max = content.shops.storage.maxStacks;
    if (!this.storage.has(itemId) && this.storage.size >= max) throw new RuleError(`O armazém está cheio (${max} tipos de item). Retire algo antes.`);
    const total = this.addItem(itemId, -quantity);
    const stored = (this.storage.get(itemId) ?? 0) + quantity;
    this.storage.set(itemId, stored);
    return { itemId, total, stored };
  }

  async withdraw(shopId: string, itemId: string, quantity: number): Promise<StorageResult> {
    this.inTown();
    this.service(shopId, 'storage');
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 9999) throw new RuleError('Quantidade inválida');
    const have = this.storage.get(itemId) ?? 0;
    if (have < quantity) throw new RuleError('Você não tem tudo isso no armazém.');
    const stored = have - quantity;
    if (stored === 0) this.storage.delete(itemId);
    else this.storage.set(itemId, stored);
    return { itemId, total: this.addItem(itemId, quantity), stored };
  }

  /** Mesmas regras de training_*, guild_*, chat_send e ranking (migration social). Offline não há outros jogadores. */
  private training: { startedAt: number; level: number } | null = null;
  private guild: { id: string; name: string; tag: string } | null = null;
  private chat: ChatMessage[] = [];
  private lastChat = 0;

  private trainingState(): TrainingState {
    const t = this.training;
    if (!t) return { training: false, startedAt: 0, level: 0, minutes: 0, xp: 0 };
    const ms = Date.now() - t.startedAt;
    return { training: true, startedAt: t.startedAt, level: t.level, minutes: trainingMinutes(content.social.training, ms), xp: trainingXp(content.social.training, t.level, ms) };
  }

  async loadTraining(): Promise<TrainingState> {
    return this.trainingState();
  }

  async startTraining(): Promise<TrainingState> {
    this.inTown();
    if (this.training) throw new RuleError('Você já está treinando.');
    this.training = { startedAt: Date.now(), level: this.progress.level };
    return this.trainingState();
  }

  async claimTraining(): Promise<TrainingClaim> {
    this.inTown();
    if (!this.training) throw new RuleError('Você não está treinando.');
    const { minutes, xp: gained } = this.trainingState();
    this.training = null;
    const p = this.progress;
    const before = p.level;
    p.xp += gained;
    p.level = levelForXp(p.xp, this.thresholds);
    return { minutes, xpGained: gained, xp: p.xp, level: p.level, leveledUp: p.level > before };
  }

  private selfMember(): GuildMember {
    return { name: 'Você', classId: this.classId, level: this.progress.level, role: 'leader' };
  }

  async loadGuilds(): Promise<GuildBoard> {
    const g = this.guild;
    return {
      maxMembers: content.social.guilds.maxMembers,
      mine: g && { ...g, role: 'leader', members: [this.selfMember()] },
      guilds: g ? [{ ...g, members: 1, totalLevel: this.progress.level }] : [],
    };
  }

  async createGuild(name: string, tag: string): Promise<Wallet & { name: string; tag: string }> {
    this.inTown();
    const rules = content.social.guilds;
    if (this.guild) throw new RuleError('Saia da sua guilda antes de fundar outra.');
    const error = guildNameError(name, tag, rules);
    if (error) throw new RuleError(error);
    if (this.progress.copper < rules.createCost) throw new RuleError(`Fundar uma guilda custa ${rules.createCost} de cobre.`);
    this.progress.copper -= rules.createCost;
    this.guild = { id: 'offline-guild', name: tidyText(name), tag: tidyText(tag).toUpperCase() };
    return { name: this.guild.name, tag: this.guild.tag, copper: this.progress.copper, gold: this.progress.gold };
  }

  async joinGuild(): Promise<void> {
    throw new RuleError('Guilda não encontrada.');
  }

  async leaveGuild(): Promise<void> {
    this.inTown();
    if (!this.guild) throw new RuleError('Você não está numa guilda.');
    // sozinho na guilda: ela acaba junto com o canal dela
    this.guild = null;
    this.chat = this.chat.filter((m) => m.channel === 'global');
  }

  async kickMember(): Promise<void> {
    throw new RuleError('Esse personagem não é da sua guilda.');
  }

  async loadRanking(): Promise<Ranking> {
    const p = this.progress;
    return {
      players: [{ name: 'Você', classId: this.classId, level: p.level, xp: p.xp, guildTag: this.guild?.tag ?? null }],
      guilds: this.guild ? [{ name: this.guild.name, tag: this.guild.tag, members: 1, totalLevel: p.level }] : [],
    };
  }

  async loadChat(): Promise<ChatMessage[]> {
    return [...this.chat];
  }

  async sendChat(channel: 'global' | 'guild', body: string): Promise<ChatMessage> {
    const rules = content.social.chat;
    const m = chatMessage(body, rules);
    if (!m.ok) throw new RuleError(m.error);
    if (channel === 'guild' && !this.guild) throw new RuleError('Você não está numa guilda.');
    if (Date.now() - this.lastChat < rules.cooldownSeconds * 1000) throw new RuleError('Espere um pouco antes de mandar outra mensagem.');
    this.lastChat = Date.now();
    const msg: ChatMessage = { id: `offline-chat-${this.chat.length + 1}`, channel, author: 'Você', body: m.text, at: Date.now() };
    this.chat = [...this.chat, msg].slice(-rules.history);
    return msg;
  }

  onChat(): () => void {
    return () => {};
  }

  joinPresence(info: PresenceInfo, onChange: (online: PresenceInfo[]) => void): Presence {
    let current = info;
    queueMicrotask(() => onChange([current]));
    return {
      update: (next) => {
        current = { ...current, ...next };
        onChange([current]);
      },
      leave: () => {},
    };
  }

  /** Só para o teste de fumaça: adianta o treino em `minutes` minutos. */
  testShiftTraining(minutes: number): void {
    if (this.training) this.training.startedAt -= minutes * 60_000;
  }

  /** Só para o teste de fumaça: libera o intervalo do chat. */
  testResetChatCooldown(): void {
    this.lastChat = 0;
  }

  /** Só para o teste de fumaça: vence um anúncio próprio (para testar o "Recolher"). */
  testExpireListings(): void {
    for (const l of this.listings) l.expiresAt = Date.now() - 1000;
  }

  /** Só para o teste de fumaça: completa uma missão do dia. */
  testCompleteQuest(slot: number): void {
    const q = this.todayQuests().find((x) => x.slot === slot);
    if (q) q.progress = content.quests.templates.find((x) => x.id === q.questId)!.count;
  }
}

export function createBackend(session: PlaySession): GameBackend {
  return session.mode === 'online' ? new OnlineBackend(session.character.id) : new OfflineBackend(session.classId);
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

/** Habilidades aprendidas em memória, sempre iguais ao último valor que o servidor devolveu. */
export class SkillBook extends Phaser.Events.EventEmitter {
  constructor(public readonly learned: LearnedSkills) {
    super();
  }

  grade(skillId: string): number {
    return this.learned.get(skillId) ?? 0;
  }

  set(skillId: string, grade: number): void {
    this.learned.set(skillId, grade);
    this.emit('change');
  }
}

export const getSkills = (scene: Phaser.Scene): SkillBook => scene.registry.get('skills') as SkillBook;

/** Missões do dia em memória. O progresso vem do servidor; `advance` só adianta o número na tela entre uma leitura e outra. */
export class QuestLog extends Phaser.Events.EventEmitter {
  constructor(public board: QuestBoard) {
    super();
  }

  set(board: QuestBoard): void {
    this.board = board;
    this.emit('change');
  }

  /** Avança as missões que o evento conta; devolve as que mudaram (para avisar o jogador). */
  advance(e: QuestEvent): { quest: DailyQuest; count: number; name: string }[] {
    const changed: { quest: DailyQuest; count: number; name: string }[] = [];
    for (const q of this.board.quests) {
      const t = content.quests.templates.find((x) => x.id === q.questId);
      if (!t || q.claimed || q.progress >= t.count) continue;
      const n = questProgress(t, e);
      if (n === 0) continue;
      q.progress = Math.min(t.count, q.progress + n);
      changed.push({ quest: q, count: t.count, name: t.name });
    }
    if (changed.length) this.emit('change');
    return changed;
  }
}

export const getQuests = (scene: Phaser.Scene): QuestLog => scene.registry.get('quests') as QuestLog;

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
