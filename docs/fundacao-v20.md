# Fundação da v20 (sem publicação)

Esta etapa fica só no branch de desenvolvimento. Não houve merge, push em `main`, deploy do GitHub Pages, projeto Supabase nem planilha real.

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
- Legado não entra numa organização sozinho. Gerente não vê valor e não vê outra organização. Equipe vê o próprio setor ou o que lhe foi atribuído.

## O que esta etapa não faz

Não liga login Google, e-mail e senha, backup automático de verdade, restauração entre aparelhos nem os módulos de gestão no dia a dia. O SQL em `supabase/schema.sql` é proposta. `fixtures.sql` não insere dados e não usa lançamento real. O modelo em `supabase/politica-modelo.js` só confere as regras nos testes. Não substitui o Postgres.

## Testes executados

`npm test`: 19 testes, todos passando.

- Backup idempotente, quota, prévia, confirmação, cópia inválida e aborto da restauração.
- Conta vazia, mescla sem duplicar id, troca de usuário, logout, ack parcial e ack divergente.
- Plano sem valor na produção e sem org automática.
- Recusa de `service_role`.
- Regressão do relatório v19: 7 empresas, 13 setores, fim de expediente fora do tempo útil, reabertura preservando OS, valor e pausas, PDF ainda mensal.
- v20: novembro de 2026 tem 6 semanas, a segunda é 02/11 a 08/11, sem "Semana N de M", quinzenas 1ª e 2ª, situação filtrada, resumo mensal intacto.
- Rede dos testes não chama o contador.

Captura mobile em 390x844, com carros fictícios OS-TESTE, operador "Pessoa Exemplo". O contador e qualquer host Supabase foram bloqueados.

## Testes não executados

- RLS de verdade num Postgres ou Supabase. Não há projeto autorizado e não foi criado um.
- Login Google, e-mail e senha, upload real e restauração noutro aparelho.
- Duas abas reais do navegador ao mesmo tempo. A mescla por id está testada em memória.
- Publicação no GitHub Pages. O cache do service worker passou para `folha-zero-v20` só neste branch. O site no ar continua a v19.

## Rollout quando houver autorização

1. Ricardo exporta o backup local antes de qualquer aparelho de teste.
2. Um projeto Supabase é criado por uma pessoa autorizada. A anon key entra só na configuração daquele teste. A service_role não vai para o app.
3. A cópia online continua desligada para os demais. Login não é obrigatório.
4. A primeira conta é a do Ricardo, com vínculo explícito do legado e conferência do ack. Conta vazia não pode substituir o aparelho.
5. Rollback: restaurar a cópia local anterior, ou seguir na chave `folhazero_v1`, que não depende da nuvem. O site publicado só muda num merge futuro, fora desta etapa.
