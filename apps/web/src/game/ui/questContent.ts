import type { QuestTemplate } from '@navor/shared';
import { content } from '../../content.ts';
import type { GameBackend, Inventory, Progress, QuestLog } from '../backend.ts';
import { applyWallet, attempt, walletText } from './shopContent.ts';
import type { PanelContent, PanelRow, ServicePanel } from './ServicePanel.ts';

export interface QuestContext {
  backend: GameBackend;
  inventory: Inventory;
  progress: Progress;
  quests: QuestLog;
  panel: ServicePanel;
  /** subiu de nível com a recompensa: o jogo recalcula atributos e enche vida e mana */
  onLeveledUp: (level: number) => void;
}

const nameOf = (t: QuestTemplate): string =>
  t.kind === 'kill'
    ? (content.creatures.creatures.find((c) => c.id === t.target)?.name ?? t.target)
    : (content.items.items.find((i) => i.id === t.target)?.name ?? t.target);
const itemName = (id: string) => content.items.items.find((i) => i.id === id)?.name ?? id;

export function questGoal(t: QuestTemplate): string {
  return `${t.kind === 'kill' ? 'Derrote' : 'Colete'} ${t.count} × ${nameOf(t)}`;
}

export function rewardText(t: QuestTemplate): string {
  return [`${t.reward.xp} XP`, ...(t.reward.copper ? [`${t.reward.copper} cobre`] : []), ...t.reward.items.map((r) => `${r.quantity} × ${itemName(r.item)}`)].join(' + ');
}

/** Janela das missões do dia (tecla J) e do Covil do Dragão (GDD 12). */
export function questContent(ctx: QuestContext): () => PanelContent {
  return () => {
    const board = ctx.quests.board;
    const rows: PanelRow[] = board.quests.map((q) => {
      const t = content.quests.templates.find((x) => x.id === q.questId)!;
      const done = q.progress >= t.count;
      return {
        name: t.name,
        color: q.claimed ? '#9ca3af' : done ? '#86efac' : undefined,
        detail: `${questGoal(t)} · ${Math.min(q.progress, t.count)}/${t.count} · recompensa: ${rewardText(t)}${q.claimed ? ' · recebida' : ''}`,
        actions: q.claimed
          ? []
          : [
              {
                label: 'Receber',
                disabled: !done,
                run: () =>
                  attempt(ctx, async () => {
                    const r = await ctx.backend.claimQuest(q.slot);
                    q.claimed = true;
                    ctx.quests.set({ ...board });
                    for (const i of r.items) ctx.inventory.set(i.itemId, i.total);
                    applyWallet(ctx, r);
                    ctx.progress.set({ ...ctx.progress.state, xp: r.xp, level: r.level });
                    if (r.leveledUp) ctx.onLeveledUp(r.level);
                    return `Recompensa recebida: ${rewardText(t)}.`;
                  }),
              },
            ],
      };
    });
    const level = ctx.progress.state.level;
    const lairs = content.procedural.areas.filter((a) => a.daily);
    return {
      title: 'Missões do dia',
      subtitle: walletText(ctx.progress.state),
      sections: [
        {
          title: `Hoje (${board.day.split('-').reverse().join('/')})`,
          rows,
          empty: 'Nenhuma missão hoje.',
          note: 'Abates e coletas contam sozinhos. A recompensa sai na cidade. Missões novas à meia-noite (horário de Brasília).',
        },
        {
          title: 'Chefe diário',
          rows: lairs.map((a) => ({
            name: a.name,
            detail: board.dailyAreas.includes(a.id)
              ? 'Você já entrou hoje. Volte amanhã.'
              : level < a.minLevel
                ? `A partir do nível ${a.minLevel}.`
                : 'Disponível hoje: uma entrada por dia, pelo portão oeste da cidade.',
            actions: [],
          })),
        },
      ],
    };
  };
}
