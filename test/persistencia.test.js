const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

require(path.join(__dirname, '..', 'persistencia.js'));
const P = globalThis.FolhaPersistencia;

function memoria(opts = {}) {
  const map = new Map();
  let copias = 0;
  return {
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) {
      if (String(k).startsWith('folhazero_copia_')) {
        copias += 1;
        if (opts.falharCopiaAPartir && copias >= opts.falharCopiaAPartir) {
          const e = new Error('QuotaExceededError');
          e.name = 'QuotaExceededError';
          throw e;
        }
      }
      map.set(k, String(v));
    },
    removeItem(k) { map.delete(k); }
  };
}

function doc(entries) {
  return JSON.stringify({
    version: 2,
    entries,
    quinzenas: { 'Cliente Exemplo|2026-11|1': 'Aberta' },
    descontos: {},
    settings: { operador: 'Pessoa Exemplo', setorOperador: 'Setor Exemplo', valorPadrao: { 'Cliente Exemplo': 10 }, aliquota: {} }
  });
}

const carro = (id, extra) => Object.assign({
  id, empresa: 'Cliente Exemplo', setor: 'Setor Exemplo', os: 'OS-TESTE-' + id,
  veiculo: 'Carro Exemplo', dataInicio: '2026-11-01', dataTermino: '2026-11-03',
  valor: 10, ajudante: 1, situacao: 'Finalizado', pausas: [], updatedAt: 1
}, extra);

test('a chave de produção não é renomeada e o arquivo não chama a rede', () => {
  assert.equal(P.KEY, 'folhazero_v1');
  const src = fs.readFileSync(path.join(__dirname, '..', 'persistencia.js'), 'utf8');
  assert.equal(src.includes('fetch('), false);
  assert.equal(src.includes('script.google.com'), false);
  assert.equal(src.includes('supabase.co'), false);
});

test('config ausente fica desligada e service_role é recusado sem ecoar o segredo', () => {
  assert.equal(P.configHabilitada({}), false);
  assert.equal(P.lerConfig({}), null);
  const segredo = 'segredo-que-nao-pode-vazar-xyz';
  const recusa = P.lerConfig({ FOLHA_ZERO_NUVEM: { url: 'https://projeto.invalid', anonKey: 'anon', service_role: segredo } });
  assert.equal(recusa.motivo, 'segredo_proibido');
  assert.equal(JSON.stringify(recusa).includes(segredo), false);
  const suspeita = P.lerConfig({ FOLHA_ZERO_NUVEM: { url: 'https://projeto.invalid', anonKey: 'eyJhbGciOi-service_role-abc' } });
  assert.equal(suspeita.motivo, 'chave_suspeita');
});

test('backup local antes da migração é idempotente e não mexe na origem', async () => {
  const s = memoria();
  const bruto = doc([carro('a')]);
  s.setItem(P.KEY, bruto);
  const primeiro = await P.prepararMigracao(s);
  assert.equal(primeiro.ok, true);
  assert.equal(s.getItem(P.KEY), bruto);
  const segundo = await P.prepararMigracao(s);
  assert.equal(segundo.repetido, true);
  assert.equal(segundo.backupId, primeiro.backupId);
  assert.equal(s.getItem(P.KEY), bruto);
  const g = JSON.parse(s.getItem(P.GUARD));
  assert.equal(g.backups.filter(b => b.motivo === 'pre_migracao').length, 1);
  assert.equal(g.nuvem.estado, 'backup_local');
});

test('falha de quota no backup aborta e preserva a origem', async () => {
  const s = memoria({ falharCopiaAPartir: 1 });
  const bruto = doc([carro('a')]);
  s.setItem(P.KEY, bruto);
  const r = await P.prepararMigracao(s);
  assert.equal(r.ok, false);
  assert.equal(r.motivo, 'quota_ou_escrita');
  assert.equal(s.getItem(P.KEY), bruto);
});

