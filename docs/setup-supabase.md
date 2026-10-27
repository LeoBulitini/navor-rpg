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

Na Fase 5:

- `items`: catálogo de itens (cópia de `content/items.json`). Leitura pública, sem escrita.
- `exploration_areas`, `area_rarity_rules`, `area_items`: regras de sorteio de cada área (cópia do bloco `resources` de
  `content/procedural.json`). Só o servidor lê.
- `explorations` e `exploration_nodes`: cada entrada na Gruta, com a seed e o conteúdo de cada ponto de coleta. Só o servidor lê.
- `inventory_items`: inventário por personagem, um item por linha. O jogador **só lê** o dos próprios personagens.
- `start_exploration(p_character_id, p_area_id)`: encerra a exploração anterior, sorteia seed e pontos e devolve tudo.
- `collect_node(p_exploration_id, p_node_index)`: confere dono, prazo, intervalo entre coletas e se o ponto já foi
  coletado, e soma no inventário. Repetir a chamada não soma de novo.

Na Fase 6:

- `creatures`, `creature_drops`, `area_creatures`: monstros, o que soltam e onde aparecem (cópia de `content/creatures.json`
  e do bloco `creatures` de `content/procedural.json`). Só o servidor lê.
- `level_thresholds` (XP total de cada nível) e `combat_rules` (teto de dano por segundo). Só o servidor lê.
- `exploration_monsters`: os monstros de cada entrada e quando foram abatidos. Só o servidor lê.
- `start_exploration` passou a sortear também os monstros e devolvê-los.
- `kill_monster(p_exploration_id, p_monster_index)`: confere dono, prazo, monstro vivo e o ritmo de abates, sorteia cobre e
  itens e grava XP, nível, cobre e inventário. Repetir a chamada não soma de novo.
- `end_exploration(p_exploration_id)`: encerra a entrada (morte). Só o dono consegue.

Os dados de catálogo entram por migrations `*_content_sync.sql`, geradas com `npm run db:content` a partir de `content/`.

## Aplicar as migrations num projeto novo

Com a [CLI do Supabase](https://supabase.com/docs/guides/local-development) (já instalada como dependência de desenvolvimento):

```bash
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase db push
```

O advisor de segurança do Supabase avisa que `create_character`, `start_exploration`, `collect_node`, `kill_monster` e `end_exploration` são `SECURITY DEFINER` executáveis por usuários logados.
Isso é intencional: são a única forma de o cliente criar personagem, entrar na Gruta, coletar, abater monstros e encerrar a entrada, e as funções validam tudo e usam `auth.uid()` para conferir o dono.

## Desenvolvimento local

Opção A, com Docker: `npx supabase start` sobe Auth + Postgres locais e imprime a URL e a chave publishable para o `.env.local`.

Opção B, sem backend: deixe o `.env.local` vazio e escolha "Jogar offline" no menu.

## Testes de acesso (RLS)

`supabase/tests/database/characters.test.sql` (pgTAP) verifica, entre outros: RLS ligado, usuário A não vê nem altera dados de B,
cliente não altera as próprias moedas/nível, anônimo não cria personagem.
`supabase/tests/database/exploration.test.sql` verifica a coleta: o mesmo ponto não soma duas vezes, B não vê o inventário
nem coleta na exploração de A, o cliente não grava no inventário direto, exploração vencida ou encerrada não aceita coleta,
o intervalo entre coletas, o limite de entradas por minuto e que o sorteio só usa os itens e raridades da Gruta.

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
