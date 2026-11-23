# Plano da Gestão de Produção (ADM)

Decisões aprovadas por Ricardo em 23/11/2026. As quatro sugestões da seção 9 foram aceitas:

1. A blindadora vê de cada carro compartilhado a OS, o veículo, o setor, a situação, as datas e as horas de início e de término, e as pausas com motivo e duração. Não vê valor, ajudante, desconto, quinzena, observação pessoal nem a cópia da conta. Depois do consentimento, o prestador escolhe em cada lançamento se aquele carro é da empresa ou fica só no aparelho.
2. Ao revogar o consentimento, o que já foi enviado permanece na empresa, sem atualização nova, com a ficha encerrada. O prestador deixa de enviar carros novos. Nada é apagado no celular nem na cópia particular da conta.
3. Um vínculo ativo por prestador. Para mudar de empresa, ele revoga o consentimento anterior e aceita o novo convite.
4. O gerente define o SLA em horas úteis, nos 10 setores da empresa dele. Os dez começam com 8 horas úteis e ele ajusta quando quiser.

A migração de revisão está em `supabase/migrations/20261123210000_gestao_producao.sql`. Ela não foi aplicada no Supabase. Este plano não publica o site, não mexe em `main` e não altera `folhazero_v1`.

Este texto é só o plano. Não publica o site, não mexe em `main`, não altera o banco e não entra no app oficial. O modo Individual e a chave `folhazero_v1` continuam como estão. Nada deste arquivo deve ser aplicado no Supabase.

A Gestão de Produção é o módulo da blindadora. Ela vive na mesma base do Folha Zero, ao lado do modo Individual do prestador. Equipe e Gerente entram no mesmo módulo, com permissões distintas. Checklists ficam de fora nesta etapa.

## 1. Resumo executivo e regras já aprovadas

O prestador continua lançando carros no celular, com ou sem login, e guarda tudo no aparelho. Se quiser participar da Gestão de uma empresa, entra com Google ou com e-mail e senha, aceita um convite e dá um consentimento explícito sobre o que será compartilhado. Só depois disso a blindadora passa a ver a produção daquele prestador.

O gerente vê a produção da empresa dele: por setor, por prestador ou por equipe, com pausas e causas, gargalos e SLA. Ele não abre a cópia particular da conta, não vê valor, desconto nem quinzena de outra pessoa, e não substitui o lançamento que está no celular do prestador.

Regras já aprovadas, que este plano respeita:

1. Base única: modo Individual (prestador) e Gestão de Produção (blindadora). Equipe e Gerente no mesmo módulo, com permissões distintas.
2. Uma empresa por conta gerente. Outra empresa exige outra conta.
3. Consentimento explícito de compartilhamento. Dados pessoais do prestador ficam estritamente separados dos dados compartilhados com a blindadora.
4. Os mesmos motivos de pausa do Folha Zero de hoje: os 8 oficiais, mais "Fim de expediente" à parte no relatório. "Outro motivo" (texto digitado) também entra, como já entra no app.
5. Um celular ativo por conta, com troca só depois de confirmação.
6. Visão do gerente: produção pelos 10 setores fixos, na ordem Desmontagem, Manta, Aço, Overlap, Tampa, Vidro, Montagem, Tapeçaria, Aço de retrovisor e Churrasqueira; também por prestador ou por equipe; pausas e causas; gargalos e SLA.
7. Checklists ficam de fora por enquanto.
8. Supabase somente no plano Free (sem Pro e sem PITR). Login com Google e com e-mail e senha.
9. INOVA Blindagem permanece só como referência de testes, sem gerente piloto real. No banco já existe uma trava que impede cadastrar uma empresa com esse nome na lista oficial. Os testes desta etapa usam uma empresa fictícia com outro nome.
10. Custos futuros ficam a cargo da contratante, por mensalidade ou licença. Não há cobrança nesta etapa.
11. Prioridade absoluta: preservar os lançamentos locais em `folhazero_v1`. Quem usa só o Individual nunca é obrigado a entrar com conta. Licença vencida, suspensa ou revogada trava só carro novo ou envio novo, e não apaga o que já está no aparelho.