test('prévia da restauração não escreve e sem confirmação não troca a origem', async () => {
  const s = memoria();
  const original = doc([carro('a', { valor: 10 })]);
  s.setItem(P.KEY, original);
  const prep = await P.prepararMigracao(s);
  const novo = doc([carro('a', { valor: 99, updatedAt: 2 }), carro('b', { updatedAt: 2 })]);
  s.setItem(P.KEY, novo);
  const previa = P.preverRestauracao(s, prep.backupId);
  assert.equal(previa.ok, true);
  assert.equal(previa.atual.lancamentos, 2);
  assert.equal(previa.copia.lancamentos, 1);
  assert.deepEqual(previa.idsQueSaem, ['b']);
  assert.equal(s.getItem(P.KEY), novo);
  const semConfirmar = await P.restaurarBackup(s, prep.backupId, false);
  assert.equal(semConfirmar.motivo, 'sem_confirmacao');
  assert.equal(s.getItem(P.KEY), novo);
});

test('restauração confirmada grava cópia de segurança e aborta cópia inválida', async () => {
  const s = memoria();
  const original = doc([carro('a', { os: 'OS-TESTE-001', valor: 10 })]);
  s.setItem(P.KEY, original);
  const prep = await P.prepararMigracao(s);
  const novo = doc([carro('b', { os: 'OS-TESTE-002', valor: 20 })]);
  s.setItem(P.KEY, novo);
  const feito = await P.restaurarBackup(s, prep.backupId, true);
  assert.equal(feito.ok, true);
  assert.equal(JSON.parse(s.getItem(P.KEY)).entries[0].os, 'OS-TESTE-001');
  assert.ok(feito.backupAtual);
  const g = JSON.parse(s.getItem(P.GUARD));
  const invalido = g.backups[0];
  s.setItem(invalido.chave, '{nao é json');
  s.setItem(P.KEY, novo);
  const abortou = await P.restaurarBackup(s, invalido.id, true);
  assert.equal(abortou.ok, false);
  assert.equal(abortou.motivo, 'copia_invalida');
  assert.equal(s.getItem(P.KEY), novo);
});

test('quota na cópia de segurança não substitui o original', async () => {
  const s = memoria({ falharCopiaAPartir: 2 });
  const original = doc([carro('a')]);
  s.setItem(P.KEY, original);
  const prep = await P.prepararMigracao(s);
  const novo = doc([carro('b')]);
  s.setItem(P.KEY, novo);
  const r = await P.restaurarBackup(s, prep.backupId, true);
  assert.equal(r.ok, false);
  assert.equal(r.motivo, 'backup_atual_falhou');
  assert.equal(s.getItem(P.KEY), novo);
});

test('conta vazia não sobrescreve o local e a mescla não duplica id', () => {
  const local = doc([carro('a', { updatedAt: 1 })]);
  let escreveu = false;
  const vazio = P.aplicarRemoto(local, { entries: [], quinzenas: {}, descontos: {} }, () => { escreveu = true; });
  assert.equal(vazio.acao, 'manter_local');
  assert.equal(vazio.motivo, 'conta_vazia');
  assert.equal(escreveu, false);
  const mescla = P.mesclarEntradas(
    [carro('a', { updatedAt: 1, os: 'velho' }), carro('b', { updatedAt: 1 })],
    [carro('a', { updatedAt: 5, os: 'novo' }), carro('b', { updatedAt: 1 }), carro('c', { updatedAt: 1 })]
  );
  assert.deepEqual(mescla.map(e => e.id).sort(), ['a', 'b', 'c']);
  assert.equal(mescla.find(e => e.id === 'a').os, 'novo');
  const deNovo = P.mesclarEntradas(mescla, mescla);
  assert.equal(deNovo.length, 3);
});

