import { describe, expect, it } from 'vitest';
import { loadContent } from '../src/index.ts';
import { readRawContent } from '../node/fs-content.ts';

describe('conteúdo em content/', () => {
  const content = loadContent(readRawContent());

  it('tem as seis raridades do GDD, na ordem', () => {
    expect(content.rarities.rarities.map((r) => r.name)).toEqual([
      'Comum', 'Incomum', 'Raro', 'Épico', 'Lendário', 'Sombrio',
    ]);
  });

  it('tem três caminhos de classe com evolução em 0, 25, 50 e 75', () => {
    expect(content.classes.paths).toHaveLength(3);
    for (const path of content.classes.paths) {
      expect(path.stages.map((s) => s.level)).toEqual([0, 25, 50, 75]);
    }
    expect(content.classes.maxLevel).toBe(75);
  });

  it('usa tile de 32 px', () => {
    expect(content.balance.tileSize).toBe(32);
  });

  it('a caixa de colisão do jogador cabe dentro de um tile', () => {
    const { hitbox } = content.balance.player;
    expect(hitbox.offsetX + hitbox.width).toBeLessThanOrEqual(content.balance.tileSize);
    expect(hitbox.offsetY + hitbox.height).toBeLessThanOrEqual(content.balance.tileSize);
  });
});

describe('validação de conteúdo', () => {
  it('recusa cor de raridade inválida com mensagem legível', () => {
    const raw = readRawContent();
    raw.rarities = { rarities: [{ id: 'x', name: 'X', color: 'cinza' }] };
    expect(() => loadContent(raw)).toThrow(/rarities\.json/);
  });

  it('recusa caractere de tile duplicado', () => {
    const raw = readRawContent();
    const tiles = raw.tiles as { tiles: { char: string }[] };
    tiles.tiles[1]!.char = tiles.tiles[0]!.char;
    expect(() => loadContent(raw)).toThrow(/duplicado/);
  });
});