O painel do proprietário (Ricardo) continua separado. Ele convida e licencia o gerente da empresa. Ele não vê o conteúdo dos lançamentos compartilhados com a blindadora. Contas, prazos e totais agregados seguem no painel que já existe.

## 2. Como o módulo se encaixa no que já existe

As tabelas do painel já aplicadas permanecem como estão. A Gestão não reabre `copias_conta` para o gerente e não mistura o documento particular com a visão da empresa.

O que já existe e este plano não altera:

- `private.painel_donos`: lista de proprietários, fora da API.
- `public.painel_empresas`: a empresa, com `gerente_email`, `gerente_user_id` e `status` (`ativo`, `suspenso`, `revogado`).
- `public.painel_convites`: convites do proprietário para avulso ou gerente.
- `public.painel_pedidos`, `public.painel_contas`, `public.painel_degustacoes` e `public.painel_licencas`: pedido, conta, degustação e licença. Em `painel_contas`, o tipo continua `avulso` ou `gerente`.
- `public.copias_conta`: backup particular da conta. O painel do dono já vê só ficha curta (existe, data, tamanho, revisão e, no agregado, a quantidade de carros). O conteúdo do documento não sai. A Gestão também não lê esse documento.

A licença da empresa continua grudada em `painel_licencas` pelo `empresa_id`. A licença de um prestador avulso continua grudada na pessoa. Um prestador pode ser avulso no painel (usa o Individual e o backup da conta) e, à parte, ter um vínculo de Gestão com uma empresa. Por isso o membro da equipe não entra como um novo tipo em `painel_contas`. O vínculo mora em tabelas novas, ligadas a `painel_empresas` e ao `user_id` da conta.

Licença da empresa vencida, suspensa ou revogada: o gerente ainda consulta o que já foi compartilhado. Ninguém daquela empresa envia carro novo para a Gestão. No celular, o prestador continua vendo e editando o que já tem no modo Individual.

## 3. Modelo de dados proposto

Só especificação. Nenhum SQL deste capítulo deve ser executado. Quando houver um arquivo de migração, ele entra em revisão, como já aconteceu com o painel, e só é aplicado com autorização expressa.

### 3.1 Princípio de separação

Há dois acervos, sempre.

**Particular do prestador.** O que está no aparelho (`folhazero_v1` ou a chave de teste) e a cópia em `copias_conta`. Inclui valor, ajudante, desconto, quinzena, alíquota, observação pessoal e o documento completo. A blindadora não lê esse acervo.

**Compartilhado com a empresa.** Uma ficha de produção gravada em tabelas próprias, só depois do consentimento, só com os campos da decisão 1 da seção 9. Essa ficha é uma cópia dos campos autorizados, não uma mudança de lugar. O lançamento local continua sendo a fonte do prestador.

### 3.2 Tabelas novas

Todas no schema `public`, com RLS ligada e sem concessão de `SELECT`, `INSERT`, `UPDATE` ou `DELETE` para `anon` ou `authenticated`. O acesso é só por função, no padrão já usado no painel.

**`gestao_equipes`.** Times dentro de uma empresa.

- `id`, `empresa_id` (liga em `painel_empresas.id`), `nome`, `status` (`ativa` ou `arquivada`), `criado_por`, `criado_em`.

**`gestao_convites`.** Convite do gerente para um prestador entrar na equipe. Não reutiliza `painel_convites`, porque aquele convite é do proprietário e só aceita tipo `avulso` ou `gerente`.

- `id`, `codigo` (único, no mesmo estilo curto do painel), `email`, `empresa_id`, `equipe_id` (pode ser vazio), `status` (`rascunho`, `aceito`, `expirado`, `cancelado`), `criado_por`, `criado_em`, `aceito_por`, `aceito_em`, `expira_em`.
- Não envia e-mail. O gerente copia o código e manda por fora, como já acontece no painel do proprietário.

**`gestao_vinculos`.** Ligação da pessoa com a empresa, depois do convite e do consentimento.

