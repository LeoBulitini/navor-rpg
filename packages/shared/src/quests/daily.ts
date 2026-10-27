import type { Quests, QuestTemplate } from '../content/schemas.ts';
import type { Rng } from '../procgen/rng.ts';

/** Fuso do dia do jogo (GDD 12): missões e o Covil do Dragão viram às 00:00 de Brasília. */
export const GAME_TIME_ZONE = 'America/Sao_Paulo';

/** Dia do jogo ('AAAA-MM-DD') de um instante. Mesma regra de game_day() no banco. */
export function gameDay(at: Date, timeZone = GAME_TIME_ZONE): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

/** Missões que combinam com o nível (minLevel até maxLevel). */
export function eligibleQuests(quests: Quests, level: number): QuestTemplate[] {
  return quests.templates.filter((t) => t.minLevel <= level && (t.maxLevel === undefined || level <= t.maxLevel));
}

/** Sorteia as missões do dia, sem repetir. O servidor faz o mesmo em ensure_daily_quests. */
export function pickDailyQuests(quests: Quests, level: number, rng: Rng): QuestTemplate[] {
  const pool = [...eligibleQuests(quests, level)];
  const out: QuestTemplate[] = [];
  while (out.length < quests.perDay && pool.length > 0) out.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]!);
  return out;
}

export type QuestEvent = { kind: 'kill'; creatureId: string } | { kind: 'collect'; itemId: string; quantity: number };

/** Quanto um abate ou uma coleta avança a missão (0 se não conta). */
export function questProgress(t: QuestTemplate, e: QuestEvent): number {
  if (t.kind === 'kill' && e.kind === 'kill') return e.creatureId === t.target ? 1 : 0;
  if (t.kind === 'collect' && e.kind === 'collect') return e.itemId === t.target ? e.quantity : 0;
  return 0;
}
