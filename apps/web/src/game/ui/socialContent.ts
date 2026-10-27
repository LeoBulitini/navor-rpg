import { trainingRateMilli, trainingXp } from '@navor/shared';
import { content } from '../../content.ts';
import type { GameBackend, GuildBoard, Progress, Ranking, TrainingState } from '../backend.ts';
import { applyWallet, attempt, walletText } from './shopContent.ts';
import type { PanelContent, PanelRow, PanelSection, ServicePanel } from './ServicePanel.ts';

export interface SocialContext {
  backend: GameBackend;
  progress: Progress;
  panel: ServicePanel;
  /** subiu de nível com o treino: o jogo recalcula atributos e enche vida e mana */
  onLeveledUp: (level: number) => void;
  /** entrou, saiu ou fundou guilda: o chat e a etiqueta acima do personagem mudam */
  onGuildChanged: (tag: string | null) => void;
}

const { training, guilds } = content.social;
const className = (id: string) => content.classes.paths.flatMap((p) => p.stages).find((c) => c.classId === id)?.name ?? id;
const clock = (ms: number) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

function hm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
}

/** Salão de Treinamento (GDD 7.1): treino AFK de até `maxHours`, XP pago ao encerrar, contado pelo servidor. */
export function trainingContent(ctx: SocialContext, initial: TrainingState): () => PanelContent {
  let state = initial;
  return () => {
    const level = ctx.progress.state.level;
    const perMinute = trainingRateMilli(training, state.training ? state.level : level) / 1000;
    let row: PanelRow;
    if (!state.training) {
      row = {
        name: 'Treinar',
        detail: `${perMinute.toLocaleString('pt-BR')} XP por minuto no nível ${level} · até ${training.maxHours} h (${trainingXp(training, level, training.maxHours * 3600_000)} XP)`,
        actions: [
          {
            label: 'Começar',
            run: () =>
              attempt(ctx, async () => {
                state = await ctx.backend.startTraining();
                return 'Treino começou. Pode fechar o jogo: o tempo conta no servidor.';
              }),
          },
        ],
      };
    } else {
      // estimativa local; o número oficial vem do servidor ao encerrar
      const elapsed = Date.now() - state.startedAt;
      const xp = trainingXp(training, state.level, elapsed);
      const minutes = Math.min(Math.floor(Math.max(0, elapsed) / 60_000), training.maxHours * 60);
      const full = minutes >= training.maxHours * 60;
      row = {
        name: `Treinando desde ${clock(state.startedAt)}`,
        color: full ? '#86efac' : undefined,
        detail: `${hm(minutes)} · ${xp} XP até agora${full ? ' · limite alcançado' : ` · limite de ${training.maxHours} h`}`,
        actions: [
          {
            label: 'Encerrar e receber',
            run: () =>
              attempt(ctx, async () => {
                const r = await ctx.backend.claimTraining();
                state = { training: false, startedAt: 0, level: 0, minutes: 0, xp: 0 };
                ctx.progress.set({ ...ctx.progress.state, xp: r.xp, level: r.level });
                if (r.leveledUp) ctx.onLeveledUp(r.level);
                return `Treino encerrado: ${hm(r.minutes)}, +${r.xpGained} XP.`;
              }),
          },
        ],
      };
    }
    return {
      title: 'Salão de Treinamento',
      subtitle: `Nível ${level}`,
      sections: [
        {
          title: 'Treino',
          rows: [row],
          note: `O XP por minuto é o do nível em que o treino começou. Enquanto treina, você pode usar a cidade, mas não sai pelos portões. Depois de ${training.maxHours} h o treino para de render; encerre para receber.`,
        },
      ],
    };
  };
}

export interface GuildState {
  board: GuildBoard;
  ranking: Ranking;
}

