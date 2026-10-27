# Navor RPG

RPG medieval online 2D em pixel art 32×32, para navegador e, no futuro, Windows, usando o mesmo backend.
O documento de requisitos é o GDD (`GDD_Navor_RPG.docx`); a arquitetura aprovada está em [docs/architecture.md](docs/architecture.md).

**Estado atual: Fase 3, cidade pequena.** Login por e-mail e senha (Supabase), criação e seleção de personagem Mago
protegidas por RLS, e o jogo começa na cidade principal: seis prédios de serviço (ainda sem função, mostram "em breve"
na porta) e um portão que leva à área de exploração de teste e volta. Sem backend configurado, o jogo abre em modo offline.

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
| F3 | Liga/desliga a depuração: caixas de colisão, células bloqueadas em vermelho, posição e FPS |

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
| `npm run placeholders` | Regenera o personagem temporário em `apps/web/public/assets/placeholder/` |
| `python3 tools/art/city_art.py` | Regenera a arte da cidade (tiles e prédios); requer Python 3 e Pillow |
| `npm run sprites:import -- "<pasta>"` | Copia a arte dos personagens da pasta do artista para o jogo (veja abaixo) |

## Estrutura

```
apps/web/            cliente Phaser 4 + Vite
  src/game/          cenas, entidades, sistemas (input), UI de depuração
  src/assets/        manifest.json: chave lógica -> arquivo de arte
  public/assets/     characters/ (personagens), city/ (tiles e prédios) e placeholder/ (personagem temporário)
packages/shared/     lógica pura em TypeScript, sem Phaser (será usada também pelo backend)
content/             dados configuráveis: raridades, classes, tiles, objetos (prédios), mapas, valores de protótipo
  src/menu/          menu HTML: login, lista e criação de personagem
  src/services/      cliente Supabase, autenticação, personagens
supabase/            migrations (schema + RLS), testes pgTAP, config da CLI
scripts/             validação de conteúdo, importação de sprites, placeholders, testes de fumaça e de banco
tools/art/           gerador da arte provisória da cidade (Python + Pillow)
docs/                arquitetura, decisões, setup do Supabase e da Vercel
```

## Editar os mapas

Os mapas ficam em `content/maps/` (`city.json` é a cidade, `test-map.json` a área de exploração de teste). Cada mapa tem:

- `rows`: uma linha de texto por fileira de tiles. A legenda está em `content/tiles.json`: `.` grama, `,` terra, `=` calçada, `*` flores, `#` muro, `T` arbusto, `R` rocha, `~` água e `|` cerca. `P` é o ponto de nascimento.
- `objects`: prédios e decoração de `content/objects.json` (`ref`), pelo canto superior esquerdo do sprite, em tiles.
- `exits`: retângulos (em tiles) que levam a outro mapa (`to`). `arriveAt` é a célula onde o jogador aparece lá.

O mapa inicial é o de `content/world.json`. `npm run content:check` (também roda no build) recusa o mapa e aponta o erro se:

- o mapa não for retangular;
- a borda estiver aberta fora de uma saída;
- não houver exatamente um `P`;
- um objeto sair do mapa;
- o nascimento, uma porta ou uma saída ficar inalcançável;
- um `arriveAt` cair em lugar bloqueado ou dentro de outra saída.

Em `content/objects.json`, cada objeto define o tamanho do sprite, a parte sólida (`collider`, a base; o telhado fica por cima do jogador) e, nos prédios, a área da porta com a mensagem.

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

### Cidade (arte provisória)

O tileset (`apps/web/public/assets/city/terrain.png`) e os objetos (`apps/web/public/assets/city/objects/*.png`) foram desenhados por código em `tools/art/city_art.py`. Para trocar pela arte definitiva:

- **Tileset**: uma fileira de tiles 32×32 na ordem do `index` de `content/tiles.json`.
- **Prédios e decoração**: um PNG por `sprite` de `content/objects.json`, com o `width`/`height` definidos lá. Se o tamanho mudar, ajuste também `collider` e `door`.

`npm test` confere tamanhos e a existência de todos os arquivos.

## Valores de protótipo

Velocidade (4 tiles/s), resolução interna (640×360, ampliada por fator inteiro) e a caixa de colisão do personagem ficam em `content/balance.prototype.json`. São provisórios; veja [docs/decisions.md](docs/decisions.md).
