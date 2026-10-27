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
| 2026-10-27 | Fase 9: Floresta com o mesmo gerador da Gruta (salas viram clareiras, paredes viram mata fechada), 32×32 tiles, 5 a 7 clareiras; portão no lado leste da cidade | Decidida por Claude (autorização de 2026-10-27), provisória |
| 2026-10-27 | Pontos de coleta da Floresta: Madeira Comum, Frutas Silvestres, Ervas Medicinais, Madeira Resistente, Flor Azul e Madeira Ancestral (70% comum, 25% incomum, 5% raro). Couro, presas e peles vêm só dos animais | Decidida por Claude (autorização de 2026-10-27), provisória |
| 2026-10-27 | Animais da Floresta, 5 a 8 por entrada: Cervo (foge, vida 30, Carne e Couro Simples) e Coelho (foge, vida 10, Carne e Pele de Coelho) não atacam; Lobo (vida 40, ataque 9), Javali Selvagem (vida 55, ataque 11, rápido), Aranha Gigante (vida 45, ataque 10, escondida) e Urso (vida 140, ataque 18, 5% das vezes) atacam | Decidida por Claude (autorização de 2026-10-27), provisória |
| 2026-10-27 | Animais dóceis fogem enquanto o jogador está a até 3,5–4 tiles e depois param onde estão; podem ser abatidos (dão XP e drops) | Decidida por Claude (autorização de 2026-10-27), provisória |
| 2026-10-27 | Aranha Gigante fica com 20% de opacidade até perseguir ou atacar o jogador | Decidida por Claude (autorização de 2026-10-27), provisória |
| 2026-10-27 | Esquilos (2 a 4 por Floresta) são só enfeite: fogem, não podem ser atacados, não dão nada e não existem no servidor | Decidida por Claude (autorização de 2026-10-27), provisória |
| 2026-10-27 | Itens novos soltos pelos animais: Carne, Pele de Coelho, Presas de Lobo, Pele de Urso, Presas de Urso, Veneno e Seda de Aranha (Pele de Lobo, Couro Simples e Presas de Javali já estavam no GDD) | Decidida por Claude (autorização de 2026-10-27), provisória |
| 2026-10-27 | Gruta: Morcego (vida 14, ataque 4, rápido, recarga 0,6 s) e Esqueleto Antigo (vida 85, ataque 13, defesa física 5, só na metade mais distante da entrada); sorteio 45% Rato, 25% Morcego, 20% Goblin, 10% Esqueleto. O Morcego não atravessa paredes | Decidida por Claude (autorização de 2026-10-27), provisória |
| 2026-10-27 | Baús: Gruta com 1 a 2 (3 a 15 de cobre, 25% Pergaminho Simples, 6% Pergaminho Aprimorado, 2% de 1 moeda de ouro); Floresta com 0 a 1 (2 a 10 de cobre, 20% Pergaminho Simples, 1% de ouro). Sempre no fundo da área. Só abrem 10 s depois da entrada | Decidida por Claude (autorização de 2026-10-27), provisória |
| 2026-10-27 | Moeda de ouro já é gravada no personagem (vem dos baús); conversão com cobre e uso ficam para a Fase 10 | Decidida por Claude (autorização de 2026-10-27), provisória |
| 2026-10-27 | Mensagens de exploração encerrada dizem "Entre na área de novo" (não citam mais só a Gruta) | Decidida por Claude (autorização de 2026-10-27), provisória |
| 2026-10-27 | Fase 10: câmbio de 100 cobre = 1 ouro (proposta do GDD 11), nos dois sentidos, sem taxa, no Mercado | Decidida por Claude (autorização de 2026-10-27), provisória |
| 2026-10-27 | Valor base dos itens por raridade: Comum 5, Incomum 15, Raro 50, Épico 200, Lendário 800, Sombrio 2500 cobre; o item pode ter valor próprio | Decidida por Claude (autorização de 2026-10-27), provisória |
| 2026-10-27 | NPCs pagam 40% do valor ao comprar do jogador (mínimo 1 cobre); nenhum item vendido por um NPC pode ser revendido com lucro (teste automático) | Decidida por Claude (autorização de 2026-10-27), provisória |
| 2026-10-27 | Alquimista vende Poção de Vida Pequena (15, +40 vida), Poção de Mana Pequena (15, +30 mana), Poção de Vida (40, +100) e Poção de Mana (40, +80); compra poções, cogumelos, ervas, flores, veneno, cristais e essências | Decidida por Claude (autorização de 2026-10-27), provisória |
| 2026-10-27 | Taverna vende Pão (4, +20 vida), Carne Assada (10, +45 vida) e Torta de Frutas (12, +30 vida, +15 mana); compra carne, frutas e comida; dormitório por 15 cobre enche vida e mana | Decidida por Claude (autorização de 2026-10-27), provisória |
| 2026-10-27 | Ferreiro compra minérios, ossos, peles, couro, presas, quitina, seda e madeira (venda de equipamentos na Fase 11) | Decidida por Claude (autorização de 2026-10-27), provisória |
| 2026-10-27 | Pergaminhos não são vendidos a NPCs (ficam para os focos de habilidade, Fase 12) | Decidida por Claude (autorização de 2026-10-27), provisória |
| 2026-10-27 | Vida e mana não enchem mais sozinhas na cidade; enchem ao subir de nível e dormindo na Taverna. Depois de cair, o jogador volta com metade da vida e mana cheia | Decidida por Claude (autorização de 2026-10-27), provisória |
| 2026-10-27 | Teclas 1, 2 e 3 usam a menor poção de vida, a menor de mana e uma comida; o servidor gasta o item, o efeito vale no navegador (vida e mana continuam só no navegador) | Decidida por Claude (autorização de 2026-10-27), provisória |
| 2026-10-27 | Lojas, dormitório e câmbio só funcionam na cidade: o servidor recusa com uma exploração aberta. Voltar pela saída de uma área agora encerra a entrada | Decidida por Claude (autorização de 2026-10-27), provisória |
| 2026-10-27 | Compra de até 99 unidades por vez; as janelas dos serviços são HTML por cima do jogo, com botões (sem campo de texto) | Decidida por Claude (autorização de 2026-10-27), provisória |

