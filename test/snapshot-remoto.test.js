const test = require('node:test');
const assert = require('node:assert/strict');
require('../persistencia.js');
const S = require('../snapshot-remoto.js');

function memoria() {
  const map = new Map();
  return {
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(k, String(v)); },
    removeItem(k) { map.delete(k); }
  };
}

function doc(entries) {
  return JSON.stringify({ version: 2, entries, quinzenas: {}, descontos: {}, settings: { operador: 'Pessoa Exemplo' } });
}

test('chave publishable é aceita e service_role nunca', () => {
  assert.equal(S.chavePublicaAceita('sb_publishable_exemplo'), true);
  assert.equal(S.chavePublicaAceita('sb_secret_exemplo'), false);
  assert.equal(S.chavePublicaAceita('eyJhbGci.service_role.x'), false);
  assert.equal(S.chavePublicaAceita(''), false);
});

test('sem autorização não envia e conta vazia não restaura por cima', async () => {
  const storage = memoria();
  storage.setItem('folhazero_v1', doc([{ id: 'fixture-1', os: 'OS-FIXTURE' }]));
  let gravou = 0;
  const remoto = {
    gravar: async () => { gravou += 1; return { ok: true }; },
    ler: async () => ({ ok: true, sha256: 'x', lancamentos: 1, bytes: 1, documento: { entries: [] } }),
    listar: async () => ({ ok: true, itens: [] })
  };
  const sem = await S.enviarCopiaAutorizada(storage, false, remoto);
  assert.equal(sem.enviou, false);
  assert.equal(gravou, 0);
  const vazio = await S.prepararRestauracao(storage, 'x', remoto);
  assert.equal(vazio.motivo, 'conta_vazia');
  assert.equal(vazio.escreveu, false);
  assert.equal(storage.getItem('folhazero_v1').includes('OS-FIXTURE'), true);
});

test('conclui só depois do ack e a prévia não escreve', async () => {
  const storage = memoria();
  const original = doc([{ id: 'fixture-1', os: 'OS-FIXTURE' }]);
  storage.setItem('folhazero_v1', original);
  const guardado = {};
  const remoto = {
    gravar: async (item) => { guardado.item = item; return { ok: true }; },
    ler: async (sha) => ({
      ok: true, sha256: sha, bytes: guardado.item.bytes, lancamentos: 1, documento: guardado.item.documento
    }),
    listar: async () => ({ ok: true, itens: [{ sha256: guardado.item.sha256 }] })
  };
  const envio = await S.enviarCopiaAutorizada(storage, true, remoto);
  assert.equal(envio.verificado, true);
  assert.equal(storage.getItem('folhazero_v1'), original);
  const previa = await S.restaurarConfirmada(storage, envio.sha256, false, remoto);
  assert.equal(previa.motivo, 'sem_confirmacao');
  assert.equal(previa.escreveu, false);
  assert.equal(storage.getItem('folhazero_v1'), original);
  storage.setItem('folhazero_v1', doc([{ id: 'outro', os: 'OS-OUTRO' }]));
  const feito = await S.restaurarConfirmada(storage, envio.sha256, true, remoto);
  assert.equal(feito.ok, true);
  assert.equal(JSON.parse(storage.getItem('folhazero_v1')).entries[0].os, 'OS-FIXTURE');
});

test('ack divergente não marca concluído', async () => {
  const storage = memoria();
  storage.setItem('folhazero_v1', doc([{ id: 'fixture-1', os: 'OS-FIXTURE' }]));
  const remoto = {
    gravar: async () => ({ ok: true }),
    ler: async () => ({ ok: true, sha256: 'outro', lancamentos: 1, bytes: 1, documento: { entries: [] } }),
    listar: async () => ({ ok: true, itens: [] })
  };
  const r = await S.enviarCopiaAutorizada(storage, true, remoto);
  assert.equal(r.verificado, false);
  assert.equal(r.motivo, 'ack_divergente');
});
