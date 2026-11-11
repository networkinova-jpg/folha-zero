const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const Pol = require('../supabase/politica-modelo.js');
const Acesso = require('../acesso.js');

function memoria() {
  const map = new Map();
  return {
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(k, String(v)); },
    removeItem(k) { map.delete(k); }
  };
}

function sessaoDono(uid) {
  return { papel: 'proprietario', verificadoNoServidor: true, origem: 'servidor', uid };
}

test('bootstrap não usa nome nem e-mail e o cliente não recebe a função', () => {
  const meta = Acesso.lerMeta(memoria());
  const porNome = Acesso.bootstrapProprietario(meta, {
    via: 'sql_do_titular', explicito: true, uid: 'uid-1', nome: 'Ricardo Ribeiro', email: 'ricardo@example.invalid', porNomeOuEmail: true
  });
  assert.equal(porNome.motivo, 'nao_usar_nome_ou_email');
  assert.equal(meta.proprietarios.length, 0);
  const ok = Acesso.bootstrapProprietario(meta, { via: 'sql_do_titular', explicito: true, uid: 'uid-prop-teste' });
  assert.equal(ok.ok, true);
  assert.equal(Acesso.bootstrapProprietario(meta, { via: 'sql_do_titular', explicito: true, uid: 'uid-2' }).motivo, 'ja_existe_proprietario');
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20261107210000_base_segura.sql'), 'utf8');
  assert.equal(sql.includes('function public.folha_bootstrap_proprietario'), false);
  assert.match(sql, /revoke all on all tables in schema public from public, anon, authenticated/);
  assert.equal(sql.includes('service_role'), false);
  assert.equal(fs.readFileSync(path.join(__dirname, '..', 'acesso.js'), 'utf8').includes('fetch('), false);
});

test('proprietário não lê carro nem valor e não se promove pelo cliente', () => {
  const estado = {
    proprietarios: [{ userId: 'uid-prop', ativo: true, bootstrap: 'servidor' }],
    membros: [{ orgId: 'alfa', userId: 'carla', papel: 'gerente', status: 'ativo' }],
    compartilhamentos: [{ lancamentoId: 'c1', orgId: 'alfa', encerradoEm: null, retido: true }]
  };
  const linha = { id: 'c1', ownerId: 'ana', setor: 'Setor Exemplo A' };
  const valor = { ownerId: 'ana', valor: 50 };
  assert.equal(Pol.podeLerLancamento(estado, { uid: 'uid-prop' }, linha), false);
  assert.equal(Pol.podeLerValor(estado, { uid: 'uid-prop' }, valor), false);
  assert.equal(Acesso.podeVerDadoPrivado(sessaoDono('uid-prop')), false);
  const meta = Acesso.lerMeta(memoria());
  Acesso.bootstrapProprietario(meta, { via: 'cliente', explicito: true, uid: 'uid-intruso' });
  assert.equal(meta.proprietarios.length, 0);
});

