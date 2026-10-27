import { describe, expect, it } from 'vitest';
import {
  activeMultiplier,
  attackFor,
  availableSkills,
  canEquip,
  classLine,
  cooldownWith,
  evolutionCost,
  findSkill,
  gradeCost,
  learnBlock,
  loadContent,
  maxGrade,
  maxUpgrade,
  nextClass,
  pathStatsFor,
  pieceStats,
  serverMaxDps,
  skillEffects,
  spentPoints,
  statsForLevel,
  totalPoints,
  withSkills,
  type LearnedSkills,
} from '../src/index.ts';
import { readRawContent } from '../node/fs-content.ts';

const content = loadContent(readRawContent());
const { skills, classes, combat, progression, equipment } = content;
const none = () => false;

describe('habilidades', () => {
  it('1 ponto por nível; aprimoramento custa 1, 2 e 3 pontos (6 no total)', () => {
    expect(totalPoints(skills, 10)).toBe(10);
    const ps = findSkill(skills, 'mage-power')!.def;
    expect([1, 2, 3].map((g) => gradeCost(skills, ps, g).points)).toEqual([1, 2, 3]);
    expect(spentPoints(skills, new Map([['mage-power', 3]]))).toBe(6);
  });

  it('foco 1 não pede pergaminho; do foco 2 ao 7, Simples, Aprimorado, Raro, Ancestral, Lendário e Proibido', () => {
    const active = findSkill(skills, 'arcane-burst')!.def;
    expect(maxGrade(skills, active)).toBe(7);
    expect([1, 2, 3, 4, 5, 6, 7].map((f) => gradeCost(skills, active, f).scroll)).toEqual([
      null, 'scroll-simple', 'scroll-improved', 'scroll-rare', 'scroll-ancient', 'scroll-legendary', 'scroll-forbidden',
    ]);
  });

  it('cada classe tem 25 pontos de árvore, o mesmo que os níveis entre duas etapas', () => {
    for (const [classId, c] of Object.entries(skills.classes)) {
      const all: LearnedSkills = new Map([[c.active.id, 7], ...c.passives.map((p) => [p.id, 3] as [string, number])]);
      expect(spentPoints(skills, all), classId).toBe(25);
    }
  });

  it('só sobe com pontos, na ordem, com o pergaminho, e só habilidades da linha da classe', () => {
    const learned: LearnedSkills = new Map();
    expect(learnBlock(skills, classes, 'mage', 0, learned, 'arcane-burst', none)).toBe('Pontos de habilidade insuficientes.');
    expect(learnBlock(skills, classes, 'mage', 1, learned, 'arcane-burst', none)).toBeNull();
    learned.set('arcane-burst', 1);
    expect(learnBlock(skills, classes, 'mage', 2, learned, 'arcane-burst', none)).toBe('Falta o pergaminho deste foco.');
    expect(learnBlock(skills, classes, 'mage', 2, learned, 'arcane-burst', (id) => id === 'scroll-simple')).toBeNull();
    expect(learnBlock(skills, classes, 'mage', 30, learned, 'whirlwind', none)).toBe('Sua classe não tem esta habilidade.');
    expect(learnBlock(skills, classes, 'mage', 30, learned, 'focused-ray', none)).toBe('Sua classe não tem esta habilidade.');
    expect(learnBlock(skills, classes, 'sorcerer', 30, learned, 'mage-power', none)).toBeNull();
    learned.set('mage-power', 3);
    expect(learnBlock(skills, classes, 'mage', 30, learned, 'mage-power', none)).toBe('Esta habilidade já está no máximo.');
  });

  it('o efeito é o da graduação atual e vira atributo', () => {
    const e = skillEffects(skills, new Map([['mage-power', 2], ['warrior-endurance', 1]]));
    expect(e.magAttack).toBe(5);
    expect(e.damageReductionPercent).toBe(4);
    const base = statsForLevel(pathStatsFor(progression, 'magic'), 0);
    expect(withSkills(base, e).magAttack).toBe(base.magAttack + 5);
  });

  it('evolução: 25, 50 e 75, mantendo as classes anteriores', () => {
    expect(nextClass(classes, 'mage')).toMatchObject({ classId: 'sorcerer', level: 25 });
    expect(nextClass(classes, 'necromancer')).toBeNull();
    expect(classLine(classes, 'elementalist').map((s) => s.classId)).toEqual(['mage', 'sorcerer', 'elementalist']);
    expect(availableSkills(skills, classes, 'swordsman').map((c) => c.classId)).toEqual(['warrior', 'swordsman']);
    expect(evolutionCost(skills, 25)).toMatchObject({ copper: 500, gold: 0 });
  });

  it('o teto do servidor fica acima do maior dano possível com equipamento +5 e os pontos de habilidade do nível', () => {
    const top = maxUpgrade(equipment);
    for (const path of classes.paths) {
      const ps = pathStatsFor(progression, path.id);
      const attack = combat.basicAttacks[path.id]!;
      const usable = content.items.items.filter((i) => canEquip(i, path.id));
      let gearBonus = 0;
      let gearTyped = 0;
      for (const slot of equipment.slots) {
        const best = usable.filter((i) => i.equip!.slot === slot.id).map((i) => pieceStats(i, top, equipment));
        if (best.length === 0) continue;
        gearBonus += Math.max(...best.map((s) => Math.max(s.physAttack, s.magAttack)));
        gearTyped += Math.max(...best.map((s) => (attack.damageType === 'physical' ? s.physAttack : s.magAttack)));
      }
      for (let level = 0; level <= classes.maxLevel; level++) {
        const stage = [...path.stages].reverse().find((s) => s.level <= level)!;
        const tree = availableSkills(skills, classes, stage.classId);
        // Dano por segundo de cima: todo golpe crítico, sem defesa, com os bônus de vida baixa e execução,
        // ataque básico mais todas as habilidades ativas aprendidas, cada uma na própria recarga.
        const dps = (learned: LearnedSkills) => {
          const e = skillEffects(skills, learned);
          const stats = withSkills(statsForLevel(ps, level), e);
          const hit = (attackFor(stats, attack.damageType) + gearTyped) * (1 + combat.damageVariance) * stats.critDamage
            * (1 + (e.lowHpDamagePercent + e.executeDamagePercent) / 100);
          const actives = tree.reduce((sum, c) => {
            const f = learned.get(c.active.id) ?? 0;
            return f > 0 ? sum + activeMultiplier(c.active, f) * (1000 / c.active.cooldownMs) : sum;
          }, 0);
          return hit * (1000 / cooldownWith(attack.cooldownMs, e) + actives);
        };
        // Gasta os pontos do nível sempre no passo que mais aumenta o dano por ponto.
        const learned: LearnedSkills = new Map();
        const ids = tree.flatMap((c) => [c.active.id, ...c.passives.map((p) => p.id)]);
        let left = totalPoints(skills, level);
        for (;;) {
          let best: { id: string; gain: number; cost: number } | null = null;
          for (const id of ids) {
            const def = findSkill(skills, id)!.def;
            const g = (learned.get(id) ?? 0) + 1;
            if (g > maxGrade(skills, def)) continue;
            const cost = gradeCost(skills, def, g).points;
            if (cost > left) continue;
            const trial = new Map(learned).set(id, g);
            const gain = (dps(trial) - dps(learned)) / cost;
            if (!best || gain > best.gain) best = { id, gain, cost };
          }
          if (!best) break;
          learned.set(best.id, (learned.get(best.id) ?? 0) + 1);
          left -= best.cost;
        }
        const points = spentPoints(skills, learned);
        // margem de 10% porque a escolha gulosa pode não ser a melhor possível
        expect(serverMaxDps(combat, level, gearBonus, points), `${path.id} nível ${level}`).toBeGreaterThan(dps(learned) * 1.1);
      }
    }
  });
});

