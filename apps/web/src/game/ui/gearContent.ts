import {
  canEquip,
  canUpgrade,
  equippedStats,
  gearSellPrice,
  pieceStats,
  shopBuys,
  upgradeCost,
  withGear,
  type CharacterStats,
  type GearPiece,
  type GearStats,
  type ItemDef,
  type ShopDef,
} from '@navor/shared';
import { content } from '../../content.ts';
import { applyWallet, attempt, itemRowBase, walletText, type ServiceContext } from './shopContent.ts';
import type { PanelContent, PanelRow, PanelSection } from './ServicePanel.ts';

const itemById = new Map(content.items.items.map((i) => [i.id, i]));
const { equipment } = content;
const slotName = (id: string) => equipment.slots.find((s) => s.id === id)?.name ?? id;
const itemName = (id: string) => itemById.get(id)?.name ?? id;

const STAT_LABELS: [keyof GearStats, string][] = [
  ['physAttack', 'Atq. físico'],
  ['magAttack', 'Atq. mágico'],
  ['physDefense', 'Def. física'],
  ['magDefense', 'Def. mágica'],
  ['hp', 'Vida'],
  ['mana', 'Mana'],
  ['precision', 'Precisão'],
];

export function gearStatsText(s: GearStats): string {
  return STAT_LABELS.filter(([k]) => s[k] > 0)
    .map(([k, label]) => `${label} +${s[k]}`)
    .join(', ');
}

/** Atributos, ferramenta e quem usa: o texto de uma peça nas janelas. */
export function gearDetail(item: ItemDef, upgrade = 0, pathId?: string): string {
  const e = item.equip!;
  const parts = [slotName(e.slot)];
  const stats = gearStatsText(pieceStats(item, upgrade, equipment));
  if (stats) parts.push(stats);
  if (e.toolTier) parts.push(`ferramenta nível ${e.toolTier}`);
  if (pathId && !canEquip(item, pathId)) parts.push('sua classe não usa');
  return parts.join(' · ');
}

export const gearLabel = (item: ItemDef, upgrade: number) => (upgrade > 0 ? `${item.name} +${upgrade}` : item.name);

export function gearRowBase(g: GearPiece): Pick<PanelRow, 'icon' | 'name' | 'color'> {
  const item = itemById.get(g.itemId)!;
  return { ...itemRowBase(item), name: gearLabel(item, g.upgrade) };
}

const have = (ctx: ServiceContext, id: string) => ctx.inventory.entries().find(([k]) => k === id)?.[1] ?? 0;

/** Ferreiro: o que fabrica (receitas de content/recipes.json). */
export function craftSection(shop: ShopDef, ctx: ServiceContext): PanelSection | null {
  const recipes = content.recipes.recipes.filter((r) => r.shop === shop.id);
  if (recipes.length === 0) return null;
  const w = ctx.progress.state;
  return {
    title: 'Fabricar',
    note: 'Os materiais saem do inventário. A fabricação nunca falha.',
    rows: recipes.map((r) => {
      const item = itemById.get(r.item)!;
      const mats = r.materials.map((m) => `${m.quantity}× ${itemName(m.item)} (${have(ctx, m.item)})`).join(', ');
      const coins = [r.copper ? `${r.copper} cobre` : '', r.gold ? `${r.gold} ouro` : ''].filter(Boolean).join(' + ');
      const ok = r.materials.every((m) => have(ctx, m.item) >= m.quantity) && w.copper >= r.copper && w.gold >= r.gold;
      return {
        ...itemRowBase(item),
        detail: `${item.equip ? gearDetail(item, 0, ctx.pathId) : ''} · ${mats}${coins ? ` · ${coins}` : ''}`,
        actions: [
          {
            label: 'Fabricar',
            disabled: !ok,
            run: () =>
              attempt(ctx, async () => {
                const res = await ctx.backend.craft(r.id);
                for (const m of res.materials) ctx.inventory.set(m.itemId, m.total);
                if (res.gear) ctx.gear.put(res.gear);
                else ctx.inventory.set(res.itemId, res.total);
                applyWallet(ctx, res);
                return `Fabricou ${item.name}.`;
              }),
          },
        ],
      };
    }),
  };
}

