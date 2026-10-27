import { describe, expect, it } from 'vitest';
import {
  DEEP_FRACTION,
  createRng,
  creatureById,
  exitAt,
  generateCave,
  monsterIntent,
  parseAsciiMap,
  placeChests,
  placeDecor,
  placeMonsters,
  placeResourceNodes,
  rollChestContents,
  rollChestCount,
  validateCave,
  walkDistances,
} from '../src/index.ts';
import { readRawContent } from '../node/fs-content.ts';
import { loadContent } from '../src/index.ts';

const content = loadContent(readRawContent());
const { tiles, creatures } = content;
const areas = content.procedural.areas;
const forest = areas.find((a) => a.id === 'forest')!;

describe('Floresta procedural', () => {
  it('500 seeds: todas válidas, com caminho da entrada até a saída', () => {
    for (let i = 0; i < 500; i++) {
      const gen = generateCave(forest, tiles, i * 2654435761);
      expect(() => validateCave(gen, forest, tiles)).not.toThrow();
      const map = parseAsciiMap(gen.map, tiles);
      expect(map.tiles[map.spawn.y]![map.spawn.x]!.id).toBe('forest-floor');
      expect(gen.map.exits.map((e) => e.to)).toEqual(['city', 'city']);
    }
  });

  it('a mesma seed gera a mesma Floresta, diferente da Gruta', () => {
    const cave = areas.find((a) => a.id === 'cave')!;
    expect(generateCave(forest, tiles, 99).map.rows).toEqual(generateCave(forest, tiles, 99).map.rows);
    expect(generateCave(forest, tiles, 99).map.rows).not.toEqual(generateCave(cave, tiles, 99).map.rows);
  });
});

describe.each(areas.map((a) => [a.id, a] as const))('posições na área %s', (_, area) => {
  it('300 seeds: pontos, monstros (fundo no fundo), baús e enfeites cabem sem se sobrepor', () => {
    for (let i = 0; i < 300; i++) {
      const gen = generateCave(area, tiles, i * 2246822519);
      const map = parseAsciiMap(gen.map, tiles);
      const dist = walkDistances(map, map.spawn);
      const maxDist = Math.max(...dist.values());
      const nodes = placeResourceNodes(map, gen.seed, area.resources!.nodes.max, area.resources!);
      const cr = area.creatures!;
      // metade dos monstros pede o fundo
      const deep = (k: number) => k % 2 === 0;
      const monsters = placeMonsters(map, gen.seed, cr.count.max, cr, nodes, deep);
      monsters.forEach((p, k) => {
        expect(dist.has(`${p.x},${p.y}`)).toBe(true);
        if (deep(k)) expect(dist.get(`${p.x},${p.y}`)!).toBeGreaterThanOrEqual(maxDist * DEEP_FRACTION);
      });
      const chests = area.chests ? placeChests(map, gen.seed, area.chests.count.max, area.chests, [...nodes, ...monsters]) : [];
      for (const p of chests) {
        expect(dist.get(`${p.x},${p.y}`)!).toBeGreaterThanOrEqual(maxDist * DEEP_FRACTION);
        expect(exitAt(map, p)).toBeUndefined();
      }
      const decor = placeDecor(map, gen.seed, cr, [...nodes, ...monsters, ...chests]);
      const all = [...nodes, ...monsters, ...chests, ...decor.map((d) => d.cell)].map((p) => `${p.x},${p.y}`);
      expect(new Set(all).size).toBe(all.length);
    }
  });

  it('a mesma seed dá as mesmas posições de baús e enfeites', () => {
    const gen = generateCave(area, tiles, 4242);
    const map = parseAsciiMap(gen.map, tiles);
    if (area.chests) expect(placeChests(map, gen.seed, 2, area.chests)).toEqual(placeChests(map, gen.seed, 2, area.chests));
    expect(placeDecor(map, gen.seed, area.creatures!, [])).toEqual(placeDecor(map, gen.seed, area.creatures!, []));
  });
});

describe('baús', () => {
  it('quantidade e conteúdo ficam nas faixas da área', () => {
    const rng = createRng(5);
    for (const area of areas.filter((a) => a.chests)) {
      const c = area.chests!;
      let gold = 0;
      for (let i = 0; i < 3000; i++) {
        const n = rollChestCount(c, rng);
        expect(n).toBeGreaterThanOrEqual(c.count.min);
        expect(n).toBeLessThanOrEqual(c.count.max);
        const got = rollChestContents(c, rng);
        expect(got.copper).toBeGreaterThanOrEqual(c.copper.min);
        expect(got.copper).toBeLessThanOrEqual(c.copper.max);
        expect([0, 1]).toContain(got.gold);
        gold += got.gold;
        for (const d of got.drops) expect(c.items.map((x) => x.item)).toContain(d.itemId);
      }
      // ouro é raro (GDD 11): perto da chance configurada, nunca comum
      expect(gold / 3000).toBeLessThan(c.goldChance * 2 + 0.01);
    }
  });
});

describe('comportamento dos animais', () => {
  it('Cervo e Coelho fogem do jogador por perto e nunca atacam', () => {
    for (const id of ['deer', 'rabbit', 'squirrel']) {
      const a = creatureById(creatures, id);
      const home = { x: 10, y: 10 };
      expect(monsterIntent(a, home, home, { x: 10.5, y: 10 }, false)).toBe('flee');
      expect(monsterIntent(a, home, home, { x: 10 + a.detectTiles + 1, y: 10 }, false)).toBe('idle');
      expect(monsterIntent(a, home, home, null, false)).toBe('idle');
    }
  });

  it('Lobo, Javali, Urso e Aranha atacam de perto', () => {
    for (const id of ['wolf', 'wild-boar', 'bear', 'giant-spider']) {
      const a = creatureById(creatures, id);
      expect(a.behavior).toBe('hostile');
      expect(monsterIntent(a, { x: 10, y: 10 }, { x: 10, y: 10 }, { x: 10.5, y: 10 }, false)).toBe('attack');
    }
  });

  it('Esquilo é só enfeite: não dá nada e não está nos sorteios do servidor', () => {
    const sq = creatureById(creatures, 'squirrel');
    expect(sq.decorative).toBe(true);
    expect(sq.xp).toBe(0);
    expect(sq.drops).toEqual([]);
    expect(areas.flatMap((a) => a.creatures?.spawn.map((s) => s.creature) ?? [])).not.toContain('squirrel');
  });

  it('Esqueleto Antigo fica no fundo da Gruta e a Aranha se esconde', () => {
    expect(creatureById(creatures, 'ancient-skeleton').placement).toBe('deep');
    expect(creatureById(creatures, 'giant-spider').hidden).toBe(true);
  });
});
