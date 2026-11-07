const test = require('node:test');
const assert = require('node:assert/strict');
const Pol = require('../supabase/politica-modelo.js');

const estado = {
  membros: [
    { orgId: 'alfa', userId: 'ana', papel: 'prestador', setor: 'Setor Exemplo A', status: 'ativo' },
    { orgId: 'alfa', userId: 'bruno', papel: 'equipe', setor: 'Setor Exemplo A', status: 'ativo' },
    { orgId: 'alfa', userId: 'carla', papel: 'gerente', setor: '', status: 'ativo' },
    { orgId: 'beta', userId: 'diego', papel: 'gerente', setor: '', status: 'ativo' },
    { orgId: 'alfa', userId: 'eva', papel: 'equipe', setor: 'Setor Exemplo B', status: 'revogado' }
  ],
  atribuicoes: [{ lancamentoId: 'carro-3', userId: 'bruno' }]
};

const pessoal = { id: 'carro-1', ownerId: 'ana', orgId: null, setor: 'Setor Exemplo A' };
const daOrg = { id: 'carro-2', ownerId: 'ana', orgId: 'alfa', setor: 'Setor Exemplo A' };
const outroSetor = { id: 'carro-3', ownerId: 'ana', orgId: 'alfa', setor: 'Setor Exemplo B' };
const daBeta = { id: 'carro-4', ownerId: 'diego', orgId: 'beta', setor: 'Setor Exemplo A' };
const valorAna = { lancamentoId: 'carro-2', ownerId: 'ana', valor: 123.45 };

test('valor privado só o dono lê', () => {
  assert.equal(Pol.podeLerValor(estado, { uid: 'ana' }, valorAna), true);
  assert.equal(Pol.podeLerValor(estado, { uid: 'carla' }, valorAna), false);
  assert.equal(Pol.podeLerValor(estado, { uid: 'bruno' }, valorAna), false);
  assert.equal(Pol.podeLerValor(estado, null, valorAna), false);
});

test('gerente vê a própria org e não a outra, equipe respeita setor e atribuição', () => {
  assert.equal(Pol.podeLerLancamento(estado, { uid: 'ana' }, pessoal), true);
  assert.equal(Pol.podeLerLancamento(estado, { uid: 'carla' }, pessoal), false);
  assert.equal(Pol.podeLerLancamento(estado, { uid: 'carla' }, daOrg), true);
  assert.equal(Pol.podeLerLancamento(estado, { uid: 'carla' }, daBeta), false);
  assert.equal(Pol.podeLerLancamento(estado, { uid: 'diego' }, daOrg), false);
  assert.equal(Pol.podeLerLancamento(estado, { uid: 'bruno' }, daOrg), true);
  assert.equal(Pol.podeLerLancamento(estado, { uid: 'bruno' }, outroSetor), true);
  assert.equal(Pol.podeLerLancamento(estado, { uid: 'eva' }, daOrg), false);
  assert.equal(Pol.podeLerLancamento(estado, { uid: 'bruno' }, pessoal), false);
});

test('ninguém se promove e só gerente revoga convite da própria org', () => {
  assert.equal(Pol.podeDefinirPapel(estado, { uid: 'bruno' }, { orgId: 'alfa', userId: 'bruno', papelNovo: 'gerente' }).motivo, 'proprio_papel');
  assert.equal(Pol.podeDefinirPapel(estado, { uid: 'bruno' }, { orgId: 'alfa', userId: 'ana', papelNovo: 'gerente' }).motivo, 'nao_e_gerente');
  assert.equal(Pol.podeDefinirPapel(estado, { uid: 'carla' }, { orgId: 'alfa', userId: 'carla', papelNovo: 'gerente' }).motivo, 'proprio_papel');
  assert.equal(Pol.podeDefinirPapel(estado, { uid: 'carla' }, { orgId: 'beta', userId: 'diego', papelNovo: 'equipe' }).motivo, 'nao_e_gerente');
  assert.equal(Pol.podeDefinirPapel(estado, { uid: 'carla' }, { orgId: 'alfa', userId: 'bruno', papelNovo: 'gerente' }).ok, true);
  assert.equal(Pol.podeRevogarConvite(estado, { uid: 'carla' }, { orgId: 'alfa' }), true);
  assert.equal(Pol.podeRevogarConvite(estado, { uid: 'bruno' }, { orgId: 'alfa' }), false);
  assert.equal(Pol.podeRevogarConvite(estado, { uid: 'carla' }, { orgId: 'beta' }), false);
});
