# Registro de decisões

Cada linha registra o que foi decidido, quando e por quem. Itens "A DEFINIR" do GDD só entram aqui depois de aprovados.

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

## Pendentes (não decidir sem o dono do projeto)

Ver a seção "Decisões em aberto" do GDD. Próximas a decidir, por fase:

- Fase 2: confirmação de e-mail no protótipo (SMTP próprio ou desligar).
- Fase 5: reconexão e perda de progresso ao sair da Gruta (com recursos coletados).
- Fase 6: combate em tempo real ou por turnos, fórmulas, curva de XP, penalidade de morte; nível de validação de combate no servidor.
- Fase 7: Tauri ou Electron.
