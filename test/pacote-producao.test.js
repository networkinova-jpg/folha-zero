const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const raiz = path.join(__dirname, '..');
const SITE = 'https://networkinova-jpg.github.io/folha-zero/';

function assetsDoWorker() {
  const sw = fs.readFileSync(path.join(raiz, 'sw.js'), 'utf8');
  const bloco = sw.match(/const ASSETS = \[([\s\S]*?)\];/);
  assert.ok(bloco);
  return [...bloco[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

function arquivoLocal(asset) {
  const rel = asset.replace(/^\.\//, '');
  return rel === '' ? 'index.html' : rel;
}

test('cada arquivo do service worker já está no site publicado ou entra no pacote', async () => {
  const assets = assetsDoWorker();
  const index = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
  const refs = [...index.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]).filter((s) => !/^https?:/.test(s));
  const conhecidos = new Set(assets.map(arquivoLocal));
  for (const ref of refs) assert.equal(conhecidos.has(ref), true, ref);
  const obrigatorios = new Map();
  const vistos = new Set();
  const conferir = assets.concat(['./sw.js']);
  for (const asset of conferir) {
    const rel = arquivoLocal(asset);
    if (vistos.has(rel)) continue;
    vistos.add(rel);
    const local = fs.readFileSync(path.join(raiz, rel));
    const resposta = await fetch(SITE + rel);
    const remoto = Buffer.from(await resposta.arrayBuffer());
    const igual = resposta.status === 200 && remoto.equals(local);
    if (!igual) obrigatorios.set(rel, resposta.status === 200 ? 'restaurar' : 'remover');
  }
  assert.equal(obrigatorios.get('persistencia.js'), 'remover');
  assert.equal(obrigatorios.get('acesso.js'), 'remover');
  assert.equal(obrigatorios.get('copia-conta.bundle.js'), 'remover');
  assert.equal(obrigatorios.get('folha-zero-config.js'), 'remover');
  assert.equal(obrigatorios.get('styles.css'), 'restaurar');
  assert.equal(obrigatorios.get('app.js'), 'restaurar');
  assert.equal(obrigatorios.get('index.html'), 'restaurar');
  assert.equal(obrigatorios.get('sw.js'), 'restaurar');
  assert.equal(obrigatorios.has('manifest.webmanifest'), false);
  assert.equal(obrigatorios.has('icons/icon-192.png'), false);
  assert.equal(obrigatorios.has('icons/icon-512.png'), false);
  assert.equal(obrigatorios.has('vendor/jspdf.umd.min.js'), false);
  assert.equal(obrigatorios.has('vendor/jsQR.js'), false);
  assert.equal([...obrigatorios.keys()].some((nome) => nome.includes('app-teste')), false);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'folha-pacote-'));
  for (const rel of obrigatorios.keys()) {
    const destino = path.join(dir, rel);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.copyFileSync(path.join(raiz, rel), destino);
  }
  const zip = '/opt/cursor/artifacts/folha-zero-integracao.zip';
  fs.mkdirSync(path.dirname(zip), { recursive: true });
  fs.rmSync(zip, { force: true });
  execFileSync('zip', ['-X', '-r', zip, '.'], { cwd: dir });
  const nomes = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).trim().split('\n').filter(Boolean).sort();
  assert.deepEqual(nomes, [...obrigatorios.keys()].sort());
  fs.writeFileSync('/opt/cursor/artifacts/folha-zero-integracao-arquivos.json', JSON.stringify({
    site: SITE,
    arquivos: [...obrigatorios.keys()].sort(),
    rollback: Object.fromEntries(obrigatorios)
  }, null, 2));
});
