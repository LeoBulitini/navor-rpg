# Deploy na Vercel

O projeto Vercel `navor-rpg` está ligado ao repositório GitHub `LeoBulitini/navor-rpg`:

- push em `main` gera o deploy de produção;
- cada pull request gera um deploy de preview com URL própria.

As configurações de build ficam no `vercel.json` da raiz (`npm ci`, `npm run build`, saída em `apps/web/dist`).

## Variáveis de ambiente (Project Settings > Environment Variables)

| Nome | Valor | Ambientes |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | URL do projeto Supabase | Production, Preview |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | chave publishable do Supabase | Production, Preview |

Sem essas variáveis o site funciona apenas no modo offline. Nunca cadastre a chave secret/service_role aqui:
variáveis `VITE_*` são embutidas no JavaScript público.

Observação: o plano Hobby da Vercel é só para uso não comercial. Se houver venda de moeda premium no futuro,
o projeto precisará do plano Pro.
