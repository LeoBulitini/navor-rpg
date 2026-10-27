# MVP P1: critérios de aceitação

Critérios da seção 16 do GDD e do escopo P1 (seção 15), com a evidência de cada um. "Automático" quer dizer que um
teste confere o critério a cada pull request (workflow "Testes" do GitHub Actions).

| Critério | Como está | Evidência |
| --- | --- | --- |
| O projeto inicia localmente seguindo o README, sem passos ocultos | `npm install` e `npm run dev`; sem Supabase, o menu oferece o modo offline | Automático: o GitHub Actions instala do zero (`npm ci`), faz o build e joga |
| Personagem em cena top-down, movimento com teclado; colisões impedem atravessar paredes | Setas/WASD em 8 direções, colisão pelos pés | Automático: teste de fumaça (andar, diagonal, não atravessar prédio nem borda) |
| Arte 32×32 ou placeholders claramente identificados | Mago com arte real de Leonardo. Cidade, Gruta, itens, monstros e projétil são arte provisória feita por código, 32×32, listada no README e em `docs/decisions.md`. O personagem placeholder mostra "ARTE PLACEHOLDER (PH)" na tela | Automático: `npm test` confere tamanhos e arquivos. A arte provisória feita por código não tem aviso na tela (foi aprovada como estilo provisório) |
| Entrar numa área de exploração e achar uma saída funcional | Portão sul da cidade leva à Gruta; as duas saídas voltam à cidade | Automático: teste de fumaça entra, sai e entra de novo |
| Mapa procedural sempre com caminho válido da entrada à saída | O gerador valida e, se uma seed falhar, usa a seguinte | Automático: 500 seeds em `packages/shared/test/cave.test.ts` |
| Recurso coletado aparece no inventário e não duplica ao atualizar/reconectar | `collect_node` grava na hora e repetir não soma | Automático: pgTAP (`exploration.test.sql`) e teste de fumaça (offline). **Online no navegador: não testado** |
| Vida, dano, morte/retorno e experiência seguem regras documentadas | Regras em `content/combat.json`, `content/progression.json`, `content/creatures.json` e `docs/decisions.md` | Automático: `packages/shared/test/combat.test.ts`, pgTAP (`combat.test.sql`) e teste de fumaça (abate, XP, derrota, volta à cidade) |
| Dados persistentes pertencem ao usuário e outro usuário não altera | RLS em todas as tabelas; escrita só por funções que conferem `auth.uid()` | Automático: pgTAP (`characters`, `exploration`, `combat`), com dois usuários |
| O cliente não tem credenciais administrativas do Supabase | Só URL e chave publishable; o cliente recusa uma chave secreta | `apps/web/src/services/supabase.ts`; advisor de segurança do Supabase sem alertas de tabela exposta |
| Instruções de execução, ambiente e deploy documentadas | README, `docs/setup-supabase.md`, `docs/setup-vercel.md` | Revisão manual |

## Escopo P1

| Entrega | Situação |
| --- | --- |
| P0 Fundação: repositório, cliente web, Supabase, autenticação, estrutura de dados | Feito (Fases 1 e 2) |
| P1 Protótipo jogável: tiles 32×32, movimento, colisão, Mago, cidade pequena | Feito (Fases 1 e 3) |
| P1 Exploração: Gruta procedural com entrada e saída, mapa validado, recursos, pelo menos um monstro | Feito (Fases 4, 5 e 6): dois monstros |
| P1 Progressão básica: vida/mana, combate simples, XP e níveis, inventário e persistência | Feito (Fases 5 e 6) |
| Executável Windows ligado ao mesmo backend | Feito (Fase 7): instalador gerado pelo GitHub Actions |

## O que ainda não foi testado

- **Jogar online de ponta a ponta** (login, Gruta, coleta, abate, XP gravados no Supabase) num navegador: o ambiente
  do Claude não alcança o Supabase pelo navegador. As funções do banco foram testadas com pgTAP num Postgres local e
  aplicadas no projeto Supabase, mas ninguém jogou online ainda.
- **O app Windows num Windows de verdade**: o instalador é gerado no `windows-latest` do GitHub Actions e a mesma
  configuração foi compilada e aberta no Linux, mas ninguém o instalou num PC com Windows.
- **Equilíbrio do combate** (dano, vida, XP, velocidade dos monstros): valores provisórios, conferidos só por testes.
