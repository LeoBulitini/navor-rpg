import { describe, expect, it } from 'vitest';
import { loadContent, marketTax, sellerProceeds } from '../src/index.ts';
import { readRawContent } from '../node/fs-content.ts';

const { shops } = loadContent(readRawContent());

describe('mercado entre jogadores', () => {
  it('a taxa é a porcentagem do total, arredondada para baixo', () => {
    expect(marketTax(100, shops.market)).toBe(Math.floor(shops.market.taxPercent));
    expect(marketTax(19, { ...shops.market, taxPercent: 5 })).toBe(0);
    expect(marketTax(20, { ...shops.market, taxPercent: 5 })).toBe(1);
  });

  it('o vendedor recebe o total menos a taxa, nunca mais do que o comprador pagou', () => {
    for (const [price, qty] of [[1, 1], [50, 2], [999, 7], [100000, 999]] as const) {
      const got = sellerProceeds(price, qty, shops.market);
      expect(got).toBeLessThanOrEqual(price * qty);
      expect(got).toBe(price * qty - marketTax(price * qty, shops.market));
    }
  });

  it('um prédio tem o mercado e outro o armazém', () => {
    expect(shops.shops.filter((s) => s.playerMarket).map((s) => s.id)).toEqual(['market']);
    expect(shops.shops.filter((s) => s.storage).map((s) => s.id)).toEqual(['warehouse']);
  });
});
