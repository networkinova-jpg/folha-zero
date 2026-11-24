const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const script = fs.readFileSync(path.join(raiz, 'pausa-almoco-teste.js'), 'utf8');
const app = fs.readFileSync(path.join(raiz, 'app.js'), 'utf8');
const teste = fs.readFileSync(path.join(raiz, 'app-teste.html'), 'utf8');
const index = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');

test('o app de teste oferece Almoço/café sem mexer no aplicativo publicado', () => {
  assert.equal(script.includes('Almoço/café'), true);
  assert.equal(script.includes('foraMin'), true);
  assert.equal(script.includes('FOLHA_ZERO_MODO_TESTE'), true);
  assert.equal(script.includes('folhazero_v1'), false);
  assert.equal(script.includes('\u2014'), false);
  assert.equal(app.includes('Almoço/café'), false);
  assert.equal(app.includes('Fim de expediente'), true);
  assert.equal(teste.includes('pausa-almoco-teste.js'), true);
  assert.equal(index.includes('pausa-almoco-teste.js'), false);
  assert.equal(index.includes('Almoço/café'), false);
});
