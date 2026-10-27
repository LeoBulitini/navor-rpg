import type { ActiveSkill, Classes, PassiveSkill, SkillEffectKind, Skills } from '../content/schemas.ts';
import type { CharacterStats } from './progression.ts';

/** Graduação (aprimoramento) ou foco (habilidade ativa) de cada habilidade aprendida, por id. */
export type LearnedSkills = Map<string, number>;

export type SkillDef = ({ type: 'active' } & ActiveSkill) | ({ type: 'passive' } & PassiveSkill);

export interface ClassSkills {
  classId: string;
  name: string;
  /** nível da etapa de classe (0, 25, 50, 75) */
  level: number;
  active: ActiveSkill;
  passives: PassiveSkill[];
}

/** Etapas do caminho da classe até a atual (a classe nova mantém as habilidades das anteriores). */
export function classLine(classes: Classes, classId: string): { classId: string; name: string; level: number }[] {
  const path = classes.paths.find((p) => p.stages.some((s) => s.classId === classId));
  if (!path) throw new Error(`Classe desconhecida: ${classId}`);
  const current = path.stages.find((s) => s.classId === classId)!;
  return path.stages.filter((s) => s.level <= current.level);
}

/** Próxima etapa do caminho (evolução), ou null na última. */
export function nextClass(classes: Classes, classId: string): { classId: string; name: string; level: number } | null {
  const path = classes.paths.find((p) => p.stages.some((s) => s.classId === classId))!;
  const current = path.stages.find((s) => s.classId === classId)!;
  return path.stages.filter((s) => s.level > current.level).sort((a, b) => a.level - b.level)[0] ?? null;
}

export function availableSkills(skills: Skills, classes: Classes, classId: string): ClassSkills[] {
  return classLine(classes, classId).map((st) => ({ ...st, active: skills.classes[st.classId]!.active, passives: skills.classes[st.classId]!.passives }));
}

export function findSkill(skills: Skills, skillId: string): { classId: string; def: SkillDef } | null {
  for (const [classId, c] of Object.entries(skills.classes)) {
    if (c.active.id === skillId) return { classId, def: { type: 'active', ...c.active } };
    const ps = c.passives.find((x) => x.id === skillId);
    if (ps) return { classId, def: { type: 'passive', ...ps } };
  }
  return null;
}

export const maxGrade = (skills: Skills, def: SkillDef) => (def.type === 'active' ? skills.focusScrolls.length : skills.gradeCosts.length);

/** Pontos e pergaminho para chegar à graduação/foco `grade` (1 = aprender). Mesmos valores de skill_grade_costs no banco. */
export function gradeCost(skills: Skills, def: SkillDef, grade: number): { points: number; scroll: string | null } {
  if (def.type === 'active') return { points: skills.focusPointCost, scroll: skills.focusScrolls[grade - 1] ?? null };
  return { points: skills.gradeCosts[grade - 1]!, scroll: null };
}

export function totalPoints(skills: Skills, level: number): number {
  return level * skills.pointsPerLevel;
}

export function spentPoints(skills: Skills, learned: LearnedSkills): number {
  let total = 0;
  for (const [id, grade] of learned) {
    const found = findSkill(skills, id);
    if (!found) continue;
    for (let g = 1; g <= grade; g++) total += gradeCost(skills, found.def, g).points;
  }
  return total;
}

/**
 * null se pode subir a habilidade; senão, o motivo. Mesma regra de learn_skill.
 * `hasScroll` diz se o jogador tem o pergaminho pedido.
 */
export function learnBlock(
  skills: Skills,
  classes: Classes,
  classId: string,
  level: number,
  learned: LearnedSkills,
  skillId: string,
  hasScroll: (itemId: string) => boolean,
): string | null {
  const found = findSkill(skills, skillId);
  if (!found || !classLine(classes, classId).some((s) => s.classId === found.classId)) return 'Sua classe não tem esta habilidade.';
  const next = (learned.get(skillId) ?? 0) + 1;
  if (next > maxGrade(skills, found.def)) return 'Esta habilidade já está no máximo.';
  const cost = gradeCost(skills, found.def, next);
  if (totalPoints(skills, level) - spentPoints(skills, learned) < cost.points) return 'Pontos de habilidade insuficientes.';
  if (cost.scroll && !hasScroll(cost.scroll)) return 'Falta o pergaminho deste foco.';
  return null;
}

export type SkillEffects = Record<SkillEffectKind, number>;

/** Soma dos efeitos dos aprimoramentos aprendidos (o valor de cada um é o da graduação atual). */
export function skillEffects(skills: Skills, learned: LearnedSkills): SkillEffects {
  const out = Object.fromEntries(
    ['hp', 'mana', 'physAttack', 'magAttack', 'defense', 'precision', 'critChance', 'critDamage', 'attackSpeedPercent', 'manaCostPercent',
      'manaRegenPercent', 'moveSpeedPercent', 'damageReductionPercent', 'blockChance', 'penetrationPercent', 'dropChancePercent',
      'lifeStealPercent', 'lowHpDamagePercent', 'executeDamagePercent', 'stealthPercent'].map((k) => [k, 0]),
  ) as SkillEffects;
  for (const [id, grade] of learned) {
    const found = findSkill(skills, id);
    if (!found || found.def.type !== 'passive' || grade < 1) continue;
    out[found.def.effect.kind] += found.def.effect.values[Math.min(grade, found.def.effect.values.length) - 1]!;
  }
  return out;
}

/** Atributos com os aprimoramentos que mexem neles direto. */
export function withSkills(stats: CharacterStats, e: SkillEffects): CharacterStats {
  return {
    ...stats,
    maxHp: stats.maxHp + e.hp,
    maxMana: stats.maxMana + e.mana,
    physAttack: stats.physAttack + e.physAttack,
    magAttack: stats.magAttack + e.magAttack,
    physDefense: stats.physDefense + e.defense,
    magDefense: stats.magDefense + e.defense,
    precision: stats.precision + e.precision,
    critChance: Math.min(1, stats.critChance + e.critChance),
    critDamage: stats.critDamage + e.critDamage,
    moveSpeedTilesPerSecond: stats.moveSpeedTilesPerSecond * (1 + e.moveSpeedPercent / 100),
  };
}

/** Multiplicador de dano da habilidade ativa num foco (1 a 7). */
export function activeMultiplier(active: ActiveSkill, focus: number): number {
  return active.damageMultiplier + active.perFocus * (Math.max(1, focus) - 1);
}

/** Recarga e custo de mana com Velocidade de Ataque/Agilidade e Eficiência/Concentração (máximo 60% de redução). */
export function cooldownWith(ms: number, e: SkillEffects): number {
  return Math.round(ms * (1 - Math.min(60, e.attackSpeedPercent) / 100));
}

export function manaCostWith(cost: number, e: SkillEffects): number {
  return cost * (1 - Math.min(60, e.manaCostPercent) / 100);
}

/** Custo da evolução para a etapa do `level` (25, 50, 75). */
export function evolutionCost(skills: Skills, level: number): { copper: number; gold: number } | null {
  return skills.evolution.find((e) => e.level === level) ?? null;
}
