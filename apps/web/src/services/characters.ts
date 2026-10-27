import { supabase } from './supabase.ts';

export interface Character {
  id: string;
  name: string;
  class_id: string;
  level: number;
  xp: number;
  copper: number;
  gold: number;
}

export interface PlayableClass {
  id: string;
  name: string;
}

function client() {
  if (!supabase) throw new Error('Backend não configurado');
  return supabase;
}

/** Só retorna os personagens do usuário logado: a política RLS filtra no banco. */
export async function listMyCharacters(): Promise<Character[]> {
  const { data, error } = await client()
    .from('characters')
    .select('id, name, class_id, level, xp, copper, gold')
    .order('created_at');
  if (error) throw error;
  return data;
}

export async function listStartingClasses(): Promise<PlayableClass[]> {
  const { data, error } = await client()
    .from('classes')
    .select('id, name')
    .eq('playable', true)
    .eq('unlock_level', 0)
    .order('id');
  if (error) throw error;
  return data;
}

/** Criação validada no servidor (função create_character). O cliente nunca grava direto. */
export async function createCharacter(name: string, classId: string): Promise<Character> {
  const { data, error } = await client().rpc('create_character', { p_name: name, p_class_id: classId });
  if (error) throw error;
  return data as Character;
}
