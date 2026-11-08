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

function servidor() {
  const estado = { revisao: null, documento: null, chamadas: [] };
  const cliente = {
    from() {
      estado.chamadas.push('leitura');
      return { select() { return { limit() {
        if (estado.revisao == null) return Promise.resolve({ data: [], error: null });
        return Promise.resolve({ data: [{ revisao: estado.revisao, documento: estado.documento }], error: null });
      } }; } };
    },
    rpc(_nome, args) {
      estado.chamadas.push(args.p_revisao_esperada);
      if (estado.revisao == null) {
        if (args.p_revisao_esperada != null) return Promise.resolve({ error: { code: '23514', message: 'revisao_divergente' } });
        estado.revisao = 1;
        estado.documento = JSON.parse(JSON.stringify(args.p_documento));
        return Promise.resolve({ data: 1, error: null });
      }
      if (args.p_revisao_esperada !== estado.revisao) {
        return Promise.resolve({ error: { code: '23514', message: 'revisao_divergente' } });
      }
      estado.documento = JSON.parse(JSON.stringify(args.p_documento));
      estado.revisao += 1;
      return Promise.resolve({ data: estado.revisao, error: null });
    }
  };
  return { estado, cliente };
}

test('dois aparelhos guardam a revisão da cópia e o segundo não cobre a edição', async () => {
  const { estado, cliente } = servidor();
  const conta = 'conta-a';
  const sessao = { user: { id: conta } };
  const doc = modo.documentoFixture();
  const a = memoria();
  const b = memoria();
  a.setItem(modo.CHAVE_APP, JSON.stringify(doc));
  b.setItem(modo.CHAVE_APP, JSON.stringify(doc));
  a.setItem(modo.CHAVE_CONTA, conta);
  b.setItem(modo.CHAVE_CONTA, conta);

  const primeiro = await backup.enviarDaBase(cliente, a, { liberado: true, sessao, documento: doc });
  assert.equal(primeiro.enviou, true);
  assert.equal(primeiro.base, 1);
  assert.equal(backup.lerBase(b, conta), null);

  const semBase = await backup.enviarDaBase(cliente, b, { liberado: true, sessao, documento: doc });
  assert.equal(semBase.motivo, 'base_ausente');
  assert.equal(semBase.enviou, false);
  assert.equal(estado.revisao, 1);
  assert.equal(backup.lerBase(b, conta), null);

  const previa = backup.recuperar(b, estado.documento, false);
  assert.equal(previa.escreveu, false);
  assert.equal(backup.lerBase(b, conta), null);

  const adotado = backup.recuperar(b, estado.documento, true);
  assert.equal(adotado.ok, true);
  assert.equal(backup.adotarRevisao(b, conta, 1).ok, true);
  assert.equal(JSON.parse(b.getItem(modo.CHAVE_COPIA)).entries.length, 2);

  const editado = JSON.parse(a.getItem(modo.CHAVE_APP));
  editado.entries[0].obs = 'Teste sem internet';
  a.setItem(modo.CHAVE_APP, JSON.stringify(editado));
  const atualizou = await backup.enviarDaBase(cliente, a, { liberado: true, sessao, documento: editado });
  assert.equal(atualizou.base, 2);
  assert.equal(estado.documento.entries[0].obs, 'Teste sem internet');
  assert.equal(backup.lerBase(b, conta), 1);

  const leituras = estado.chamadas.filter((item) => item === 'leitura').length;
  const stale = await backup.enviarDaBase(cliente, b, {
    liberado: true, sessao, documento: JSON.parse(b.getItem(modo.CHAVE_APP))
  });
  assert.equal(stale.motivo, 'revisao_divergente');
  assert.equal(stale.repetiu, false);
  assert.equal(estado.revisao, 2);
  assert.equal(estado.documento.entries[0].obs, 'Teste sem internet');
  assert.equal(backup.lerBase(b, conta), 1);
  assert.equal(JSON.parse(b.getItem(modo.CHAVE_APP)).entries[0].obs, 'Peça de teste com acento');
  assert.equal(estado.chamadas.filter((item) => item === 'leitura').length, leituras);

  const troca = await backup.enviarDaBase(cliente, a, {
    liberado: true, sessao: { user: { id: 'conta-b' } }, documento: editado
  });
  assert.equal(troca.motivo, 'conta_anterior');
  assert.equal(backup.lerBase(a, conta), 2);
  assert.equal(backup.lerBase(a, 'conta-b'), null);
  assert.equal(estado.documento.entries[0].obs, 'Teste sem internet');
  assert.equal(backup.MENSAGEM_ATUALIZADA.includes('outro aparelho'), false);
  assert.equal(backup.MENSAGEM_CONFLITO.includes('Nada foi enviado de novo'), true);
});

