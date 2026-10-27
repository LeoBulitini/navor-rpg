import { supabase } from './supabase.ts';

function client() {
  if (!supabase) throw new Error('Backend não configurado');
  return supabase;
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client().rpc(fn, args);
  if (error) throw error;
  return data as T;
}

export interface WalletRow {
  copper: number;
  gold: number;
}

export interface ShopItemRow extends WalletRow {
  item_id: string;
  /** quantidade do item no inventário depois da operação */
  total: number;
}

/** Compra de um NPC (função shop_buy): o servidor confere preço, saldo e se o jogador está na cidade. */
export const shopBuy = (characterId: string, shopId: string, itemId: string, quantity: number) =>
  rpc<ShopItemRow>('shop_buy', { p_character_id: characterId, p_shop_id: shopId, p_item_id: itemId, p_quantity: quantity });

/** Venda para um NPC (função shop_sell): o servidor paga o valor do item × taxa de compra do NPC. */
export const shopSell = (characterId: string, shopId: string, itemId: string, quantity: number) =>
  rpc<ShopItemRow & { earned: number }>('shop_sell', { p_character_id: characterId, p_shop_id: shopId, p_item_id: itemId, p_quantity: quantity });

/** Usa uma poção ou comida (função use_item): o servidor gasta o item e diz quanto de vida e mana devolve. */
export const useItem = (characterId: string, itemId: string) =>
  rpc<{ item_id: string; total: number; hp: number; mana: number }>('use_item', { p_character_id: characterId, p_item_id: itemId });

/** Dormitório da Taverna (função tavern_rest). */
export const tavernRest = (characterId: string, shopId: string) => rpc<WalletRow>('tavern_rest', { p_character_id: characterId, p_shop_id: shopId });

/** Câmbio no Mercado (função exchange_currency): `amount` moedas de `to`. */
export const exchangeCurrency = (characterId: string, shopId: string, to: 'gold' | 'copper', amount: number) =>
  rpc<WalletRow>('exchange_currency', { p_character_id: characterId, p_shop_id: shopId, p_to: to, p_amount: amount });
