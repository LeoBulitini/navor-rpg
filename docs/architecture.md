# Arquitetura

Documento completo (requisitos, conflitos, stack, fases): https://claude.ai/artifact/52RZjt5g8h1Wq62KhS3a9H

## Resumo

- **Cliente** (`apps/web`): Phaser 4 + TypeScript + Vite. Renderiza, lê entrada, faz movimento e colisão localmente.
- **Lógica compartilhada** (`packages/shared`): TypeScript puro, sem Phaser. Schemas de conteúdo, leitura de mapas, movimento.
  Desde a Fase 4 tem o gerador procedural (mapa e posição dos pontos de coleta) e, na Fase 5, a regra de sorteio usada no modo offline.
- **Conteúdo** (`content/`): JSON validado com Zod. Nada de valores de jogo espalhados no código.
- **Backend** (Fase 2 em diante): Supabase. O cliente só lê os próprios dados (RLS); toda escrita de moedas, inventário,
  drops e XP passa por funções no servidor. A chave `service_role` nunca vai para o cliente.
  Na Fase 5, a coleta usa funções SQL (`start_exploration`, `collect_node`) em vez de Edge Functions: o servidor sorteia
  e guarda o conteúdo de cada ponto, então não precisa conhecer o mapa. Edge Functions ficam para quando o servidor
  precisar entender o mapa.
  Na Fase 6, o combate roda no navegador e o servidor valida o abate (`kill_monster`): monstro sorteado por ele, ainda vivo,
  e ritmo de abates possível para o nível. Ele sorteia e grava XP, cobre e itens. Simular o combate no servidor depende do
  modelo de multiplayer (A DEFINIR).
- **Hospedagem**: Vercel (build estático). **Windows**: Tauri 2 (`apps/desktop`) empacotando o mesmo build web, gerado
  pelo GitHub Actions (`windows-latest`). O app fala direto com o mesmo Supabase; não há servidor nem banco próprios.

## Plano de fases

1. Cena de teste local
2. Fundação online: Supabase, login, personagem, RLS, deploy Vercel
3. Cidade pequena e transição de cena
4. Gruta procedural com seed e validação de caminho
5. Coleta e inventário validados no servidor
6. Combate simples, XP, nível, morte e retorno
7. Fechamento do MVP P1 e executável Windows de teste (atual; ver [mvp-p1.md](mvp-p1.md))
