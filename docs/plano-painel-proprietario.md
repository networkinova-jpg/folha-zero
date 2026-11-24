# Plano do painel do proprietário

Este texto é só o plano. Não publica o site, não mexe em `main` e não altera o banco. O app do dia a dia continua como está.

Ricardo é o dono e o administrador geral. Ele convida, aprova, suspende e revoga pessoas avulsas e empresas. Também marca degustação e licença. Ele não vê senha de ninguém. Ele não abre os lançamentos, a OS, o veículo nem o valor de outra pessoa. A cópia na conta continua particular. O painel mostra só se a conta existe, o estado dela e a data do último backup.

Quem já usa o app abre do mesmo jeito. Login não é obrigatório para lançar, ver a folha ou exportar o backup. Uma licença vencida, suspensa ou revogada não apaga o que está no celular.

## 1. O que Ricardo vê

A página é separada do app. Quem não for o dono entra com o Google e vê só a frase: esta conta não é do proprietário. Não aparece lista nenhuma.

**Entrada.** Um botão: Entrar com Google. Sem campo de senha. Sem e-mail e senha nesta etapa.

**Início.** Quatro números: pedidos esperando, pessoas avulsas, empresas e licenças que vencem nos próximos 7 dias. Nada de carro, OS ou valor.

**Pedidos.** Cada linha tem nome, e-mail, o que a pessoa pediu (avulso ou empresa) e a data. Ricardo aprova ou recusa. Pedido recusado não cria licença.

**Pessoas avulsas.** Uma linha por pessoa: nome, e-mail, estado, fim da degustação ou da licença, e a data do último backup se houver cópia. Ricardo pode iniciar uma degustação de 20 dias, marcar uma licença com data de validade, suspender ou revogar. Não há botão para abrir os lançamentos.

**Empresas.** Uma linha por empresa: nome, e-mail do gerente, estado e validade. Ricardo cria a empresa, indica o gerente e define a licença. INOVA Blindagem não entra nesta lista. Ela fica só nos testes. Um gerente, uma empresa. Outra empresa pede outra conta de gerente. O gerente ainda não administra a equipe nesta etapa. Isso fica para depois.

**Convites.** Ricardo escreve o e-mail e escolhe avulso ou gerente de uma empresa. O convite fica como rascunho. O app ainda não envia e-mail. Ricardo pode copiar um código para mandar por fora, se quiser. Quando a pessoa entrar com o Google e o e-mail bater, o convite vira aceito e cai em Pedidos ou já nasce aprovado, conforme a decisão 4 abaixo.

**Minha conta.** Mostra que Ricardo é o proprietário, sem prazo. Não usa o nome digitado no celular como prova.

## 2. Onde fica e como se protege

Primeiro no site isolado de teste, numa página só do painel, separada do app de teste. O endereço publicado do dia a dia não muda nessa fase.

Depois que Ricardo testar, a mesma página pode ir para o GitHub Pages como `admin.html`, no mesmo endereço do app, sem substituir a página inicial. O app normal continua em `index.html`.

A proteção é no servidor. Existe uma lista de proprietários que só o banco aceita, gravada por um comando feito no projeto, não pelo celular. A página pergunta: esta sessão do Google está nessa lista e está ativa? Se não estiver, para. O nome "Ricardo Ribeiro" no app não serve de chave. Um dado que a pessoa possa editar na própria conta também não serve.

O celular do painel usa só a chave pública. A chave secreta do banco não entra no app. Cada tabela só deixa ver a própria linha, e o dono só vê o que a regra dele permitir. Função exposta na API não fica com poder especial. O poder especial fica numa função interna, fora da API, com caminho de busca vazio. A função pública só repassa o pedido de quem já está logado.

A cópia dos lançamentos continua legível só pelo dono daquela cópia. O painel, no máximo, recebe uma ficha curta: existe cópia, data da última gravação, tamanho e número da revisão. O conteúdo não sai.

## 3. Dados e estados

