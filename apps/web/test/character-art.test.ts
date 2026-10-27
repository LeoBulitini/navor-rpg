import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FACINGS } from '@navor/shared';
import characterArt from '../src/assets/characters.json';
import manifest from '../src/assets/manifest.json';
import classes from '../../../content/classes.json';

const PUBLIC = join(import.meta.dirname, '../public');
const classIds = classes.paths.flatMap((p) => p.stages.map((s) => s.classId));

function pngSize(file: string) {
  const b = readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

function expectSheet(dir: string) {
  const { frameWidth, frameHeight, frames } = manifest.characters;
  const needed = Math.max(frames.idle, ...frames.walk) + 1;
  for (const facing of FACINGS) {
    const file = join(PUBLIC, dir, `${facing}.png`);
    expect(existsSync(file), file).toBe(true);
    const { w, h } = pngSize(file);
    expect(h, file).toBe(frameHeight);
    expect(w % frameWidth, file).toBe(0);
    expect(w / frameWidth, `${file} tem quadros para idle/walk`).toBeGreaterThanOrEqual(needed);
  }
}

describe('arte dos personagens', () => {
  it('só lista classes que existem em content/classes.json', () => {
    for (const id of characterArt.classIds) expect(classIds).toContain(id);
  });

  it.each(characterArt.classIds)('%s tem as 8 direções', (id) => {
    expectSheet(`${manifest.characters.path}/${id}`);
  });

  it('o placeholder cobre as 8 direções (classes sem arte)', () => {
    expectSheet(manifest.characters.placeholderPath);
  });
});
