# Fundação da v20 (sem publicação)

Esta etapa fica só no branch de desenvolvimento. Não houve merge, push em `main` nem deploy do GitHub Pages. O projeto Supabase `vyxfjdhhlzluwfesxgra` existe, em São Paulo, no plano Free. A migração base foi aplicada pelo conector como versão `20261107210528` (o arquivo do repositório é `20261107210000_base_segura.sql`; o conteúdo é o mesmo e não deve ser reaplicado). As tabelas existem e não há linhas, nem em `auth.users`.

## Revisão de 07/11

Ricardo fechou o escopo abaixo. A base segura já está no projeto e as tabelas seguem sem linhas. Ainda não há empresa piloto nem gerente piloto. A migração da cópia privada ainda não foi aplicada.

- Gestão de Produção é um módulo só, com equipe e gerente. O gerente coordena por setor, por prestador ou cria equipe. O nome genérico da equipe é Equipe de Produção. Concept não é nome fixo de equipe.
- INOVA Blindagem aparece só como tenant fictício de teste nesta rodada. Não entrou na lista real de empresas do app e não é semeada em `folhazero_v1`.
- Pausas usam a lista que o app já tem, mais Outro motivo e Fim de expediente. Não há taxonomia nova de insumo ou pessoal.
- Cada conta de gerente pertence a uma única organização. Outra empresa exige outra conta. Não há seletor de várias empresas para o gerente. O prestador pode atender várias empresas clientes, mas o gerente vê só a própria organização e só a produção que o prestador compartilhou. Valor privado não entra.
- Compartilhar exige consentimento informado: finalidade, versão do texto, data e escopo. Revogar encerra a visibilidade da empresa. A retenção de produção já entregue não está ativa: ninguém concordou com ela ainda. A linha continua com o prestador. Isso não promete exclusão irrestrita e não apaga o aparelho.
- Um aparelho ativo por conta vale no servidor, depois de confirmação ao ativar outro. `localStorage` e impressão digital não travam o celular. Quem está offline só perde a nuvem quando o aparelho voltar a falar com o servidor, e os lançamentos locais continuam. Trocar de conta não mostra a base da outra. Quem já usa o app segue abrindo o legado.
- O projeto já é Supabase Free, titular Ricardo, região `sa-east-1`, id `vyxfjdhhlzluwfesxgra`. Continua vazio. Sem Pro, PITR, cartão, addon ou upgrade. Custo futuro, se houver, fica com o contratante por mensalidade ou licença. O preço não está definido. O Free não é produção sem limite nem backup gerenciado.
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

Não força login no aplicativo do dia a dia, não cria conta, não envia cópia e não liga backup automático, restauração entre aparelhos nem os módulos de gestão. A tela isolada só inicia o Google. O SQL canônico é `supabase/migrations/20261107210000_base_segura.sql`. `schema.sql` só aponta para ele. `migrations/002_proprietario.sql` não tem DDL. O arquivo foi conferido num Postgres 16 local, com os mesmos `gen_random_uuid` do PG 17, sem aplicar nada no projeto. Falta aceitar convite e criar organização pelo app: sem policy de insert, o padrão é negar.

## Testes executados

`npm test`: 54 testes, todos passando. Um sobe um Postgres local, aplica a base duas vezes, a cópia privada e a proteção da fixture duas vezes. Os ataques incluem negativos aninhados e oito sessões simultâneas da mesma conta. Nada disso foi aplicado no projeto remoto. Nenhuma conta foi criada.

- Backup idempotente, quota, prévia, confirmação, cópia inválida e aborto da restauração.
- Conta vazia, mescla sem duplicar id, troca de usuário, logout, ack parcial e ack divergente.
- Plano sem valor na produção e sem org automática.
- Recusa de `service_role`.
- INOVA Blindagem ausente do catálogo real. Pausas iguais às do app. Gerente limitado a uma empresa. Consentimento com finalidade, versão, data e escopo. Revogação sem apagar o local e sem prometer apagar a produção já retida.
- Um aparelho ativo só como regra de servidor. Ativar outro pede confirmação. A nota local não apaga `folhazero_v1`.
- O clique do Google, em mock, monta a autorização do projeto e recusa a origem publicada e um destino externo. O erro de retorno não contém token. E-mail fica pendente de SMTP. Plano Pro e PITR são recusados.
- Proprietário da plataforma: bootstrap só com ordem explícita de servidor, nunca por nome ou e-mail. Ele aprova, suspende e revoga acessos e registra degustação ou licença manual sem preço. Não lê carros nem valores. O gerente só gere membros da própria empresa se o proprietário permitir. Convite real não é enviado. A tela de acesso fica desligada sem projeto e não guarda senha.
- Regressão do relatório v19: 7 empresas, 13 setores, fim de expediente fora do tempo útil, reabertura preservando OS, valor e pausas, PDF ainda mensal.
- v20: novembro de 2026 tem 6 semanas, a segunda é 02/11 a 08/11, sem "Semana N de M", quinzenas 1ª e 2ª, situação filtrada, resumo mensal intacto.
- Rede dos testes não chama o contador.