As tabelas de pedido, licença, empresa e proprietário já existem no projeto e estão vazias. Este plano não as altera. Na etapa seguinte, se faltar um estado, o SQL novo vai para revisão antes de qualquer aplicação.

**Convite.** Rascunho, aceito, expirado ou cancelado. Vale para pessoa avulsa ou para gerente de uma empresa.

**Pedido.** Pendente, aprovado ou recusado.

**Conta.** Ativa, suspensa ou revogada. Pessoa avulsa é uma conta sem empresa. Empresa é a casa do gerente. Os membros da empresa ficam para a etapa do gerente.

**Degustação.** Ativa, com dia de início e dia de fim. O prazo padrão é 20 dias. Quando o fim passa, ela fica encerrada.

**Licença.** Ativa, com início e validade. Pode ficar suspensa, revogada ou vencida. Licença de avulso gruda na pessoa. Licença de empresa gruda na empresa. Não há cobrança nem cartão agora. O preço fica para quando as empresas forem pagar.

Um aparelho ativo por conta continua sendo regra do servidor, só depois que a pessoa confirmar a troca. O celular offline não apaga o que já tem.

## 4. O que o app faz, sem perder o local

| Situação | Lançar carro novo | Ver, editar o que já existe e exportar backup |
|---|---|---|
| Sem conta, dentro dos 20 dias locais | Sim | Sim |
| Sem conta e sem data de teste (quem já usava) | Sim | Sim |
| Degustação ou licença ativa no servidor | Sim | Sim |
| Degustação encerrada, licença vencida, conta suspensa ou revogada | Não. Aviso para falar com Ricardo | Sim. Nada é apagado |

O teste de 20 dias de hoje mora no próprio aparelho, na data em que a pessoa passou da tela de boas-vindas. Quem não tem essa data não tem prazo. O nome do Ricardo no código só tira o aviso local. Isso não é a trava de verdade.

Quando a pessoa tiver conta e o servidor disser que a licença está ativa, o celular para de contar os 20 dias e não apaga os lançamentos. Se o servidor disser que venceu, o celular só trava carro novo, como já faz hoje no fim do teste. Exportar backup segue liberado. A cópia anterior no aparelho também fica.

Quem já tem lançamentos e nunca teve data de teste continua sem prazo até Ricardo olhar conta a conta. Ninguém é empurrado para uma degustação automática.

## 5. Etapas para testar

1. Ricardo lê este plano e responde as decisões. Nada muda no site nem no banco.
2. Se o desenho das tabelas precisar de ajuste, o arquivo SQL entra no branch só para revisão. Ninguém aplica daqui.
3. A página do painel sobe só no site isolado de teste. Ricardo entra com o Google dele. Uma conta que não é dele vê a frase de recusa. Ele aprova um pedido fictício, marca 20 dias, suspende e revoga. Confere que a tela não mostra carro, OS nem valor.
4. No app de teste, uma licença vencida trava só o carro novo. O backup exporta. Os lançamentos de teste continuam na chave de teste, não na chave do app publicado.
5. Só depois disso a página `admin.html` vai para o GitHub Pages. O app publicado passa a perguntar a licença de quem estiver logado. Quem não entrar continua no regra local de hoje. Quem já usa sem data de teste não ganha prazo sozinho.

## 6. Decisões para o Ricardo

1. Login passa a ser obrigatório no futuro? Sugestão: não. O uso local segue sem conta, até nova decisão.
2. Com licença vencida, suspensa ou revogada, a pessoa ainda edita o carro que já lançou? Sugestão: sim. Só trava carro novo. Exportar backup continua.
3. Quem já usa o app e não tem data de teste entra numa degustação? Sugestão: não. Continua sem prazo até Ricardo decidir aquela conta.
4. O convite manda e-mail agora? Sugestão: não. Fica rascunho, e a pessoa pede acesso depois de entrar com o Google. E-mail fica para quando houver envio próprio.
5. O painel nasce no site isolado e só depois no GitHub Pages? Sugestão: sim. A página publicada do dia a dia não muda na primeira leva.
