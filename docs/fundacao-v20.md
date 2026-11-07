# Fundação da v20 (sem publicação)

Esta etapa fica só no branch de desenvolvimento. Não houve merge, push em `main`, deploy do GitHub Pages, projeto Supabase nem planilha real.

## Revisão de 07/11

Ricardo fechou o escopo abaixo. Ainda não há empresa piloto, gerente piloto nem projeto configurado.

- Gestão de Produção é um módulo só, com equipe e gerente. O gerente coordena por setor, por prestador ou cria equipe. O nome genérico da equipe é Equipe de Produção. Concept não é nome fixo de equipe.
- INOVA Blindagem aparece só como tenant fictício de teste nesta rodada. Não entrou na lista real de empresas do app e não é semeada em `folhazero_v1`.
- Pausas usam a lista que o app já tem, mais Outro motivo e Fim de expediente. Não há taxonomia nova de insumo ou pessoal.
- Cada conta de gerente pertence a uma única organização. Outra empresa exige outra conta. Não há seletor de várias empresas para o gerente. O prestador pode atender várias empresas clientes, mas o gerente vê só a própria organização e só a produção que o prestador compartilhou. Valor privado não entra.
- Compartilhar exige consentimento informado: finalidade, versão do texto, data e escopo. Revogar interrompe compartilhamento novo. Produção já entregue pode ficar retida para a finalidade registrada. Isso não promete apagar tudo e não apaga o aparelho.
- Um aparelho ativo por conta vale no servidor, depois de confirmação ao ativar outro. `localStorage` e impressão digital não travam o celular. Quem está offline só perde a nuvem quando o aparelho voltar a falar com o servidor, e os lançamentos locais continuam. Trocar de conta não mostra a base da outra. Quem já usa o app segue abrindo o legado.
- Supabase, se for criado com autorização, é só o plano Free, titular Ricardo, região `sa-east-1`. Sem Pro, PITR, cartão, addon ou upgrade. Custo futuro, se houver, fica com o contratante por mensalidade ou licença. O preço não está definido. O Free não é produção sem limite nem backup gerenciado.
- Login Google e e-mail com senha são desejados. E-mail depende de SMTP e dos limites do fornecedor. O SMTP padrão restrito não será usado em produção e nenhum provedor foi contratado. O código só decide o motivo da pendência e não envia credencial nem mensagem.
- Dados fictícios ficam nos testes. Atualizar o app não injeta esses dados na base de ninguém. Não há modo demo automático.

## Decisões

- A chave `folhazero_v1` continua sendo a origem dos lançamentos. Nada neste branch a renomeia, apaga ou troca de URL.
- A cópia online fica desligada sem `window.FOLHA_ZERO_NUVEM` com `url` e `anonKey`. Não há endpoint inventado e não há `fetch` em `persistencia.js`.
- `service_role`, senha ou qualquer campo com esse papel é recusado e não é guardado.
- Antes de migrar, o texto cru de `folhazero_v1` vai para `folhazero_copia_*`. Se a escrita falhar, a migração aborta e a origem fica como estava.
- A nuvem só pode ser marcada `verificada` com ack do mesmo sha256 e da mesma lista de ids. Conta remota vazia não substitui lançamentos locais.
- Repetir o envio usa o mesmo `mutation_id` (o sha256 do payload). Ids dos carros não são recriados.
- Logout e troca de usuário só limpam o vínculo em `folhazero_guardiao`. Não copiam a base para outra conta e não trazem dados de outro perfil.
- Restaurar exige prévia e confirmação. Antes de escrever, grava cópia de segurança do estado atual. Cópia inválida ou falta de espaço aborta e preserva o original.
- O seletor Semana, Quinzena e Mês altera só o gráfico "Por dia da semana" e a "Situação dos carros". Resumo, produção, pausas, maior e menor tempo, parados, tempo por carro e PDF continuam no mês inteiro. Mês é o padrão. Semana é de segunda a domingo, recortada no mês escolhido. Não existe o rótulo "Semana N de M".
- O estado do seletor fica na memória. Não entra em `folhazero_v1`.
- Login não é obrigatório. Quem já usa o app abre como antes.
- O contador do Google continua no app de produção, mas os testes zeram `CONTADOR_URL` e bloqueiam a rede. Nenhum carro de teste foi enviado.

## Inventário do que hoje está em folhazero_v1

Documento JSON, `version: 2`.

- `entries[]`: id estável (texto gerado no aparelho, não é uuid), empresa, setor, os, veiculo, dataInicio, horaInicio, dataTermino, horaTermino, situacao, pausas (`motivo`, `inicio`, `fim`, `outro`), valor, ajudante, obs, exemplo, createdAt, updatedAt.
- `quinzenas`: status da folha por empresa e quinzena.
- `descontos`: desconto manual por empresa e quinzena.
- `settings`: operador, setorOperador, valorPadrao, aliquota, trialInicio, lastBackup.

Catálogo atual do app, preservado: 7 empresas (Concept Blindados, VRZ Blindados, Carbon Blindados, Bullet Blindados, Collet Blindados, EB Blindados, Marc Blindagem) e 13 setores, incluindo Steel, Aço Maçaneta e Qualidade. Situação manual, pausa com motivo, fim de expediente, reabertura e leitor de QR permanecem.

