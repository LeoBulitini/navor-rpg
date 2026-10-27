import { describe, expect, it } from 'vitest';
import { createRng, eligibleQuests, gameDay, loadContent, pickDailyQuests, questProgress } from '../src/index.ts';
import { readRawContent } from '../node/fs-content.ts';

const content = loadContent(readRawContent());
const { quests } = content;

describe('missões diárias', () => {
  it('o dia vira à meia-noite de Brasília, não à do UTC', () => {
    expect(gameDay(new Date('2026-10-28T02:59:59Z'))).toBe('2026-10-27');
    expect(gameDay(new Date('2026-10-28T03:00:00Z'))).toBe('2026-10-28');
  });

  it('todo nível tem missões suficientes, e só do nível dele', () => {
    for (let level = 0; level <= content.classes.maxLevel; level++) {
      const pool = eligibleQuests(quests, level);
      expect(pool.length).toBeGreaterThanOrEqual(quests.perDay);
      for (const t of pool) expect(t.minLevel <= level && (t.maxLevel ?? Infinity) >= level).toBe(true);
    }
  });

  it('sorteia perDay missões diferentes, sempre iguais para a mesma seed', () => {
    for (const level of [0, 5, 12, 40]) {
      const a = pickDailyQuests(quests, level, createRng(7)).map((t) => t.id);
      expect(a).toHaveLength(quests.perDay);
      expect(new Set(a).size).toBe(a.length);
      expect(pickDailyQuests(quests, level, createRng(7)).map((t) => t.id)).toEqual(a);
    }
  });

  it('missões de nível mais alto pagam mais', () => {
    const best = (level: number) => Math.min(...eligibleQuests(quests, level).map((t) => t.reward.xp));
    expect(best(12)).toBeGreaterThan(best(0));
  });

  it('abates e coletas só contam para o alvo da missão', () => {
    const rats = quests.templates.find((t) => t.id === 'rats')!;
    const iron = quests.templates.find((t) => t.id === 'iron')!;
    expect(questProgress(rats, { kind: 'kill', creatureId: 'cave-rat' })).toBe(1);
    expect(questProgress(rats, { kind: 'kill', creatureId: 'cave-bat' })).toBe(0);
    expect(questProgress(rats, { kind: 'collect', itemId: 'iron', quantity: 3 })).toBe(0);
    expect(questProgress(iron, { kind: 'collect', itemId: 'iron', quantity: 3 })).toBe(3);
  });
});
