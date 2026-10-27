import { describe, expect, it } from 'vitest';
import { createRng, exitAt, generateCave, loadContent, parseAsciiMap, placeResourceNodes, reachableFrom, rollResourceNodes } from '../src/index.ts';
import { readRawContent } from '../node/fs-content.ts';

const content = loadContent(readRawContent());
const config = content.procedural.areas.find((a) => a.id === 'cave')!;
const res = config.resources!;
const { tiles } = content;
const cheb = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

describe('pontos de coleta: posição', () => {
  it('a mesma seed dá as mesmas posições', () => {
    const cave = generateCave(config, tiles, 777);
    const map = parseAsciiMap(cave.map, tiles);
    expect(placeResourceNodes(map, cave.seed, 10, res)).toEqual(placeResourceNodes(map, cave.seed, 10, res));
  });

  it('pedir menos pontos dá o começo da mesma lista', () => {
    const cave = generateCave(config, tiles, 99);
    const map = parseAsciiMap(cave.map, tiles);
    expect(placeResourceNodes(map, cave.seed, 8, res)).toEqual(placeResourceNodes(map, cave.seed, 12, res).slice(0, 8));
  });

  it('500 seeds com o máximo de pontos: todos em chão alcançável, fora das saídas e espaçados', () => {
    for (let i = 0; i < 500; i++) {
      const cave = generateCave(config, tiles, i * 2654435761);
      const map = parseAsciiMap(cave.map, tiles);
      const reach = reachableFrom(map, map.spawn);
      const nodes = placeResourceNodes(map, cave.seed, res.nodes.max, res);
      expect(nodes).toHaveLength(res.nodes.max);
      for (const [k, p] of nodes.entries()) {
        expect(reach.has(`${p.x},${p.y}`)).toBe(true);
        expect(exitAt(map, p)).toBeUndefined();
        expect(cheb(p, map.spawn)).toBeGreaterThanOrEqual(res.clearance);
        for (const e of map.exits) expect(cheb(p, e)).toBeGreaterThanOrEqual(res.clearance);
        for (const q of nodes.slice(k + 1)) expect(cheb(p, q)).toBeGreaterThanOrEqual(res.minDistance);
      }
    }
  });
});

describe('pontos de coleta: sorteio (modo offline)', () => {
  it('respeita a quantidade de pontos, os itens da Gruta e a faixa de cada raridade', () => {
    const rarityOf = new Map(content.items.items.map((i) => [i.id, i.rarity]));
    const rng = createRng(42);
    for (let run = 0; run < 300; run++) {
      const nodes = rollResourceNodes(res, content.items, rng);
      expect(nodes.length).toBeGreaterThanOrEqual(res.nodes.min);
      expect(nodes.length).toBeLessThanOrEqual(res.nodes.max);
      nodes.forEach((n, i) => {
        expect(n.index).toBe(i);
        expect(res.items).toContain(n.itemId);
        const rule = res.rarities.find((r) => r.rarity === rarityOf.get(n.itemId))!;
        expect(n.quantity).toBeGreaterThanOrEqual(rule.quantity.min);
        expect(n.quantity).toBeLessThanOrEqual(rule.quantity.max);
      });
    }
  });

  it('a proporção de raridades fica perto dos pesos', () => {
    const rarityOf = new Map(content.items.items.map((i) => [i.id, i.rarity]));
    const rng = createRng(7);
    const counts = new Map<string, number>();
    let total = 0;
    for (let run = 0; run < 2000; run++) {
      for (const n of rollResourceNodes(res, content.items, rng)) {
        const r = rarityOf.get(n.itemId)!;
        counts.set(r, (counts.get(r) ?? 0) + 1);
        total++;
      }
    }
    const weights = res.rarities.reduce((s, r) => s + r.weight, 0);
    for (const r of res.rarities) expect((counts.get(r.rarity) ?? 0) / total).toBeCloseTo(r.weight / weights, 1);
  });
});

describe('validação de itens e coleta', () => {
  type RawArea = { resources: { items: string[]; rarities: { rarity: string }[] } };
  const area = (raw: ReturnType<typeof readRawContent>) => (raw.procedural as { areas: RawArea[] }).areas[0]!;

  it('recusa item da Gruta que não existe em items.json', () => {
    const raw = readRawContent();
    area(raw).resources.items.push('espada-lendaria');
    expect(() => loadContent(raw)).toThrow(/não existe em items\.json/);
  });

  it('recusa item cuja raridade não tem regra de sorteio', () => {
    const raw = readRawContent();
    area(raw).resources.items.push('mithril');
    expect(() => loadContent(raw)).toThrow(/não tem regra/);
  });

  it('recusa item com raridade desconhecida', () => {
    const raw = readRawContent();
    (raw.items as { items: { rarity: string }[] }).items[0]!.rarity = 'mitico';
    expect(() => loadContent(raw)).toThrow(/rarities\.json/);
  });
});