test('aprovação, licença sem cobrança, convite parado e gerente só na própria empresa', () => {
  const s = memoria();
  const bruto = JSON.stringify({ version: 2, entries: [{ id: 'legado', os: 'OS-TESTE-LOCAL', valor: 10 }], quinzenas: {}, descontos: {}, settings: {} });
  s.setItem(Acesso.KEY, bruto);
  const meta = Acesso.lerMeta(s);
  Acesso.bootstrapProprietario(meta, { via: 'sql_do_titular', explicito: true, uid: 'uid-prop-teste' });
  meta.solicitacoes.push({ id: 'sol-1', nome: 'Pessoa Exemplo', email: 'pessoa.exemplo@example.invalid', papelPedido: 'gerente', status: 'pendente', orgNome: 'INOVA Blindagem' });
  Acesso.gravarMeta(s, meta);
  const dono = sessaoDono('uid-prop-teste');
  const gerente = { papel: 'gerente', verificadoNoServidor: true, origem: 'servidor', uid: 'carla', orgId: 'alfa' };
  assert.equal(Acesso.decidirSolicitacao(Acesso.lerMeta(s), gerente, 'sol-1', 'aprovar').motivo, 'somente_proprietario');
  const aprovou = Acesso.decidirSolicitacao(Acesso.lerMeta(s), dono, 'sol-1', 'aprovar');
  assert.equal(aprovou.ok, true);
  Acesso.gravarMeta(s, Acesso.lerMeta(s));
  const meta2 = Acesso.lerMeta(s);
  meta2.solicitacoes[0].status = 'pendente';
  const deNovo = Acesso.decidirSolicitacao(meta2, dono, 'sol-1', 'aprovar');
  assert.equal(deNovo.ok, true);
  Acesso.gravarMeta(s, meta2);
  assert.equal(s.getItem(Acesso.KEY), bruto);
  const lic = Acesso.registrarLicenca(meta2, dono, { userId: 'ana', tipo: 'degustacao', status: 'ativa', valor: 10 });
  assert.equal(lic.motivo, 'sem_cobranca');
  assert.equal(Acesso.registrarLicenca(meta2, dono, { userId: 'ana', tipo: 'licenca_manual', status: 'ativa' }).cobrou, false);
  assert.equal(Acesso.rascunhoConvite(meta2, dono, { orgId: 'alfa', email: 'pessoa.exemplo@example.invalid', enviar: true }).enviouEmail, false);
  assert.equal(Acesso.concederGestao(meta2, dono, 'alfa', true).ok, true);
  assert.equal(Acesso.gerenteGerirMembro(meta2, gerente, { orgId: 'alfa', papel: 'equipe' }).ok, true);
  assert.equal(Acesso.gerenteGerirMembro(meta2, gerente, { orgId: 'beta', papel: 'equipe' }).motivo, 'outra_empresa');
  assert.equal(Acesso.gerenteGerirMembro(meta2, gerente, { orgId: 'alfa', papel: 'proprietario' }).motivo, 'escalada');
  assert.equal(s.getItem(Acesso.KEY), bruto);
  assert.equal(Acesso.tentarLogin({}, 'email').enviou, false);
  assert.equal(Acesso.tentarLogin({ FOLHA_ZERO_NUVEM: { url: 'https://projeto.invalid', publishableKey: 'pk_test_publica' } }, 'google').motivo, 'aguardando_projeto_autorizado');
  assert.equal(Acesso.lerConfigPublica({ FOLHA_ZERO_NUVEM: { url: 'https://projeto.invalid', publishableKey: 'pk', service_role: 'segredo' } }).motivo, 'segredo_proibido');
});

test('tela de acesso fica desligada e não guarda senha nem apaga legado', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'http://127.0.0.1:8765/index.html', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  const chamadas = [];
  w.fetch = async (url) => { chamadas.push(String(url)); throw new Error('rede bloqueada'); };
  const bruto = JSON.stringify({
    version: 2, entries: [{ id: 'legado', os: 'OS-TESTE-LOCAL', empresa: 'Cliente Norte Teste', setor: 'Tapeçaria', veiculo: 'Carro Exemplo', dataInicio: '2026-11-01', dataTermino: null, situacao: 'Em processo', valor: 10, pausas: [] }], quinzenas: {}, descontos: {},
    settings: { operador: 'Pessoa Exemplo', setorOperador: 'Tapeçaria', valorPadrao: {}, aliquota: {} }
  });
  w.localStorage.setItem('folhazero_v1', bruto);
  let src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').replace(/const CONTADOR_URL = '[^']*';/, "const CONTADOR_URL = '';");
  w.eval(fs.readFileSync(path.join(__dirname, '..', 'persistencia.js'), 'utf8'));
  w.eval(fs.readFileSync(path.join(__dirname, '..', 'acesso.js'), 'utf8'));
  w.eval(src);
  w.document.querySelector('[data-view="ajustes"]').click();
  const card = w.document.getElementById('acesso-card').textContent;
  const aviso = w.document.getElementById('acesso-aviso').textContent;
  assert.match(aviso, /cartão Backup, mais abaixo/);
  assert.equal(card.includes('O login está desligado'), false);
  assert.equal(card.includes('banco segue vazio'), false);
  assert.equal(w.document.getElementById('acesso-form'), null);
  assert.equal(w.document.getElementById('acesso-senha'), null);
  assert.equal(card.includes('Entrar com Google'), false);
  assert.equal(card.includes('acesso-teste'), false);
  assert.equal(card.includes('OS-TESTE-LOCAL'), false);
  assert.equal(w.localStorage.getItem('folhazero_v1'), bruto);
  assert.deepEqual(chamadas, []);
});