- `id`, `empresa_id`, `user_id`, `equipe_id` (pode ser vazio), `papel` (`equipe`), `status` (`pendente_consentimento`, `ativo`, `revogado`), `consentimento_em`, `consentimento_texto` (o que a pessoa viu e aceitou), `revogado_em`, `revogado_por`.
- O gerente da empresa não precisa de linha aqui: ele já está em `painel_empresas.gerente_user_id` e em `painel_contas` com tipo `gerente`.
- Um vínculo ativo por pessoa, se a decisão 3 da seção 9 for confirmada. Troca de empresa exige revogar o vínculo anterior.

**`gestao_consentimentos`.** Histórico do que foi aceito ou revogado. Não se apaga quando o vínculo muda de estado.

- `id`, `vinculo_id`, `user_id`, `empresa_id`, `acao` (`aceitou` ou `revogou`), `escopo` (texto ou lista dos campos autorizados naquele momento), `em`.

**`gestao_carros`.** Ficha compartilhada de um lançamento.

- `id`, `empresa_id`, `prestador_user_id`, `equipe_id` (o time no momento do envio, para o histórico não mudar se a pessoa trocar de equipe), `origem_id` (o `id` local do lançamento, só para atualizar a mesma ficha, sem trazer o documento).
- Campos de produção, conforme a decisão 1: no desenho sugerido, `os`, `veiculo`, `setor`, `situacao`, `data_inicio`, `hora_inicio`, `data_termino`, `hora_termino`.
- `compartilhado_em`, `atualizado_em`, `status` (`ativo` ou `encerrado`). `encerrado` vale para ficha que já não recebe atualização (revogação ou saída), mas permanece no histórico da empresa.
- Sem `valor`, `ajudante`, `desconto`, dados de quinzena, alíquota, observação pessoal ou qualquer recorte de `copias_conta`.
- O setor oficial é um dos 10 listados na seção 1. O app Individual hoje também tem Steel, Aço Maçaneta e Qualidade. Esses três continuam no modo Individual. Se um carro compartilhado vier com um desses nomes, a Gestão mostra em um agrupamento "Outros", sem abrir coluna nova nos 10 setores.

**`gestao_pausas`.** Pausas da ficha compartilhada.

- `id`, `carro_id` (liga em `gestao_carros.id`), `motivo`, `outro` (sim ou não), `inicio`, `fim`.
- Motivos oficiais, nesta ordem: Faltando peça, Faltando vidro, Problemas elétricos, Problemas com vidro, Aguardando etapa anterior, Aguardando vidraceiro, Aguardando ajuste da produção, Impasse na resolução de um problema.
- "Fim de expediente" é motivo especial, como no app: não entra no tempo útil do carro e aparece separado no relatório.
- "Outro motivo" guarda o texto digitado, com o mesmo limite já usado no app (60 caracteres).

**`gestao_sla`.** Prazo da empresa por setor.

- `empresa_id`, `setor` (um dos 10), `prazo_horas_uteis`, `atualizado_em`, `atualizado_por`.
- Quem define o prazo é a decisão 4 da seção 9. A sugestão é o gerente, com um valor inicial igual nos 10 setores (8 horas úteis), que ele ajusta quando quiser.
- Tempo útil segue a regra já usada no Folha Zero: do início ao término, menos as pausas e menos o "Fim de expediente".

**`gestao_dispositivos`.** Um celular ativo por conta logada.

- `user_id`, `dispositivo_id` (sorteado no aparelho, não é senha e não fica em `folhazero_v1`), `rotulo` (opcional, por exemplo o navegador), `ativo`, `confirmado_em`, `visto_em`.
- No máximo uma linha ativa por `user_id`.

### 3.3 Segurança das funções

O padrão é o mesmo do painel, com o recorte mais fechado já usado no incremento de pessoas e carros:

- Função interna no schema `private`, `SECURITY DEFINER`, `search_path` vazio. Ela começa exigindo sessão e o papel certo.
- Função pública no schema `public`, `SECURITY INVOKER`, `search_path` vazio, só repassando a chamada. Não há `SECURITY DEFINER` no schema exposto.
- `REVOKE ALL` nas tabelas para `public`, `anon` e `authenticated`.
- `REVOKE ALL` nas funções para `public` e `anon`. `GRANT EXECUTE` das funções públicas só para `authenticated`. As funções privadas recebem `EXECUTE` para `authenticated` apenas o suficiente para o invoker conseguir chamá-las. O schema `private` permanece fora da API.
- A chave `service_role` nunca entra no cliente.

