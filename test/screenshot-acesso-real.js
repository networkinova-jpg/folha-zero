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
      const arquivo = path.join(raiz, rel === '/' ? '/acesso-teste.html' : rel);
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
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const chamadas = [];
  page.on('request', (req) => {
    const u = req.url();
    if (u.includes('/signup') || u.includes('signUp') || u.includes('/otp')) chamadas.push(u.split('?')[0]);
  });
  await page.goto('http://127.0.0.1:' + porta + '/acesso-teste.html', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => /alcançado|Não foi possível|recusada/.test(document.getElementById('st-conexao').textContent));
  const conexao = await page.textContent('#st-conexao');
  const google = await page.textContent('#st-google');
  const email = await page.textContent('#st-email');
  const snap = await page.textContent('#st-snapshot');
  if (!/alcançado/.test(conexao)) throw new Error('conexao: ' + conexao);
  if (!/Google ligado no projeto/.test(google)) throw new Error('google: ' + google);
  if (!/Criar conta está desligado/.test(email)) throw new Error('email: ' + email);
  if (!/wild-voice-4f08/.test(snap)) throw new Error('snapshot: ' + snap);
  if (!(await page.locator('#btn-google').isEnabled())) throw new Error('google desabilitado fora da origem publicada');
  const posts = [];
  page.on('request', (req) => {
    if (req.method() === 'POST' && (req.url().includes('/rest/v1/snapshots_privados') || req.url().includes('/rest/v1/copias_fixture_teste'))) posts.push(req.url());
  });
  await page.locator('#btn-gerar').click();
  await page.locator('#btn-comparar').click();
  const copia = await page.textContent('#st-copia');
  const restauro = await page.textContent('#st-restauro');
  if (!/fictício/.test(copia)) throw new Error('copia: ' + copia);
  if (!/Integridade confere/.test(restauro)) throw new Error('restauro: ' + restauro);
  const chaves = await page.evaluate(() => Object.keys(localStorage));
  if (chaves.includes('folhazero_v1')) throw new Error('leu o aplicativo');
  if (!chaves.includes('folhazero_teste_fixture')) throw new Error('fixture ausente');
  if (await page.locator('#btn-enviar').isEnabled()) throw new Error('envio remoto habilitado');
  if (await page.locator('#btn-confirmar').count()) throw new Error('a tela oferece restaurar o aplicativo');
  await page.locator('main').screenshot({ path: '/opt/cursor/artifacts/folha-zero-acesso-teste-mobile.png' });
  if (posts.length) throw new Error('houve envio remoto');
  if (chamadas.length) throw new Error('houve signup: ' + chamadas.length);
  await browser.close();
  srv.close();
  console.log('ok');
})().catch((e) => { console.error(e); process.exit(1); });
