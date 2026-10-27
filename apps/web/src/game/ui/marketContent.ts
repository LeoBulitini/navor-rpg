import { marketTax, type ItemDef, type ShopDef } from '@navor/shared';
import { content } from '../../content.ts';
import type { MarketBoard } from '../backend.ts';
import type { PanelInput, PanelRow, PanelSection } from './ServicePanel.ts';
import { applyWallet, attempt, itemRowBase, type ServiceContext } from './shopContent.ts';

/** Estado do mercado e do armazém lido do servidor; recarregado depois de cada ação. */
export interface MarketState {
  board: MarketBoard;
  storage: Map<string, number>;
}

const itemById = new Map(content.items.items.map((i) => [i.id, i]));
const coin = (c: 'copper' | 'gold') => (c === 'gold' ? 'ouro' : 'cobre');

function hoursLeft(at: number): string {
  const h = (at - Date.now()) / 3600_000;
  if (h <= 0) return 'vencido';
  return h < 1 ? 'vence em menos de 1 h' : `vence em ${Math.floor(h)} h`;
}

/** Quantidade digitada, entre 1 e `max` (texto inválido vira 0, e o servidor recusa). */
const qty = (v: string | undefined, max = Infinity) => Math.min(max, Math.max(0, Math.floor(Number(v) || 0)));
const qtyInput = (max: number, value = '1'): PanelInput => ({ id: 'qty', label: 'Quantidade', value, min: 1, max });

/** Itens da bolsa que podem ir ao mercado ou ao armazém (equipamentos ainda não). */
function bagItems(ctx: ServiceContext): { item: ItemDef; qty: number }[] {
  return ctx.inventory
    .entries()
    .map(([id, n]) => ({ item: itemById.get(id), qty: n }))
    .filter((x): x is { item: ItemDef; qty: number } => Boolean(x.item) && !x.item!.equip)
    .sort((a, b) => a.item.name.localeCompare(b.item.name));
}

/** Mercado entre jogadores (prédio com `playerMarket`): comprar, meus anúncios e anunciar. */
export function marketSections(shop: ShopDef, ctx: ServiceContext, state: MarketState, reload: () => Promise<void>): PanelSection[] {
  const rules = content.shops.market;
  const w = ctx.progress.state;
  const offers: PanelRow[] = state.board.offers.map((l) => {
    const item = itemById.get(l.itemId)!;
    return {
      ...itemRowBase(item),
      key: l.id,
      detail: `${l.quantity} à venda · ${l.price} de ${coin(l.currency)} cada · ${l.sellerName} · ${hoursLeft(l.expiresAt)}`,
      inputs: [qtyInput(l.quantity)],
      actions: [
        {
          label: 'Comprar',
          disabled: w[l.currency] < l.price,
          run: (v) =>
            attempt(ctx, async () => {
              const n = qty(v.qty, l.quantity);
              const r = await ctx.backend.buyFromMarket(shop.id, l.id, n);
              ctx.inventory.set(r.itemId, r.total);
              applyWallet(ctx, r);
              await reload();
              return `Comprou ${n}× ${item.name} por ${n * l.price} de ${coin(l.currency)}.`;
            }),
        },
      ],
    };
  });
  const mine: PanelRow[] = state.board.mine.map((l) => {
    const item = itemById.get(l.itemId)!;
    const expired = l.expiresAt <= Date.now();
    return {
      ...itemRowBase(item),
      key: l.id,
      detail: `${l.quantity} sobrando · ${l.price} de ${coin(l.currency)} cada · ${hoursLeft(l.expiresAt)}`,
      actions: [
        {
          label: expired ? 'Recolher' : 'Cancelar',
          run: () =>
            attempt(ctx, async () => {
              const r = await ctx.backend.cancelListing(shop.id, l.id);
              ctx.inventory.set(r.itemId, r.total);
              await reload();
              return r.returned > 0 ? `${r.returned}× ${item.name} voltaram para a bolsa.` : 'Anúncio encerrado.';
            }),
        },
      ],
    };
  });
  const sell: PanelRow[] = bagItems(ctx).map(({ item, qty: have }) => {
    const suggested = Math.max(1, item.value ?? content.rarities.rarities.find((r) => r.id === item.rarity)?.value ?? 1);
    return {
      ...itemRowBase(item),
      key: `sell:${item.id}`,
      detail: `você tem ${have}`,
      inputs: [
        qtyInput(have),
        { id: 'price', label: 'Preço por unidade', value: String(suggested), min: 1, max: rules.maxPricePerUnit },
        { id: 'currency', label: 'Moeda', value: 'copper', options: [{ value: 'copper', label: 'cobre' }, { value: 'gold', label: 'ouro' }] },
      ],
      actions: [
        {
          label: 'Anunciar',
          run: (v) =>
            attempt(ctx, async () => {
              const n = qty(v.qty, have);
              const price = qty(v.price);
              const currency = v.currency === 'gold' ? 'gold' : 'copper';
              const r = await ctx.backend.listOnMarket(shop.id, item.id, n, price, currency);
              ctx.inventory.set(r.itemId, r.total);
              await reload();
              const tax = marketTax(n * price, rules);
              return `Anunciou ${n}× ${item.name} por ${price} de ${coin(currency)} cada. Se vender tudo, recebe ${n * price - tax} (taxa ${tax}).`;
            }),
        },
      ],
    };
  });
  return [
    {
      title: 'Anúncios de outros jogadores',
      rows: offers,
      empty: ctx.backend.saves ? 'Ninguém está vendendo nada agora.' : 'No modo offline não há outros jogadores.',
    },
    { title: 'Meus anúncios', rows: mine, empty: 'Você não tem anúncios abertos.' },
    {
      title: 'Anunciar',
      rows: sell,
      empty: 'Sua bolsa não tem itens para anunciar.',
      note: `O item fica guardado no anúncio até alguém comprar. Taxa de ${rules.taxPercent}% sobre cada venda; até ${rules.maxListings} anúncios; vencem em ${rules.expiresHours} h (depois, recolha o que sobrou). Equipamentos ainda não podem ser anunciados.`,
    },
  ];
}

