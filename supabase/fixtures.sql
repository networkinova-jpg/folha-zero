-- Dados fictícios para revisar o esquema. Não são lançamentos de ninguém.
-- Não executar contra um projeto real sem autorização. Não há OS, nome ou
-- empresa de produção aqui.

-- Usuárias e usuários de exemplo (uuid fixo só neste arquivo):
--   11111111-1111-4111-8111-111111111111  Ana Prestadora
--   22222222-2222-4222-8222-222222222222  Bruno Equipe
--   33333333-3333-4333-8333-333333333333  Carla Gerente
--   44444444-4444-4444-8444-444444444444  Diego Outra Org

-- Organização "Blindadora Exemplo Alfa"
-- Outra organização "Oficina Exemplo Beta", invisível para Carla.

-- Lançamento pessoal da Ana, org_id nulo, client_id 'carro-ficticio-1'.
-- OS-TESTE-001, veículo "Carro Exemplo", setor "Setor Exemplo A".
-- Valor 123.45 fica só em lancamento_valores, owner Ana.

-- Lançamento da org Alfa, client_id 'carro-ficticio-2', setor "Setor Exemplo A".
-- Bruno (equipe desse setor) pode ver a produção e não o valor.
-- Carla (gerente da Alfa) pode ver a produção da Alfa e não o valor, e não vê a Beta.
-- Diego é gerente da Beta e não vê a Alfa.

-- Convite da Alfa para "pessoa.ficticia@example.invalid", revogável por Carla.
-- sync_mutacoes.mutation_id = 'm-ficticio-repetivel' para o mesmo sha256.

-- Este arquivo não contém INSERT de propósito: colar uuid em auth.users
-- exigiria um projeto de verdade. O modelo executável dos mesmos casos
-- está em politica-modelo.js e nos testes.
