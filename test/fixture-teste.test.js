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

test('sessão ausente, expirada ou fictícia não envia', () => {
  const agora = Date.parse('2026-11-07T12:00:00Z');
  const ausente = fx.tentarEnvioRemoto(null, agora);
  assert.equal(ausente.enviou, false);
  assert.equal(ausente.motivo, 'sessao_ausente');
  const expirada = fx.tentarEnvioRemoto({ user: { id: 'fixture' }, expires_at: Math.floor(agora / 1000) - 10 }, agora);
  assert.equal(expirada.enviou, false);
  assert.equal(expirada.motivo, 'sessao_ausente');
  const viva = fx.tentarEnvioRemoto({ user: { id: 'fixture' }, expires_at: Math.floor(agora / 1000) + 600 }, agora);
  assert.equal(viva.ok, false);
  assert.equal(viva.enviou, false);
  assert.equal(viva.motivo, 'envio_bloqueado');
  assert.equal(fs.readFileSync(path.join(__dirname, '..', 'fixture-teste.js'), 'utf8').includes('fetch('), false);
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