Fora dessa chave, de propósito: `folhazero_contador` (nome e setor do contador, sem carros) e, nesta etapa, `folhazero_guardiao` mais `folhazero_copia_*`.

## O que a migração futura pode separar

`planoDeLinhas` só desenha o pacote. Não envia nada.

- Produção, sem dinheiro e com `org_id` nulo até um vínculo explícito: empresa, setor, OS, veículo, datas, horas, situação, observação e pausas.
- Privado do dono: valor, ajudante, descontos, alíquota e valor padrão.
- Legado não entra numa organização sozinho. O gerente só vê produção com compartilhamento e consentimento da própria organização. Equipe vê o setor, o prestador ou a equipe atribuída. Valor, desconto e alíquota ficam com o dono.

## O que esta etapa não faz

Não liga login Google, e-mail e senha, backup automático de verdade, restauração entre aparelhos nem os módulos de gestão no dia a dia. O SQL em `supabase/schema.sql` é proposta. `fixtures.sql` não insere dados e não usa lançamento real. O modelo em `supabase/politica-modelo.js` só confere as regras nos testes. Não substitui o Postgres.

## Testes executados

`npm test`: 28 testes, todos passando.

- Backup idempotente, quota, prévia, confirmação, cópia inválida e aborto da restauração.
- Conta vazia, mescla sem duplicar id, troca de usuário, logout, ack parcial e ack divergente.
- Plano sem valor na produção e sem org automática.
- Recusa de `service_role`.
- INOVA Blindagem ausente do catálogo real. Pausas iguais às do app. Gerente limitado a uma empresa. Consentimento com finalidade, versão, data e escopo. Revogação sem apagar o local e sem prometer apagar a produção já retida.
- Um aparelho ativo só como regra de servidor. Ativar outro pede confirmação. A nota local não apaga `folhazero_v1`.
- Login Google e e-mail não enviam nada. E-mail fica pendente de SMTP. Plano Pro e PITR são recusados. Free não promete backup gerenciado.
- Proprietário da plataforma: bootstrap só com ordem explícita de servidor, nunca por nome ou e-mail. Ele aprova, suspende e revoga acessos e registra degustação ou licença manual sem preço. Não lê carros nem valores. O gerente só gere membros da própria empresa se o proprietário permitir. Convite real não é enviado. A tela de acesso fica desligada sem projeto e não guarda senha.
- Regressão do relatório v19: 7 empresas, 13 setores, fim de expediente fora do tempo útil, reabertura preservando OS, valor e pausas, PDF ainda mensal.
- v20: novembro de 2026 tem 6 semanas, a segunda é 02/11 a 08/11, sem "Semana N de M", quinzenas 1ª e 2ª, situação filtrada, resumo mensal intacto.
- Rede dos testes não chama o contador.

Captura mobile em 390x844, com carros fictícios OS-TESTE, operador "Pessoa Exemplo". O contador e qualquer host Supabase foram bloqueados.

## O que funciona agora e o que continua pendente

No aparelho, sem projeto: a seção Acesso explica que o login está desligado, os campos ficam inativos e a senha não é gravada. O painel do proprietário não abre pelo nome de quem usa o app. Com uma sessão de teste marcada como confirmada pelo servidor, a lista local de solicitações e de licenças pode ser alterada só em `folhazero_admin_meta`. Isso não cria conta, não envia convite e não mostra carros nem valores.

Pendente de integração real: criar o projeto Free, ligar a chave pública, provar o login Google, validar o SMTP próprio, publicar a função de borda e aplicar as migrações. O conector do Supabase segue sem autenticação. Nada disso foi simulado como se já estivesse no ar.

## Testes não executados

- RLS de verdade num Postgres ou Supabase. Não há projeto e esta etapa não criou um.
- Envio real de e-mail, login Google contra um provedor, upload e restauração noutro aparelho.
- Revogação de aparelho com o servidor fora do ar. O teste cobre a decisão e o fato de o local permanecer. Não cobre um aparelho real offline.
- Duas abas reais do navegador ao mesmo tempo. A mescla por id está testada em memória.
- Publicação no GitHub Pages. O cache do service worker desta branch é `folha-zero-v20`. O site no ar continua a v19.

## Rollout quando houver autorização

1. Ricardo exporta o backup local antes de qualquer conta de teste.
2. Se a criação for autorizada, o projeto é Supabase Free, titular Ricardo, região `sa-east-1`. Sem cartão, Pro, PITR, addon ou upgrade. A anon key entra só na configuração daquele teste. A service_role não vai para o app.
3. SMTP de produção continua pendente. Não usar o envio padrão restrito e não contratar provedor nesta etapa.
4. Não há empresa piloto nem gerente piloto ainda. A primeira cópia, quando existir, continua desligada para os demais aparelhos. Login não é obrigatório. Conta vazia não substitui o local.
5. Rollback: restaurar a cópia local, ou seguir em `folhazero_v1`. O site publicado só muda num merge futuro, fora desta etapa.
