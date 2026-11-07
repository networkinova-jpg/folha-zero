const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const fx = require('../fixture-teste.js');

function memoria() {
  const dados = new Map();
  const lidas = [];
  return {
    lidas,
    getItem(chave) { lidas.push(chave); return dados.has(chave) ? dados.get(chave) : null; },
    setItem(chave, valor) {
      if (chave === fx.PROIBIDA) throw new Error('escreveu no aplicativo');
      dados.set(chave, String(valor));
    }
  };
}

test('o conjunto fictício preserva ids, datas, pausas, zero, ausência e acentos', () => {
  const doc = fx.gerarConjunto();
  const v = fx.validarDocumento(doc);
  assert.equal(v.ok, true);
  assert.deepEqual(doc.entries.map((e) => e.id), ['fx-aco-01', 'fx-vidro-02']);
  assert.equal(doc.entries[0].dataInicio, '2026-11-02');
  assert.equal(doc.entries[0].pausas[0].motivo, 'Fim de expediente');
  assert.equal(doc.entries[0].pausas[1].motivo, 'Aço da maçaneta');
  assert.equal(doc.entries[0].valor, 0);
  assert.equal(doc.entries[1].valor, null);
  assert.equal(doc.entries[0].veiculo.includes('í'), true);
  assert.equal(doc.settings.operador, 'Pessoa Exemplo');
  assert.equal(doc.marca, 'fixture-teste');
  assert.equal(fx.canon(doc), fx.canon(fx.gerarConjunto()));
});

test('grava só na chave de teste e recusa o aplicativo', () => {
  const storage = memoria();
  const gravado = fx.gerarEGravar(storage);
  assert.equal(gravado.ok, true);
  assert.equal(gravado.chave, fx.CHAVE);
  assert.equal(storage.lidas.includes(fx.PROIBIDA), false);
  const recusa = fx.gravarFixture(storage, fx.PROIBIDA, fx.gerarConjunto());
  assert.equal(recusa.ok, false);
  assert.equal(recusa.motivo, 'chave_proibida');
  assert.equal(storage.getItem(fx.PROIBIDA), null);
});

test('outro contexto de teste confere a integridade sem nuvem', () => {
  const a = memoria();
  const b = memoria();
  fx.gerarEGravar(a);
  const r = fx.simularOutroNavegador(a, b);
  assert.equal(r.ok, true);
  assert.equal(r.valorZero, true);
  assert.equal(r.valorAusente, true);
  assert.equal(r.acentos, true);
  assert.equal(r.pausas, 2);
  assert.equal(b.getItem(fx.CHAVE_B).includes('fx-aco-01'), true);
  assert.equal(b.getItem(fx.CHAVE), null);
});

function clienteFalso(resultado) {
  const ops = [];
  function chain(nome) {
    const api = {
      insert(row) { ops.push({ op: 'insert', nome, row }); return Promise.resolve(resultado.insert || { error: null }); },
      select(cols) { ops.push({ op: 'select', nome, cols }); return api; },
      order() { return api; },
      limit() { return Promise.resolve(resultado.select || { data: [], error: null }); },
      delete() { ops.push({ op: 'delete', nome }); return Promise.resolve({ error: null }); }
    };
    return api;
  }
  return { ops, from(nome) { ops.push({ op: 'from', nome }); return chain(nome); } };
}

function sessaoFixture(agora) {
  return { user: { id: '11111111-1111-4111-8111-111111111111' }, expires_at: Math.floor(agora / 1000) + 600 };
}

test('sessão ausente, expirada ou origem errada não envia', () => {
  const agora = Date.parse('2026-11-07T12:00:00Z');
  const pagina = new URL(fx.PAGINA_NUVEM);
  assert.equal(fx.planejarEnvio({ location: pagina, sessao: null, agoraMs: agora }).motivo, 'sessao_ausente');
  const expirada = fx.planejarEnvio({
    location: pagina,
    sessao: { user: { id: '11111111-1111-4111-8111-111111111111' }, expires_at: Math.floor(agora / 1000) - 10 },
    agoraMs: agora
  });
  assert.equal(expirada.motivo, 'sessao_ausente');
  const pages = fx.planejarEnvio({
    location: new URL('https://networkinova-jpg.github.io/folha-zero/acesso-teste'),
    sessao: sessaoFixture(agora),
    agoraMs: agora
  });
  assert.equal(pages.motivo, 'origem_producao');
  const local = fx.planejarEnvio({
    location: new URL('http://127.0.0.1:8765/acesso-teste.html'),
    sessao: sessaoFixture(agora),
    agoraMs: agora
  });
  assert.equal(local.motivo, 'origem_nao_autorizada');
  assert.equal(fs.readFileSync(path.join(__dirname, '..', 'fixture-teste.js'), 'utf8').includes('fetch('), false);
  assert.equal(fs.readFileSync(path.join(__dirname, '..', 'acesso-teste.js'), 'utf8').includes("from('snapshots_privados')"), false);
});

