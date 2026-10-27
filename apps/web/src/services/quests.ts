import { supabase } from './supabase.ts';
import type { WalletRow } from './economy.ts';

function client() {
  if (!supabase) throw new Error('Backend não configurado');
  return supabase;
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client().rpc(fn, args);
  if (error) throw error;
  return data as T;
}

export interface QuestBoardRow {
  day: string;
  quests: { slot: number; quest_id: string; progress: number; claimed: boolean }[];
  /** áreas diárias (Covil do Dragão) já usadas hoje */
  daily_areas: string[];
}

/** Missões do dia (função list_daily_quests): o servidor sorteia na primeira vez do dia de Brasília. */
export const listDailyQuests = (characterId: string) => rpc<QuestBoardRow>('list_daily_quests', { p_character_id: characterId });

/** Recebe a recompensa de uma missão concluída (função claim_quest), só na cidade. */
export const claimQuest = (characterId: string, slot: number) =>
  rpc<
    WalletRow & {
      slot: number;
      quest_id: string;
      xp_gained: number;
      xp: number;
      level: number;
      leveled_up: boolean;
      copper_gained: number;
      items: { item_id: string; quantity: number; total: number }[];
    }
  >('claim_quest', { p_character_id: characterId, p_slot: slot });