Funções internas propostas (nomes de trabalho):

- `private.gestao_exigir_sessao()`: sessão com e-mail confirmado.
- `private.gestao_exigir_gerente(empresa_id)`: a sessão é o `gerente_user_id` daquela empresa, a empresa está ativa e a licença da empresa permite o que a função vai fazer.
- `private.gestao_exigir_vinculo_ativo(empresa_id)`: a sessão tem vínculo `ativo` com consentimento naquela empresa.
- Convite e vínculo: criar convite, aceitar convite, registrar consentimento, revogar vínculo, listar equipe.
- Produção: enviar ou atualizar ficha, listar as próprias fichas (prestador) ou as da empresa (gerente).
- Painel do gerente: resumo, por setor, por equipe, por prestador, pausas e causas, gargalos e SLA.
- Aparelho: ativar dispositivo, confirmar troca, consultar o aparelho ativo, registrar que o app foi aberto.

Cada uma dessas funções públicas tem um invoker com o mesmo nome em `public`. Nenhuma delas devolve documento de `copias_conta`, valor, desconto ou quinzena.

## 4. Convite, consentimento e revogação

O fluxo começa no painel do proprietário, que já existe: Ricardo cria a empresa, indica o gerente e marca a licença. O gerente não nasce por conta própria.

Depois, no módulo de Gestão (primeiro no site de teste):

1. O gerente entra com a conta dele, cria as equipes que quiser e gera um convite em rascunho, com o e-mail do prestador e, se quiser, a equipe. O app não manda e-mail. O gerente copia o código e envia por fora.
2. O prestador pode continuar usando só o Individual, sem conta, até decidir entrar. Para se vincular, ele entra com Google ou com e-mail e senha. O e-mail da sessão precisa ser o mesmo do convite, como já vale no painel.
3. O convite vai para `aceito` e o vínculo nasce como `pendente_consentimento`. Ainda não existe ficha compartilhada.
4. A tela de consentimento mostra, em linguagem simples, duas listas: o que a empresa vai ver e o que permanece só no aparelho e na cópia da conta. Não há aceite implícito, não há caixa pré-marcada e não há envio no mesmo toque em que a pessoa só lê o texto. Ela precisa confirmar de propósito ("Concordo em compartilhar com [nome da empresa]").
5. Com o consentimento gravado (vínculo `ativo` e linha em `gestao_consentimentos`), o prestador passa a ter o modo Gestão no mesmo app. No lançamento, ele escolhe se aquele carro é da empresa ou fica só no aparelho. Carro marcado como só no aparelho nunca é enviado. Carro da empresa gera ou atualiza a ficha em `gestao_carros` e as pausas em `gestao_pausas`, só com os campos autorizados.
6. Atualização da ficha acontece quando o prestador, neste aparelho ativo e com internet, muda situação, horário ou pausa de um carro já compartilhado. Se houver dúvida entre duas versões, o app mostra a prévia e pede confirmação. Não há substituição automática, na mesma linha do backup da conta.
7. Prestador ou gerente podem revogar o vínculo. A revogação não apaga `folhazero_v1`, não apaga `copias_conta` e não impede o Individual. O vínculo fica `revogado`. Envios e atualizações novas param. O que acontece com o histórico já compartilhado é a decisão 2 da seção 9. A sugestão é manter as fichas na empresa com status `encerrado`, sem atualização nova.

Se o convite expirar ou for cancelado antes do consentimento, não resta vínculo ativo e nenhum dado de produção foi compartilhado.

## 5. Um celular ativo por conta, no plano Free

A regra vale para conta logada (prestador da Gestão, gerente ou avulso com backup). Quem usa só o Individual, sem entrar, não tem conta no servidor e portanto não entra nesta trava. O lançamento local dele não é apagado em nenhum dos casos abaixo.

Não depende de recurso pago do Supabase. Não usa PITR. Não exige Realtime. Cabe em uma tabela pequena e em funções chamadas quando o app abre, quando a pessoa entra e, no máximo, a cada 15 minutos enquanto o app estiver aberto com internet.