test('o envio deliberado grava só a fixture canônica e o conflito não apaga', async () => {
  const agora = Date.parse('2026-11-07T12:00:00Z');
  const plano = fx.planejarEnvio({ location: new URL(fx.PAGINA_NUVEM), sessao: sessaoFixture(agora), agoraMs: agora, documento: fx.gerarConjunto() });
  assert.equal(plano.ok, true);
  assert.equal(plano.pedido.sha256, fx.SHA256_CANON);
  assert.equal(fx.canon(plano.pedido.documento), fx.canon(fx.gerarConjunto()));
  const cliente = clienteFalso({ insert: { error: null } });
  const enviado = await fx.enviarComCliente(cliente, plano.pedido);
  assert.equal(enviado.enviou, true);
  assert.equal(cliente.ops.some((op) => op.nome === 'snapshots_privados'), false);
  assert.equal(cliente.ops.some((op) => op.op === 'delete'), false);
  assert.equal(cliente.ops.find((op) => op.op === 'insert').nome, fx.SUPERFICIE);
  const outro = fx.gerarConjunto();
  outro.entries[0].valor = 10;
  const recusado = await fx.enviarComCliente(cliente, Object.assign({}, plano.pedido, { documento: outro }));
  assert.equal(recusado.motivo, 'nao_canonico');
  const conflito = clienteFalso({ insert: { error: { code: '23505' } } });
  const repetido = await fx.enviarComCliente(conflito, plano.pedido);
  assert.equal(repetido.jaExistia, true);
  assert.equal(repetido.enviou, false);
  assert.equal(conflito.ops.some((op) => op.op === 'delete'), false);
});

test('a recuperação grava só a chave de teste quando a cópia remota é canônica', async () => {
  const storage = memoria();
  const doc = fx.gerarConjunto();
  const cliente = clienteFalso({ select: { data: [{ sha256: fx.SHA256_CANON, documento: doc, bytes: 1215 }], error: null } });
  const r = await fx.restaurarComCliente(cliente, storage);
  assert.equal(r.ok, true);
  assert.equal(r.escreveu, true);
  assert.equal(storage.getItem(fx.CHAVE).includes('fx-aco-01'), true);
  assert.equal(storage.lidas.includes(fx.PROIBIDA), false);
  const adulterado = fx.gerarConjunto();
  adulterado.entries[0].empresa = 'Concept Blindados';
  const vazio = memoria();
  const ruim = await fx.restaurarComCliente(clienteFalso({ select: { data: [{ sha256: fx.SHA256_CANON, documento: adulterado }], error: null } }), vazio);
  assert.equal(ruim.escreveu, false);
  assert.equal(vazio.getItem(fx.CHAVE), null);
  const lista = await fx.listarComCliente(clienteFalso({ select: { data: [{ sha256: fx.SHA256_CANON, bytes: 1215 }], error: null } }));
  assert.equal(lista.itens.length, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(lista.itens[0], 'documento'), false);
});

test('carga inválida e carga grande são recusadas antes de gravar', () => {
  const storage = memoria();
  const semMarca = fx.gerarConjunto();
  delete semMarca.marca;
  assert.equal(fx.gravarFixture(storage, fx.CHAVE, semMarca).motivo, 'carga_invalida');
  const texto = fx.gerarConjunto();
  texto.entries[0].valor = 'dez';
  assert.equal(fx.validarDocumento(texto).motivo, 'carga_invalida');
  const grande = fx.gerarConjunto();
  grande.entries[0].obs = 'x'.repeat(fx.LIMITE_BYTES);
  assert.equal(fx.validarDocumento(grande).motivo, 'carga_grande');
  assert.equal(storage.getItem(fx.CHAVE), null);
});

test('o SQL corrigido fecha a fixture e não toca a tabela real', () => {
  const crypto = require('crypto');
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase/migrations/20261107234500_snapshot_fixture.sql'), 'utf8');
  const doc = JSON.parse(sql.match(/\$fx\$([\s\S]*?)\$fx\$/)[1]);
  const sha = crypto.createHash('sha256').update(fx.canon(fx.gerarConjunto()), 'utf8').digest('hex');
  assert.equal(fx.canon(doc), fx.canon(fx.gerarConjunto()));
  assert.equal(sha, fx.SHA256_CANON);
  assert.equal(sql.includes(sha), true);
  assert.equal(sql.includes('create trigger snapshots_validar_fixture'), false);
  assert.equal(sql.includes('before insert or update on public.snapshots_privados'), false);
  assert.equal(sql.includes('before insert or update on public.copias_fixture_teste'), true);
  assert.equal(sql.includes('count(*)'), false);
  assert.equal(fx.SUPERFICIE, 'copias_fixture_teste');
  assert.equal(fs.readFileSync(path.join(__dirname, '..', 'acesso-teste.js'), 'utf8').includes("from('snapshots_privados')"), false);
});

test('a tela declara modo teste e não oferece restaurar o aplicativo', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'acesso-teste.html'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '..', 'acesso-teste.js'), 'utf8');
  assert.equal(html.includes('Modo teste'), true);
  assert.equal(html.includes('Nada aqui restaura o aplicativo'), true);
  assert.equal(html.includes('index.html'), false);
  assert.equal(html.includes('btn-enviar" disabled'), true);
  assert.equal(html.includes('btn-confirmar'), false);
  assert.equal(js.includes('folhazero_v1'), false);
  assert.equal(js.includes('enviarCopiaAutorizada'), false);
});
