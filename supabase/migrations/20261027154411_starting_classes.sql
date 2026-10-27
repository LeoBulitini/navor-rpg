-- Fase 8: Guerreiro e Arqueiro passam a ser classes iniciais jogáveis, ao lado do Mago (GDD 1.1 e 4).
-- As classes de evolução (níveis 25, 50 e 75) continuam fora da criação de personagem.
update public.classes set playable = true where id in ('warrior', 'archer');
