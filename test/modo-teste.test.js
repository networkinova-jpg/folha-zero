const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const modo = require('../modo-teste.js');
const fx = require('../fixture-teste.js');

function memoria() {
  const dados = new Map();
  const chaves = [];
  return {
    chaves,
    getItem(chave) { chaves.push(['get', chave]); return dados.has(chave) ? dados.get(chave) : null; },
    setItem(chave, valor) {
      chaves.push(['set', chave]);
      if (chave === modo.PROIBIDA) throw new Error('gravou no aplicativo');
      dados.set(chave, String(valor));
    },
    removeItem(chave) { chaves.push(['del', chave]); dados.delete(chave); }
  };
}

test('a semente e a recolocação não tocam o aplicativo publicado', () => {
  const storage = memoria();
  const s = modo.semearSeVazio(storage);
  assert.equal(s.semeou, true);
  assert.equal(modo.semearSeVazio(storage).semeou, false);
  const doc = JSON.parse(storage.getItem(modo.CHAVE_APP));
  assert.equal(doc.entries[0].valor, 0);
  assert.equal(doc.entries[1].valor, null);
  assert.equal(doc.entries[0].pausas[0].motivo, 'Fim de expediente');
  assert.equal(doc.entries[1].situacao, 'Em processo');
  assert.equal(doc.quinzenas['INOVA Blindagem|2026|11|1'], 'Aberta');
  assert.equal(storage.chaves.some((c) => c[1] === modo.PROIBIDA), false);
  const fxDoc = fx.gerarConjunto();
  assert.equal(doc.entries[0].id, fxDoc.entries[0].id);
  assert.equal(doc.entries[1].id, fxDoc.entries[1].id);
});

test('prévia sem confirmação não grava e a confirmação guarda a cópia anterior', () => {
  const storage = memoria();
  modo.semearSeVazio(storage);
  const editado = modo.documentoFixture();
  editado.entries[1].obs = 'editado no teste';
  storage.setItem(modo.CHAVE_APP, JSON.stringify(editado));
  const novo = modo.documentoFixture();
  const previa = modo.aplicarDocumento(storage, novo, false);
  assert.equal(previa.escreveu, false);
  assert.equal(previa.motivo, 'sem_confirmacao');
  assert.equal(previa.previa.colisoes.includes('fx-vidro-02'), true);
  assert.equal(JSON.parse(storage.getItem(modo.CHAVE_APP)).entries[1].obs, 'editado no teste');
  const aplicado = modo.aplicarDocumento(storage, novo, true);
  assert.equal(aplicado.ok, true);
  assert.equal(JSON.parse(storage.getItem(modo.CHAVE_COPIA)).entries[1].obs, 'editado no teste');
  assert.equal(JSON.parse(storage.getItem(modo.CHAVE_APP)).entries[1].obs, '');
});

test('falha de gravação devolve o documento anterior', () => {
  const storage = memoria();
  modo.semearSeVazio(storage);
  const original = storage.getItem(modo.CHAVE_APP);
  let gravacoes = 0;
  const instavel = {
    getItem(chave) { return storage.getItem(chave); },
    setItem(chave, valor) {
      if (chave === modo.CHAVE_APP && ++gravacoes === 1) throw new Error('quota');
      storage.setItem(chave, valor);
    },
    removeItem(chave) { storage.removeItem(chave); }
  };
  const r = modo.aplicarDocumento(instavel, modo.documentoFixture(), true);
  assert.equal(r.motivo, 'rollback');
  assert.equal(storage.getItem(modo.CHAVE_APP), original);
});

test('logout, troca de conta e falha remota não apagam o teste', () => {
  const storage = memoria();
  modo.semearSeVazio(storage);
  const antes = storage.getItem(modo.CHAVE_APP);
  assert.equal(modo.sair(storage).apagou, false);
  const troca = modo.trocarConta(storage, 'conta-a');
  assert.equal(troca.enviou, false);
  const segunda = modo.trocarConta(storage, 'conta-b');
  assert.equal(segunda.trocou, true);
  assert.equal(segunda.enviou, false);
  assert.equal(modo.aposFalha(storage, antes).perdeu, false);
  assert.equal(storage.getItem(modo.CHAVE_APP), antes);
});

test('versão errada não grava e o app publicado não liga o modo teste', () => {
  const storage = memoria();
  modo.semearSeVazio(storage);
  const ruim = modo.documentoFixture();
  ruim.version = 3;
  const r = modo.aplicarDocumento(storage, ruim, true);
  assert.equal(r.motivo, 'versao');
  assert.equal(r.escreveu, false);
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(app, /const KEY = MODO_TESTE \? 'folhazero_teste_app' : 'folhazero_v1'/);
  assert.match(app, /const CONTADOR_URL = 'https:\/\/script\.google\.com\/macros\/s\/AKfycbx21D_/);
  assert.match(app, /if \(!MODO_TESTE && 'serviceWorker'/);
  assert.equal(index.includes('FOLHA_ZERO_MODO_TESTE'), false);
  assert.equal(fx.paginaPermitida(new URL(fx.PAGINA_APP)).ok, true);
  assert.equal(fx.paginaPermitida(new URL('https://networkinova-jpg.github.io/folha-zero/app-teste')).motivo, 'origem_producao');
});
