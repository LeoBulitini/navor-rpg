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
| `npm run sprites:import -- "<pasta>"` | Copia a arte dos personagens da pasta do artista para o jogo (veja abaixo) |

## Estrutura

```
apps/web/            cliente Phaser 4 + Vite
  src/game/          cenas, entidades, sistemas (input), UI de depuração
  src/assets/        manifest.json: chave lógica -> arquivo de arte
  public/assets/     characters/ (arte real dos personagens) e placeholder/ (arte temporária)
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

## Arte

### Personagens (arte real)

Cada classe tem 8 PNGs, um por direção: `south`, `south-west`, `west`, `north-west`, `north`, `north-east`, `east`, `south-east`.
Cada PNG é uma tira horizontal de quadros 32×32 (hoje há 1 quadro por direção, então o personagem não anima ao andar).

Para atualizar, rode na raiz do repositório, apontando para a pasta do artista:

```
npm run sprites:import -- "C:\Users\<você>\Downloads\Navor RPG\Assets\Personagens"
```

O script procura `<pasta>/<grupo>/<Nome da classe>/<direção>.png`, com o nome igual ao de `content/classes.json` (Mago, Feiticeiro, Espadachim...).
Ele copia para `apps/web/public/assets/characters/<classId>/` e gera `apps/web/src/assets/characters.json` com as classes importadas.
Classes sem arte completa usam o personagem placeholder e o jogo mostra o aviso "ARTE PLACEHOLDER (PH)".

Quando houver quadros de caminhada, basta deixar os PNGs mais largos (2, 3, 4... quadros) e ajustar `frames.walk` em `apps/web/src/assets/manifest.json`.

### Tiles (ainda placeholder)

Cada tile tem um ponto magenta no canto. Para trocar: coloque uma fileira de tiles 32×32, na ordem do campo `index` de `content/tiles.json`, troque o `path` do `tileset` em `apps/web/src/assets/manifest.json` e mude `placeholder` para `false`.

## Valores de protótipo

Velocidade (4 tiles/s), resolução interna (640×360, ampliada por fator inteiro) e a caixa de colisão do personagem ficam em `content/balance.prototype.json`. São provisórios; veja [docs/decisions.md](docs/decisions.md).