Como funciona:

1. No primeiro login daquele aparelho, o app grava um `dispositivo_id` em uma chave própria do navegador, fora de `folhazero_v1`. Se essa chave se perder, o aparelho pede de novo a confirmação de troca. Os lançamentos locais não são tocados.
2. O servidor guarda no máximo um dispositivo ativo por `user_id`. Se for o mesmo `dispositivo_id`, só atualiza `visto_em`.
3. Se outro aparelho já estiver ativo e tiver sido visto recentemente (sugestão: nos últimos 7 dias), o servidor responde "troca pendente". O app pergunta: "Há outro celular ativo nesta conta. Deseja continuar neste aparelho? O outro deixa de enviar e de ver a Gestão até você confirmar de novo lá." Só depois do sim o novo aparelho vira o ativo.
4. Se o aparelho ativo não aparece há mais de 7 dias, a pergunta continua, com o texto avisando que o outro não é visto há esse tempo. Ainda assim a pessoa confirma. Nada é trocado sozinho.
5. O aparelho que perdeu o lugar não tem os lançamentos apagados. O modo Individual segue normal, inclusive offline. O que para é o envio para a Gestão e a visão de gerente, até aquele aparelho voltar a ser o ativo, de novo com confirmação.
6. Offline: o prestador lança e edita no aparelho à vontade. A fila de envio espera internet e a confirmação de que este ainda é o celular ativo. Em conflito, vale a prévia com confirmação, nunca a substituição automática.

Essa estratégia cabe no Free porque cada conta tem uma linha ativa, as consultas são pontuais e não há leitura do documento particular para fazer o controle.

## 6. Telas e indicadores do gerente

A área do gerente é uma página do próprio módulo de Gestão, separada do painel do proprietário e separada da folha do prestador. Equipe e Gerente compartilham o módulo, mas a equipe não vê estas telas. O prestador vê só os carros que ele compartilhou, o estado do vínculo e o botão de revogar o consentimento.

Entrada do gerente: login com Google ou com e-mail e senha. Sem login, não há visão da empresa. A conta precisa ser a do `gerente_user_id` daquela empresa.

**Início.** Números do período escolhido (dia, semana, quinzena ou mês, no mesmo espírito do relatório atual): carros em andamento, carros finalizados, pausas abertas, carros fora do SLA e o setor que está mais parado. Sem valor em reais.

**Por setor.** Os 10 setores, nessa ordem fixa, cada um com: quantidade em andamento, quantidade finalizada, tempo útil médio, quantidade à espera da etapa anterior, tempo de pausa e situação do SLA (dentro do prazo, perto de vencer ou atrasado). "Outros" só aparece se existir ficha com setor que não é um dos 10.

**Por equipe.** Os mesmos indicadores, agrupados pela equipe do vínculo no momento do envio.

**Por prestador.** Uma linha por pessoa com vínculo ativo ou com histórico no período: nome, e-mail, equipe, carros em andamento, carros finalizados, tempo útil médio e pausa aberta, se houver. Sem valor, sem desconto e sem quinzena.

**Pausas e causas.** Consolidado no período, no mesmo critério do relatório mensal do Folha Zero: os 8 motivos oficiais, depois os textos de "Outro motivo", e "Fim de expediente" por último, separado, sem entrar no tempo útil.

**Gargalos.** Três recortes objetivos: o setor com mais carros em "Aguardando etapa anterior"; o setor com maior tempo útil médio; o setor com mais tempo de pausa (sem contar "Fim de expediente"). A tela mostra a conta e aponta os carros que puxam esse número (OS, veículo, prestador, setor e há quanto tempo), sem abrir dado pessoal financeiro.

**SLA.** Para cada um dos 10 setores: prazo configurado, percentual no prazo, quantidade atrasada e a lista dos carros atrasados. O tempo comparado é o tempo útil. Carro ainda em andamento conta como atrasado se o tempo útil até agora já passou do prazo.

**Cadastro da empresa, nesta etapa.** Criar e arquivar equipe, gerar e cancelar convite, copiar código, mover prestador de equipe, revogar vínculo e editar os prazos de SLA. Sem checklist. Sem tela de cobrança.

