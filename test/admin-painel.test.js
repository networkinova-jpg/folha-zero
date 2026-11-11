const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const logica = require('../admin-painel-logica.js');

const html = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
const pagina = fs.readFileSync(path.join(__dirname, '..', 'admin-painel.js'), 'utf8');

test('sem sessão mostra a entrada e quem não é dono só vê a recusa', () => {
  assert.deepEqual(logica.vista(false, false, 'pedidos'), { entrada: true, recusa: false, painel: false, tela: 'entrada' });
  const recusa = logica.vista(true, false, 'pedidos');
  assert.equal(recusa.recusa, true);
  assert.equal(recusa.painel, false);
  assert.equal(recusa.entrada, false);
  const dono = logica.vista(true, true, 'convites');
  assert.equal(dono.painel, true);
  assert.equal(dono.tela, 'convites');
  assert.equal(logica.FRASE_RECUSA, 'Esta conta não é do proprietário.');
});

test('INOVA não entra na lista real e os contadores são só números', () => {
  assert.equal(logica.empresaAceita('INOVA Blindagem'), false);
  assert.equal(logica.empresaAceita('INOVA BLINDAGEM '), false);
  assert.equal(logica.empresaAceita('Inova  Blindagem'), false);
  assert.equal(logica.empresaAceita('  inova blindagem '), false);
  assert.equal(logica.empresaAceita('Oficina Norte'), true);
  assert.deepEqual(logica.contadores({ pedidos: 2, avulsos: 3, empresas: 1, vencem_7_dias: 4 }), {
    pedidos: 2, avulsos: 3, empresas: 1, vencem: 4
  });
});

test('a página do painel fica fora do app publicado', () => {
  ['Entrada', 'Início', 'Pedidos', 'Pessoas avulsas', 'Empresas', 'Convites', 'Minha conta'].forEach((titulo) => {
    assert.equal(html.includes(titulo), true, titulo);
  });
  assert.equal(html.includes(logica.FRASE_RECUSA), true);
  assert.equal(html.includes('folhazero_v1'), false);
  assert.equal(html.includes('app.js'), false);
  assert.equal(html.includes('service_role'), false);
  assert.equal(pagina.includes('documento'), false);
  assert.equal(pagina.includes('painel_eu'), true);
  assert.equal(pagina.includes('folhazero_v1'), false);
  const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  assert.equal(index.includes('admin.html'), false);
  assert.equal(sw.includes('admin.html'), false);
  assert.equal(html.includes('\u2014'), false);
  assert.equal(pagina.includes('\u2014'), false);
});
