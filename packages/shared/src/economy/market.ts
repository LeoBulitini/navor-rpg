import type { Shops } from '../content/schemas.ts';

/** Taxa do mercado sobre uma venda (sai do que o vendedor recebe). Mesma regra de market_buy. */
export function marketTax(total: number, market: Shops['market']): number {
  return Math.floor((total * market.taxPercent) / 100);
}

/** O que o vendedor recebe de uma venda de `quantity` unidades a `price` cada. */
export function sellerProceeds(price: number, quantity: number, market: Shops['market']): number {
  const total = price * quantity;
  return total - marketTax(total, market);
}
