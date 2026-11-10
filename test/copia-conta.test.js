const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const conta = require('../copia-conta.js');
const login = require('../login-google.js');

function memoria(inicial) {
  const dados = new Map(Object.entries(inicial || {}));
  return {
    getItem(chave) { return dados.has(chave) ? dados.get(chave) : null; },
    setItem(chave, valor) { dados.set(chave, String(valor)); },
    removeItem(chave) { dados.delete(chave); }
  };
}

function documento(obs, extra) {
  return Object.assign({
    version: 2,
    campoLegado: 'não apagar',
    entries: [{
      id: 'carro-1', empresa: 'Concept Blindados', os: 'OS-1', veiculo: 'Carro',
      valor: 510, obs, pausas: [{ motivo: 'Fim de expediente', inicio: '2026-11-02T12:00', nota: 'extra' }],
      etiquetaAntiga: true
    }],
    quinzenas: { 'Concept Blindados|2026|11|1': 'Aberta' },
    descontos: {},
    settings: { operador: 'Pessoa Exemplo', lastBackup: null }
  }, extra || {});
}

function preparar(storage, uid, doc) {
  storage.setItem(conta.KEY, JSON.stringify(doc));
  conta.associar(storage, uid, true, false);
}

function servidor(inicial) {
  const estado = Object.assign({ revisao: null, documento: null, rpcs: 0, leituras: 0, modo: 'normal' }, inicial);
  const cliente = {
    from() {
      estado.leituras += 1;
      return { select() { return { limit() {
        if (estado.revisao == null) return Promise.resolve({ data: [], error: null });
        return Promise.resolve({ data: [{ revisao: estado.revisao, documento: estado.documento }], error: null });
      } }; } };
    },
    rpc(_nome, args) {
      estado.rpcs += 1;
      if (estado.modo === 'perder') throw new Error('sem resposta');
      if (estado.modo === 'segurar' && estado.rpcs === 1) {
        return estado.espera.then(() => aplicar(args));
      }
      return aplicar(args);
    }
  };
  function aplicar(args) {
    const esperado = args.p_revisao_esperada;
    if (estado.revisao == null) {
      if (esperado != null) return Promise.resolve({ error: { code: '23514', message: 'revisao_divergente' } });
      estado.revisao = 1;
    } else if (esperado !== estado.revisao) {
      return Promise.resolve({ error: { code: '23514', message: 'revisao_divergente' } });
    } else {
      estado.revisao += 1;
    }
    estado.documento = JSON.parse(JSON.stringify(args.p_documento));
    if (estado.modo === 'perder-depois') throw new Error('sem resposta');
    return Promise.resolve({ data: estado.revisao, error: null });
  }
  return { estado, cliente };
}

function pedido(storage, uid, extra) {
  return Object.assign({
    uid, origemOk: true, online: true, agora: 100000
  }, extra);
}

test('navegador vazio não cria lançamento nem envia exemplo', async () => {
  const storage = memoria();
  const r = conta.associar(storage, 'conta-a', true, false);
  assert.equal(r.ok, true);
  assert.equal(storage.getItem(conta.KEY), null);
  assert.equal(storage.getItem(conta.BRUTO), null);
  const { estado, cliente } = servidor();
  const envio = await conta.rodarFila(cliente, storage, pedido(storage, 'conta-a', { manual: true }));
  assert.equal(envio.motivo, 'sem_documento');
  assert.equal(estado.rpcs, 0);
  assert.equal(JSON.stringify(storage.getItem(conta.KEY) || '').includes('exemplo'), false);
});

test('campo desconhecido permanece e a associação é obrigatória', async () => {
  const doc = documento('nota');
  const antes = JSON.stringify(doc);
  assert.equal(conta.aceitaEnvio(doc).ok, true);
  assert.equal(JSON.stringify(doc), antes);
  assert.equal(doc.entries[0].pausas[0].nota, 'extra');
  const storage = memoria();
  storage.setItem(conta.KEY, antes);
  const { estado, cliente } = servidor();
  const sem = await conta.rodarFila(cliente, storage, pedido(storage, 'conta-a', { manual: true }));
  assert.equal(sem.motivo, 'conta_nao_associada');
  assert.equal(estado.rpcs, 0);
  assert.equal(conta.associar(storage, 'conta-a', false, false).motivo, 'sem_consentimento');
  conta.associar(storage, 'conta-a', true, false);
  assert.equal(storage.getItem(conta.BRUTO), antes);
  assert.equal(storage.getItem(conta.KEY), antes);
  conta.anotarMudanca(storage, 'conta-a');
  const envio = await conta.rodarFila(cliente, storage, pedido(storage, 'conta-a'));
  assert.equal(envio.enviou, true);
  assert.equal(estado.documento.campoLegado, 'não apagar');
  assert.equal(estado.documento.entries[0].etiquetaAntiga, true);
  assert.equal(estado.documento.quinzenas['Concept Blindados|2026|11|1'], 'Aberta');
  assert.equal(storage.getItem(conta.KEY), antes);
});

