import { describe, expect, it } from 'vitest';
import { loadContent, parseAsciiMap, reachableFrom, isWalkable, toTileIndexGrid, type AsciiMap } from '../src/index.ts';
import { readRawContent } from '../node/fs-content.ts';

const content = loadContent(readRawContent());
const tiles = content.tiles;

const mapOf = (rows: string[]): AsciiMap => ({ id: 't', name: 't', spawnChar: 'P', spawnTile: 'path', rows });

describe('parseAsciiMap', () => {
  it('lê o mapa de teste e encontra o ponto de nascimento', () => {
    const map = parseAsciiMap(content.maps['test-map']!, tiles);
    expect(map.width).toBe(32);
    expect(map.height).toBe(23);
    expect(isWalkable(map, map.spawn)).toBe(true);
  });

  it('no mapa de teste, toda célula andável é alcançável a partir do nascimento', () => {
    const map = parseAsciiMap(content.maps['test-map']!, tiles);
    const reach = reachableFrom(map, map.spawn);
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (isWalkable(map, { x, y })) expect(reach.has(`${x},${y}`), `(${x},${y})`).toBe(true);
      }
    }
  });

  it('gera a grade de índices para o tileset', () => {
    const grid = toTileIndexGrid(parseAsciiMap(mapOf(['###', '#P#', '###']), tiles));
    expect(grid).toEqual([[2, 2, 2], [2, 1, 2], [2, 2, 2]]);
  });

  it('recusa linhas de larguras diferentes', () => {
    expect(() => parseAsciiMap(mapOf(['####', '#P#', '###']), tiles)).toThrow(/colunas/);
  });

  it('recusa caractere desconhecido', () => {
    expect(() => parseAsciiMap(mapOf(['###', '#P?', '###']), tiles)).toThrow(/desconhecido/);
  });

  it('recusa mapa sem nascimento ou com dois', () => {
    expect(() => parseAsciiMap(mapOf(['###', '#.#', '###']), tiles)).toThrow(/nascimento/);
    expect(() => parseAsciiMap(mapOf(['####', '#PP#', '####']), tiles)).toThrow(/nascimento/);
  });

  it('recusa borda aberta', () => {
    expect(() => parseAsciiMap(mapOf(['#.#', '#P#', '###']), tiles)).toThrow(/borda/);
  });
});

describe('reachableFrom', () => {
  it('não atravessa paredes', () => {
    const map = parseAsciiMap(mapOf(['#####', '#P#.#', '#####']), tiles);
    const reach = reachableFrom(map, map.spawn);
    expect(reach.has('1,1')).toBe(true);
    expect(reach.has('3,1')).toBe(false);
  });
});