test('troca de usuário e logout não vazam nem capturam a base local', () => {
  const s = memoria();
  const bruto = doc([carro('a', { os: 'OS-TESTE-LOCAL' })]);
  s.setItem(P.KEY, bruto);
  assert.equal(P.vincularLegado(s, 'uid-ana', false).motivo, 'sem_confirmacao');
  assert.equal(P.vincularLegado(s, 'uid-ana', true).ok, true);
  assert.equal(P.vincularLegado(s, 'uid-diego', true).motivo, 'outro_perfil');
  assert.equal(JSON.parse(s.getItem(P.GUARD)).vinculo.uid, 'uid-ana');
  const troca = P.trocarUsuario(s, 'uid-diego');
  assert.equal(troca.acao, 'desvinculou');
  assert.equal(s.getItem(P.KEY), bruto);
  assert.equal(JSON.parse(s.getItem(P.GUARD)).vinculo, null);
  P.vincularLegado(s, 'uid-ana', true);
  P.sair(s);
  assert.equal(s.getItem(P.KEY), bruto);
  assert.equal(JSON.parse(s.getItem(P.GUARD)).vinculo, null);
});

test('envio só marca concluído com ack verificado e repete o mesmo lote', async () => {
  const s = memoria();
  s.setItem(P.KEY, doc([carro('a'), carro('b')]));
  let chamadas = 0;
  const transport = async () => { chamadas += 1; return { verificado: true }; };
  const ambiente = { FOLHA_ZERO_NUVEM: { url: 'https://projeto.invalid', anonKey: 'anon-de-teste' } };
  const desligado = await P.enviarSeConfigurado(s, {}, transport);
  assert.equal(desligado.motivo, 'desabilitada');
  assert.equal(chamadas, 0);
  const semVinculo = await P.enviarSeConfigurado(s, ambiente, transport);
  assert.equal(semVinculo.motivo, 'sem_vinculo');
  assert.equal(chamadas, 0);
  P.vincularLegado(s, 'uid-ana', true);
  const rede = await P.enviarSeConfigurado(s, ambiente, async () => { chamadas += 1; throw new Error('offline'); });
  assert.equal(rede.motivo, 'rede');
  assert.equal(JSON.parse(s.getItem(P.KEY)).entries.length, 2);
  const pedidos = [];
  const parcial = await P.enviarSeConfigurado(s, ambiente, async (pedido) => {
    pedidos.push(pedido.ids.slice());
    return { verificado: false, idsPendentes: ['b'] };
  });
  assert.equal(parcial.motivo, 'parcial');
  assert.equal(JSON.parse(s.getItem(P.GUARD)).nuvem.estado, 'aguardando_ack');
  const ids = JSON.parse(s.getItem(P.KEY)).entries.map(e => e.id);
  const ok = await P.enviarSeConfigurado(s, ambiente, async (pedido) => {
    pedidos.push(pedido.ids.slice());
    assert.deepEqual(pedido.ids, ['b']);
    return { verificado: true, sha256: pedido.sha256, ids };
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.estado, 'verificada');
  const repetido = await P.enviarSeConfigurado(s, ambiente, async () => { throw new Error('nao deveria repetir a rede'); });
  assert.equal(repetido.repetido, true);
  assert.equal(pedidos[0].includes('a') && pedidos[0].includes('b'), true);
  assert.equal(pedidos[1].join(), 'b');
});

test('plano separa valor privado e não cria org sozinho', () => {
  const plano = P.planoDeLinhas(JSON.parse(doc([carro('a', { valor: 123.45, ajudante: 9, obs: 'nota ficticia' })])), 'uid-ana');
  assert.equal(plano.lancamentos[0].org_id, null);
  assert.equal(plano.lancamentos[0].client_id, 'a');
  assert.equal(JSON.stringify(plano.lancamentos).includes('123.45'), false);
  assert.equal(plano.valores[0].valor, 123.45);
  assert.equal(plano.ajustes.owner_id, 'uid-ana');
  assert.equal('valor_padrao' in plano.lancamentos[0], false);
  assert.throws(() => P.planoDeLinhas({ entries: [] }, ''), /uid obrigatorio/);
});

test('ack divergente não conclui', () => {
  const r = P.marcarConcluida({ sha256: 'abc', ids: ['a'] }, { verificado: true, sha256: 'abc', ids: ['b'] });
  assert.equal(r.ok, false);
  assert.equal(r.estado, 'aguardando_ack');
  const sem = P.marcarConcluida({ sha256: 'abc', ids: ['a'] }, { verificado: false, sha256: 'abc', ids: ['a'] });
  assert.equal(sem.motivo, 'sem_ack');
});
