const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
require('../gestao-producao-logica.js');
const tela = require('../gestao-tela.js');

const html = fs.readFileSync(path.join(__dirname, '..', 'gestao.html'), 'utf8');
const pagina = fs.readFileSync(path.join(__dirname, '..', 'gestao-producao.js'), 'utf8');

test('sem sessão fica na entrada e a sessão expirada oferece sair', () => {
  const entrada = tela.vista({ sessao: false });
  assert.equal(entrada.entrada, true);
  assert.equal(entrada.gerente, false);
  assert.equal(entrada.prestador, false);
  const expirada = tela.vista({ sessao: true, situacao: 'sessao_expirada' });
  assert.equal(expirada.expirada, true);
  assert.equal(expirada.painel, false);
  assert.deepEqual(expirada.botoes, ['sair']);
  assert.equal(tela.FRASE_EXPIRADA, 'Sua sessão expirou. Entre de novo com sua conta Google.');
});

test('função ausente oferece demonstração e a demonstração é a visão do gerente', () => {
  assert.equal(tela.classificarFalha({ code: 'PGRST202', message: 'Could not find the function public.gestao_minha_posicao in the schema cache' }), 'sql_ausente');
  assert.equal(tela.classificarFalha({ status: 401, message: 'JWT expired' }), 'sessao_expirada');
  assert.equal(tela.classificarFalha(new TypeError('Failed to fetch')), 'erro_temporario');
  const ausente = tela.vista({ sessao: true, sqlAusente: true });
  assert.equal(ausente.sqlAusente, true);
  assert.equal(ausente.gerente, false);
  assert.deepEqual(ausente.botoes, ['demo', 'sair']);
  const demo = tela.vista({ demonstracao: true, sqlAusente: true });
  assert.equal(demo.gerente, true);
  assert.equal(demo.demonstracao, true);
  assert.equal(demo.sqlAusente, false);
  assert.equal(tela.FRASE_SQL.includes('ainda não foi aplicado'), true);
  assert.equal(tela.ROTULO_EXEMPLO, 'Exemplo local. Sem mexer no banco.');
  assert.equal(tela.ROTULO_EXEMPLO.includes('\u2014'), false);
});

test('a demonstração mostra setores, pausas e não leva valor', () => {
  const exemplo = tela.exemploLocal();
  const painel = tela.montarPainel(exemplo, {});
  assert.equal(painel.ativos, 1);
  assert.equal(painel.pausados, 1);
  assert.equal(painel.concluidos, 4);
  assert.equal(painel.porSetor.length, 11);
  assert.deepEqual(painel.porSetor.slice(0, 10).map((item) => item.setor), require('../gestao-producao-logica.js').SETORES);
  assert.equal(painel.porSetor[10].setor, 'Outros');
  assert.equal(painel.pausas[painel.pausas.length - 1].motivo, 'Fim de expediente');
  assert.equal(painel.pausas[painel.pausas.length - 1].fimExp, true);
  const almoco = painel.pausas.find((item) => item.motivo === 'Almoço/café');
  assert.equal(almoco.fimExp, true);
  assert.equal(painel.os.length, 2);
  const os100 = painel.os.find((item) => item.os === 'OS-100');
  assert.deepEqual(os100.etapas.map((item) => item.setor), ['Desmontagem', 'Manta', 'Vidro', 'Tapeçaria']);
  assert.equal(os100.etapas[0].atrasado, false);
  assert.equal(os100.etapas[3].dataTermino, '');
  assert.equal(painel.equipesResumo.map((item) => item.nome).join(','), 'Montagem,Vidro,Tapeçaria');
  assert.equal(painel.dentro >= 1, true);
  assert.equal(painel.mediaGeral.includes('h') || painel.mediaGeral.includes('min'), true);
  const montagem = painel.equipesResumo.find((item) => item.nome === 'Montagem');
  assert.equal(montagem.prestadores.some((pessoa) => pessoa.email === 'ana@example.invalid' && pessoa.etapas.length >= 2), true);
  assert.equal(JSON.stringify(painel).includes('999'), false);
  assert.equal(JSON.stringify(painel).includes('nao mostrar'), false);
  const soCarla = tela.montarPainel(exemplo, { equipe: 'equipe-tapecaria', prestador: 'carla@example.invalid' });
  assert.equal(soCarla.ativos, 1);
  assert.equal(soCarla.concluidos, 0);
  const prestador = tela.vista({ sessao: true, papel: 'prestador' });
  assert.equal(prestador.prestador, true);
  assert.equal(prestador.gerente, false);
  assert.match(tela.textoConsentimento('Oficina Exemplo'), /OS, veículo, setor/);
  assert.match(tela.textoConsentimento('Oficina Exemplo'), /ficam só no celular/);
  assert.match(tela.FRASE_REVOGAR, /Nada é apagado do celular/);
});

test('a página da gestão fica fora do app publicado e não desenha valor', () => {
  ['Entrada', 'Início', 'Por setor', 'Pausas e gargalos', 'SLA', 'Equipes e convites', 'Consentimento', 'Celular ativo', 'Revogar consentimento'].forEach((titulo) => {
    assert.equal(html.includes(titulo), true, titulo);
  });
  assert.equal(html.includes(tela.ROTULO_EXEMPLO), true);
  assert.equal(html.includes(tela.FRASE_EXPIRADA), true);
  assert.equal(html.includes('Ver demonstração com dados de exemplo'), true);
  assert.equal(html.includes('Nenhum e-mail é enviado'), true);
  assert.equal(html.includes('folhazero_v1'), false);
  assert.equal(html.includes('innerHTML'), false);
  assert.equal(pagina.includes('gestao_minha_posicao'), true);
  assert.equal(pagina.includes('gestao_sla_definir'), true);
  assert.equal(pagina.includes('classificarFalha'), true);
  assert.equal(pagina.includes('textContent'), true);
  assert.equal(pagina.includes('innerHTML'), false);
  assert.equal(pagina.includes('folhazero_v1'), false);
  assert.equal(pagina.includes("scope: 'local'"), true);
  const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  assert.equal(index.includes('gestao.html'), false);
  assert.equal(sw.includes('gestao.html'), false);
  assert.equal(html.includes('\u2014'), false);
  assert.equal(pagina.includes('\u2014'), false);
});
