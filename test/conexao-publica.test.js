const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function config() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'acesso-teste-config.js'), 'utf8');
  const url = src.match(/url: "([^"]+)"/)[1];
  const publishableKey = src.match(/publishableKey: "([^"]+)"/)[1];
  return { url, publishableKey };
}

test('a tela usa só a chave publishable e o projeto responde sem criar conta', async () => {
  const cfg = config();
  assert.equal(cfg.publishableKey.startsWith('sb_publishable_'), true);
  assert.equal(/service_role/i.test(cfg.publishableKey), false);
  assert.equal(fs.readFileSync(path.join(__dirname, '..', 'acesso-teste.js'), 'utf8').includes('signUp'), false);
  const headers = { apikey: cfg.publishableKey, Authorization: 'Bearer ' + cfg.publishableKey };
  const saude = await fetch(cfg.url + '/auth/v1/health', { headers });
  assert.equal(saude.status, 200);
  const ajustes = await fetch(cfg.url + '/auth/v1/settings', { headers });
  assert.equal(ajustes.status, 200);
  const j = await ajustes.json();
  assert.equal(j.external.google, false);
  assert.equal(j.external.github, false);
  const tabela = await fetch(cfg.url + '/rest/v1/snapshots_privados?select=id&limit=0', { headers });
  assert.equal(tabela.status, 404);
});
