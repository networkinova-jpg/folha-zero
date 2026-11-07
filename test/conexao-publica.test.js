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
  assert.equal(j.external.google, true);
  assert.equal(j.external.github, false);
  const tela = fs.readFileSync(path.join(__dirname, '..', 'acesso-teste.js'), 'utf8');
  assert.equal(tela.includes("flowType: 'pkce'"), true);
  assert.equal(tela.includes('enviarCopiaAutorizada'), false);
  assert.equal(tela.includes('folhazero_v1'), false);
  const login = fs.readFileSync(path.join(__dirname, '..', 'login-google.js'), 'utf8');
  assert.equal(login.includes('signUp'), false);
  assert.equal(login.includes('folhazero_v1'), false);
  assert.equal(login.includes('networkinova-jpg.github.io'), true);
  const tabela = await fetch(cfg.url + '/rest/v1/snapshots_privados?select=id&limit=0', { headers });
  assert.equal(tabela.status, 401);
  const fixture = await fetch(cfg.url + '/rest/v1/copias_fixture_teste?select=id&limit=0', { headers });
  assert.equal(fixture.status, 401);
  const corpo = await fixture.json();
  assert.equal(corpo.code, '42501');
  const privado = await fetch(cfg.url + '/rest/v1/rpc/fixture_canonica', {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json', 'Content-Profile': 'private' }, headers),
    body: '{}'
  });
  assert.equal(privado.status, 406);
});
