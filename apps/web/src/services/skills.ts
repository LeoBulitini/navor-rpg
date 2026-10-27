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

/** Habilidades do personagem (a política de acesso só deixa ler as próprias). */
export async function listSkills(characterId: string): Promise<{ skill_id: string; grade: number }[]> {
  const { data, error } = await client().from('character_skills').select('skill_id, grade').eq('character_id', characterId);
  if (error) throw error;
  return data;
}

/** Sobe uma graduação ou foco (função learn_skill): o servidor confere pontos, ordem e pergaminho. */
export const learnSkill = (characterId: string, skillId: string) =>
  rpc<{ skill_id: string; grade: number; points_left: number; scroll: { item_id: string; total: number } | null }>('learn_skill', {
    p_character_id: characterId,
    p_skill_id: skillId,
  });

/** Evolui para a próxima classe do caminho (função evolve_class). */
export const evolveClass = (characterId: string) => rpc<WalletRow & { class_id: string }>('evolve_class', { p_character_id: characterId });
