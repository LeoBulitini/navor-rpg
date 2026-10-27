import type { Social } from '../content/schemas.ts';

/** XP por minuto de treino, em milésimos (conta inteira, igual à de training_xp no banco). */
export function trainingRateMilli(rules: Social['training'], level: number): number {
  return Math.round(rules.xpPerMinuteBase * 1000) + Math.round(rules.xpPerMinutePerLevel * 1000) * level;
}

/** Minutos de treino que contam: inteiros, até o limite de horas. */
export function trainingMinutes(rules: Social['training'], elapsedMs: number): number {
  return Math.max(0, Math.min(Math.floor(elapsedMs / 60_000), rules.maxHours * 60));
}

/** XP ganho por `elapsedMs` de treino no nível em que o treino começou. Mesma regra de training_xp. */
export function trainingXp(rules: Social['training'], level: number, elapsedMs: number): number {
  return Math.floor((trainingMinutes(rules, elapsedMs) * trainingRateMilli(rules, level)) / 1000);
}

/** Tira espaços sobrando e caracteres de controle. */
export const tidyText = (s: string): string => s.replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim();

/** Mensagem do chat pronta para enviar, ou o motivo da recusa. Mesma regra de chat_send. */
export function chatMessage(body: string, rules: Social['chat']): { ok: true; text: string } | { ok: false; error: string } {
  const text = tidyText(body);
  if (!text) return { ok: false, error: 'Mensagem vazia.' };
  if ([...text].length > rules.maxLength) return { ok: false, error: `A mensagem passa de ${rules.maxLength} caracteres.` };
  return { ok: true, text };
}

/** Nome (letras com ou sem acento, números e espaços) e sigla (A-Z e números, guardada em maiúsculas) de guilda. Mesma regra de guild_create. */
export function guildNameError(name: string, tag: string, rules: Social['guilds']): string | null {
  const n = tidyText(name);
  const t = tidyText(tag);
  if ([...n].length < rules.nameMin || [...n].length > rules.nameMax) return `O nome da guilda precisa ter de ${rules.nameMin} a ${rules.nameMax} letras.`;
  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ0-9 ]+$/.test(n)) return 'Use só letras, números e espaços no nome da guilda.';
  if ([...t].length < rules.tagMin || [...t].length > rules.tagMax) return `A sigla precisa ter de ${rules.tagMin} a ${rules.tagMax} letras.`;
  if (!/^[A-Za-z0-9]+$/.test(t)) return 'Use só letras sem acento e números na sigla.';
  return null;
}
