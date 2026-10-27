# Navor RPG

RPG medieval online 2D em pixel art 32×32, para navegador e Windows, usando o mesmo backend.
O documento de requisitos é o GDD (`GDD_Navor_RPG.docx`); a arquitetura aprovada está em [docs/architecture.md](docs/architecture.md).

**Estado atual: Fase 7, protótipo do MVP P1 fechado.** Login por e-mail e senha (Supabase), criação e seleção de
personagem Mago protegidas por RLS, e o jogo começa na cidade principal: seis prédios de serviço (ainda sem função,
mostram "em breve" na porta) e um portão que leva à Gruta. A cada entrada o servidor sorteia a seed da Gruta, o conteúdo
dos pontos de coleta e os monstros. O jogador coleta com **E**, vê o inventário com **I** e ataca com **Espaço**.
O servidor confere cada coleta e cada abate e grava inventário, XP, nível e cobre; repetir não duplica nada. Ao cair,
o jogador volta à cidade. Sem backend configurado, o jogo abre em modo offline (nada é salvo).
Há um app Windows de teste (Tauri) que abre o mesmo jogo ligado ao mesmo Supabase; veja "App Windows" abaixo.
O que cada critério de aceitação do GDD tem como evidência está em [docs/mvp-p1.md](docs/mvp-p1.md).

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
| Espaço | Ataque básico da classe na direção em que o personagem está virado: Projétil Arcano (Mago, gasta mana), Golpe de Espada (Guerreiro) ou Flecha (Arqueiro) |
| E | Coletar o recurso mais próximo |
| I | Abrir e fechar o inventário |
| F3 | Liga/desliga a depuração: caixas de colisão, células bloqueadas em vermelho, posição e FPS |

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento com recarga automática |
| `npm test` | Testes automatizados (Vitest): dados de conteúdo, mapas, alcance, Gruta procedural (500 seeds), movimento, arte |
| `npm run test:db` | Testes do banco (pgTAP) num Postgres local, sem Docker: acesso, coleta, inventário; ver docs/setup-supabase.md |
| `npm run db:content` | Cria uma migration com os itens e regras de coleta de `content/` quando eles mudam (veja abaixo) |
| `npm run content:check` | Valida os JSON de `content/` (também roda antes do build) |
| `npm run typecheck` | Checagem de tipos do TypeScript |
| `npm run build` | Build de produção em `apps/web/dist` |
| `npm run preview` | Serve o build de produção em http://localhost:4173 |
| `npm run smoke` | Teste de fumaça no navegador real (requer `npm run build` e `npx playwright install chromium` uma vez) |
| `npm run placeholders` | Regenera o personagem temporário em `apps/web/public/assets/placeholder/` |
| `python3 tools/art/city_art.py` | Regenera a arte da cidade (tiles e prédios); requer Python 3 e Pillow |
| `python3 tools/art/item_art.py` | Regenera os ícones dos itens; requer Python 3 e Pillow |
| `python3 tools/art/creature_art.py` | Regenera os monstros e o projétil; requer Python 3 e Pillow |
| `npm run desktop:dev` | Abre o app Tauri apontando para o `npm run dev` (requer Rust; veja "App Windows") |
| `npm run desktop:build` | Gera o instalador do app para o sistema atual em `apps/desktop/src-tauri/target/release/bundle` |
| `npm run sprites:import -- "<pasta>"` | Copia a arte dos personagens da pasta do artista para o jogo (veja abaixo) |

## Estrutura

```
apps/desktop/        app Windows (Tauri 2): abre o build de apps/web/dist, sem dados próprios
apps/web/            cliente Phaser 4 + Vite
  src/game/          cenas, entidades, sistemas (input), UI de depuração
  src/assets/        manifest.json: chave lógica -> arquivo de arte
  public/assets/     characters/ (personagens), city/ (tiles e prédios), items/ (ícones) e placeholder/ (personagem temporário)
packages/shared/     lógica pura em TypeScript, sem Phaser (será usada também pelo backend)
  src/menu/          menu HTML: login, lista e criação de personagem
  src/services/      cliente Supabase, autenticação, personagens, exploração e inventário
content/             dados configuráveis: raridades, classes, tiles, objetos (prédios), itens, mapas, áreas geradas, valores de protótipo
supabase/            migrations (schema + RLS), testes pgTAP, config da CLI
scripts/             validação de conteúdo, importação de sprites, placeholders, testes de fumaça e de banco
tools/art/           geradores da arte provisória da cidade e dos ícones (Python + Pillow)
docs/                arquitetura, decisões, setup do Supabase e da Vercel
```

