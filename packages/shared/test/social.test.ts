import { describe, expect, it } from 'vitest';
import { chatMessage, guildNameError, loadContent, tidyText, trainingMinutes, trainingXp } from '../src/index.ts';
import { readRawContent } from '../node/fs-content.ts';

const content = loadContent(readRawContent());
const { training, chat, guilds } = content.social;
const MIN = 60_000;

describe('treino no Salão', () => {
  it('conta minutos inteiros', () => {
    expect(trainingMinutes(training, 59_999)).toBe(0);
    expect(trainingMinutes(training, 61 * MIN + 30_000)).toBe(61);
  });

  it(`para de contar em ${training.maxHours} horas`, () => {
    expect(trainingMinutes(training, 30 * 60 * MIN)).toBe(training.maxHours * 60);
    expect(trainingXp(training, 10, 30 * 60 * MIN)).toBe(trainingXp(training, 10, training.maxHours * 60 * MIN));
  });

  it('dá mais XP por minuto em nível mais alto', () => {
    expect(trainingXp(training, 20, 60 * MIN)).toBeGreaterThan(trainingXp(training, 1, 60 * MIN));
  });

  it('usa conta inteira (sem erro de arredondamento entre cliente e servidor)', () => {
    // 1 + 0,4 × 7 = 3,8 XP por minuto; 10 minutos = 38
    expect(trainingXp({ ...training, xpPerMinuteBase: 1, xpPerMinutePerLevel: 0.4 }, 7, 10 * MIN)).toBe(38);
  });

  it('8 horas no nível 10 valem cerca de um nível, menos que caçar', () => {
    expect(trainingXp(training, 10, 8 * 60 * MIN)).toBe(2400);
  });
});

describe('chat', () => {
  it('limpa espaços e caracteres de controle', () => {
    expect(tidyText('  oi \n\t  pessoal\u0000 ')).toBe('oi pessoal');
    expect(chatMessage('  olá   mundo ', chat)).toEqual({ ok: true, text: 'olá mundo' });
  });

  it('recusa mensagem vazia ou longa demais', () => {
    expect(chatMessage('   ', chat).ok).toBe(false);
    expect(chatMessage('a'.repeat(chat.maxLength), chat).ok).toBe(true);
    expect(chatMessage('a'.repeat(chat.maxLength + 1), chat).ok).toBe(false);
  });
});

describe('nome de guilda', () => {
  it('aceita nome e sigla válidos, com acento', () => {
    expect(guildNameError('Cavaleiros de Navor', 'CAV', guilds)).toBeNull();
    expect(guildNameError('Ordem do Leão', 'leao', guilds)).toBeNull();
  });

  it('recusa nome curto, símbolos e sigla longa', () => {
    expect(guildNameError('ab', 'AB', guilds)).toMatch(/de 3 a 20/);
    expect(guildNameError('<script>', 'AB', guilds)).toMatch(/só letras/);
    expect(guildNameError('Guilda Boa', 'ABCDE', guilds)).toMatch(/sigla/);
    expect(guildNameError('Guilda Boa', 'A-B', guilds)).toMatch(/sigla/);
    expect(guildNameError('Guilda Boa', 'LEÃO', guilds)).toMatch(/sigla/);
  });
});