| 2026-10-27 | Equipamentos: 11 espaços (arma, escudo, cabeça, peito, mãos, pernas, pés, anel, amuleto, picareta, machado de coleta); cada peça é única, com nível de melhoria próprio; limite de 60 peças por personagem | Decidida por Claude (autorização de 2026-10-27), provisória |
| 2026-10-27 | Conjunto inicial de 19 peças e 14 receitas do Ferreiro, só com materiais da Gruta e da Floresta; nenhuma receita pede pergaminho. Armas e escudo são por caminho de classe; armaduras e acessórios servem para todos | Decidida por Claude (autorização de 2026-10-27), provisória |
| 2026-10-27 | Melhoria até +5, sempre dá certo: cada nível soma 15% dos atributos da peça (arredondando para cima) e custa 20/40/80/150/300 de cobre, mais 1 e 2 de ouro nos níveis +4 e +5, e 1 a 5 unidades do material da peça | Decidida por Claude (autorização de 2026-10-27), provisória |
| 2026-10-27 | Sem durabilidade nem reparo por enquanto | Decidida por Claude (autorização de 2026-10-27), provisória |
| 2026-10-27 | Ferramentas: depósitos de minério, cristal e madeira Raros pedem ferramenta nível 1 (Picareta de Ferro ou Machado de Lenhador, 25 de cobre), Épicos nível 2 (Picareta de Prata ou Machado Reforçado, fabricados), Lendários 3 e Sombrios 4 (ainda sem ferramenta). Comum e Incomum não pedem ferramenta | Decidida por Claude (autorização de 2026-10-27), provisória |
| 2026-10-27 | O Ferreiro paga pela peça o preço de venda × (1 + 0,25 × nível de melhoria); testes garantem que fabricar ou melhorar e vender nunca dá lucro | Decidida por Claude (autorização de 2026-10-27), provisória |
| 2026-10-27 | O teto de dano por segundo do servidor soma 5 por ponto de ataque dos equipamentos; um teste garante que fica acima do dano possível com o melhor equipamento +5 | Decidida por Claude (autorização de 2026-10-27), provisória |
| 2026-10-27 | Equipar e tirar funciona em qualquer lugar (tecla C); comprar, fabricar, melhorar e vender só na cidade | Decidida por Claude (autorização de 2026-10-27), provisória |
| 2026-10-27 | Habilidades: 1 ponto por nível; cada classe tem 1 habilidade ativa (focos 1 a 7) e 3 aprimoramentos (graduações 1 a 3, custando 1, 2 e 3 pontos); os nomes seguem o GDD e os números são provisórios | Decidida por Claude (autorização de 2026-10-27), provisória |
| 2026-10-27 | Focos 2 a 7 da habilidade ativa custam 1 ponto e gastam um pergaminho, do Simples ao Proibido, na ordem de raridade | Decidida por Claude (autorização de 2026-10-27), provisória |
| 2026-10-27 | Efeitos de aprimoramentos sem número no GDD viram atributos simples (ex.: Invocação vira mana extra, Furtividade reduz a distância em que os monstros notam o jogador, Execução dá dano extra abaixo de 30% da vida do monstro) | Decidida por Claude (autorização de 2026-10-27), provisória |
| 2026-10-27 | Evolução de classe nos níveis 25, 50 e 75 custa 500 cobre, 2000 cobre + 2 ouro e 5000 cobre + 5 ouro; só na cidade; a classe nova mantém as habilidades da anterior | Decidida por Claude (autorização de 2026-10-27), provisória |
| 2026-10-27 | Não há como desaprender pontos de habilidade por enquanto | Decidida por Claude (autorização de 2026-10-27), provisória |
| 2026-10-27 | O teto de dano por segundo do servidor cresce 8% por ponto de habilidade gasto; um teste garante que fica acima do dano possível com a melhor distribuição de pontos | Decidida por Claude (autorização de 2026-10-27), provisória |
| 2026-10-27 | Teclas: K abre as habilidades; Q, R, F e G usam a habilidade ativa de cada etapa da classe (base, 25, 50 e 75) | Decidida por Claude (autorização de 2026-10-27), provisória |
| 2026-10-27 | Classes evoluídas sem arte própria usam a arte da classe base do caminho | Decidida por Claude (autorização de 2026-10-27), provisória |

## Pendentes (não decidir sem o dono do projeto)

Ver a seção "Decisões em aberto" do GDD. Próximas a decidir, por fase:

- Fase 2: confirmação de e-mail no protótipo (SMTP próprio ou desligar).
- Reconexão: voltar para a mesma Gruta depois de recarregar a página.
- Revisar as decisões provisórias de combate da Fase 6 (tabela acima) depois de jogar.
- Assinatura digital do instalador Windows (certificado pago) e atualização automática do app.
