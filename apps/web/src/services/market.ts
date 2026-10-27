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

export interface ListingRow {
  id: string;
  seller_id: string;
  seller_name: string;
  item_id: string;
  quantity: number;
  price: number;
  currency: 'copper' | 'gold';
  expires_at: string;
  closed_at: string | null;
}

/** Anúncios que o jogador pode ver (a política de acesso mostra os ativos de todos e os próprios). */
export async function listListings(): Promise<ListingRow[]> {
  const { data, error } = await client()
    .from('market_listings')
    .select('id, seller_id, seller_name, item_id, quantity, price, currency, expires_at, closed_at')
    .is('closed_at', null)
    .order('price', { ascending: true })
    .limit(200);
  if (error) throw error;
  return data as ListingRow[];
}

type ListingJson = { id: string; item_id: string; quantity: number; price: number; currency: 'copper' | 'gold'; expires_at: string };

/** Anuncia itens do inventário (função market_list): o item fica guardado no anúncio. */
export const marketList = (characterId: string, shopId: string, itemId: string, quantity: number, price: number, currency: string) =>
  rpc<{ listing: ListingJson; item_id: string; total: number }>('market_list', {
    p_character_id: characterId,
    p_shop_id: shopId,
    p_item_id: itemId,
    p_quantity: quantity,
    p_price: price,
    p_currency: currency,
  });

/** Compra de um anúncio (função market_buy): moedas e itens mudam de dono numa transação só. */
export const marketBuy = (characterId: string, shopId: string, listingId: string, quantity: number) =>
  rpc<WalletRow & { listing: ListingJson; item_id: string; total: number }>('market_buy', {
    p_character_id: characterId,
    p_shop_id: shopId,
    p_listing_id: listingId,
    p_quantity: quantity,
  });

/** Cancela um anúncio ou recolhe um vencido (função market_cancel). */
export const marketCancel = (characterId: string, shopId: string, listingId: string) =>
  rpc<{ listing: ListingJson; item_id: string; returned: number; total: number }>('market_cancel', {
    p_character_id: characterId,
    p_shop_id: shopId,
    p_listing_id: listingId,
  });

/** Itens do armazém da conta. */
export async function listStorage(): Promise<{ item_id: string; quantity: number }[]> {
  const { data, error } = await client().from('storage_items').select('item_id, quantity');
  if (error) throw error;
  return data;
}

export const storageDeposit = (characterId: string, shopId: string, itemId: string, quantity: number) =>
  rpc<{ item_id: string; total: number; stored: number }>('storage_deposit', { p_character_id: characterId, p_shop_id: shopId, p_item_id: itemId, p_quantity: quantity });

export const storageWithdraw = (characterId: string, shopId: string, itemId: string, quantity: number) =>
  rpc<{ item_id: string; total: number; stored: number }>('storage_withdraw', { p_character_id: characterId, p_shop_id: shopId, p_item_id: itemId, p_quantity: quantity });
