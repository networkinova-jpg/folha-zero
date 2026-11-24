const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const raiz = path.join(__dirname, '..');
const tipos = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.txt': 'text/plain' };

function servir() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const u = decodeURIComponent(req.url.split('?')[0]);
      const rel = u === '/' ? '/index.html' : u;
      const arquivo = path.join(raiz, rel);
      if (!arquivo.startsWith(raiz) || !fs.existsSync(arquivo) || fs.statSync(arquivo).isDirectory()) {
        res.writeHead(404); res.end('ausente'); return;
      }
      res.writeHead(200, { 'content-type': tipos[path.extname(arquivo)] || 'application/octet-stream', 'cache-control': 'no-store' });
      fs.createReadStream(arquivo).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

function dados() {
  const base = (parcial) => Object.assign({
    empresa: 'Concept Blindados', setor: 'Tapeçaria', veiculo: 'Carro Exemplo', valor: 100, ajudante: null,
    obs: '', pausas: [], situacao: 'Finalizado'
  }, parcial);
  return {
    version: 2,
    entries: [
      base({ id: 's1', os: 'OS-TESTE-101', dataInicio: '2026-11-02', horaInicio: '08:00', dataTermino: '2026-11-03', horaTermino: '18:00' }),
      base({ id: 's2', os: 'OS-TESTE-102', dataInicio: '2026-11-03', horaInicio: '08:00', dataTermino: '2026-11-04', horaTermino: '16:00', empresa: 'EB Blindados', setor: 'Qualidade' }),
      base({ id: 's3', os: 'OS-TESTE-103', dataInicio: '2026-11-04', dataTermino: null, horaInicio: null, horaTermino: null, situacao: 'Faltando peça', setor: 'Aço Maçaneta' })
    ],
    quinzenas: {},
    descontos: {},
    settings: { operador: 'Pessoa Exemplo', setorOperador: 'Tapeçaria', lastBackup: null, valorPadrao: {}, aliquota: {} }
  };
}

(async () => {
  const srv = await servir();
  const porta = srv.address().port;
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    recordVideo: { dir: '/tmp/fz-video', size: { width: 390, height: 844 } }
  });
  await context.addInitScript((doc) => {
    localStorage.setItem('folhazero_v1', JSON.stringify(doc));
    const d = new Date();
    const hoje = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    localStorage.setItem('folhazero_contador', JSON.stringify({
      id: 'fz-' + 'ab'.repeat(12), cadastro: '2026-01-01T00:00:00.000Z', uso: hoje, enviado: 'Pessoa Exemplo|Tapeçaria'
    }));
  }, dados());
  await context.route('**/*', route => {
    const u = route.request().url();
    if (u.includes('script.google.com') || u.includes('supabase.co') || u.includes('googleusercontent.com')) return route.abort();
    return route.continue();
  });
  const page = await context.newPage();
  const bloqueadas = [];
  page.on('request', req => {
    const u = req.url();
    if (u.includes('script.google.com') || u.includes('supabase.co')) bloqueadas.push(u);
  });
  await page.goto('http://127.0.0.1:' + porta + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.click('button[data-view="relatorios"]');
  await page.click('#r-tab-mes');
  await page.selectOption('#rm-mes', '11');
  await page.selectOption('#rm-ano', '2026');
  await page.waitForSelector('#rm-per-intervalo');
  await page.locator('#rm-periodo-card').scrollIntoViewIfNeeded();
  const mes = await page.textContent('#rm-per-intervalo');
  if (mes !== 'Período: 01/11 a 30/11') throw new Error('mês inesperado: ' + mes);
  await page.waitForTimeout(900);
  await page.click('#rm-per-seg [data-modo="semana"]');
  for (let i = 0; i < 6; i++) {
    const t = await page.textContent('#rm-per-intervalo');
    if (t === 'Período: 02/11 a 08/11') break;
    await page.click('#rm-per-next');
  }
  const semana = await page.textContent('#rm-per-intervalo');
  const card = await page.textContent('#rm-periodo-card');
  if (semana !== 'Período: 02/11 a 08/11') throw new Error('semana inesperada: ' + semana);
  if (/Semana \d+ de \d+/.test(card)) throw new Error('rótulo antigo ainda presente');
  await page.locator('#rm-periodo-card').scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  await page.locator('#rm-periodo-card').screenshot({ path: '/opt/cursor/artifacts/folha-zero-seletor-semana-mobile.png' });
  await page.click('#rm-per-seg [data-modo="quinzena"]');
  const q1 = await page.textContent('#rm-per-intervalo');
  if (q1 !== '1ª quinzena: 01/11 a 15/11') throw new Error('quinzena inesperada: ' + q1);
  await page.locator('#rm-periodo-card').screenshot({ path: '/opt/cursor/artifacts/folha-zero-seletor-quinzena-mobile.png' });
  await page.waitForTimeout(900);
  const video = page.video();
  await context.close();
  const destino = '/opt/cursor/artifacts/folha-zero-seletor-mobile.webm';
  await video.saveAs(destino);
  await browser.close();
  srv.close();
  if (bloqueadas.length) throw new Error('rede real chamada: ' + bloqueadas.join(','));
  console.log('ok', semana, q1);
})().catch(e => { console.error(e); process.exit(1); });
