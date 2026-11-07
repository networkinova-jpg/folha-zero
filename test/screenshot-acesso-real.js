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
  if (!/bloqueado neste teste de login/.test(snap)) throw new Error('snapshot: ' + snap);
  if (!(await page.locator('#btn-google').isEnabled())) throw new Error('google desabilitado fora da origem publicada');
  await page.locator('main').screenshot({ path: '/opt/cursor/artifacts/folha-zero-acesso-teste-mobile.png' });
  if (await page.locator('#btn-enviar').isEnabled()) throw new Error('envio habilitado sem sessao e sem tabela');
  if (chamadas.length) throw new Error('houve signup: ' + chamadas.length);
  await browser.close();
  srv.close();
  console.log('ok');
})().catch((e) => { console.error(e); process.exit(1); });
