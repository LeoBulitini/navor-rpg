import { sellPrice, shopBuys, type ItemDef, type ShopDef } from '@navor/shared';
import { content } from '../../content.ts';
import { itemIconPath, itemIconFor } from '../../assets/index.ts';
import { friendlyError } from '../../services/errors.ts';
import type { GameBackend, Inventory, Progress, Wallet } from '../backend.ts';
import type { PanelContent, PanelRow, PanelSection, ServicePanel } from './ServicePanel.ts';

export interface ServiceContext {
  backend: GameBackend;
  inventory: Inventory;
  progress: Progress;
  panel: ServicePanel;
  /** dormiu na Taverna: o jogo enche vida e mana */
  onRested: () => void;
}

const coin = (currency: 'copper' | 'gold') => (currency === 'gold' ? 'ouro' : 'cobre');
export const walletText = (w: Wallet) => `Cobre ${w.copper} · Ouro ${w.gold}`;

export function itemRowBase(item: ItemDef): Pick<PanelRow, 'icon' | 'name' | 'color'> {
  return {
    icon: itemIconPath(itemIconFor(item.id)),
    name: item.name,
    color: content.rarities.rarities.find((r) => r.id === item.rarity)?.color,
  };
}

export function effectText(item: ItemDef): string {
  const parts = [];
  if (item.use?.hp) parts.push(`vida +${item.use.hp}`);
  if (item.use?.mana) parts.push(`mana +${item.use.mana}`);
  return parts.join(', ');
}

/** Atualiza moedas e inventário com o que o servidor devolveu. */
export function applyWallet(ctx: ServiceContext, w: Wallet): void {
  ctx.progress.set({ ...ctx.progress.state, copper: w.copper, gold: w.gold });
}

/** Roda uma ação do servidor e mostra o resultado (ou o erro) na janela. */
export async function attempt(ctx: ServiceContext, action: () => Promise<string>): Promise<void> {
  try {
    ctx.panel.say(await action(), 'ok');
  } catch (err) {
    ctx.panel.say(friendlyError(err), 'error');
  }
}

/** Conteúdo da janela de uma loja de NPC (GDD 7.1 e 11): comprar, vender, dormitório e câmbio. */
export function shopContent(shop: ShopDef, ctx: ServiceContext): () => PanelContent {
  const itemById = new Map(content.items.items.map((i) => [i.id, i]));
  const have = (id: string) => ctx.inventory.entries().find(([k]) => k === id)?.[1] ?? 0;

  const buy = (item: ItemDef, qty: number) =>
    attempt(ctx, async () => {
      const r = await ctx.backend.buy(shop.id, item.id, qty);
      ctx.inventory.set(r.itemId, r.total);
      applyWallet(ctx, r);
      return `Comprou ${qty}× ${item.name}.`;
    });
  const sell = (item: ItemDef, qty: number) =>
    attempt(ctx, async () => {
      const r = await ctx.backend.sell(shop.id, item.id, qty);
      ctx.inventory.set(r.itemId, r.total);
      applyWallet(ctx, r);
      return `Vendeu ${qty}× ${item.name} por ${r.earned} de cobre.`;
    });

  return () => {
    const w = ctx.progress.state;
    const sections: PanelSection[] = [];
    if (shop.sells.length > 0) {
      sections.push({
        title: 'À venda',
        rows: shop.sells.map((offer) => {
          const item = itemById.get(offer.item)!;
          const funds = w[offer.currency];
          const effect = effectText(item);
          return {
            ...itemRowBase(item),
            detail: `${offer.price} de ${coin(offer.currency)}${effect ? ` · ${effect}` : ''} · você tem ${have(item.id)}`,
            actions: [1, 5].map((qty) => ({ label: `Comprar ${qty}`, run: () => buy(item, qty), disabled: funds < offer.price * qty })),
          };
        }),
      });
    }
    if (shop.rest) {
      const price = shop.rest.price;
      sections.push({
        title: 'Dormitório',
        rows: [
          {
            name: 'Dormir',
            detail: `${price} de cobre · enche vida e mana`,
            actions: [
              {
                label: 'Dormir',
                disabled: w.copper < price,
                run: () =>
                  attempt(ctx, async () => {
                    applyWallet(ctx, await ctx.backend.rest(shop.id));
                    ctx.onRested();
                    return 'Você dormiu e acordou descansado: vida e mana cheias.';
                  }),
              },
            ],
          },
        ],
      });
    }
    if (shop.exchange) {
      const rate = content.shops.copperPerGold;
      const swap = (to: 'gold' | 'copper', amount: number) =>
        attempt(ctx, async () => {
          applyWallet(ctx, await ctx.backend.exchange(shop.id, to, amount));
          return to === 'gold' ? `Trocou ${amount * rate} de cobre por ${amount} de ouro.` : `Trocou ${amount} de ouro por ${amount * rate} de cobre.`;
        });
      sections.push({
        title: 'Câmbio',
        note: `1 moeda de ouro = ${rate} de cobre.`,
        rows: [
          {
            name: 'Comprar ouro',
            detail: `${rate} de cobre por moeda`,
            actions: [1, 10].map((n) => ({ label: `${n} ouro`, run: () => swap('gold', n), disabled: w.copper < n * rate })),
          },
          {
            name: 'Trocar ouro por cobre',
            detail: `${rate} de cobre por moeda`,
            actions: [1, 10].map((n) => ({ label: `${n} ouro`, run: () => swap('copper', n), disabled: w.gold < n })),
          },
        ],
      });
    }
    const sellable = ctx.inventory
      .entries()
      .map(([id, qty]) => ({ item: itemById.get(id), qty }))
      .filter((x): x is { item: ItemDef; qty: number } => Boolean(x.item) && shopBuys(shop, x.item!));
    if (shop.buys.items.length > 0 || shop.buys.categories.length > 0) {
      sections.push({
        title: 'Vender',
        empty: 'Você não tem nada que este NPC compre.',
        rows: sellable.map(({ item, qty }) => ({
          ...itemRowBase(item),
          detail: `paga ${sellPrice(item, content.rarities, content.shops)} de cobre cada · você tem ${qty}`,
          actions: [
            { label: 'Vender 1', run: () => sell(item, 1) },
            { label: 'Vender tudo', run: () => sell(item, qty) },
          ],
        })),
      });
    }
    return { title: shop.name, subtitle: walletText(w), sections };
  };
}