Captura mobile em 390x844, com carros fictícios OS-TESTE, operador "Pessoa Exemplo". O contador e qualquer host Supabase foram bloqueados.

## O que funciona agora e o que continua pendente

No aparelho, sem projeto: a seção Acesso explica que o login está desligado, os campos ficam inativos e a senha não é gravada. O painel do proprietário não abre pelo nome de quem usa o app. Com uma sessão de teste marcada como confirmada pelo servidor, a lista local de solicitações e de licenças pode ser alterada só em `folhazero_admin_meta`. Isso não cria conta, não envia convite e não mostra carros nem valores.

A tela `acesso-teste.html` fala com o projeto usando só a chave publishable e o fluxo PKCE. O botão Google chama `signInWithOAuth` com retorno igual à própria página. A origem `networkinova-jpg.github.io` fica bloqueada. O login Google já foi concluído por Ricardo no site isolado. Esta etapa não repete esse login.

A cópia fictícia fica na chave `folhazero_teste_fixture`. A tela de acesso não lê `folhazero_v1`. No site isolado, com sessão, o envio manual grava só a fixture canônica em `copias_fixture_teste`. Se a conta já tem a linha, nada é apagado e a recuperação continua disponível. O GitHub Pages não envia. O app de teste em `app-teste.html` usa `folhazero_teste_app` e não registra o service worker. O backup variável dos lançamentos de teste está preparado em `20261108010000_backups_teste_app.sql` e ainda não foi aplicado. O envio desses lançamentos permanece fechado. A tabela canônica não foi afrouxada. O teste ponta a ponta da fixture no projeto foi feito pelo Ricardo. A restauração real dos lançamentos do aplicativo não faz parte desta etapa. No plano Free o banco fica somente leitura acima de 500 MB e não há PITR. A retenção do aplicativo continua pendente.

Em 07/11/2026 a Data API, com a chave publishable, respondeu HTTP 406 e código PGRST106 ao schema `private`. A função de mesmo nome em `public` respondeu 404 PGRST202. O schema `private` está fora da API nesta verificação. O envio remoto continua fechado porque a migração de validação não foi aplicada no projeto.

## Testes não executados

- Relação dos schemas expostos na API. Não dá para ver pelo conector se `private` está oculto. Tratar como pendência.
- Login Google ponta a ponta. Os testes usam mock: o clique monta a URL do projeto e o erro não mostra token. Nenhuma conta real foi criada.
- SMTP próprio, cadastro de cliente e subida de lançamento real.
- Envio real de e-mail, upload e restauração noutro aparelho. O envio de cópia permanece bloqueado nesta tela.
- Revogação de aparelho com o servidor fora do ar. O teste cobre a decisão e o fato de o local permanecer. Não cobre um aparelho real offline.
- Duas abas reais do navegador ao mesmo tempo. A mescla por id está testada em memória.
- Publicação no GitHub Pages. O cache do service worker desta branch é `folha-zero-v20`. O site no ar continua a v19.

## Checklist para ligar o login de verdade

Sem colar segredo em conversa.

1. Não reaplicar a base `20261107210528` nem a cópia `20261107223000`. As duas já foram aplicadas.
2. No painel do projeto, conferir se a API expõe só `public`. O schema `private` precisa ficar de fora. Isso ainda não foi verificado.
3. Quando o endereço HTTPS da hospedagem isolada existir, colocá-lo em Authentication, URL Configuration, Redirect URLs. A origem JavaScript autorizada no Google Cloud é esse mesmo HTTPS. Não usar `networkinova-jpg.github.io`.
4. E-mail de cliente: configurar SMTP próprio. O envio padrão não serve. Enquanto isso, a tela não cria conta.
5. No computador, só para ver a tela: `python3 -m http.server 8765` e abrir `http://127.0.0.1:8765/acesso-teste.html`. Esse endereço não entra na allowlist e não é o teste do telefone.

## Rollout quando houver autorização

1. Ricardo exporta o backup local antes de qualquer conta de teste.
2. Se a criação for autorizada, o projeto é Supabase Free, titular Ricardo, região `sa-east-1`. Sem cartão, Pro, PITR, addon ou upgrade. A anon key entra só na configuração daquele teste. A service_role não vai para o app.
3. SMTP de produção continua pendente. Não usar o envio padrão restrito e não contratar provedor nesta etapa.
4. Não há empresa piloto nem gerente piloto ainda. A primeira cópia, quando existir, continua desligada para os demais aparelhos. Login não é obrigatório. Conta vazia não substitui o local.
5. Rollback: restaurar a cópia local, ou seguir em `folhazero_v1`. O site publicado só muda num merge futuro, fora desta etapa.
