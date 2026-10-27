import {
  activeMultiplier,
  availableSkills,
  evolutionCost,
  findSkill,
  gradeCost,
  learnBlock,
  maxGrade,
  nextClass,
  spentPoints,
  totalPoints,
  type ActiveSkill,
  type PassiveSkill,
} from '@navor/shared';
import { content } from '../../content.ts';
import type { GameBackend, Inventory, Progress, SkillBook } from '../backend.ts';
import { applyWallet, attempt, walletText } from './shopContent.ts';
import type { PanelContent, PanelRow, PanelSection, ServicePanel } from './ServicePanel.ts';

export interface SkillContext {
  backend: GameBackend;
  inventory: Inventory;
  progress: Progress;
  skills: SkillBook;
  panel: ServicePanel;
  classId: () => string;
  /** tecla de cada etapa de classe (0, 25, 50, 75), para mostrar na janela */
  keys: string[];
  onEvolved: (classId: string) => void;
}

const { skills, classes } = content;
const itemName = (id: string) => content.items.items.find((i) => i.id === id)?.name ?? id;

function effectText(p: PassiveSkill, grade: number): string {
  const v = p.effect.values[grade - 1]!;
  const k = p.effect.kind;
  if (k === 'critChance' || k === 'blockChance') return `+${Math.round(v * 1000) / 10}%`;
  if (k === 'critDamage') return `+${Math.round(v * 100)}% de dano crítico`;
  return k.endsWith('Percent') ? `${v}%` : `+${v}`;
}

/** Janela de habilidades (tecla K): pontos, árvores das classes da linha e evolução. */
export function skillContent(ctx: SkillContext): () => PanelContent {
  const have = (id: string) => (ctx.inventory.entries().find(([k]) => k === id)?.[1] ?? 0) > 0;
  const learn = (id: string, name: string) =>
    attempt(ctx, async () => {
      const r = await ctx.backend.learn(id);
      ctx.skills.set(r.skillId, r.grade);
      if (r.scroll) ctx.inventory.set(r.scroll.itemId, r.scroll.total);
      return `${name} agora no nível ${r.grade}.`;
    });

  return () => {
    const classId = ctx.classId();
    const level = ctx.progress.state.level;
    const learned = ctx.skills.learned;
    const left = totalPoints(skills, level) - spentPoints(skills, learned);
    const block = (id: string) => learnBlock(skills, classes, classId, level, learned, id, have);

    const nextLabel = (id: string, grade: number) => {
      const def = findSkill(skills, id)!.def;
      if (grade >= maxGrade(skills, def)) return null;
      const c = gradeCost(skills, def, grade + 1);
      return `${c.points} ponto${c.points > 1 ? 's' : ''}${c.scroll ? ` + ${itemName(c.scroll)}` : ''}`;
    };

    const activeRow = (a: ActiveSkill, key: string): PanelRow => {
      const f = learned.get(a.id) ?? 0;
      const next = nextLabel(a.id, f);
      const now = f > 0 ? `foco ${f}/7 · dano ×${activeMultiplier(a, f).toFixed(2)} · tecla ${key}` : 'não aprendida';
      return {
        name: `${a.name} (ativa)`,
        detail: `${now} · ${a.manaCost} de mana · recarga ${a.cooldownMs / 1000}s${next ? ` · próximo: ${next}` : ' · máximo'}`,
        actions: next ? [{ label: f === 0 ? 'Aprender' : 'Subir foco', run: () => learn(a.id, a.name), disabled: block(a.id) !== null }] : [],
      };
    };

    const passiveRow = (p: PassiveSkill): PanelRow => {
      const g = learned.get(p.id) ?? 0;
      const next = nextLabel(p.id, g);
      const now = g > 0 ? `graduação ${g}/3: ${effectText(p, g)}` : 'não aprendido';
      return {
        name: p.name,
        detail: `${p.description} ${now}${next ? ` · próxima (${effectText(p, g + 1)}): ${next}` : ' · máximo'}`,
        actions: next ? [{ label: g === 0 ? 'Aprender' : 'Subir', run: () => learn(p.id, p.name), disabled: block(p.id) !== null }] : [],
      };
    };

    const sections: PanelSection[] = availableSkills(skills, classes, classId).map((c, i) => ({
      title: c.level > 0 ? `${c.name} (a partir do nível ${c.level})` : c.name,
      rows: [activeRow(c.active, ctx.keys[i] ?? '?'), ...c.passives.map(passiveRow)],
    }));

    const next = nextClass(classes, classId);
    if (next) {
      const cost = evolutionCost(skills, next.level)!;
      const w = ctx.progress.state;
      const coins = [`${cost.copper} cobre`, cost.gold ? `${cost.gold} ouro` : ''].filter(Boolean).join(' + ');
      sections.push({
        title: 'Evolução',
        note: 'A classe nova mantém tudo o que você já aprendeu e libera uma árvore nova. Só na cidade.',
        rows: [
          {
            name: `Evoluir para ${next.name}`,
            detail: `a partir do nível ${next.level} · ${coins}`,
            actions: [
              {
                label: 'Evoluir',
                disabled: level < next.level || w.copper < cost.copper || w.gold < cost.gold,
                run: () =>
                  attempt(ctx, async () => {
                    const r = await ctx.backend.evolve();
                    applyWallet(ctx, r);
                    ctx.onEvolved(r.classId);
                    return `Você agora é ${next.name}!`;
                  }),
              },
            ],
          },
        ],
      });
    }

    return {
      title: 'Habilidades',
      subtitle: `${left} ponto${left === 1 ? '' : 's'} livre${left === 1 ? '' : 's'} · ${walletText(ctx.progress.state)}`,
      sections,
    };
  };
}
