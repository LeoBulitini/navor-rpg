import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Defesa extra: recusa uma chave secreta colocada por engano no cliente.
if (key && (key.startsWith('sb_secret_') || /service_role/.test(atobSafe(key.split('.')[1] ?? '')))) {
  throw new Error('Chave secreta do Supabase no cliente. Use a chave publishable (VITE_SUPABASE_PUBLISHABLE_KEY).');
}

/** null quando o backend não está configurado (o jogo oferece o modo offline). */
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;

function atobSafe(s: string): string {
  try {
    return atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  } catch {
    return '';
  }
}
