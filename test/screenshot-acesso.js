const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const raiz = path.join(__dirname, '..');
const tipos = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.txt': 'text/plain' };

function servir() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]);
      const arquivo = path.join(raiz, rel === '/' ? '/index.html' : rel);
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
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, recordVideo: { dir: '/tmp/fz-acesso', size: { width: 390, height: 844 } } });
  await context.addInitScript(() => {
    const doc = { version: 2, entries: [], quinzenas: {}, descontos: {}, settings: { operador: 'Pessoa Exemplo', setorOperador: 'Tapeçaria', valorPadrao: {}, aliquota: {} } };
    localStorage.setItem('folhazero_v1', JSON.stringify(doc));
    const d = new Date();
    const hoje = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    localStorage.setItem('folhazero_contador', JSON.stringify({ id: 'fz-' + 'ab'.repeat(12), cadastro: '2026-01-01T00:00:00.000Z', uso: hoje, enviado: 'Pessoa Exemplo|Tapeçaria' }));
  });
  await context.route('**/*', route => {
    const u = route.request().url();
    if (u.includes('script.google.com') || u.includes('supabase.co')) return route.abort();
    return route.continue();
  });
  const page = await context.newPage();
  const bloqueadas = [];
  page.on('request', req => { const u = req.url(); if (u.includes('script.google.com') || u.includes('supabase.co')) bloqueadas.push(u); });
  await page.goto('http://127.0.0.1:' + porta + '/', { waitUntil: 'domcontentloaded' });
  await page.click('button[data-view="ajustes"]');
  await page.locator('#acesso-card').scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);
  const aviso = await page.textContent('#acesso-aviso');
  if (!/cartão Backup/.test(aviso)) throw new Error('aviso inesperado: ' + aviso);
  await page.locator('#acesso-card').screenshot({ path: '/opt/cursor/artifacts/folha-zero-acesso-desligado-mobile.png' });
  await page.evaluate(() => {
    const meta = FolhaAcesso.lerMeta(localStorage);
    FolhaAcesso.bootstrapProprietario(meta, { via: 'sql_do_titular', explicito: true, uid: 'uid-prop-teste' });
    meta.solicitacoes.push({ id: 'sol-1', nome: 'Pessoa Exemplo', email: 'pessoa.exemplo@example.invalid', papelPedido: 'gerente', status: 'pendente', orgNome: 'INOVA Blindagem' });
    meta.licencas.push({ id: 'lic-1', userId: 'uid-exemplo', tipo: 'degustacao', status: 'ativa', orgId: 'tenant-ficticio-inova' });
    FolhaAcesso.gravarMeta(localStorage, meta);
    window.FOLHA_ZERO_SESSAO = { papel: 'proprietario', verificadoNoServidor: true, origem: 'servidor', uid: 'uid-prop-teste' };
    renderAcesso();
  });
  await page.evaluate(() => {
    document.querySelector('.topbar').style.display = 'none';
    document.querySelector('.tabbar').style.display = 'none';
  });
  await page.locator('#acesso-card').scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const painel = await page.textContent('#acesso-card');
  if (!/não aparecem aqui/.test(painel)) throw new Error('painel sem aviso de separação');
  if (/OS-TESTE|R\$/.test(painel)) throw new Error('painel vazou dado privado');
  await page.locator('#acesso-card').screenshot({ path: '/opt/cursor/artifacts/folha-zero-painel-proprietario-mobile.png' });
  const video = page.video();
  await context.close();
  await video.saveAs('/opt/cursor/artifacts/folha-zero-acesso-mobile.webm');
  await browser.close();
  srv.close();
  if (bloqueadas.length) throw new Error('rede real: ' + bloqueadas.join(','));
  console.log('ok');
})().catch(e => { console.error(e); process.exit(1); });
