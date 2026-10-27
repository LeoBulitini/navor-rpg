import { describe, expect, it } from 'vitest';
import { exitAt, loadContent, parseAsciiMap, reachableFrom, isWalkable, toTileIndexGrid, type AsciiMap } from '../src/index.ts';
import { readRawContent } from '../node/fs-content.ts';

const content = loadContent(readRawContent());
const tiles = content.tiles;

const mapOf = (rows: string[], extra: Partial<AsciiMap> = {}): AsciiMap => ({
  id: 't', name: 't', spawnChar: 'P', spawnTile: 'path', rows, objects: [], exits: [], ...extra,
});

describe('parseAsciiMap', () => {
  it('lê a cidade e encontra o ponto de nascimento', () => {
    const map = parseAsciiMap(content.maps['city']!, tiles, content.objects);
    expect(map.width).toBe(40);
    expect(map.height).toBe(30);
    expect(isWalkable(map, map.spawn)).toBe(true);
  });

  it('na cidade, toda célula andável é alcançável a partir do nascimento', () => {
    const map = parseAsciiMap(content.maps['city']!, tiles, content.objects);
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

describe('cidade', () => {
  const city = parseAsciiMap(content.maps['city']!, tiles, content.objects);

  it('é o mapa inicial do jogo', () => {
    expect(content.world.startMap).toBe('city');
  });

  it('tem os seis prédios de serviço do GDD, todos com porta alcançável', () => {
    const reach = reachableFrom(city, city.spawn);
    const buildings = city.objects.filter((o) => o.door);
    expect(buildings.map((b) => b.def.name).sort()).toEqual(
      ['Alquimista', 'Ferreiro', 'Guilda', 'Mercado', 'Salão de Treinamento', 'Taverna'].sort(),
    );
    for (const b of buildings) expect(reach.has(`${b.door!.approach.x},${b.door!.approach.y}`), b.def.id).toBe(true);
  });

  it('a base dos prédios bloqueia o caminho e o telhado não', () => {
    const market = city.objects.find((o) => o.def.id === 'market')!;
    const T = city.tileSize;
    const baseRow = Math.floor((market.collider.y + market.collider.h - 1) / T);
    const roofRow = Math.floor(market.y / T);
    const col = Math.floor((market.x + 40) / T);
    expect(isWalkable(city, { x: col, y: baseRow })).toBe(false);
    expect(city.blocked[roofRow]![col]).toBe(false);
  });

  it('o portão é alcançável e leva à Gruta', () => {
    const exit = city.exits[0]!;
    expect(exit.to).toBe('cave');
    expect(exitAt(city, { x: exit.x, y: exit.y })).toBe(exit);
  });

  it('variações de tile são estáveis (o mesmo mapa sempre desenha igual)', () => {
    const a = toTileIndexGrid(city, tiles);
    const b = toTileIndexGrid(city, tiles);
    expect(a).toEqual(b);
    const grassIndexes = new Set(a.flat().filter((i) => [0, 9, 10].includes(i)));
    expect(grassIndexes.size).toBe(3);
  });
});

describe('objetos e saídas', () => {
  it('objeto bloqueia as células da sua base', () => {
    const map = parseAsciiMap(mapOf(['#######', '#P....#', '#.....#', '#.....#', '#######'], { objects: [{ ref: 'barrel', x: 3, y: 2 }] }), tiles, content.objects);
    expect(isWalkable(map, { x: 3, y: 2 })).toBe(false);
    expect(isWalkable(map, { x: 4, y: 2 })).toBe(true);
  });

  it('recusa objeto que não existe em objects.json', () => {
    expect(() => parseAsciiMap(mapOf(['###', '#P#', '###'], { objects: [{ ref: 'dragão', x: 1, y: 1 }] }), tiles, content.objects)).toThrow(/não existe/);
  });

  it('aceita borda aberta só onde há saída', () => {
    const exit = { x: 2, y: 2, w: 1, h: 1, to: 'city', arriveAt: { x: 19, y: 27 }, label: 'saída' };
    expect(() => parseAsciiMap(mapOf(['#####', '#P..#', '##,##'], { exits: [exit] }), tiles)).not.toThrow();
    expect(() => parseAsciiMap(mapOf(['#####', '#P..#', '##,##']), tiles)).toThrow(/borda/);
  });

  it('recusa saída que não dá para alcançar', () => {
    const exit = { x: 3, y: 2, w: 1, h: 1, to: 'city', arriveAt: { x: 19, y: 27 }, label: 'saída' };
    expect(() => parseAsciiMap(mapOf(['#####', '#P#.#', '###,#'], { exits: [exit] }), tiles)).toThrow(/alcançável/);
  });

  it('recusa chegada dentro de uma saída do outro mapa (evita ir e voltar sem parar)', () => {
    const raw = readRawContent();
    const proc = raw.procedural as { areas: { returnTo: { arriveAt: { x: number; y: number } } }[] };
    proc.areas[0]!.returnTo.arriveAt = { x: 19, y: 29 };
    expect(() => loadContent(raw)).toThrow(/dentro de uma saída/);
  });

  it('recusa saída para mapa fixo sem arriveAt', () => {
    const raw = readRawContent();
    const city = raw.maps['city.json'] as { exits: { to: string }[] };
    city.exits[0]!.to = 'city';
    expect(() => loadContent(raw)).toThrow(/falta arriveAt/);
  });
});
