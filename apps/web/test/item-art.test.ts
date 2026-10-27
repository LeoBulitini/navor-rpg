import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import manifest from '../src/assets/manifest.json';
import items from '../../../content/items.json';
import procedural from '../../../content/procedural.json';
import creatures from '../../../content/creatures.json';
import combat from '../../../content/combat.json';

const PUBLIC = join(import.meta.dirname, '../public');

function pngSize(file: string) {
  const b = readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

const icons = [...new Set([...items.items.flatMap((i) => ('icon' in i && i.icon ? [i.icon] : [])), manifest.items.fallback])];

describe('ícones dos itens', () => {
  it.each(icons)('%s tem PNG 32x32', (icon) => {
    const file = join(PUBLIC, manifest.items.path, `${icon}.png`);
    expect(existsSync(file), file).toBe(true);
    expect(pngSize(file)).toEqual({ w: 32, h: 32 });
  });

  it('todo item que aparece numa área de coleta tem ícone próprio', () => {
    const withIcon = new Set(items.items.filter((i) => 'icon' in i && i.icon).map((i) => i.id));
    const lootItems = procedural.areas.flatMap((a) => a.resources?.items ?? []);
    expect(lootItems.filter((id) => !withIcon.has(id))).toEqual([]);
  });
});

describe('sprites de combate', () => {
  it.each(creatures.creatures.map((c) => c.sprite))('monstro %s tem tira de quadros 32x32', (sprite) => {
    const file = join(PUBLIC, manifest.creatures.path, `${sprite}.png`);
    expect(existsSync(file), file).toBe(true);
    const { w, h } = pngSize(file);
    expect(h).toBe(manifest.creatures.frameHeight);
    expect(w % manifest.creatures.frameWidth).toBe(0);
  });

  it.each(Object.values(combat.basicAttacks).map((a) => a.sprite))('efeito %s tem PNG', (sprite) => {
    expect(existsSync(join(PUBLIC, manifest.effects.path, `${sprite}.png`))).toBe(true);
  });

  it('todo item que um monstro solta tem ícone próprio', () => {
    const withIcon = new Set(items.items.filter((i) => 'icon' in i && i.icon).map((i) => i.id));
    const dropItems = creatures.creatures.flatMap((c) => c.drops.map((d) => d.item));
    expect(dropItems.filter((id) => !withIcon.has(id))).toEqual([]);
  });
});