test('a cópia automática não cobre revisão alheia, não repete conflito e não perde edição', async () => {
  const estado = { revisao: 1, documento: null, rpcs: 0, leituras: 0 };
  const doc = modo.documentoFixture();
  estado.documento = JSON.parse(JSON.stringify(doc));
  let segurar = null;
  let soltar = null;
  const cliente = {
    from() {
      estado.leituras += 1;
      return { select() { return { limit() {
        return Promise.resolve(estado.revisao == null
          ? { data: [], error: null }
          : { data: [{ revisao: estado.revisao, documento: estado.documento }], error: null });
      } }; } };
    },
    rpc(_nome, args) {
      estado.rpcs += 1;
      const esperado = args.p_revisao_esperada;
      if (segurar && estado.rpcs === 1) {
        return segurar.then(() => aplicar(esperado, args.p_documento));
      }
      return aplicar(esperado, args.p_documento);
    }
  };
  function aplicar(esperado, documento) {
    if (estado.revisao == null) {
      if (esperado != null) return Promise.resolve({ error: { code: '23514', message: 'revisao_divergente' } });
      estado.revisao = 1;
    } else if (esperado !== estado.revisao) {
      return Promise.resolve({ error: { code: '23514', message: 'revisao_divergente' } });
    } else {
      estado.revisao += 1;
    }
    estado.documento = JSON.parse(JSON.stringify(documento));
    return Promise.resolve({ data: estado.revisao, error: null });
  }
  const conta = 'conta-a';
  const sessao = { user: { id: conta } };
  const a = memoria();
  const b = memoria();
  const baseDoc = JSON.stringify(doc);
  a.setItem(modo.CHAVE_APP, baseDoc);
  b.setItem(modo.CHAVE_APP, baseDoc);
  a.setItem(modo.CHAVE_CONTA, conta);
  b.setItem(modo.CHAVE_CONTA, conta);
  backup.gravarBase(a, conta, 1);
  backup.gravarBase(b, conta, 1);
  function pedido(storage, extra) {
    return Object.assign({
      conta, sessao, online: true, origemOk: true, liberado: true, agora: 100000,
      documento: JSON.parse(storage.getItem(modo.CHAVE_APP)),
      documentoAtual() { return JSON.parse(storage.getItem(modo.CHAVE_APP)); }
    }, extra);
  }

  const editadoA = JSON.parse(baseDoc);
  editadoA.entries[0].obs = 'Teste sem internet 2';
  a.setItem(modo.CHAVE_APP, JSON.stringify(editadoA));
  backup.anotarMudanca(a, conta);
  const subiu = await backup.rodarFila(cliente, a, pedido(a));
  assert.equal(subiu.enviou, true);
  assert.equal(estado.revisao, 2);
  assert.equal(estado.documento.entries[0].obs, 'Teste sem internet 2');
  assert.equal(a.getItem(modo.CHAVE_APP), JSON.stringify(editadoA));

  backup.anotarMudanca(b, conta);
  const conflito = await backup.rodarFila(cliente, b, pedido(b));
  assert.equal(conflito.motivo, 'revisao_divergente');
  assert.equal(estado.documento.entries[0].obs, 'Teste sem internet 2');
  const rpcs = estado.rpcs;
  const localB = b.getItem(modo.CHAVE_APP);
  backup.anotarMudanca(b, conta);
  const deNovo = await backup.rodarFila(cliente, b, pedido(b, { agora: 200000 }));
  assert.equal(deNovo.motivo, 'revisao_divergente');
  assert.equal(estado.rpcs, rpcs);
  assert.equal(b.getItem(modo.CHAVE_APP), localB);
  assert.equal(backup.lerBase(b, conta), 1);

  const sem = memoria();
  sem.setItem(modo.CHAVE_CONTA, conta);
  sem.setItem(modo.CHAVE_APP, baseDoc);
  backup.anotarMudanca(sem, conta);
  const leituras = estado.leituras;
  const bloqueado = await backup.rodarFila(cliente, sem, pedido(sem));
  assert.equal(bloqueado.motivo, 'base_ausente');
  assert.equal(estado.leituras, leituras + 1);
  backup.anotarMudanca(sem, conta);
  const parado = await backup.rodarFila(cliente, sem, pedido(sem, { agora: 300000 }));
  assert.equal(parado.motivo, 'base_ausente');
  assert.equal(estado.leituras, leituras + 1);
  assert.equal(estado.documento.entries[0].obs, 'Teste sem internet 2');

  const igual = await backup.rodarFila(cliente, a, pedido(a, { manual: true }));
  assert.equal(igual.motivo, 'igual');
  assert.equal(estado.revisao, 2);

  segurar = new Promise((resolve) => { soltar = resolve; });
  const durante = JSON.parse(a.getItem(modo.CHAVE_APP));
  durante.entries[0].obs = 'em voo';
  a.setItem(modo.CHAVE_APP, JSON.stringify(durante));
  backup.anotarMudanca(a, conta);
  estado.rpcs = 0;
  const voo = backup.rodarFila(cliente, a, pedido(a));
  const depois = JSON.parse(a.getItem(modo.CHAVE_APP));
  depois.entries[0].obs = 'depois do voo';
  a.setItem(modo.CHAVE_APP, JSON.stringify(depois));
  backup.anotarMudanca(a, conta);
  soltar();
  const terminou = await voo;
  assert.equal(terminou.enviou, true);
  assert.equal(estado.documento.entries[0].obs, 'depois do voo');
  assert.equal(JSON.parse(a.getItem(modo.CHAVE_APP)).entries[0].obs, 'depois do voo');
  assert.equal(estado.revisao, 4);

  const offline = backup.anotarMudanca(a, conta);
  assert.equal(offline.fila.estado === 'pendente' || offline.fila.estado === 'enviado', true);
  const antesOff = estado.rpcs;
  const semRede = await backup.rodarFila(cliente, a, pedido(a, { online: false }));
  assert.equal(semRede.motivo, 'offline');
  assert.equal(estado.rpcs, antesOff);

  const outra = await backup.rodarFila(cliente, a, pedido(a, { sessao: { user: { id: 'conta-b' } }, manual: true }));
  assert.equal(outra.motivo, 'conta_anterior');
  assert.equal(backup.lerBase(a, 'conta-b'), null);

  const antesRestauracao = estado.rpcs;
  b.setItem(modo.CHAVE_APP, JSON.stringify(estado.documento));
  backup.registrarCopiaAceita(b, conta, estado.documento, estado.revisao);
  const restaurado = await backup.rodarFila(cliente, b, pedido(b, { manual: true }));
  assert.equal(restaurado.motivo, 'igual');
  assert.equal(estado.rpcs, antesRestauracao);
  assert.equal(estado.documento.entries[0].obs, 'depois do voo');
});