/** Ferreiro: melhorar as peças (+1 por vez, até o máximo de equipment.json). */
export function upgradeSection(shop: ShopDef, ctx: ServiceContext): PanelSection | null {
  if (!shop.upgrades) return null;
  const w = ctx.progress.state;
  const pieces = ctx.gear.list().filter((g) => itemById.get(g.itemId)?.equip?.upgradeMaterial);
  return {
    title: 'Melhorar',
    empty: 'Você não tem peças que possam ser melhoradas.',
    note: `Cada nível soma ${equipment.upgrade.statPercentPerLevel}% dos atributos da peça, até +${equipment.upgrade.costs.length}. A melhoria nunca falha.`,
    rows: pieces.map((g) => {
      const item = itemById.get(g.itemId)!;
      const cost = upgradeCost(item, g.upgrade, equipment);
      if (!cost || !canUpgrade(item, g.upgrade, equipment)) {
        return { ...gearRowBase(g), detail: `${gearDetail(item, g.upgrade)} · nível máximo`, actions: [] };
      }
      const next = gearStatsText(pieceStats(item, g.upgrade + 1, equipment));
      const coins = [`${cost.copper} cobre`, cost.gold ? `${cost.gold} ouro` : ''].filter(Boolean).join(' + ');
      const ok = w.copper >= cost.copper && w.gold >= cost.gold && have(ctx, cost.material) >= cost.materials;
      return {
        ...gearRowBase(g),
        detail: `+${g.upgrade + 1}: ${next} · ${cost.materials}× ${itemName(cost.material)} (${have(ctx, cost.material)}) + ${coins}${g.slot ? ' · equipada' : ''}`,
        actions: [
          {
            label: `Melhorar para +${g.upgrade + 1}`,
            disabled: !ok,
            run: () =>
              attempt(ctx, async () => {
                const res = await ctx.backend.upgrade(shop.id, g.id);
                ctx.inventory.set(res.material.itemId, res.material.total);
                ctx.gear.put(res.gear);
                applyWallet(ctx, res);
                return `${item.name} agora é +${res.gear.upgrade}.`;
              }),
          },
        ],
      };
    }),
  };
}

/** Linhas de venda das peças que o NPC compra. */
export function gearSellRows(shop: ShopDef, ctx: ServiceContext): PanelRow[] {
  return ctx.gear
    .list()
    .filter((g) => shopBuys(shop, itemById.get(g.itemId)!))
    .map((g) => {
      const item = itemById.get(g.itemId)!;
      const price = gearSellPrice(item, g.upgrade, content.rarities, content.shops, equipment);
      return {
        ...gearRowBase(g),
        detail: `paga ${price} de cobre${g.slot ? ' · equipada' : ''}`,
        actions: [
          {
            label: 'Vender',
            run: () =>
              attempt(ctx, async () => {
                const res = await ctx.backend.sellGear(shop.id, g.id);
                ctx.gear.remove(res.gearId);
                applyWallet(ctx, res);
                return `Vendeu ${gearLabel(item, g.upgrade)} por ${res.earned} de cobre.`;
              }),
          },
        ],
      };
    });
}

export interface EquipmentContext extends Omit<ServiceContext, 'onRested'> {
  /** atributos do personagem sem equipamento (nível e classe) */
  baseStats: () => CharacterStats;
}

/** Janela de equipamento (tecla C): o que está em cada espaço, a bolsa e os atributos com os bônus. */
export function equipmentContent(ctx: EquipmentContext): () => PanelContent {
  const equip = (g: GearPiece) =>
    attempt(ctx, async () => {
      const res = await ctx.backend.equip(g.id);
      ctx.gear.put(res.gear, res.unequipped);
      return `Equipou ${gearLabel(itemById.get(g.itemId)!, g.upgrade)}.`;
    });
  const unequip = (g: GearPiece) =>
    attempt(ctx, async () => {
      ctx.gear.put(await ctx.backend.unequip(g.id));
      return `Guardou ${gearLabel(itemById.get(g.itemId)!, g.upgrade)} na bolsa.`;
    });

  return () => {
    const pieces = ctx.gear.list();
    const equipped = equipment.slots.map((slot) => ({ slot, piece: pieces.find((g) => g.slot === slot.id) }));
    const bag = pieces.filter((g) => !g.slot).sort((a, b) => a.itemId.localeCompare(b.itemId) || b.upgrade - a.upgrade);
    const total = withGear(ctx.baseStats(), equippedStats(pieces, itemById, equipment));
    const r = (n: number) => Math.round(n * 10) / 10;
    return {
      title: 'Equipamento',
      subtitle: walletText(ctx.progress.state),
      sections: [
        {
          title: 'Equipado',
          rows: equipped.map(({ slot, piece }) =>
            piece
              ? {
                  ...gearRowBase(piece),
                  name: `${slot.name}: ${gearRowBase(piece).name}`,
                  detail: gearDetail(itemById.get(piece.itemId)!, piece.upgrade),
                  actions: [{ label: 'Tirar', run: () => unequip(piece) }],
                }
              : { name: `${slot.name}: vazio`, actions: [] },
          ),
        },
        {
          title: 'Bolsa',
          empty: 'Nenhuma peça guardada. O Ferreiro vende, fabrica e melhora equipamentos.',
          note: `${pieces.length} de ${equipment.maxPieces} peças.`,
          rows: bag.map((g) => {
            const item = itemById.get(g.itemId)!;
            return {
              ...gearRowBase(g),
              detail: gearDetail(item, g.upgrade, ctx.pathId),
              actions: [{ label: 'Equipar', run: () => equip(g), disabled: !canEquip(item, ctx.pathId) }],
            };
          }),
        },
        {
          title: 'Atributos',
          rows: [
            { name: `Vida ${total.maxHp} · Mana ${total.maxMana}`, actions: [] },
            { name: `Ataque físico ${r(total.physAttack)} · mágico ${r(total.magAttack)}`, actions: [] },
            { name: `Defesa física ${r(total.physDefense)} · mágica ${r(total.magDefense)}`, actions: [] },
            { name: `Precisão ${r(total.precision)} · Crítico ${Math.round(total.critChance * 1000) / 10}%`, actions: [] },
          ],
        },
      ],
    };
  };
}
