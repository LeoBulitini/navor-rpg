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

export interface GearRow {
  id: string;
  item_id: string;
  upgrade: number;
  slot: string | null;
}

/** Peças do personagem (a política de acesso só deixa ler as próprias). */
export async function listGear(characterId: string): Promise<GearRow[]> {
  const { data, error } = await client().from('character_gear').select('id, item_id, upgrade, slot').eq('character_id', characterId);
  if (error) throw error;
  return data;
}

/** Fabrica pela receita (função craft_item): o servidor gasta materiais e moedas e cria a peça. */
export const craftItem = (characterId: string, recipeId: string) =>
  rpc<WalletRow & { item_id: string; total: number; gear?: GearRow; materials: { item_id: string; total: number }[] }>('craft_item', {
    p_character_id: characterId,
    p_recipe_id: recipeId,
  });

/** Melhora uma peça em +1 (função upgrade_gear). */
export const upgradeGear = (characterId: string, shopId: string, gearId: string) =>
  rpc<WalletRow & { gear: GearRow; material: { item_id: string; total: number } }>('upgrade_gear', {
    p_character_id: characterId,
    p_shop_id: shopId,
    p_gear_id: gearId,
  });

/** Vende uma peça ao NPC (função sell_gear). */
export const sellGear = (characterId: string, shopId: string, gearId: string) =>
  rpc<WalletRow & { gear_id: string; earned: number }>('sell_gear', { p_character_id: characterId, p_shop_id: shopId, p_gear_id: gearId });

/** Equipa uma peça (função equip_gear); a que estava no espaço volta para a bolsa. */
export const equipGear = (characterId: string, gearId: string) =>
  rpc<{ gear: GearRow; unequipped: string | null }>('equip_gear', { p_character_id: characterId, p_gear_id: gearId });

export const unequipGear = (characterId: string, gearId: string) =>
  rpc<{ gear: GearRow }>('unequip_gear', { p_character_id: characterId, p_gear_id: gearId });
