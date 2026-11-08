const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
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

test('sem a trava explícita o envio não chama a nuvem', async () => {
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
  assert.equal(backup.ABERTO, true);
});

function memoria() {
  const dados = new Map();
  return {
    getItem(chave) { return dados.has(chave) ? dados.get(chave) : null; },
    setItem(chave, valor) {
      if (chave === 'folhazero_v1') throw new Error('gravou no aplicativo');
      dados.set(chave, String(valor));
    },
    removeItem(chave) { dados.delete(chave); }
  };
}

test('sessão ausente, outra conta e revisão velha não reenviam nem apagam', async () => {
  const doc = modo.documentoFixture();
  doc.entries.push(Object.assign({}, doc.entries[1], { id: 'carro-novo-1', os: 'OS-NOVO', valor: null }));
  const semSessao = backup.planejarEnvio({ liberado: true, documento: doc, storage: memoria(), revisaoAtual: null });
  assert.equal(semSessao.motivo, 'sessao_ausente');
  assert.equal(semSessao.enviou, false);
  const storage = memoria();
  storage.setItem('folhazero_teste_conta', 'conta-a');
  const troca = backup.planejarEnvio({
    liberado: true,
    sessao: { user: { id: 'conta-b' } },
    storage,
    documento: doc,
    revisaoAtual: null
  });
  assert.equal(troca.motivo, 'conta_anterior');
  const plano = backup.planejarEnvio({
    liberado: true,
    sessao: { user: { id: 'conta-a' } },
    storage,
    documento: doc,
    revisaoAtual: 2
  });
  assert.equal(plano.ok, true);
  assert.equal(plano.pedido.revisao, 2);
  const ops = [];
  const cliente = {
    ops,
    rpc(nome, args) {
      ops.push({ nome, args });
      return Promise.resolve({ error: { code: '23514', message: 'revisao_divergente' } });
    },
    from() { throw new Error('nao era leitura'); },
    delete() { throw new Error('apagou'); }
  };
  const conflito = await backup.enviar(cliente, plano.pedido, true);
  assert.equal(conflito.motivo, 'revisao_divergente');
  assert.equal(conflito.enviou, false);
  assert.equal(conflito.repetiu, false);
  assert.equal(conflito.apagou, false);
  assert.equal(ops.length, 1);
  assert.equal(ops[0].args.p_revisao_esperada, 2);
  assert.equal(ops[0].args.p_documento.entries.length, 3);
});

test('a leitura é da própria linha e a recuperação pede confirmação e guarda a cópia', async () => {
  const doc = modo.documentoFixture();
  doc.entries.push(Object.assign({}, doc.entries[1], { id: 'carro-novo-1', os: 'OS-NOVO' }));
  const cliente = {
    from(nome) {
      assert.equal(nome, 'backups_teste_app');
      return {
        select(cols) {
          assert.equal(cols, 'revisao,documento');
          return {
            limit(n) {
              assert.equal(n, 1);
              return Promise.resolve({ data: [{ revisao: 1, documento: doc }], error: null });
            }
          };
        },
        delete() { throw new Error('apagou'); }
      };
    },
    rpc() { throw new Error('leitura nao grava'); }
  };
  const lido = await backup.lerPropria(cliente);
  assert.equal(lido.vazio, false);
  assert.equal(lido.revisao, 1);
  assert.equal(lido.documento.entries.length, 3);
  const storage = memoria();
  modo.semearSeVazio(storage);
  const previa = backup.recuperar(storage, doc, false);
  assert.equal(previa.escreveu, false);
  assert.equal(previa.motivo, 'sem_confirmacao');
  assert.equal(previa.previa.somenteLocais.includes('fx-vidro-02'), false);
  assert.equal(JSON.parse(storage.getItem(modo.CHAVE_APP)).entries.length, 2);
  const aplicado = backup.recuperar(storage, doc, true);
  assert.equal(aplicado.ok, true);
  assert.equal(JSON.parse(storage.getItem(modo.CHAVE_APP)).entries.length, 3);
  assert.equal(JSON.parse(storage.getItem(modo.CHAVE_COPIA)).entries.length, 2);
  assert.equal(backup.MENSAGEM_RECOLOCADA.includes('cópia local'), true);
  assert.equal(backup.MENSAGEM_RECOLOCADA.includes('canônica'), false);
});

test('a página só liga a cópia variável no site isolado e não lê o aplicativo', () => {
  const painel = fs.readFileSync(path.join(__dirname, '..', 'app-teste-painel.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'app-teste.html'), 'utf8');
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase/migrations/20261108010000_backups_teste_app.sql'), 'utf8');
  assert.equal(painel.includes('folhazero_v1'), false);
  assert.equal(painel.includes('.delete('), false);
  assert.equal(painel.includes('B.ABERTO === true && pode'), true);
  assert.equal(painel.includes('paginaPermitida'), true);
  assert.match(html, /id="btn-backup-variavel" disabled/);
  assert.match(html, /id="btn-backup-previa" disabled/);
  assert.match(html, /id="btn-backup-confirmar" disabled/);
  assert.equal(html.includes('Enviar lançamentos de teste'), true);
  assert.equal(html.includes('Ver prévia da cópia variável'), true);
  assert.equal(html.includes('Confirmar recuperação da cópia variável'), true);
  assert.equal(sql.includes('security invoker'), true);
  assert.equal(sql.includes('security definer'), true);
});
