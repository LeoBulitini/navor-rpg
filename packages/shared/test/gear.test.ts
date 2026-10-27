import { describe, expect, it } from 'vitest';
import {
  canEquip,
  canUpgrade,
  equippedStats,
  gatherBlock,
  gearAttackBonus,
  gearSellPrice,
  loadContent,
  maxUpgrade,
  pieceStats,
  requiredToolTier,
  sellPrice,
  upgradeCost,
  upgradedStat,
  type GearPiece,
} from '../src/index.ts';
import { readRawContent } from '../node/fs-content.ts';

const content = loadContent(readRawContent());
const { items, rarities, shops, equipment, recipes } = content;
const itemById = new Map(items.items.map((i) => [i.id, i]));
const item = (id: string) => itemById.get(id)!;
const piece = (itemId: string, upgrade = 0, slot: string | null = item(itemId).equip!.slot): GearPiece => ({ id: itemId, itemId, upgrade, slot });

describe('equipamentos', () => {
  it('melhoria soma 15% por nível, arredondando para cima, e não mexe em atributo zero', () => {
    expect(upgradedStat(3, 0, 15)).toBe(3);
    expect(upgradedStat(3, 1, 15)).toBe(4);
    expect(upgradedStat(20, 1, 15)).toBe(23);
    expect(upgradedStat(8, 5, 15)).toBe(14);
    expect(upgradedStat(0, 5, 15)).toBe(0);
    expect(pieceStats(item('sword-iron'), 2, equipment).physAttack).toBe(8 + Math.ceil((8 * 30) / 100));
  });

  it('só as peças equipadas contam, e o bônus de ataque usa o maior entre físico e mágico', () => {
    const gear = [piece('staff-crystal'), piece('amulet-fangs'), piece('chest-iron', 0, null)];
    const s = equippedStats(gear, itemById, equipment);
    expect(s.magAttack).toBe(10);
    expect(s.physAttack).toBe(2);
    expect(s.hp).toBe(0);
    expect(gearAttackBonus(gear, itemById, equipment)).toBe(8 + 2);
  });

  it('armas respeitam o caminho da classe; armaduras servem para todos', () => {
    expect(canEquip(item('staff-apprentice'), 'magic')).toBe(true);
    expect(canEquip(item('staff-apprentice'), 'melee')).toBe(false);
    expect(canEquip(item('chest-leather'), 'ranged')).toBe(true);
    expect(canEquip(item('iron'), 'magic')).toBe(false);
  });

  it('cada caminho tem uma arma à venda no Ferreiro', () => {
    const blacksmith = shops.shops.find((s) => s.id === 'blacksmith')!;
    for (const path of content.classes.paths) {
      expect(blacksmith.sells.some((o) => item(o.item).category === 'weapon' && canEquip(item(o.item), path.id)), path.id).toBe(true);
    }
  });

  it('melhoria tem custo crescente até o nível máximo; ferramentas não melhoram', () => {
    const sword = item('sword-iron');
    expect(upgradeCost(sword, 0, equipment)).toEqual({ copper: 20, gold: 0, material: 'iron', materials: 1 });
    expect(upgradeCost(sword, maxUpgrade(equipment), equipment)).toBeNull();
    expect(canUpgrade(item('pickaxe-iron'), 0, equipment)).toBe(false);
    const costs = equipment.upgrade.costs;
    for (let i = 1; i < costs.length; i++) expect(costs[i]!.copper).toBeGreaterThan(costs[i - 1]!.copper);
  });

  it('fabricar e vender nunca dá lucro', () => {
    for (const r of recipes.recipes) {
      const spent = r.copper + r.gold * shops.copperPerGold + r.materials.reduce((sum, m) => sum + sellPrice(item(m.item), rarities, shops) * m.quantity, 0);
      expect(gearSellPrice(item(r.item), 0, rarities, shops, equipment), r.id).toBeLessThan(spent);
    }
  });

  it('melhorar e vender nunca dá lucro', () => {
    for (const it of items.items.filter((i) => i.equip?.upgradeMaterial)) {
      for (let u = 0; u < maxUpgrade(equipment); u++) {
        const c = upgradeCost(it, u, equipment)!;
        const spent = c.copper + c.gold * shops.copperPerGold + sellPrice(item(c.material), rarities, shops) * c.materials;
        const gain = gearSellPrice(it, u + 1, rarities, shops, equipment) - gearSellPrice(it, u, rarities, shops, equipment);
        expect(gain, `${it.id} +${u + 1}`).toBeLessThan(spent);
      }
    }
  });

  it('depósitos raros pedem picareta ou machado do nível certo', () => {
    expect(requiredToolTier(item('iron'), equipment)).toBe(0);
    expect(requiredToolTier(item('gold-ore'), equipment)).toBe(1);
    expect(requiredToolTier(item('mithril'), equipment)).toBe(2);
    expect(requiredToolTier(item('blue-flower'), equipment)).toBe(0);
    expect(gatherBlock(item('gold-ore'), [], itemById, equipment)).toMatch(/Picareta de nível 1/);
    expect(gatherBlock(item('gold-ore'), [piece('pickaxe-iron')], itemById, equipment)).toBeNull();
    expect(gatherBlock(item('gold-ore'), [piece('pickaxe-iron', 0, null)], itemById, equipment)).not.toBeNull();
    expect(gatherBlock(item('wood-ancient'), [piece('pickaxe-silver')], itemById, equipment)).toMatch(/Machado/);
    expect(gatherBlock(item('mithril'), [piece('pickaxe-silver')], itemById, equipment)).toBeNull();
  });

  it('todo recurso raro que sai numa área tem ferramenta à venda ou fabricável', () => {
    const blacksmith = shops.shops.find((s) => s.id === 'blacksmith')!;
    const obtainable = new Set([...blacksmith.sells.map((o) => o.item), ...recipes.recipes.map((r) => r.item)]);
    for (const area of content.procedural.areas) {
      for (const id of area.resources?.items ?? []) {
        const need = requiredToolTier(item(id), equipment);
        if (need === 0) continue;
        const ok = [...obtainable].some((t) => item(t).equip?.slot === item(id).gather && (item(t).equip?.toolTier ?? 0) >= need);
        expect(ok, `${area.id}: ${id}`).toBe(true);
      }
    }
  });
});
