# Configuração do Supabase

O Navor RPG usa um único projeto Supabase (Auth + Postgres) para o navegador e o futuro cliente Windows.

Projeto hospedado: `navor-rpg` (ref `orfkmjxkaiotmojwchmc`, região São Paulo `sa-east-1`), na organização Supabase "Navor", plano gratuito.
Observação: o plano gratuito permite 2 projetos ativos por pessoa somando todas as organizações; projetos sem uso por ~7 dias são pausados.

## Segurança: o que vai para o cliente

| Valor | Onde fica | Pode ir para o navegador? |
| --- | --- | --- |
| URL do projeto (`VITE_SUPABASE_URL`) | `.env.local` e variáveis da Vercel | Sim |
| Chave publishable (`sb_publishable_...`) ou anon legada | `.env.local` e variáveis da Vercel | Sim. O acesso é limitado pelas políticas RLS |
| Chave secret / service_role | Somente em Edge Functions (fases futuras) | **Nunca**. O cliente se recusa a iniciar se receber uma |

## Banco de dados

O schema está em `supabase/migrations/`. Na Fase 2:

- `classes`: catálogo das 12 classes (cópia de `content/classes.json`; um teste garante que os dois batem). Leitura pública, sem escrita.
- `characters`: personagens. O jogador **só lê os próprios** (RLS). Não existe insert/update/delete direto pelo cliente:
  a criação passa pela função `create_character(p_name, p_class_id)`, que valida nome, classe inicial liberada e limite por conta.
  Nível, XP e moedas só poderão ser alterados por funções de servidor nas fases seguintes.

Valores provisórios (A DEFINIR no GDD, marcados na migration): nome de 3 a 16 letras/números, máximo de 3 personagens por conta, só o Mago jogável.

## Aplicar as migrations num projeto novo

Com a [CLI do Supabase](https://supabase.com/docs/guides/local-development) (já instalada como dependência de desenvolvimento):

```bash
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase db push
```

O advisor de segurança do Supabase avisa que `create_character` é `SECURITY DEFINER` executável por usuários logados.
Isso é intencional: é a única forma de o cliente criar personagem, e a função valida tudo e usa `auth.uid()` como dono.

## Desenvolvimento local

Opção A, com Docker: `npx supabase start` sobe Auth + Postgres locais e imprime a URL e a chave publishable para o `.env.local`.

Opção B, sem backend: deixe o `.env.local` vazio e escolha "Jogar offline" no menu.

## Testes de acesso (RLS)

`supabase/tests/database/characters.test.sql` (pgTAP) verifica, entre outros: RLS ligado, usuário A não vê nem altera dados de B,
cliente não altera as próprias moedas/nível, anônimo não cria personagem.

```bash
npx supabase test db   # com o Supabase local (Docker)
npm run test:db        # sem Docker: Postgres 16 + pgTAP instalados na máquina
```

## Autenticação

Login por e-mail e senha (mínimo 8 caracteres). No projeto hospedado a confirmação por e-mail fica ligada.
Atenção: o envio de e-mail embutido do Supabase é limitado (poucos e-mails por hora e, no plano gratuito,
só para endereços da equipe do projeto). Para convidar testadores será preciso configurar um SMTP próprio
(Authentication > Emails > SMTP Settings) ou desligar a confirmação durante o protótipo. Decisão pendente.

Em Authentication > URL Configuration, coloque a URL da Vercel em "Site URL" e `http://localhost:5173` em "Redirect URLs".