/** Guilda (GDD 7.1): fundar, entrar, sair, remover membros e o ranking. Torneios e guerras ficam fora. */
export function guildContent(ctx: SocialContext, state: GuildState): () => PanelContent {
  const reload = async () => {
    const [board, ranking] = await Promise.all([ctx.backend.loadGuilds(), ctx.backend.loadRanking()]);
    state.board = board;
    state.ranking = ranking;
    ctx.onGuildChanged(board.mine?.tag ?? null);
  };
  return () => {
    const { board, ranking } = state;
    const sections: PanelSection[] = [];
    const mine = board.mine;
    if (mine) {
      sections.push({
        title: `${mine.name} [${mine.tag}] (${mine.members.length}/${board.maxMembers})`,
        note: 'O canal da guilda no chat é só dos membros (Enter abre o chat; comece com /g).',
        rows: [
          ...mine.members.map<PanelRow>((m) => ({
            name: m.name,
            detail: `${m.role === 'leader' ? 'líder · ' : ''}${className(m.classId)} nível ${m.level}`,
            actions:
              mine.role === 'leader' && m.role !== 'leader'
                ? [{ label: 'Remover', run: () => attempt(ctx, async () => (await ctx.backend.kickMember(m.name), await reload(), `${m.name} saiu da guilda.`)) }]
                : [],
          })),
          {
            name: 'Sair da guilda',
            detail: mine.role === 'leader' ? (mine.members.length > 1 ? 'o membro mais antigo vira líder' : 'você é o último: a guilda acaba') : '',
            actions: [{ label: 'Sair', run: () => attempt(ctx, async () => (await ctx.backend.leaveGuild(), await reload(), 'Você saiu da guilda.')) }],
          },
        ],
      });
    } else {
      sections.push({
        title: 'Fundar guilda',
        note: `Nome de ${guilds.nameMin} a ${guilds.nameMax} letras; sigla de ${guilds.tagMin} a ${guilds.tagMax} letras (A-Z e números). Até ${guilds.maxMembers} membros.`,
        rows: [
          {
            name: 'Nova guilda',
            detail: `${guilds.createCost} de cobre`,
            inputs: [
              { id: 'name', label: 'Nome', value: '', text: { maxLength: guilds.nameMax } },
              { id: 'tag', label: 'Sigla', value: '', text: { maxLength: guilds.tagMax } },
            ],
            actions: [
              {
                label: 'Fundar',
                disabled: ctx.progress.state.copper < guilds.createCost,
                run: (v) =>
                  attempt(ctx, async () => {
                    const r = await ctx.backend.createGuild(v.name ?? '', v.tag ?? '');
                    applyWallet(ctx, r);
                    await reload();
                    return `Guilda ${r.name} [${r.tag}] fundada!`;
                  }),
              },
            ],
          },
        ],
      });
      sections.push({
        title: 'Guildas',
        empty: ctx.backend.saves ? 'Nenhuma guilda ainda. Funde a primeira!' : 'No modo offline não há outros jogadores.',
        rows: board.guilds.map((g) => ({
          name: `${g.name} [${g.tag}]`,
          key: `guild:${g.id}`,
          detail: `${g.members}/${board.maxMembers} membros · níveis somados ${g.totalLevel}`,
          actions: [
            {
              label: 'Entrar',
              disabled: g.members >= board.maxMembers,
              run: () => attempt(ctx, async () => (await ctx.backend.joinGuild(g.id), await reload(), `Você entrou em ${g.name}.`)),
            },
          ],
        })),
      });
    }
    sections.push(
      {
        title: 'Ranking de jogadores',
        rows: ranking.players.map((p, i) => ({
          name: `${i + 1}. ${p.name}${p.guildTag ? ` [${p.guildTag}]` : ''}`,
          key: `rank:${i}`,
          detail: `${className(p.classId)} nível ${p.level} · ${p.xp} XP`,
          actions: [],
        })),
        empty: 'Ninguém no ranking ainda.',
      },
      {
        title: 'Ranking de guildas',
        rows: ranking.guilds.map((g, i) => ({
          name: `${i + 1}. ${g.name} [${g.tag}]`,
          key: `grank:${i}`,
          detail: `${g.members} membros · níveis somados ${g.totalLevel}`,
          actions: [],
        })),
        empty: 'Nenhuma guilda ainda.',
        note: 'Torneios e guerras entre guildas ainda não existem.',
      },
    );
    return { title: 'Guilda', subtitle: walletText(ctx.progress.state), sections };
  };
}
