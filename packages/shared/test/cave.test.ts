import { describe, expect, it } from 'vitest';
import { exitAt, generateCave, isWalkable, loadContent, parseAsciiMap, reachableFrom, validateCave } from '../src/index.ts';
import { readRawContent } from '../node/fs-content.ts';

const content = loadContent(readRawContent());
const config = content.procedural.areas.find((a) => a.id === 'cave')!;
const { tiles } = content;

describe('Gruta procedural', () => {
  it('a mesma seed gera exatamente o mesmo mapa', () => {
    const a = generateCave(config, tiles, 12345);
    const b = generateCave(config, tiles, 12345);
    expect(a.map.rows).toEqual(b.map.rows);
    expect(a.seed).toBe(b.seed);
  });

  it('seeds diferentes geram mapas diferentes', () => {
    const maps = new Set([1, 2, 3, 4, 5].map((s) => generateCave(config, tiles, s).map.rows.join('\n')));
    expect(maps.size).toBe(5);
  });

  it('500 seeds: todas válidas, com caminho da entrada até a saída e todas as salas alcançáveis', () => {
    for (let i = 0; i < 500; i++) {
      const cave = generateCave(config, tiles, i * 2654435761);
      expect(() => validateCave(cave, config, tiles)).not.toThrow();
      const map = parseAsciiMap(cave.map, tiles);
      expect(map.width).toBe(config.width);
      expect(map.height).toBe(config.height);
      expect(cave.rooms.length).toBeGreaterThanOrEqual(config.rooms.min);
      expect(cave.rooms.length).toBeLessThanOrEqual(config.rooms.max);
      const reach = reachableFrom(map, map.spawn);
      const [entrance, exit] = map.exits;
      expect(reach.has(`${entrance!.x},${entrance!.y}`)).toBe(true);
      expect(reach.has(`${exit!.x},${exit!.y}`)).toBe(true);
      // nascimento fora das saídas (senão o jogador sairia ao chegar)
      expect(exitAt(map, map.spawn)).toBeUndefined();
    }
  });

  it('rochas nunca isolam parte do chão', () => {
    for (let i = 0; i < 200; i++) {
      const map = parseAsciiMap(generateCave(config, tiles, i).map, tiles);
      const reach = reachableFrom(map, map.spawn);
      for (let y = 0; y < map.height; y++)
        for (let x = 0; x < map.width; x++) if (isWalkable(map, { x, y })) expect(reach.has(`${x},${y}`)).toBe(true);
    }
  });

  it('as duas saídas levam de volta à cidade, no portão', () => {
    const map = generateCave(config, tiles, 7).map;
    expect(map.exits.map((e) => e.to)).toEqual(['city', 'city']);
    expect(map.exits[0]!.y).toBe(0);
    expect(map.exits[1]!.y).toBe(config.height - 1);
    for (const e of map.exits) expect(e.arriveAt).toEqual(config.returnTo.arriveAt);
  });

  it('falha de forma legível quando a configuração é impossível', () => {
    const impossible = { ...config, rooms: { min: 40, max: 40 } };
    expect(() => generateCave(impossible, tiles, 1, 3)).toThrow(/nenhuma geração válida/);
  });
});
