-- Casos fictícios para ler o esquema. Não executar em projeto real.
-- Não há INSERT. Não cria usuário, não manda e-mail e não grava no app pessoal.
-- INOVA Blindagem, neste arquivo, é só um tenant de teste desta rodada.
-- Não é empresa do catálogo do aplicativo e não deve ser semeada em folhazero_v1.

-- Pessoas fictícias:
--   11111111-1111-4111-8111-111111111111  Ana Prestadora
--   22222222-2222-4222-8222-222222222222  Bruno, da Equipe de Produção
--   33333333-3333-4333-8333-333333333333  Carla, gerente de uma única organização
--   44444444-4444-4444-8444-444444444444  Diego, gerente de outra organização

-- Organização fictícia "INOVA Blindagem" (somente este teste).
-- Outra organização fictícia "Oficina Exemplo Beta".
-- Carla não ganha seletor para ver a Beta. Diego não vê a INOVA.
-- Ana, prestadora, tem carros em "Cliente Norte Teste" e "Cliente Sul Teste".
-- O valor fica só com Ana.

-- Equipe criada pela Carla se chama "Equipe de Produção".
-- Não usar Concept como nome fixo de equipe.

-- Consentimento da Ana, versão de texto 2026-11-07, finalidade de compartilhar
-- produção sem valores, escopo só Cliente Norte Teste e Setor Exemplo A.
-- Depois de revogar, o gerente deixa de ver o carro. A linha continua com a Ana.
-- Retenção pela empresa não está ativa. Não se presume concordância com isso.
-- Isso não apaga o folhazero_v1 e não promete exclusão irrestrita.

-- Pausa do carro fictício: motivo "Faltando peça", mais uma "Fim de expediente"
-- e um "Outro motivo" com o texto "Peça de teste". Sem categoria nova.

-- Aparelho ativo de Ana: "aparelho-ficticio-1". Ativar outro pede confirmação
-- e revoga o anterior só no servidor.

-- O modelo executável destes casos está nos testes. Não há projeto Supabase.