## App Windows (Tauri)

O app em `apps/desktop` é só uma janela com o mesmo jogo do navegador (o build de `apps/web/dist`). Ele usa o mesmo
Supabase, então conta, personagens e inventário são os mesmos do site. Não há dados guardados no computador.

**Baixar o instalador de teste:** a cada push na `main`, o GitHub Actions (workflow "App Windows") gera o instalador.
Abra a aba **Actions** do repositório, entre na execução mais recente de "App Windows" e baixe o artifact
`navor-windows` (precisa estar logado no GitHub). Dentro há `Navor_0.1.0_x64-setup.exe` e `Navor_0.1.0_x64_en-US.msi`.
O instalador não é assinado digitalmente, então o Windows SmartScreen avisa "Editor desconhecido": clique em
"Mais informações" e "Executar assim mesmo". Para rodar o workflow na hora, use "Run workflow" na página dele.

**Gerar na sua máquina** (Windows): instale [Rust](https://rustup.rs) e o "Desktop development with C++" do
Visual Studio Build Tools, crie `apps/web/.env.local` como em "Rodar localmente" e rode `npm run desktop:build`.

O ícone (`apps/desktop/app-icon.png`) é provisório, feito do sprite do Mago por `tools/art/app_icon.py`. Para trocar,
substitua o PNG (1024×1024) e rode `npx tauri icon app-icon.png` dentro de `apps/desktop`.

## Testes automáticos no GitHub

O workflow "Testes" (`.github/workflows/ci.yml`) roda a cada pull request e push na `main`: typecheck, `npm test`,
build, teste de fumaça no Chromium e testes de banco (pgTAP). As capturas do teste de fumaça ficam no artifact
`capturas-do-teste`. O repositório é público, então esses minutos não têm custo.

## Editar os mapas

Os mapas fixos ficam em `content/maps/` (hoje só `city.json`, a cidade). Cada mapa tem:

- `rows`: uma linha de texto por fileira de tiles. A legenda está em `content/tiles.json`: `.` grama, `,` terra, `=` calçada, `*` flores, `#` muro, `T` arbusto, `R` rocha, `~` água e `|` cerca. `P` é o ponto de nascimento.
- `objects`: prédios e decoração de `content/objects.json` (`ref`), pelo canto superior esquerdo do sprite, em tiles.
- `exits`: retângulos (em tiles) que levam a outro mapa (`to`). `arriveAt` é a célula onde o jogador aparece lá (não se usa quando o destino é gerado, como a Gruta).

O mapa inicial é o de `content/world.json`. `npm run content:check` (também roda no build) recusa o mapa e aponta o erro se:

- o mapa não for retangular;
- a borda estiver aberta fora de uma saída;
- não houver exatamente um `P`;
- um objeto sair do mapa;
- o nascimento, uma porta ou uma saída ficar inalcançável;
- um `arriveAt` cair em lugar bloqueado ou dentro de outra saída.

### Gruta (gerada por seed)

Os parâmetros ficam em `content/procedural.json` (tamanho, número e tamanho das salas, largura dos corredores, atalhos, rochas e para onde as saídas levam); são valores provisórios.
O gerador (`packages/shared/src/procgen/cave.ts`) monta salas, liga todas por corredores (mais alguns atalhos que criam desvios), abre a entrada no topo e a saída embaixo, e valida antes de mostrar: tamanho, número de salas, todas as salas alcançáveis e caminho da entrada até a saída. Se uma seed não servir, tenta a seguinte.
A mesma seed sempre gera a mesma Gruta; no jogo, a seed aparece no canto da tela. No modo offline, `?seed=123` na URL fixa uma seed para testar (online, quem escolhe a seed é o servidor).

### Coleta e inventário

Os itens ficam em `content/items.json` (todos os do GDD, com raridade e ícone). Em `content/procedural.json`, o bloco `resources` da Gruta define quantos pontos de coleta aparecem, quais itens podem sair, o peso de cada raridade e a faixa de quantidade. São valores provisórios.

Ao entrar na Gruta, o jogo chama a função `start_exploration` do banco. Ela sorteia a seed e o conteúdo de cada ponto, encerra a exploração anterior do personagem e devolve tudo. O navegador gera o mapa e posiciona os pontos a partir da seed (`packages/shared/src/procgen/resources.ts`). A posição é só visual: o que vale (item e quantidade) fica no servidor. A tecla **E** chama `collect_node`, que confere dono, prazo (30 minutos), intervalo mínimo entre coletas e se o ponto já foi coletado, e soma o item no inventário na mesma transação.

O banco guarda uma cópia dos itens e das regras de coleta. Depois de mudar `items.json` ou o bloco `resources`, rode `npm run db:content`: ele cria uma migration `*_content_sync.sql` com os dados novos. Aplique-a no Supabase e faça commit. Ela só insere e atualiza: para tirar um item ou uma raridade de uma área, escreva uma migration com o `delete`. `npm test` falha se a cópia do banco estiver diferente de `content/`.

Em `content/objects.json`, cada objeto define o tamanho do sprite, a parte sólida (`collider`, a base; o telhado fica por cima do jogador) e, nos prédios, a área da porta com a mensagem.

### Combate

Espaço dispara o Projétil Arcano para onde o Mago está virado. Os números ficam em `content/combat.json` (custo, recarga, alcance, fórmula de dano), `content/progression.json` (curva de XP e atributos por nível) e `content/creatures.json` (monstros: vida, ataque, velocidade, detecção, XP, cobre e itens). O bloco `creatures` da Gruta, em `content/procedural.json`, define quantos monstros aparecem e o peso de cada tipo. Tudo provisório; veja [docs/decisions.md](docs/decisions.md).

Ao entrar na Gruta, o servidor sorteia quais monstros existem; o navegador os posiciona pela seed e roda o combate. Ao abater um, o jogo chama `kill_monster`: o servidor confere a entrada, se o monstro ainda está vivo e se o ritmo de abates é possível para o nível, e então sorteia cobre e itens e grava XP e nível. Vida e mana ficam só no navegador. Ao cair, `end_exploration` encerra a entrada e o jogador volta à praça com vida cheia, sem perder nada do que já tinha.

Depois de mudar monstros, curva de XP ou o teto de dano, rode `npm run db:content` (o banco guarda uma cópia).

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

O tileset (`apps/web/public/assets/city/terrain.png`, com os tiles da cidade e da Gruta) e os objetos (`apps/web/public/assets/city/objects/*.png`) foram desenhados por código em `tools/art/city_art.py`. Para trocar pela arte definitiva:

- **Tileset**: uma fileira de tiles 32×32 na ordem do `index` de `content/tiles.json`.
- **Prédios e decoração**: um PNG por `sprite` de `content/objects.json`, com o `width`/`height` definidos lá. Se o tamanho mudar, ajuste também `collider` e `door`.

### Ícones dos itens (arte provisória)

Um PNG 32×32 por `icon` de `content/items.json`, em `apps/web/public/assets/items/`, desenhados por código em `tools/art/item_art.py`. O mesmo ícone aparece no chão da Gruta e no inventário. Itens sem ícone usam `unknown.png`. Para trocar, substitua o PNG mantendo o nome e o tamanho.

### Monstros e efeitos (arte provisória)

Um PNG por `sprite` de `content/creatures.json`, em `apps/web/public/assets/creatures/`: tira horizontal de quadros 32×32 (quadro 0 parado, os demais formam o andar), desenhada virada para a direita (o jogo espelha). O projétil fica em `apps/web/public/assets/effects/`. Desenhados por código em `tools/art/creature_art.py`; para trocar, substitua mantendo nome e altura.

`npm test` confere tamanhos e a existência de todos os arquivos.

## Valores de protótipo

Velocidade (4 tiles/s), resolução interna (640×360, ampliada por fator inteiro) e a caixa de colisão do personagem ficam em `content/balance.prototype.json`. São provisórios; veja [docs/decisions.md](docs/decisions.md).
