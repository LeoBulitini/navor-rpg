import { supabase } from './supabase.ts';

export interface StartedExploration {
  exploration_id: string;
  seed: number;
  nodes: { index: number; item_id: string; quantity: number }[];
  monsters: { index: number; creature_id: string }[];
}

export interface CollectedNode {
  item_id: string;
  quantity: number;
  /** false quando o ponto já tinha sido coletado: nada foi somado de novo */
  collected: boolean;
  /** quantidade total do item no inventário depois da coleta */
  total: number;
}

function client() {
  if (!supabase) throw new Error('Backend não configurado');
  return supabase;
}

/** O servidor sorteia a seed e o conteúdo dos pontos de coleta (função start_exploration). */
export async function startExploration(characterId: string, areaId: string): Promise<StartedExploration> {
  const { data, error } = await client().rpc('start_exploration', { p_character_id: characterId, p_area_id: areaId });
  if (error) throw error;
  return data as StartedExploration;
}

/** Coleta validada e gravada no servidor (função collect_node). Repetir a chamada não duplica. */
export async function collectNode(explorationId: string, nodeIndex: number): Promise<CollectedNode> {
  const { data, error } = await client().rpc('collect_node', { p_exploration_id: explorationId, p_node_index: nodeIndex });
  if (error) throw error;
  return data as CollectedNode;
}

/** Só retorna o inventário de personagens do usuário logado: a política RLS filtra no banco. */
export async function listInventory(characterId: string): Promise<{ item_id: string; quantity: number }[]> {
  const { data, error } = await client().from('inventory_items').select('item_id, quantity').eq('character_id', characterId);
  if (error) throw error;
  return data;
}

export interface KilledMonster {
  /** false quando o monstro já tinha sido abatido: nada foi somado de novo */
  killed: boolean;
  creature_id: string;
  xp_gained: number;
  xp: number;
  level: number;
  leveled_up: boolean;
  copper_gained: number;
  copper: number;
  drops: { item_id: string; quantity: number; total: number }[];
}

/** Abate validado no servidor (função kill_monster): ele sorteia cobre e itens e grava XP e nível. */
export async function killMonster(explorationId: string, monsterIndex: number): Promise<KilledMonster> {
  const { data, error } = await client().rpc('kill_monster', { p_exploration_id: explorationId, p_monster_index: monsterIndex });
  if (error) throw error;
  return data as KilledMonster;
}

/** Encerra a entrada (morte): depois disso o servidor recusa coletas e abates nela. */
export async function endExploration(explorationId: string): Promise<void> {
  const { error } = await client().rpc('end_exploration', { p_exploration_id: explorationId });
  if (error) throw error;
}
