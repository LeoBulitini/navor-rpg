# Navor RPG

RPG medieval online 2D em pixel art 32×32, para navegador e, no futuro, Windows, usando o mesmo backend.
O documento de requisitos é o GDD (`GDD_Navor_RPG.docx`); a arquitetura aprovada está em [docs/architecture.md](docs/architecture.md).

**Estado atual: Fase 2, fundação online.** Login por e-mail e senha (Supabase), criação e seleção de personagem Mago
protegidas por RLS, e a cena de teste da Fase 1 (movimento e colisão). Sem backend configurado, o jogo abre em modo offline.

## Requisitos

- Node.js 22 LTS (ou mais novo) e npm 10+. Confira com `node -v`.
- Um navegador moderno com WebGL (Chrome, Edge, Firefox).

## Rodar localmente

```bash
npm install
npm run dev
```

Abra http://localhost:5173.

Para entrar com conta, copie `apps/web/.env.example` para `apps/web/.env.local` e preencha com a URL e a chave publishable
do projeto Supabase ([docs/setup-supabase.md](docs/setup-supabase.md)). Sem isso, use "Jogar offline" no menu.

| Tecla | Ação |
| --- | --- |
| Setas ou WASD | Mover (8 direções) |
| F3 | Liga/desliga a depuração: caixas de colisão, tiles sólidos em vermelho, posição e FPS |

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento com recarga automática |
| `npm test` | Testes automatizados (Vitest): dados de conteúdo, leitura de mapas, alcance, movimento |
| `npm run test:db` | Testes de acesso do banco (pgTAP) num Postgres local, sem Docker; ver docs/setup-supabase.md |
| `npm run content:check` | Valida os JSON de `content/` (também roda antes do build) |
| `npm run typecheck` | Checagem de tipos do TypeScript |
| `npm run build` | Build de produção em `apps/web/dist` |
| `npm run preview` | Serve o build de produção em http://localhost:4173 |
| `npm run smoke` | Teste de fumaça no navegador real (requer `npm run build` e `npx playwright install chromium` uma vez) |
| `npm run placeholders` | Regenera a arte temporária em `apps/web/public/assets/placeholder/` |

## Estrutura

```
apps/web/            cliente Phaser 4 + Vite
  src/game/          cenas, entidades, sistemas (input), UI de depuração
  src/assets/        manifest.json: chave lógica -> arquivo de arte
  public/assets/     placeholder/ (arte temporária) e final/ (arte real)
packages/shared/     lógica pura em TypeScript, sem Phaser (será usada também pelo backend)
content/             dados configuráveis: raridades, classes, tiles, valores de protótipo, mapas
  src/menu/          menu HTML: login, lista e criação de personagem
  src/services/      cliente Supabase, autenticação, personagens
supabase/            migrations (schema + RLS), testes pgTAP, config da CLI
scripts/             validação de conteúdo, gerador de placeholders, testes de fumaça e de banco
docs/                arquitetura, decisões, setup do Supabase e da Vercel
```

## Editar o mapa de teste

O mapa está em `content/maps/test-map.json`, uma linha de texto por fileira de tiles.
A legenda está em `content/tiles.json` (`.` grama, `,` caminho, `#` muro, `T` árvore, `R` rocha, `~` água) e `P` é o ponto de nascimento.
O mapa precisa ser retangular, ter a borda toda sólida e exatamente um `P`; `npm run content:check` aponta a linha e a coluna de qualquer erro.

## Trocar a arte placeholder pela arte real

A arte atual é **temporária**: cada quadro do personagem tem a marca "PH" em magenta, cada tile tem um ponto magenta no canto e o jogo mostra "ARTE PLACEHOLDER (PH)".

1. Coloque os PNGs em `apps/web/public/assets/final/`.
   - Tileset: uma fileira de tiles 32×32, na ordem do campo `index` de `content/tiles.json`.
   - Mago: spritesheet de quadros 32×32; linhas = baixo, esquerda, direita, cima; colunas = parado, passo A, passo B.
2. Em `apps/web/src/assets/manifest.json`, troque o `path` e mude `placeholder` para `false`.

Nenhum código precisa mudar se o formato for o mesmo.

## Valores de protótipo

Velocidade (4 tiles/s), resolução interna (640×360, ampliada por fator inteiro) e a caixa de colisão do personagem ficam em `content/balance.prototype.json`. São provisórios; veja [docs/decisions.md](docs/decisions.md).
