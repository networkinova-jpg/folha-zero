const test = require('node:test');
const assert = require('node:assert/strict');
const lic = require('../licenca-teste.js');

const HOJE = '2026-11-23';
const UID = '66666666-6666-4666-8666-666666666666';

function sessao() { return { uid: UID }; }

test('deslogado e sem registro não bloqueiam', () => {
  const fora = lic.decidir({ sessao: null, hoje: HOJE });
  assert.equal(fora.motivo, 'deslogado');
  assert.equal(fora.bloqueiaNovo, false);
  assert.equal(fora.resumo, '');
  const vazio = lic.decidir({ sessao: sessao(), dados: { conta: null, degustacao: null, licenca: null }, hoje: HOJE });
  assert.equal(vazio.motivo, 'sem_registro');
  assert.equal(vazio.bloqueiaNovo, false);
  assert.equal(vazio.resumo, 'Sem prazo definido');
  const contaSolta = lic.decidir({ sessao: sessao(), dados: { conta: 'ativo' }, hoje: HOJE });
  assert.equal(contaSolta.bloqueiaNovo, false);
  assert.equal(contaSolta.resumo, 'Sem prazo definido');
});

test('degustação e licença dentro do prazo liberam', () => {
  const deg = lic.decidir({
    sessao: sessao(),
    hoje: HOJE,
    dados: { conta: 'ativo', degustacao: 'ativa', degustacao_fim: '2026-12-04' }
  });
  assert.equal(deg.bloqueiaNovo, false);
  assert.equal(deg.resumo, 'Degustação até 04/12/2026');
  const ativa = lic.decidir({
    sessao: sessao(),
    hoje: HOJE,
    dados: { conta: 'ativo', degustacao: 'ativa', degustacao_fim: '2026-12-04', licenca: 'ativa', licenca_validade: HOJE }
  });
  assert.equal(ativa.motivo, 'licenca_ativa');
  assert.equal(ativa.resumo, 'Licença ativa até 23/11/2026');
  assert.equal(ativa.bloqueiaNovo, false);
});

test('vencida, suspensa e revogada só travam carro novo', () => {
  const vencida = lic.decidir({
    sessao: sessao(),
    hoje: HOJE,
    dados: { conta: 'ativo', licenca: 'ativa', licenca_validade: '2026-11-22' }
  });
  assert.equal(vencida.motivo, 'vencido');
  assert.equal(vencida.bloqueiaNovo, true);
  assert.equal(vencida.resumo, 'Prazo vencido');
  assert.match(vencida.aviso, /carros novos está vencido/);
  assert.match(vencida.aviso, /Ricardo Ribeiro/);
  assert.match(vencida.aviso, /backup continuam liberados/);
  const encerrada = lic.avaliar({ degustacao: 'encerrada', degustacao_fim: '2026-11-01' }, HOJE);
  assert.equal(encerrada.motivo, 'vencido');
  const suspensa = lic.decidir({ sessao: sessao(), hoje: HOJE, dados: { conta: 'suspenso', licenca: 'ativa', licenca_validade: '2026-12-14' } });
  assert.equal(suspensa.motivo, 'suspenso');
  assert.equal(suspensa.resumo, 'Acesso suspenso');
  assert.match(suspensa.aviso, /carros novos está suspenso/);
  const licencaSuspensa = lic.avaliar({ conta: 'ativo', licenca: 'suspensa', licenca_validade: '2026-12-14' }, HOJE);
  assert.equal(licencaSuspensa.resumo, 'Acesso suspenso');
  const revogada = lic.decidir({ sessao: sessao(), hoje: HOJE, dados: { conta: 'revogado' } });
  assert.equal(revogada.motivo, 'revogado');
  assert.equal(revogada.bloqueiaNovo, true);
  assert.equal(revogada.aviso.includes('\u2014'), false);
});

test('offline usa o cache da mesma conta e não mexe no aplicativo', () => {
  const storage = memoria();
  storage.setItem(lic.PROIBIDA, 'documento-local');
  const dados = { conta: 'ativo', licenca: 'ativa', licenca_validade: '2026-12-14', documento: { os: 'segredo' } };
  lic.gravar(storage, UID, dados);
  assert.equal(storage.getItem(lic.PROIBIDA), 'documento-local');
  const guardado = lic.ler(storage, UID);
  assert.equal(guardado.dados.documento, undefined);
  assert.equal(guardado.dados.licenca, 'ativa');
  assert.equal(lic.ler(storage, 'outra-conta'), null);
  const offline = lic.decidir({ sessao: sessao(), erroRede: true, cache: guardado, hoje: HOJE });
  assert.equal(offline.usouCache, true);
  assert.equal(offline.bloqueiaNovo, false);
  assert.equal(offline.resumo, 'Licença ativa até 14/12/2026');
  const semCache = lic.decidir({ sessao: sessao(), erroRede: true, hoje: HOJE });
  assert.equal(semCache.motivo, 'offline_sem_cache');
  assert.equal(semCache.bloqueiaNovo, false);
  const suspensa = { uid: UID, dados: { conta: 'suspenso' } };
  const aplicada = lic.aplicar(lic.decidir({ sessao: sessao(), erroRede: true, cache: suspensa, hoje: HOJE }));
  assert.equal(aplicada.usouCache, true);
  assert.equal(lic.bloqueioLocal().bloqueiaNovo, true);
  assert.equal(lic.bloqueioLocal().resumo, 'Acesso suspenso');
});

function memoria() {
  const dados = new Map();
  return {
    getItem(chave) { return dados.has(chave) ? dados.get(chave) : null; },
    setItem(chave, valor) {
      if (chave === lic.PROIBIDA && dados.has(chave) && dados.get(chave) !== valor) throw new Error('gravou no aplicativo');
      dados.set(chave, String(valor));
    },
    removeItem(chave) { dados.delete(chave); }
  };
}
