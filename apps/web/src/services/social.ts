import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase.ts';
import type { WalletRow } from './economy.ts';

function client() {
  if (!supabase) throw new Error('Backend não configurado');
  return supabase;
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await client().rpc(fn, args);
  if (error) throw error;
  return data as T;
}

export interface TrainingRow {
  training: boolean;
  /** relógio do servidor (o tempo de treino é contado por ele) */
  now: string;
  started_at?: string;
  level?: number;
  minutes?: number;
  xp?: number;
}

/** Treino no Salão (funções training_*): o servidor conta o tempo e paga o XP. */
export const trainingStatus = (characterId: string) => rpc<TrainingRow>('training_status', { p_character_id: characterId });
export const trainingStart = (characterId: string) => rpc<TrainingRow>('training_start', { p_character_id: characterId });
export const trainingClaim = (characterId: string) =>
  rpc<{ minutes: number; xp_gained: number; xp: number; level: number; leveled_up: boolean }>('training_claim', { p_character_id: characterId });

export interface GuildInfoRow {
  max_members: number;
  mine: { id: string; name: string; tag: string; role: 'leader' | 'member'; members: { name: string; class_id: string; level: number; role: 'leader' | 'member' }[] } | null;
  guilds: { id: string; name: string; tag: string; members: number; total_level: number }[];
}

export const guildInfo = (characterId: string) => rpc<GuildInfoRow>('guild_info', { p_character_id: characterId });
export const guildCreate = (characterId: string, name: string, tag: string) =>
  rpc<WalletRow & { guild_id: string; name: string; tag: string }>('guild_create', { p_character_id: characterId, p_name: name, p_tag: tag });
export const guildJoin = (characterId: string, guildId: string) => rpc<unknown>('guild_join', { p_character_id: characterId, p_guild_id: guildId });
export const guildLeave = (characterId: string) => rpc<unknown>('guild_leave', { p_character_id: characterId });
export const guildKick = (characterId: string, memberName: string) => rpc<unknown>('guild_kick', { p_character_id: characterId, p_member_name: memberName });

export interface RankingRow {
  players: { name: string; class_id: string; level: number; xp: number; guild_tag: string | null }[];
  guilds: { name: string; tag: string; members: number; total_level: number }[];
}
export const ranking = () => rpc<RankingRow>('ranking');

export interface ChatRow {
  id: number;
  guild_id: string | null;
  author: string;
  body: string;
  created_at: string;
}

/** Últimas mensagens que o jogador pode ler (o RLS mostra o geral e o canal das guildas dele). */
export async function chatHistory(limit: number): Promise<ChatRow[]> {
  const { data, error } = await client()
    .from('chat_messages')
    .select('id, guild_id, author, body, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as ChatRow[]).reverse();
}

export const chatSend = (characterId: string, channel: 'global' | 'guild', body: string) =>
  rpc<ChatRow>('chat_send', { p_character_id: characterId, p_channel: channel, p_body: body });

/** Mensagens novas pelo Realtime (com o mesmo RLS da leitura). Devolve a função que cancela. */
export function onChatMessage(handler: (row: ChatRow) => void): () => void {
  const channel = client()
    .channel('chat-messages')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => handler(payload.new as ChatRow))
    .subscribe();
  return () => void client().removeChannel(channel);
}

export interface PresenceInfo {
  name: string;
  classId: string;
  level: number;
  mapId: string;
}

/**
 * Quem está jogando agora (Presence do Realtime). Só para mostrar na tela: nada de jogo depende disso.
 * Devolve `update` (muda o que os outros veem) e `leave`.
 */
export function joinPresence(key: string, info: PresenceInfo, onChange: (online: PresenceInfo[]) => void) {
  let current = info;
  const channel: RealtimeChannel = client().channel('online', { config: { presence: { key } } });
  channel
    .on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState<PresenceInfo>();
      onChange(Object.values(state).map((metas) => metas[0]!).filter(Boolean));
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') void channel.track(current);
    });
  return {
    update: (next: Partial<PresenceInfo>) => {
      current = { ...current, ...next };
      void channel.track(current);
    },
    leave: () => void client().removeChannel(channel),
  };
}
