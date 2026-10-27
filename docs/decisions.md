# Registro de decisões

Cada linha registra o que foi decidido, quando e por quem. Itens "A DEFINIR" do GDD só entram aqui depois de aprovados.

Em 2026-10-27 Leonardo autorizou Claude a decidir os itens pendentes e seguir até o fim do MVP. Essas decisões estão marcadas "Decidida por Claude" e são provisórias: valem até Leonardo revisar.

| Data | Decisão | Status |
| --- | --- | --- |
| 2026-10-26 | Stack: TypeScript, Phaser + Vite, Supabase (Auth, Postgres/RLS, RPC, Edge Functions), Vercel, Tauri para Windows numa fase posterior | Aprovada por Leonardo |
| 2026-10-26 | Movimento livre em 8 direções (setas e WASD), diagonal normalizada, colisão pelos pés | Aprovada (valor de protótipo) |
| 2026-10-26 | Velocidade de movimento: 4 tiles/s (128 px/s) | Aprovada (valor de protótipo) |
| 2026-10-26 | Resolução interna 640×360, ampliação por fator inteiro; personagem ocupa 1 tile de 32×32 | Aprovada (valor de protótipo) |
| 2026-10-26 | Sem arte definitiva por ora: placeholders gerados por script, marcados "PH" | Aprovada |
| 2026-10-26 | Phaser 4 (versão estável atual, 4.2.x) em vez do Phaser 3 | Decisão técnica da Fase 1 |
| 2026-10-26 | Supabase numa organização gratuita própria do Navor, separada da Vulcano | Aprovada por Leonardo |
| 2026-10-26 | Login por e-mail e senha (funciona igual no navegador e no futuro app Windows) | Recomendação seguida; revisável |
| 2026-10-26 | Nome de personagem: 3 a 16 letras/números, único sem diferenciar maiúsculas | Provisório (política de nomes A DEFINIR) |
| 2026-10-26 | Máximo de 3 personagens por conta | Provisório (regras de conta A DEFINIR) |
| 2026-10-26 | Só o Mago pode ser criado no protótipo (MVP P1) | Conforme GDD seção 15 |
| 2026-10-27 | Arte real dos personagens (Leonardo): 8 direções, 1 quadro por direção; o sprite segue a direção do movimento, inclusive diagonais | Decisão técnica a partir da arte entregue |
| 2026-10-27 | Caixa de colisão subiu 2 px (offsetY 19 → 17) para coincidir com os pés da arte real | Ajuste de protótipo |
| 2026-10-27 | Arte da cidade desenhada por código (tools/art/city_art.py), estilo aprovado por Leonardo como provisório; ele fará os tilesets definitivos | Aprovada (provisória) |
| 2026-10-27 | Cidade com 6 prédios do GDD (Mercado, Taverna, Ferreiro, Alquimista, Salão de Treinamento, Guilda); serviços ainda sem função, porta mostra "em breve" | Proposta enviada; serviços na P2 |
| 2026-10-27 | Mapas continuam em texto (ASCII) com listas de objetos e saídas, em vez do Tiled previsto no plano: menos peças, validação de caminho no mesmo código. O Tiled pode entrar quando os tilesets definitivos existirem | Decisão técnica da Fase 3; revisável |
| 2026-10-27 | Nome da cidade: "Cidade principal" (o GDD não dá nome) | Provisório (nome A DEFINIR) |
| 2026-10-27 | Gruta nova a cada entrada (seed nova); estável enquanto o jogador está dentro | Aprovada por Leonardo (provisória; persistência A DEFINIR no GDD) |
| 2026-10-27 | Gruta: 32×32 tiles, 5 a 7 salas de 4 a 8 tiles, corredores de 2 tiles, 1 a 2 atalhos, 4 a 10 rochas; individual | Provisório (tamanhos e densidade A DEFINIR) |
| 2026-10-27 | Na Fase 4 a seed é sorteada no cliente; o gerador fica em packages/shared para o servidor emitir a seed e validar coletas na Fase 5 | Decisão técnica da Fase 4 |
| 2026-10-27 | As duas saídas da Gruta (entrada e fundo) voltam ao portão da cidade; andares mais fundos ficam para depois | Provisório |
| 2026-10-27 | Mapa de teste da Fase 1 removido; a Gruta assume o papel de área de exploração | Decisão técnica da Fase 4 |
| 2026-10-27 | Coleta validada por funções SQL no banco (`start_exploration`, `collect_node`) em vez de Edge Function: o servidor sorteia a seed e o conteúdo de cada ponto; o cliente só posiciona | Aprovada por Leonardo |
| 2026-10-27 | O item entra no inventário na hora da coleta (fechar o jogo no meio da Gruta não perde o que já foi coletado) | Aprovada por Leonardo (provisória) |
| 2026-10-27 | Na Gruta aparecem só recursos e minérios Comum, Incomum e Raro; os que vêm de monstros ficam para a Fase 6 | Aprovada por Leonardo (provisória) |
| 2026-10-27 | Chance por raridade: Comum 70%, Incomum 25%, Raro 5% | Aprovada por Leonardo (provisória) |
| 2026-10-27 | 8 a 12 pontos de coleta por Gruta; Comum dá 1 a 3 unidades, Incomum 1 a 2, Raro 1 | Aprovada por Leonardo (provisória) |
| 2026-10-27 | Coletar não exige ferramenta por enquanto (picaretas chegam com o ferreiro na P2) | Aprovada por Leonardo (provisória) |
| 2026-10-27 | Inventário sem limite de espaços, com o mesmo item empilhado | Aprovada por Leonardo (provisória) |
| 2026-10-27 | No modo offline a coleta funciona no navegador e nada é salvo | Aprovada por Leonardo |
| 2026-10-27 | A exploração vence ao entrar de novo na Gruta ou após 30 minutos; os pontos não coletados se perdem; voltar à mesma Gruta após recarregar fica para a decisão de reconexão | Aprovada por Leonardo (provisória) |
| 2026-10-27 | Contra abuso: intervalo mínimo de 0,5 s entre coletas e no máximo 10 entradas na Gruta por minuto. O servidor não acompanha a posição do jogador (depende do modelo de multiplayer, A DEFINIR) | Decisão técnica da Fase 5 |
| 2026-10-27 | Todos os 41 itens do GDD (seções 9.2 a 9.5) entram em `content/items.json`; usos, preços e receitas continuam A DEFINIR | Decisão técnica da Fase 5 |
| 2026-10-27 | Combate em tempo real: o Mago dispara o Projétil Arcano (Espaço) na direção em que está virado; o projétil para nas paredes | Decidida por Claude (autorização de 2026-10-27), provisória |
| 2026-10-27 | Atributos do Mago no nível 0: vida 60, mana 30, ataque 10, defesa 3; por nível: +6 vida, +3 mana, +1,5 ataque, +0,5 defesa. Uma defesa única até existirem Defesa Física e Mágica separadas | Decidida por Claude (autorização de 2026-10-27), provisória |
| 2026-10-27 | Projétil Arcano: custa 3 de mana, recarga 0,45 s, 9 tiles/s, alcance 6 tiles; mana volta 4 por segundo | Decidida por Claude (autorização de 2026-10-27), provisória |
| 2026-10-27 | Dano = ataque × (1 ± 10%) − defesa × 0,5, mínimo 1; crítico 5% de chance, ×1,5; 0,5 s de invulnerabilidade depois de levar dano | Decidida por Claude (autorização de 2026-10-27), provisória |
| 2026-10-27 | Curva de XP: passar do nível L ao L+1 custa round(40 × (L+1)^1,6) XP (nível 1 = 40 XP, nível 10 ≈ 6 mil XP acumulados) | Decidida por Claude (autorização de 2026-10-27), provisória |
| 2026-10-27 | Monstros da Gruta: Rato das Cavernas (vida 18, ataque 5, 8 XP, 0 a 2 de cobre, Pele de Rato 50%) e Goblin Saqueador (vida 42, ataque 8, defesa 2, 22 XP, 2 a 6 de cobre, Presas de Goblin 40%); 4 a 6 por Gruta, 70% ratos | Decidida por Claude (autorização de 2026-10-27), provisória |
| 2026-10-27 | Monstros perseguem quem chega a 5–6 tiles e desistem quando se afastam o dobro disso de onde nasceram; andam em linha reta (sem desviar de paredes) | Decidida por Claude (autorização de 2026-10-27), provisória |
| 2026-10-27 | Monstros soltam cobre; XP, cobre e itens do abate são sorteados e gravados pelo servidor (`kill_monster`) | Decidida por Claude (autorização de 2026-10-27), provisória |
| 2026-10-27 | O servidor não simula o combate em tempo real: confere dono, prazo, monstro ainda vivo e se o total de vida abatida cabe em (60 + 8 × nível) de dano por segundo desde a entrada, cerca de 1,5× o máximo do Mago | Decidida por Claude (autorização de 2026-10-27), provisória |
| 2026-10-27 | Vida e mana não são gravadas no servidor: enchem na cidade e ao subir de nível; entre mapas seguem iguais | Decidida por Claude (autorização de 2026-10-27), provisória |
| 2026-10-27 | Morte: a exploração é encerrada e o jogador volta à praça da cidade com vida cheia; não perde itens, XP nem cobre, só o que ainda não coletou naquela Gruta | Decidida por Claude (autorização de 2026-10-27), provisória |
| 2026-10-27 | Arte dos monstros e do projétil desenhada por código (tools/art/creature_art.py), como a dos itens | Decidida por Claude (autorização de 2026-10-27), provisória |
| 2026-10-27 | App Windows com Tauri 2 (não Electron): instalador de poucos MB, usa o WebView2 que já vem no Windows 10/11; empacota o build web, sem dados locais | Decidida por Claude (autorização de 2026-10-27), provisória |
| 2026-10-27 | Instalador de teste gerado pelo GitHub Actions e baixado pelos artifacts da execução; sem assinatura digital (certificado é pago) e sem atualização automática por enquanto | Decidida por Claude (autorização de 2026-10-27), provisória |
| 2026-10-27 | Testes automáticos (typecheck, unitários, fumaça, banco) no GitHub Actions a cada PR; gratuito por o repositório ser público | Decidida por Claude (autorização de 2026-10-27), provisória |
| 2026-10-27 | As chaves públicas do Supabase (URL e publishable) ficam no workflow do Windows como valor padrão, porque o ambiente do Claude não consegue criar variáveis do repositório; podem ser trocadas por variáveis do repositório | Decidida por Claude (autorização de 2026-10-27), provisória |
| 2026-10-27 | Ícone provisório do app feito do sprite do Mago | Decidida por Claude (autorização de 2026-10-27), provisória |
| 2026-10-27 | Fase 8: Guerreiro e Arqueiro jogáveis desde a criação, ao lado do Mago (GDD 1.1) | Conforme GDD |
| 2026-10-27 | Atributos do GDD 5.1 (Vida, Mana, Ataque e Defesa Físicos e Mágicos, Precisão, Chance e Dano Crítico, Velocidade) definidos por caminho de classe, com valor inicial e ganho por nível em `content/progression.json`; as classes evoluídas herdam os do caminho | Decidida por Claude (autorização de 2026-10-27), provisória |
| 2026-10-27 | Ataque básico por caminho: Mago, Projétil Arcano (mágico, 3 de mana); Guerreiro, Golpe de Espada em arco de 110° à frente (físico, sem mana); Arqueiro, Flecha (física, sem mana, alcance 7) | Decidida por Claude (autorização de 2026-10-27), provisória |
| 2026-10-27 | Acerto = 85% + 0,5% por ponto de Precisão (máximo 100%); errar mostra "Errou". Monstros têm Defesa Física e Mágica separadas e golpe físico | Decidida por Claude (autorização de 2026-10-27), provisória |
| 2026-10-27 | Velocidade do Arqueiro 4,25 tiles/s; Mago e Guerreiro 4 | Decidida por Claude (autorização de 2026-10-27), provisória |
| 2026-10-27 | No modo offline dá para escolher qualquer classe inicial | Decidida por Claude (autorização de 2026-10-27), provisória |

## Pendentes (não decidir sem o dono do projeto)

Ver a seção "Decisões em aberto" do GDD. Próximas a decidir, por fase:

- Fase 2: confirmação de e-mail no protótipo (SMTP próprio ou desligar).
- Reconexão: voltar para a mesma Gruta depois de recarregar a página.
- Revisar as decisões provisórias de combate da Fase 6 (tabela acima) depois de jogar.
- Assinatura digital do instalador Windows (certificado pago) e atualização automática do app.
