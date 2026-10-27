import type { ItemDef, Rarities, ShopDef, Shops } from '../content/schemas.ts';

/** Valor de um item em cobre: o próprio 'value' ou o da raridade. */
export function itemValue(item: ItemDef, rarities: Rarities): number {
  return item.value ?? rarities.rarities.find((r) => r.id === item.rarity)?.value ?? 0;
}

/** Quanto o NPC paga por unidade ao comprar do jogador (pelo menos 1 cobre). */
export function sellPrice(item: ItemDef, rarities: Rarities, shops: Shops): number {
  return Math.max(1, Math.floor(itemValue(item, rarities) * shops.sellRate));
}

export function shopBuys(shop: ShopDef, item: ItemDef): boolean {
  return shop.buys.items.includes(item.id) || shop.buys.categories.includes(item.category);
}

export interface Wallet {
  copper: number;
  gold: number;
}

/**
 * Câmbio: `amount` moedas do destino. Para ouro, paga `copperPerGold` de cobre por moeda; para cobre,
 * troca `amount` moedas de ouro. É a mesma regra de exchange_currency no banco.
 */
export function exchange(wallet: Wallet, to: 'gold' | 'copper', amount: number, copperPerGold: number): Wallet {
  if (!Number.isInteger(amount) || amount < 1 || amount > 1000) throw new Error('Quantidade inválida');
  if (to === 'gold') {
    const cost = amount * copperPerGold;
    if (wallet.copper < cost) throw new Error('Cobre insuficiente.');
    return { copper: wallet.copper - cost, gold: wallet.gold + amount };
  }
  if (wallet.gold < amount) throw new Error('Ouro insuficiente.');
  return { copper: wallet.copper + amount * copperPerGold, gold: wallet.gold - amount };
}
