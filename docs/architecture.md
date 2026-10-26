# Arquitetura

Documento completo (requisitos, conflitos, stack, fases): https://claude.ai/artifact/52RZjt5g8h1Wq62KhS3a9H

## Resumo

- **Cliente** (`apps/web`): Phaser 4 + TypeScript + Vite. Renderiza, lê entrada, faz movimento e colisão localmente.
- **Lógica compartilhada** (`packages/shared`): TypeScript puro, sem Phaser. Schemas de conteúdo, leitura de mapas, movimento.
  A partir da Fase 4 terá o gerador procedural, usado pelo cliente e pelas Edge Functions do Supabase para validar a mesma seed.
- **Conteúdo** (`content/`): JSON validado com Zod. Nada de valores de jogo espalhados no código.
- **Backend** (Fase 2 em diante): Supabase. O cliente só lê os próprios dados (RLS); toda escrita de moedas, inventário,
  drops e XP passa por funções no servidor. A chave `service_role` nunca vai para o cliente.
- **Hospedagem**: Vercel (build estático). **Windows**: Tauri carregando o mesmo build web.

## Plano de fases

1. Cena de teste local (atual)
2. Fundação online: Supabase, login, personagem, RLS, deploy Vercel
3. Cidade pequena e transição de cena
4. Gruta procedural com seed e validação de caminho
5. Coleta e inventário validados no servidor
6. Combate simples, XP, nível, morte e retorno
7. Fechamento do MVP P1 e executável Windows de teste
