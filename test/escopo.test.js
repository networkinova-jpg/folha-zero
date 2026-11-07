const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Pol = require('../supabase/politica-modelo.js');

require(path.join(__dirname, '..', 'persistencia.js'));
const P = globalThis.FolhaPersistencia;

const TENANT_FICTICIO = { id: 'tenant-ficticio-inova', nome: 'INOVA Blindagem', aviso: 'somente teste isolado' };

function memoria() {
  const map = new Map();
  return {
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(k, String(v)); },
    removeItem(k) { map.delete(k); }
  };
}

test('INOVA Blindagem não entra no catálogo real do app', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const empresas = src.match(/const EMPRESAS = \[([^\]]+)\]/)[1];
  assert.equal(empresas.includes('INOVA'), false);
  assert.equal(src.includes('INOVA Blindagem'), false);
  assert.equal(TENANT_FICTICIO.aviso, 'somente teste isolado');
  assert.equal(P.NOME_EQUIPE, 'Equipe de Produção');
});

test('motivos de pausa são os do app, sem taxonomia nova', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const lista = src.match(/const SITUACOES = \[([^\]]+)\]/)[1].match(/'[^']+'/g).map(s => s.slice(1, -1));
  const oficiais = lista.filter(s => s !== 'Em processo' && s !== 'Finalizado');
  assert.deepEqual(P.MOTIVOS_PAUSA_OFICIAIS, oficiais);
  assert.equal(P.MOTIVO_FIM_EXPEDIENTE, 'Fim de expediente');
  const schema = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'schema.sql'), 'utf8');
  assert.equal(/categoria text/.test(schema), false);
  assert.equal(schema.includes("'insumo'"), false);
  const peça = P.pausaParaPlano({ motivo: 'Faltando peça', inicio: '2026-11-01T10:00', fim: '2026-11-01T11:00', categoria: 'insumo' });
  assert.equal(peça.motivo, 'Faltando peça');
  assert.equal(peça.outro, false);
  assert.equal('categoria' in peça, false);
  const fim = P.pausaParaPlano({ motivo: 'fim do expediente', outro: true, inicio: '2026-11-01T18:00', fim: null });
  assert.equal(fim.motivo, 'Fim de expediente');
  assert.equal(fim.outro, false);
  const outro = P.pausaParaPlano({ motivo: 'Peça de teste', outro: true, inicio: '2026-11-01T12:00', fim: null });
  assert.equal(outro.outro, true);
  assert.equal(outro.motivo, 'Peça de teste');
});

test('gerente tem uma empresa, prestador atende várias, valor não sai', () => {
  const membros = [
    { orgId: 'alfa', userId: 'carla', papel: 'gerente', status: 'ativo' },
    { orgId: 'alfa', userId: 'ana', papel: 'prestador', status: 'ativo' }
  ];
  assert.equal(Pol.assumirGerencia(membros, 'carla', 'beta').motivo, 'gerente_ja_tem_empresa');
  assert.equal(Pol.assumirGerencia(membros, 'ana', 'beta').ok, true);
  assert.equal(Pol.criarEquipe('Concept Blindados').motivo, 'nome_de_marca_fixo');
  assert.equal(Pol.criarEquipe('').nome, 'Equipe de Produção');
  const doc = {
    entries: [
      { id: 'c1', empresa: 'Cliente Norte Teste', setor: 'Setor Exemplo A', os: 'OS-TESTE-1', veiculo: 'Carro Exemplo', valor: 10, pausas: [] },
      { id: 'c2', empresa: 'Cliente Sul Teste', setor: 'Setor Exemplo B', os: 'OS-TESTE-2', veiculo: 'Carro Exemplo', valor: 20, pausas: [] }
    ],
    quinzenas: {}, descontos: {}, settings: { valorPadrao: {}, aliquota: {} }
  };
  const plano = P.planoDeLinhas(doc, 'ana');
  assert.deepEqual(plano.lancamentos.map(l => l.empresa), ['Cliente Norte Teste', 'Cliente Sul Teste']);
  assert.equal(plano.lancamentos.every(l => l.org_id === null), true);
  assert.equal(JSON.stringify(plano.lancamentos).includes('"valor"'), false);
  const consent = Pol.registrarConsentimento({
    confirma: true, userId: 'ana', orgId: TENANT_FICTICIO.id, id: 'cons-1',
    finalidade: 'Compartilhar a produção do carro, sem valores.',
    versaoTexto: '2026-11-07',
    escopo: { empresas: ['Cliente Norte Teste'], setores: ['Setor Exemplo A'] },
    aceitoEm: '2026-11-07T17:35:00.000Z'
  });
  assert.equal(consent.registro.versaoTexto, '2026-11-07');
  const estado = { consentimentos: [consent.registro], compartilhamentos: [] };
  assert.equal(Pol.podeCompartilhar(estado, { ownerId: 'ana', orgId: TENANT_FICTICIO.id, empresa: 'Cliente Norte Teste', setor: 'Setor Exemplo A', incluiValor: true }).motivo, 'valor_privado');
  assert.equal(Pol.podeCompartilhar(estado, { ownerId: 'ana', orgId: TENANT_FICTICIO.id, empresa: 'Cliente Sul Teste', setor: 'Setor Exemplo B' }).motivo, 'fora_do_escopo');
  assert.equal(Pol.podeCompartilhar(estado, { ownerId: 'ana', orgId: TENANT_FICTICIO.id, empresa: 'Cliente Norte Teste', setor: 'Setor Exemplo A' }).ok, true);
  const share = { lancamentoId: 'c1', orgId: TENANT_FICTICIO.id, consentimentoId: 'cons-1', encerradoEm: null, retido: true };
  const visivel = {
    membros: [{ orgId: TENANT_FICTICIO.id, userId: 'carla', papel: 'gerente', status: 'ativo', setor: '' }],
    compartilhamentos: [share]
  };
  const linha = { id: 'c1', ownerId: 'ana', setor: 'Setor Exemplo A' };
  assert.equal(Pol.podeLerLancamento(visivel, { uid: 'carla' }, linha), true);
  assert.equal(Pol.podeLerValor(visivel, { uid: 'carla' }, { ownerId: 'ana', valor: 10 }), false);
  const revogacao = Pol.revogarConsentimento(consent.registro, [share]);
  assert.equal(revogacao.apagouLocal, false);
  assert.equal(revogacao.promessaApagarTudo, false);
  assert.equal(revogacao.retencaoAtiva, false);
  assert.equal(revogacao.compartilhamentos[0].retido, false);
  const depois = { membros: visivel.membros, compartilhamentos: revogacao.compartilhamentos, consentimentos: [revogacao.consentimento] };
  assert.equal(Pol.podeLerLancamento(depois, { uid: 'carla' }, linha), false);
  assert.equal(Pol.podeCompartilhar(depois, { ownerId: 'ana', orgId: TENANT_FICTICIO.id, empresa: 'Cliente Norte Teste', setor: 'Setor Exemplo A' }).motivo, 'sem_consentimento');
  const outroTenant = { id: 'c1', ownerId: 'ana', setor: 'Setor Exemplo A' };
  const beta = { membros: [{ orgId: 'beta', userId: 'diego', papel: 'gerente', status: 'ativo' }], compartilhamentos: revogacao.compartilhamentos };
  assert.equal(Pol.podeLerLancamento(beta, { uid: 'diego' }, outroTenant), false);
});

