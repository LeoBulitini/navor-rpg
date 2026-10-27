-- Fase 11 (parte 2): colunas novas nas tabelas existentes.

alter table public.items add column gather_tool text;
alter table public.shops add column upgrades boolean not null default false;
alter table public.combat_rules add column max_dps_per_attack numeric not null default 0 check (max_dps_per_attack >= 0);