test('conflito não repete, offline espera e a restauração não dispara envio', async () => {
  const { estado, cliente } = servidor();
  const a = memoria();
  const b = memoria();
  preparar(a, 'conta-a', documento('base'));
  preparar(b, 'conta-a', documento('base'));
  conta.anotarMudanca(a, 'conta-a');
  await conta.rodarFila(cliente, a, pedido(a, 'conta-a'));
  const editado = documento('Teste automático 1');
  a.setItem(conta.KEY, JSON.stringify(editado));
  conta.anotarMudanca(a, 'conta-a');
  await conta.rodarFila(cliente, a, pedido(a, 'conta-a', { agora: 200000 }));
  assert.equal(estado.documento.entries[0].obs, 'Teste automático 1');
  conta.gravarBase(b, 'conta-a', 1);
  const antigo = documento('Teste celular antigo');
  b.setItem(conta.KEY, JSON.stringify(antigo));
  conta.anotarMudanca(b, 'conta-a');
  const conflito = await conta.rodarFila(cliente, b, pedido(b, 'conta-a', { agora: 300000 }));
  assert.equal(conflito.motivo, 'revisao_divergente');
  const rpcs = estado.rpcs;
  conta.anotarMudanca(b, 'conta-a');
  const deNovo = await conta.rodarFila(cliente, b, pedido(b, 'conta-a', { agora: 400000 }));
  assert.equal(deNovo.motivo, 'revisao_divergente');
  assert.equal(estado.rpcs, rpcs);
  assert.equal(JSON.parse(b.getItem(conta.KEY)).entries[0].obs, 'Teste celular antigo');
  const semRede = await conta.rodarFila(cliente, a, pedido(a, 'conta-a', { online: false, agora: 500000 }));
  assert.equal(semRede.motivo, 'offline');
  b.setItem(conta.KEY, JSON.stringify(estado.documento));
  conta.registrarCopiaAceita(b, 'conta-a', estado.documento, estado.revisao);
  const depois = await conta.rodarFila(cliente, b, pedido(b, 'conta-a', { manual: true, agora: 600000 }));
  assert.equal(depois.motivo, 'igual');
  assert.equal(estado.rpcs, rpcs);
});

test('resposta perdida, edição durante o envio e conta trocada', async () => {
  const { estado, cliente } = servidor({ modo: 'perder' });
  const storage = memoria();
  preparar(storage, 'conta-a', documento('local'));
  conta.gravarBase(storage, 'conta-a', 1);
  estado.revisao = 1;
  estado.documento = documento('nuvem');
  const novo = documento('foi');
  storage.setItem(conta.KEY, JSON.stringify(novo));
  conta.anotarMudanca(storage, 'conta-a');
  const perdido = await conta.rodarFila(cliente, storage, pedido(storage, 'conta-a'));
  assert.equal(perdido.motivo, 'resposta_ausente');
  assert.equal(estado.revisao, 1);
  const cego = await conta.rodarFila(cliente, storage, pedido(storage, 'conta-a', { agora: 120000 }));
  assert.equal(cego.motivo, 'resposta_ausente');
  assert.equal(estado.rpcs, 1);
  estado.modo = 'normal';
  const conferencia = await conta.rodarFila(cliente, storage, pedido(storage, 'conta-a', { retomada: true, agora: 200000 }));
  assert.equal(conferencia.enviou, true);
  assert.equal(estado.documento.entries[0].obs, 'foi');
  const outra = await conta.rodarFila(cliente, storage, pedido(storage, 'conta-b', { manual: true, agora: 300000 }));
  assert.equal(outra.motivo, 'conta_nao_associada');
  assert.equal(conta.associar(storage, 'conta-b', true, false).motivo, 'conta_anterior');
  assert.equal(storage.getItem(conta.KEY), JSON.stringify(novo));
});

test('o service worker novo não apaga a base e a produção não mistura o teste', () => {
  const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const teste = fs.readFileSync(path.join(__dirname, '..', 'app-teste.html'), 'utf8');
  assert.equal(sw.includes('folhazero_v1'), false);
  assert.equal(sw.includes('removeItem'), false);
  assert.equal(sw.includes('folha-zero-v21'), true);
  assert.equal(index.includes('FOLHA_ZERO_MODO_TESTE'), false);
  assert.equal(index.includes('btn-backup-variavel'), false);
  assert.equal(index.includes('copia-conta.bundle.js'), true);
  assert.equal(teste.includes('copia-conta.bundle.js'), false);
  assert.equal(login.podeIniciarGoogle(new URL('https://networkinova-jpg.github.io/folha-zero/')).motivo, 'origem_producao');
  assert.equal(login.podeIniciarGoogleProducao(new URL('https://networkinova-jpg.github.io/folha-zero/')).ok, true);
  assert.equal(login.podeIniciarGoogleProducao(new URL('https://networkinova-jpg.github.io/folha-zero/index.html')).ok, true);
  assert.equal(login.podeIniciarGoogleProducao(new URL('https://wild-voice-4f08.folha-zero-networkinova.workers.dev/app-teste')).ok, false);
});