test('um aparelho ativo no servidor não apaga o legado local', () => {
  const primeiro = Pol.ativarAparelho([], 'ana', 'aparelho-1', true);
  assert.equal(primeiro.ok, true);
  assert.equal(primeiro.imposicaoLocal, false);
  const bloqueado = Pol.ativarAparelho(primeiro.aparelhos, 'ana', 'aparelho-2', false);
  assert.equal(bloqueado.motivo, 'confirma_revogacao_anterior');
  assert.equal(bloqueado.limite, 'revogacao_offline_nao_e_imediata');
  const trocado = Pol.ativarAparelho(primeiro.aparelhos, 'ana', 'aparelho-2', true);
  assert.deepEqual(trocado.revogados, ['aparelho-1']);
  assert.equal(trocado.apagouLocal, false);
  const s = memoria();
  const bruto = JSON.stringify({ version: 2, entries: [{ id: 'legado', os: 'OS-TESTE-LOCAL' }], quinzenas: {}, descontos: {}, settings: {} });
  s.setItem(P.KEY, bruto);
  const nota = P.notarAparelho(s, 'aparelho-2', 'revogou_anterior_no_servidor');
  assert.equal(nota.apagouLocal, false);
  assert.equal(s.getItem(P.KEY), bruto);
});

test('consentimento local não mexe na base e login não envia credencial', () => {
  const s = memoria();
  const bruto = JSON.stringify({ version: 2, entries: [{ id: 'legado' }], quinzenas: {}, descontos: {}, settings: {} });
  s.setItem(P.KEY, bruto);
  const r = P.guardarConsentimento(s, {
    confirma: true, orgId: TENANT_FICTICIO.id,
    finalidade: 'Compartilhar a produção do carro, sem valores.',
    versaoTexto: '2026-11-07',
    escopo: { empresas: ['Cliente Norte Teste'], setores: ['Setor Exemplo A'] }
  });
  assert.equal(r.ok, true);
  assert.equal(s.getItem(P.KEY), bruto);
  assert.equal(P.guardarConsentimento(s, { confirma: false }).motivo, 'sem_consentimento');
  assert.equal(P.decidirLogin({ metodo: 'email', senha: 'nao-usar' }).motivo, 'credencial_recusada');
  assert.equal(P.decidirLogin({ metodo: 'email' }).enviou, false);
  assert.equal(P.decidirLogin({ metodo: 'email' }).motivo, 'smtp_pendente');
  assert.equal(P.decidirLogin({ metodo: 'google' }).motivo, 'aguardando_projeto_autorizado');
  assert.equal(P.decidirLogin({}).motivo, 'sem_projeto');
  assert.equal(P.planoSupabasePermitido('free').backupGerenciado, false);
  assert.equal(P.planoSupabasePermitido('free').regiaoPretendida, 'sa-east-1');
  assert.equal(P.planoSupabasePermitido('pro').motivo, 'plano_nao_permitido');
  assert.equal(P.planoSupabasePermitido('pitr').ok, false);
  const fonte = fs.readFileSync(path.join(__dirname, '..', 'persistencia.js'), 'utf8');
  assert.equal(fonte.includes('fetch('), false);
  assert.equal(fonte.includes('smtp.'), false);
});
