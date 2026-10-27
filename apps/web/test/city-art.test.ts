import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import manifest from '../src/assets/manifest.json';
import objects from '../../../content/objects.json';
import tiles from '../../../content/tiles.json';

const PUBLIC = join(import.meta.dirname, '../public');

function pngSize(file: string) {
  const b = readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

describe('arte da cidade', () => {
  it('o tileset tem uma coluna de 32 px para cada index de tiles.json', () => {
    const { w, h } = pngSize(join(PUBLIC, manifest.tileset.path));
    expect(h).toBe(32);
    expect(w / 32).toBeGreaterThan(Math.max(...tiles.tiles.map((t) => t.index)));
  });

  it.each(objects.objects)('$id tem PNG com o tamanho de objects.json', (obj) => {
    const file = join(PUBLIC, manifest.objects.path, `${obj.sprite}.png`);
    expect(existsSync(file), file).toBe(true);
    expect(pngSize(file)).toEqual({ w: obj.width, h: obj.height });
  });

  it.each(objects.objects)('$id: colisão e porta ficam dentro do sprite (a porta pode passar da base)', (obj) => {
    expect(obj.collider.x + obj.collider.w).toBeLessThanOrEqual(obj.width);
    expect(obj.collider.y + obj.collider.h).toBeLessThanOrEqual(obj.height);
    if ('door' in obj && obj.door) {
      expect(obj.door.x + obj.door.w).toBeLessThanOrEqual(obj.width);
      // a área da porta precisa encostar na base, senão o jogador nunca chega nela
      expect(obj.door.y).toBeLessThan(obj.collider.y + obj.collider.h);
      expect(obj.door.y + obj.door.h).toBeGreaterThan(obj.collider.y + obj.collider.h);
    }
  });
});
