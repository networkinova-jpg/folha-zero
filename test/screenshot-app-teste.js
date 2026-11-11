const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const raiz = path.join(__dirname, '..');
const tipos = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

function servir() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]);
      const arquivo = path.join(raiz, rel === '/' ? '/app-teste.html' : rel);
      if (!arquivo.startsWith(raiz) || !fs.existsSync(arquivo) || fs.statSync(arquivo).isDirectory()) {
        res.writeHead(404); res.end('ausente'); return;
      }
      res.writeHead(200, { 'content-type': tipos[path.extname(arquivo)] || 'application/octet-stream', 'cache-control': 'no-store' });
      fs.createReadStream(arquivo).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

(async () => {
  const srv = await servir();
  const porta = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const proibidas = [];
  page.on('request', (req) => {
    const u = req.url();
    if (u.includes('script.google.com') || u.endsWith('/sw.js') || u.includes('/rest/v1/copias_fixture_teste') || u.includes('/rest/v1/snapshots_privados') || u.includes('backups_teste_app') || u.includes('backup_teste_gravar')) proibidas.push(u.split('?')[0]);
  });
  await page.goto('http://127.0.0.1:' + porta + '/app-teste.html', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => /OS-FIXTURE-02/.test(document.body.innerText) && /Armazenamento de teste/.test(document.body.innerText));
  await page.locator('#btn-previa-fixture').click();
  const previa = await page.textContent('#st-teste-previa');
  if (!/Nada foi gravado/.test(previa)) throw new Error('previa: ' + previa);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle' }),
    page.locator('#btn-confirmar-fixture').click()
  ]);
  await page.waitForFunction(() => /Lançamentos de teste recolocados/.test(document.body.innerText));
  const chaves = await page.evaluate(() => Object.keys(localStorage));
  if (chaves.includes('folhazero_v1')) throw new Error('leu o aplicativo');
  if (!chaves.includes('folhazero_teste_app')) throw new Error('sem armazenamento de teste');
  if (!chaves.includes('folhazero_teste_app_copia')) throw new Error('sem copia local');
  if (chaves.includes('folhazero_contador')) throw new Error('contador real');
  if (await page.locator('#btn-teste-enviar').isEnabled()) throw new Error('envio habilitado fora do site isolado');
  if (await page.locator('#btn-backup-variavel').isEnabled()) throw new Error('backup variavel habilitado');
  if (await page.locator('#btn-backup-previa').isEnabled()) throw new Error('previa variavel habilitada');
  if (await page.locator('#btn-backup-confirmar').isEnabled()) throw new Error('confirmacao variavel habilitada');
  if (!/site isolado/.test(await page.textContent('#st-backup-variavel'))) throw new Error('aviso do backup ausente');
  await page.locator('#card-modo-teste').screenshot({ path: '/opt/cursor/artifacts/folha-zero-app-teste-mobile.png' });
  await page.locator('#view-painel').screenshot({ path: '/opt/cursor/artifacts/folha-zero-app-teste-painel-mobile.png' });
  if (proibidas.length) throw new Error('chamada proibida: ' + proibidas.join(','));
  await browser.close();
  srv.close();
  console.log('ok');
})().catch((e) => { console.error(e); process.exit(1); });
