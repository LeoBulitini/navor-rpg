import { describe, expect, it } from 'vitest';
import {
  createRng,
  creatureById,
  facingVector,
  FACINGS,
  generateCave,
  levelForXp,
  levelThresholds,
  loadContent,
  monsterIntent,
  parseAsciiMap,
  placeMonsters,
  placeResourceNodes,
  reachableFrom,
  rollDamage,
  rollKillRewards,
  rollMonsters,
  serverMaxDps,
  statsForLevel,
  totalXpForLevel,
} from '../src/index.ts';
import { readRawContent } from '../node/fs-content.ts';

const content = loadContent(readRawContent());
const { combat, progression, creatures } = content;
const cave = content.procedural.areas.find((a) => a.id === 'cave')!;
const mage = progression.classStats.find((c) => c.classId === 'mage')!;
const thresholds = levelThresholds(progression.xpCurve, content.classes.maxLevel);

describe('progressão', () => {
  it('nível 0 começa em 0 XP e a tabela só cresce', () => {
    expect(thresholds[0]).toBe(0);
    expect(thresholds).toHaveLength(content.classes.maxLevel + 1);
    for (let l = 1; l < thresholds.length; l++) expect(thresholds[l]!).toBeGreaterThan(thresholds[l - 1]!);
  });

  it('o primeiro nível custa xpCurve.base de XP', () => {
    expect(totalXpForLevel(1, progression.xpCurve)).toBe(progression.xpCurve.base);
  });

  it('levelForXp acompanha a tabela e para no nível máximo', () => {
    expect(levelForXp(0, thresholds)).toBe(0);
    expect(levelForXp(thresholds[3]! - 1, thresholds)).toBe(2);
    expect(levelForXp(thresholds[3]!, thresholds)).toBe(3);
    expect(levelForXp(Number.MAX_SAFE_INTEGER, thresholds)).toBe(content.classes.maxLevel);
  });

  it('atributos do Mago crescem com o nível', () => {
    const l0 = statsForLevel(mage, 0);
    const l10 = statsForLevel(mage, 10);
    expect(l0).toEqual({ maxHp: mage.base.hp, maxMana: mage.base.mana, attack: mage.base.attack, defense: mage.base.defense });
    expect(l10.maxHp).toBeGreaterThan(l0.maxHp);
    expect(l10.attack).toBeGreaterThan(l0.attack);
  });
});

describe('dano', () => {
  it('fica dentro da variação, com mínimo 1, e o crítico multiplica', () => {
    const rng = createRng(1);
    let crits = 0;
    for (let i = 0; i < 5000; i++) {
      const hit = rollDamage(20, 4, combat, rng);
      const base = (v: number) => 20 * v - 4 * combat.defenseFactor;
      const lo = Math.round(base(1 - combat.damageVariance));
      const hi = Math.round(base(1 + combat.damageVariance) * combat.critMultiplier);
      expect(hit.amount).toBeGreaterThanOrEqual(lo);
      expect(hit.amount).toBeLessThanOrEqual(hi);
      if (hit.crit) crits++;
    }
    expect(crits / 5000).toBeCloseTo(combat.critChance, 1);
    expect(rollDamage(1, 100, combat, rng).amount).toBe(1);
  });

  it('o teto do servidor fica acima do maior dano por segundo possível do Mago', () => {
    for (const level of [0, 10, 40, content.classes.maxLevel]) {
      const { attack } = statsForLevel(mage, level);
      const maxHit = attack * (1 + combat.damageVariance) * combat.critMultiplier;
      const maxDps = maxHit * (1000 / combat.basicAttack.cooldownMs);
      expect(serverMaxDps(combat, level)).toBeGreaterThan(maxDps);
    }
  });
});

