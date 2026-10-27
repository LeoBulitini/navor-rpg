import { describe, expect, it } from 'vitest';
import { exchange, itemValue, loadContent, sellPrice, shopBuys } from '../src/index.ts';
import { readRawContent } from '../node/fs-content.ts';

const content = loadContent(readRawContent());
const { items, rarities, shops } = content;
const item = (id: string) => items.items.find((i) => i.id === id)!;

describe('economia', () => {
  it('valor do item: o próprio ou o da raridade', () => {
    expect(itemValue(item('potion-health-small'), rarities)).toBe(15);
    expect(itemValue(item('iron'), rarities)).toBe(rarities.rarities.find((r) => r.id === 'common')!.value);
  });

  it('o NPC paga a fração configurada do valor, pelo menos 1 cobre', () => {
    expect(sellPrice(item('potion-health-small'), rarities, shops)).toBe(6);
    for (const i of items.items) expect(sellPrice(i, rarities, shops)).toBeGreaterThanOrEqual(1);
  });

  it('nenhum item comprado de um NPC pode ser revendido com lucro (sem dinheiro infinito)', () => {
    for (const shop of shops.shops) {
      for (const offer of shop.sells.filter((o) => o.currency === 'copper')) {
        for (const buyer of shops.shops.filter((s) => shopBuys(s, item(offer.item)))) {
          expect(sellPrice(item(offer.item), rarities, shops), `${offer.item} em ${buyer.id}`).toBeLessThan(offer.price);
        }
      }
    }
  });

  it('cada NPC compra só o que o catálogo dele diz', () => {
    const alchemist = shops.shops.find((s) => s.id === 'alchemist')!;
    expect(shopBuys(alchemist, item('potion-mana'))).toBe(true);
    expect(shopBuys(alchemist, item('mushroom-common'))).toBe(true);
    expect(shopBuys(alchemist, item('iron'))).toBe(false);
  });

  it('câmbio de 100 cobre por 1 ouro, nos dois sentidos, sem saldo negativo', () => {
    expect(exchange({ copper: 250, gold: 0 }, 'gold', 2, 100)).toEqual({ copper: 50, gold: 2 });
    expect(exchange({ copper: 0, gold: 3 }, 'copper', 1, 100)).toEqual({ copper: 100, gold: 2 });
    expect(() => exchange({ copper: 99, gold: 0 }, 'gold', 1, 100)).toThrow(/Cobre insuficiente/);
    expect(() => exchange({ copper: 0, gold: 0 }, 'copper', 1, 100)).toThrow(/Ouro insuficiente/);
    expect(() => exchange({ copper: 1000, gold: 0 }, 'gold', 0, 100)).toThrow(/inválida/);
  });

  it('poções e comidas têm efeito; os demais itens não', () => {
    for (const i of items.items) {
      const usable = i.category === 'potion' || i.category === 'food';
      expect(Boolean(i.use && (i.use.hp > 0 || i.use.mana > 0)), i.id).toBe(usable);
    }
  });
});