Filtro de período: dia, semana (segunda a domingo, recortada no mês), quinzena (1ª e 2ª) e mês, alinhado ao que o app já usa no relatório.

## 7. O que o app do prestador faz, sem perder o local

O modo Individual não muda de obrigação: abrir, lançar, editar, finalizar, exportar backup e usar offline continuam sem login. A chave `folhazero_v1` no app oficial não é migrada, esvaziada nem misturada com a chave de teste.

Com vínculo ativo, o mesmo app ganha a opção de marcar um lançamento como carro da empresa. Essa marca não move o lançamento e não tira valor da folha particular. Ela só autoriza o envio da ficha. Sem internet, ou com este aparelho fora da vez, o lançamento permanece no celular e o envio espera.

Licença da empresa ou do avulso vencida, suspensa ou revogada: o prestador ainda vê e edita o que já lançou no Individual, e ainda exporta o backup. O que para é carro novo quando essa for a regra da licença, e o envio novo para a Gestão.

## 8. Fases de entrega

Nenhuma fase abaixo começa no banco ou no app oficial só porque este plano existe. Cada avanço de código, SQL ou publicação pede a autorização que já vale hoje: revisar antes, testar no site isolado e só então, com um "pode", ir para o endereço do dia a dia.

**Fase 0 (agora).** Este plano, para o Ricardo ler e responder as quatro decisões da seção 9. Sem SQL aplicado, sem commit e sem publicação.

**Fase 1.** Arquivo SQL só para revisão, no mesmo espírito do painel: tabelas novas, RLS fechada e funções privadas com invoker público. Ninguém aplica daqui. Ajuste fino se as decisões da seção 9 mudarem algum campo.

**Fase 2.** Primeiro no site de teste (`wild-voice-4f08`). Pacote completo, como já é a regra desse host. Empresa fictícia (nome diferente de INOVA Blindagem), gerente de teste, convite, consentimento, envio de ficha, telas do gerente, troca confirmada de aparelho e login com e-mail e senha além do Google. Os lançamentos de teste ficam na chave de teste, não em `folhazero_v1`.

**Fase 3.** Ricardo percorre o roteiro de teste e manda os prints: convite, tela de consentimento, Início do gerente, os 10 setores, pausas com "Fim de expediente" separado, um gargalo e uma troca de celular. Ajustes voltam para o site de teste, não para o app oficial.

**Fase 4.** Só com autorização expressa: a Gestão entra no endereço oficial, em página ou modo separado, sem substituir a folha inicial e sem obrigar login no Individual. O controle real de licença do painel, quando essa etapa for autorizada, continua travando só carro novo e nunca apaga lançamento local.

**Depois, fora desta leva.** Checklists. Cobrança e mensalidade da contratante. Qualquer piloto com empresa real.

## 9. Decisões para o Ricardo

Aprovadas em 23/11/2026. As quatro sugestões abaixo foram aceitas e estão registradas no topo deste arquivo.

1. O que a blindadora vê de cada carro compartilhado? Sugestão: OS, veículo, setor, situação, datas e horas de início e de término, e as pausas (motivo e duração). Não vão valor, ajudante, desconto, quinzena, observação pessoal nem a cópia da conta. Depois do consentimento, o prestador escolhe em cada lançamento se aquele carro é da empresa ou fica só no aparelho.

2. Quando o prestador revoga o consentimento, o que acontece com o histórico já compartilhado? Sugestão: o que já foi enviado permanece na empresa, sem atualização nova, com a ficha encerrada. O prestador deixa de enviar carros novos. Nada é apagado no celular nem na cópia particular da conta.

3. Um prestador pode ter vínculo ativo com mais de uma empresa ao mesmo tempo? Sugestão: não. Um vínculo ativo por vez. Para mudar de empresa, ele revoga o consentimento anterior (vale a regra da decisão 2) e aceita o novo convite.

4. Quem define o prazo de SLA de cada setor? Sugestão: o gerente define, em horas úteis, para os 10 setores da empresa dele. Na primeira configuração, os dez começam com 8 horas úteis, e ele ajusta quando quiser.