test('resposta perdida não reenvia no escuro e a recarga trata o envio interrompido', async () => {
  const doc = modo.documentoFixture();
  const estado = { revisao: 1, documento: JSON.parse(JSON.stringify(doc)), rpcs: 0, leituras: 0, modo: 'perder' };
  const cliente = {
    from() {
      estado.leituras += 1;
      return { select() { return { limit() {
        return Promise.resolve({ data: [{ revisao: estado.revisao, documento: estado.documento }], error: null });
      } }; } };
    },
    rpc(_nome, args) {
      estado.rpcs += 1;
      if (estado.modo === 'perder') throw new Error('sem resposta');
      if (args.p_revisao_esperada !== estado.revisao) {
        return Promise.resolve({ error: { code: '23514', message: 'revisao_divergente' } });
      }
      estado.revisao += 1;
      estado.documento = JSON.parse(JSON.stringify(args.p_documento));
      if (estado.modo === 'perder-depois') throw new Error('sem resposta');
      return Promise.resolve({ data: estado.revisao, error: null });
    }
  };
  const conta = 'conta-a';
  const storage = memoria();
  const novo = JSON.parse(JSON.stringify(doc));
  novo.entries[0].obs = 'foi';
  storage.setItem(modo.CHAVE_APP, JSON.stringify(novo));
  storage.setItem(modo.CHAVE_CONTA, conta);
  backup.gravarBase(storage, conta, 1);
  backup.anotarMudanca(storage, conta);
  const pedido = {
    conta, sessao: { user: { id: conta } }, online: true, origemOk: true, liberado: true, agora: 100000,
    documento: novo,
    documentoAtual() { return JSON.parse(storage.getItem(modo.CHAVE_APP)); }
  };
  const perdido = await backup.rodarFila(cliente, storage, pedido);
  assert.equal(perdido.motivo, 'resposta_ausente');
  assert.equal(backup.lerFila(storage, conta).estado, 'ambiguo');
  assert.equal(estado.revisao, 1);
  const cego = await backup.rodarFila(cliente, storage, Object.assign({}, pedido, { agora: 100500 }));
  assert.equal(cego.motivo, 'resposta_ausente');
  assert.equal(estado.rpcs, 1);
  backup.retomarFila(storage, conta);
  estado.modo = 'normal';
  const conferencia = await backup.rodarFila(cliente, storage, Object.assign({}, pedido, { retomada: true, agora: 200000 }));
  assert.equal(conferencia.enviou, true);
  assert.equal(estado.revisao, 2);
  assert.equal(estado.documento.entries[0].obs, 'foi');
  const outro = memoria();
  const confirmado = JSON.parse(JSON.stringify(doc));
  confirmado.entries[0].obs = 'gravou';
  outro.setItem(modo.CHAVE_APP, JSON.stringify(confirmado));
  outro.setItem(modo.CHAVE_CONTA, conta);
  backup.gravarBase(outro, conta, 1);
  backup.anotarMudanca(outro, conta);
  estado.modo = 'perder-depois';
  estado.revisao = 1;
  estado.documento = JSON.parse(JSON.stringify(doc));
  const sumiu = await backup.rodarFila(cliente, outro, Object.assign({}, pedido, {
    documento: confirmado,
    documentoAtual() { return JSON.parse(outro.getItem(modo.CHAVE_APP)); }
  }));
  assert.equal(sumiu.motivo, 'resposta_ausente');
  assert.equal(estado.revisao, 2);
  const rpcs = estado.rpcs;
  const semCego = await backup.rodarFila(cliente, outro, Object.assign({}, pedido, {
    documento: confirmado, agora: 300000,
    documentoAtual() { return JSON.parse(outro.getItem(modo.CHAVE_APP)); }
  }));
  assert.equal(semCego.motivo, 'resposta_ausente');
  assert.equal(estado.rpcs, rpcs);
  const achou = await backup.rodarFila(cliente, outro, Object.assign({}, pedido, {
    retomada: true, agora: 400000, documento: confirmado,
    documentoAtual() { return JSON.parse(outro.getItem(modo.CHAVE_APP)); }
  }));
  assert.equal(achou.enviou, false);
  assert.equal(estado.revisao, 2);
  assert.equal(estado.documento.entries[0].obs, 'gravou');
  assert.equal(backup.lerBase(outro, conta), 2);
  assert.equal(backup.lerFila(outro, conta).estado, 'enviado');
});

test('a página só liga a cópia variável no site isolado e não lê o aplicativo', () => {
  const painel = fs.readFileSync(path.join(__dirname, '..', 'app-teste-painel.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'app-teste.html'), 'utf8');
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase/migrations/20261108010000_backups_teste_app.sql'), 'utf8');
  assert.equal(painel.includes('folhazero_v1'), false);
  assert.equal(painel.includes('.delete('), false);
  assert.equal(painel.includes('B.ABERTO === true && pode'), true);
  assert.equal(painel.includes('revisaoAtual: lido'), false);
  assert.equal(painel.includes('outro aparelho'), false);
  assert.equal(painel.includes('rodarFila'), true);
  assert.equal(painel.includes('anotarMudanca'), true);
  assert.equal(painel.includes('revisaoAtual: lido'), false);
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.equal(app.includes("if (MODO_TESTE)") && app.includes('folha-teste-gravou'), true);
  assert.equal(fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').includes('FOLHA_ZERO_MODO_TESTE'), false);
  assert.equal(html.includes('backup genérico'), false);
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
