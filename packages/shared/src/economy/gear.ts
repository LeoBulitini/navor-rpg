import type { CharacterStats } from '../combat/progression.ts';
import type { Equipment, GearStats, ItemDef, Rarities, Shops } from '../content/schemas.ts';
import { sellPrice, type Wallet } from './shop.ts';

/** Uma peça de equipamento do personagem. `slot` é o espaço em que está equipada (null = na bolsa). */
export interface GearPiece {
  id: string;
  itemId: string;
  upgrade: number;
  slot: string | null;
}

const STAT_KEYS = ['hp', 'mana', 'physAttack', 'magAttack', 'physDefense', 'magDefense', 'precision'] as const;

export const emptyGearStats = (): GearStats => ({ hp: 0, mana: 0, physAttack: 0, magAttack: 0, physDefense: 0, magDefense: 0, precision: 0 });

/** Atributo de uma peça melhorada: base + percent% × nível, arredondado para cima. Igual a gear_stat no banco. */
export function upgradedStat(base: number, upgrade: number, percentPerLevel: number): number {
  if (base <= 0 || upgrade <= 0) return base;
  return base + Math.ceil((base * percentPerLevel * upgrade) / 100);
}

export function pieceStats(item: ItemDef, upgrade: number, equipment: Equipment): GearStats {
  const out = emptyGearStats();
  const stats = item.equip?.stats;
  if (!stats) return out;
  for (const k of STAT_KEYS) out[k] = upgradedStat(stats[k], upgrade, equipment.upgrade.statPercentPerLevel);
  return out;
}

/** Soma dos bônus das peças equipadas. */
export function equippedStats(gear: GearPiece[], itemById: Map<string, ItemDef>, equipment: Equipment): GearStats {
  const total = emptyGearStats();
  for (const g of gear) {
    const item = itemById.get(g.itemId);
    if (!g.slot || !item) continue;
    const s = pieceStats(item, g.upgrade, equipment);
    for (const k of STAT_KEYS) total[k] += s[k];
  }
  return total;
}

/**
 * Bônus de ataque que o servidor soma ao teto de dano por segundo: para cada peça equipada, o maior
 * entre ataque físico e mágico (um golpe usa só um dos dois). Igual a gear_attack_bonus no banco.
 */
export function gearAttackBonus(gear: GearPiece[], itemById: Map<string, ItemDef>, equipment: Equipment): number {
  let total = 0;
  for (const g of gear) {
    const item = itemById.get(g.itemId);
    if (!g.slot || !item) continue;
    const s = pieceStats(item, g.upgrade, equipment);
    total += Math.max(s.physAttack, s.magAttack);
  }
  return total;
}

export function withGear(stats: CharacterStats, bonus: GearStats): CharacterStats {
  return {
    ...stats,
    maxHp: stats.maxHp + bonus.hp,
    maxMana: stats.maxMana + bonus.mana,
    physAttack: stats.physAttack + bonus.physAttack,
    magAttack: stats.magAttack + bonus.magAttack,
    physDefense: stats.physDefense + bonus.physDefense,
    magDefense: stats.magDefense + bonus.magDefense,
    precision: stats.precision + bonus.precision,
  };
}

/** A classe (pelo caminho) pode usar a peça? */
export function canEquip(item: ItemDef, pathId: string): boolean {
  if (!item.equip) return false;
  return !item.equip.paths || item.equip.paths.includes(pathId);
}

export const maxUpgrade = (equipment: Equipment) => equipment.upgrade.costs.length;

export function canUpgrade(item: ItemDef, upgrade: number, equipment: Equipment): boolean {
  return Boolean(item.equip?.upgradeMaterial) && upgrade < maxUpgrade(equipment);
}

/** Custo para levar a peça do nível `upgrade` ao seguinte. */
export function upgradeCost(item: ItemDef, upgrade: number, equipment: Equipment): (Wallet & { material: string; materials: number }) | null {
  if (!canUpgrade(item, upgrade, equipment)) return null;
  const c = equipment.upgrade.costs[upgrade]!;
  return { copper: c.copper, gold: c.gold, material: item.equip!.upgradeMaterial!, materials: c.materials };
}

/** Quanto o Ferreiro paga por uma peça: preço de venda × (1 + bônus × nível). Igual a sell_gear no banco. */
export function gearSellPrice(item: ItemDef, upgrade: number, rarities: Rarities, shops: Shops, equipment: Equipment): number {
  return Math.floor(sellPrice(item, rarities, shops) * (1 + equipment.sellBonusPerUpgrade * upgrade));
}

/** Nível de ferramenta que um depósito desse item pede (0 = nenhum). */
export function requiredToolTier(item: ItemDef, equipment: Equipment): number {
  if (!item.gather) return 0;
  return equipment.gatherTiers[item.rarity] ?? 0;
}

/** Nível da ferramenta equipada num espaço (0 sem ferramenta). */
export function equippedToolTier(gear: GearPiece[], itemById: Map<string, ItemDef>, slot: string): number {
  const piece = gear.find((g) => g.slot === slot);
  return piece ? (itemById.get(piece.itemId)?.equip?.toolTier ?? 0) : 0;
}

/** null se pode coletar; senão, o motivo. Igual à conferência de collect_node. */
export function gatherBlock(item: ItemDef, gear: GearPiece[], itemById: Map<string, ItemDef>, equipment: Equipment): string | null {
  const need = requiredToolTier(item, equipment);
  if (need === 0) return null;
  if (equippedToolTier(gear, itemById, item.gather!) >= need) return null;
  const toolName = equipment.slots.find((s) => s.id === item.gather)?.name ?? item.gather!;
  return `Precisa de ${toolName} de nível ${need} equipada.`;
}
