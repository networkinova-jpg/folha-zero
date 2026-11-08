const test = require('node:test');
const assert = require('node:assert/strict');
const backup = require('../backup-teste.js');
const modo = require('../modo-teste.js');

function clienteFalso() {
  const ops = [];
  return {
    ops,
    rpc(nome, args) { ops.push({ op: 'rpc', nome, args }); return Promise.resolve({ error: null }); },
    from(nome) { ops.push({ op: 'from', nome }); throw new Error('escrita direta'); }
  };
}

test('o envio variável fica fechado e não chama a nuvem', async () => {
  const doc = modo.documentoFixture();
  doc.entries.push(Object.assign({}, doc.entries[1], { id: 'carro-novo-1', obs: 'Observação editada com aço', valor: null }));
  assert.equal(backup.validar(doc).ok, true);
  const antigo = modo.documentoFixture();
  antigo.quinzenas = { 'INOVA Blindagem|2026|11|1': 'Aberta' };
  assert.equal(backup.normalizar(antigo).quinzenas['INOVA Blindagem|2026-11|1'], 'Aberta');
  const extra = modo.documentoFixture();
  extra.marca = 'fixture-teste';
  assert.equal(backup.validar(extra).motivo, 'carga_invalida');
  extra.entries[1].id = extra.entries[0].id;
  delete extra.marca;
  assert.equal(backup.validar(extra).motivo, 'id_duplicado');
  const cliente = clienteFalso();
  const bloqueado = await backup.enviar(cliente, { owner_id: 'conta', documento: doc });
  assert.equal(bloqueado.motivo, 'aguardando_migracao');
  assert.equal(bloqueado.enviou, false);
  assert.equal(cliente.ops.length, 0);
});

test('com a trava aberta só no teste, grava na tabela nova e o conflito não apaga', async () => {
  const doc = modo.documentoFixture();
  const cliente = clienteFalso();
  const pedido = { owner_id: '11111111-1111-4111-8111-111111111111', documento: doc };
  const enviado = await backup.enviar(cliente, pedido, true);
  assert.equal(enviado.enviou, true);
  assert.equal(cliente.ops[0].nome, 'backup_teste_gravar');
  assert.equal(cliente.ops[0].args.p_revisao_esperada, null);
  assert.equal(cliente.ops.some((op) => op.op === 'from'), false);
  const storage = {
    getItem(chave) { return chave === 'folhazero_teste_conta' ? 'conta-antiga' : null; }
  };
  assert.equal(backup.podeEnviarDaConta(storage, 'conta-nova').motivo, 'conta_anterior');
  assert.equal(backup.decidir({ owner_id: 'x', revisao: 2, documento: doc }, true).acao, 'atualizar');
});