/** Armazém da conta (prédio com `storage`): guardar e retirar. */
export function storageSections(shop: ShopDef, ctx: ServiceContext, state: MarketState): PanelSection[] {
  const max = content.shops.storage.maxStacks;
  const put = (itemId: string, n: number, back: boolean) =>
    attempt(ctx, async () => {
      const r = back ? await ctx.backend.withdraw(shop.id, itemId, n) : await ctx.backend.deposit(shop.id, itemId, n);
      ctx.inventory.set(r.itemId, r.total);
      if (r.stored > 0) state.storage.set(r.itemId, r.stored);
      else state.storage.delete(r.itemId);
      const name = itemById.get(itemId)?.name ?? itemId;
      return back ? `Retirou ${n}× ${name}.` : `Guardou ${n}× ${name}.`;
    });
  const stored: PanelRow[] = [...state.storage.entries()]
    .map(([id, n]) => ({ item: itemById.get(id)!, n }))
    .sort((a, b) => a.item.name.localeCompare(b.item.name))
    .map(({ item, n }) => ({
      ...itemRowBase(item),
      key: `out:${item.id}`,
      detail: `guardado: ${n}`,
      inputs: [qtyInput(n, String(n))],
      actions: [{ label: 'Retirar', run: (v) => put(item.id, qty(v.qty, n), true) }],
    }));
  const bag: PanelRow[] = bagItems(ctx).map(({ item, qty: have }) => ({
    ...itemRowBase(item),
    key: `in:${item.id}`,
    detail: `na bolsa: ${have}`,
    inputs: [qtyInput(have, String(have))],
    actions: [{ label: 'Guardar', run: (v) => put(item.id, qty(v.qty, have), false) }],
  }));
  return [
    {
      title: `No armazém (${state.storage.size}/${max} tipos)`,
      rows: stored,
      empty: 'O armazém está vazio.',
      note: 'O armazém é da sua conta: todos os seus personagens usam o mesmo.',
    },
    { title: 'Guardar da bolsa', rows: bag, empty: 'Sua bolsa não tem itens para guardar.' },
  ];
}
