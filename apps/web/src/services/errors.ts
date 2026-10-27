/** Converte erros do Supabase em mensagens em português para o jogador. */
export function friendlyError(err: unknown): string {
  const e = err as { message?: string; code?: string; status?: number } | null;
  const msg = e?.message ?? String(err);
  const known: [RegExp, string][] = [
    [/Invalid login credentials/i, 'E-mail ou senha incorretos.'],
    [/Email not confirmed/i, 'Confirme seu e-mail pelo link que enviamos antes de entrar.'],
    [/User already registered/i, 'Já existe uma conta com este e-mail.'],
    [/Password should be at least/i, 'A senha precisa ter pelo menos 8 caracteres.'],
    [/rate limit|too many requests/i, 'Muitas tentativas. Aguarde um pouco e tente de novo.'],
    [/Failed to fetch|NetworkError|Load failed/i, 'Sem conexão com o servidor. Verifique sua internet.'],
  ];
  for (const [re, text] of known) if (re.test(msg)) return text;
  // Erros das funções do banco já vêm em português (ver supabase/migrations).
  if (e?.code && ['22023', '23505', 'P0001'].includes(e.code)) return msg;
  console.error(err);
  return 'Algo deu errado. Tente de novo em instantes.';
}