describe('monstros', () => {
  const config = cave.creatures!;

  it('500 seeds: monstros em chão alcançável, longe da entrada e fora dos pontos de coleta', () => {
    for (let i = 0; i < 500; i++) {
      const gen = generateCave(cave, content.tiles, i * 2246822519);
      const map = parseAsciiMap(gen.map, content.tiles);
      const nodes = placeResourceNodes(map, gen.seed, cave.resources!.nodes.max, cave.resources!);
      const reach = reachableFrom(map, map.spawn);
      const monsters = placeMonsters(map, gen.seed, config.count.max, config, nodes);
      expect(new Set(monsters.map((p) => `${p.x},${p.y}`)).size).toBe(config.count.max);
      for (const p of monsters) {
        expect(reach.has(`${p.x},${p.y}`)).toBe(true);
        expect(nodes.some((n) => n.x === p.x && n.y === p.y)).toBe(false);
        expect(Math.max(Math.abs(p.x - map.spawn.x), Math.abs(p.y - map.spawn.y))).toBeGreaterThanOrEqual(config.clearance);
      }
    }
  });

  it('a mesma seed dá as mesmas posições', () => {
    const gen = generateCave(cave, content.tiles, 4242);
    const map = parseAsciiMap(gen.map, content.tiles);
    expect(placeMonsters(map, gen.seed, 5, config)).toEqual(placeMonsters(map, gen.seed, 5, config));
  });

  it('o sorteio respeita a quantidade e os pesos', () => {
    const rng = createRng(9);
    const counts = new Map<string, number>();
    let total = 0;
    for (let run = 0; run < 2000; run++) {
      const list = rollMonsters(config, rng);
      expect(list.length).toBeGreaterThanOrEqual(config.count.min);
      expect(list.length).toBeLessThanOrEqual(config.count.max);
      for (const m of list) {
        counts.set(m.creatureId, (counts.get(m.creatureId) ?? 0) + 1);
        total++;
      }
    }
    const weights = config.spawn.reduce((s, c) => s + c.weight, 0);
    for (const s of config.spawn) expect((counts.get(s.creature) ?? 0) / total).toBeCloseTo(s.weight / weights, 1);
  });

  it('recompensas do abate ficam nas faixas do monstro', () => {
    const rng = createRng(3);
    for (const c of creatures.creatures) {
      for (let i = 0; i < 300; i++) {
        const r = rollKillRewards(c, rng);
        expect(r.xp).toBe(c.xp);
        expect(r.copper).toBeGreaterThanOrEqual(c.copper.min);
        expect(r.copper).toBeLessThanOrEqual(c.copper.max);
        for (const d of r.drops) expect(c.drops.map((x) => x.item)).toContain(d.itemId);
      }
    }
    expect(() => creatureById(creatures, 'dragao')).toThrow(/desconhecido/);
  });

  it('IA: ataca de perto, persegue dentro da detecção, desiste longe de casa', () => {
    const rat = creatureById(creatures, 'cave-rat');
    const home = { x: 10, y: 10 };
    expect(monsterIntent(rat, home, home, null, false)).toBe('idle');
    expect(monsterIntent(rat, home, home, { x: 10.5, y: 10 }, false)).toBe('attack');
    expect(monsterIntent(rat, home, home, { x: 13, y: 10 }, false)).toBe('chase');
    expect(monsterIntent(rat, home, home, { x: 10 + rat.detectTiles + 1, y: 10 }, false)).toBe('idle');
    expect(monsterIntent(rat, home, home, { x: 10 + rat.detectTiles + 1, y: 10 }, true)).toBe('chase');
    const far = { x: 10 + rat.detectTiles * 2 + 1, y: 10 };
    expect(monsterIntent(rat, far, home, { x: far.x + 2, y: 10 }, true)).toBe('return');
  });
});

describe('direção do projétil', () => {
  it('cada direção dá um vetor unitário coerente', () => {
    for (const f of FACINGS) {
      const v = facingVector(f);
      expect(Math.hypot(v.vx, v.vy)).toBeCloseTo(1);
    }
    expect(facingVector('east')).toEqual({ vx: 1, vy: 0 });
    expect(facingVector('north').vy).toBe(-1);
  });
});
