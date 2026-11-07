const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const raiz = path.join(__dirname, '..');

function carro(parcial) {
  return Object.assign({
    empresa: 'Concept Blindados', setor: 'Tapeçaria', veiculo: 'Carro Exemplo',
    valor: 100, ajudante: null, obs: 'dado ficticio de teste', pausas: [], updatedAt: 1
  }, parcial);
}

function base(entries) {
  return {
    version: 2,
    entries,
    quinzenas: {},
    descontos: {},
    settings: { operador: 'Pessoa Exemplo', setorOperador: 'Tapeçaria', lastBackup: null, valorPadrao: {}, aliquota: {} }
  };
}

function carregar(dados) {
  const html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'http://127.0.0.1:8765/index.html', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  const chamadas = [];
  w.fetch = async (url) => {
    chamadas.push(String(url));
    throw new Error('rede bloqueada no teste');
  };
  w.localStorage.setItem('folhazero_v1', JSON.stringify(dados));
  w.eval(fs.readFileSync(path.join(raiz, 'persistencia.js'), 'utf8'));
  let src = fs.readFileSync(path.join(raiz, 'app.js'), 'utf8').replace(
    /const CONTADOR_URL = '[^']*';/,
    "const CONTADOR_URL = '';"
  );
  src += `
;globalThis.EMPRESAS = EMPRESAS;
globalThis.SETORES = SETORES;
globalThis.MOTIVO_FIM = MOTIVO_FIM;
globalThis.reabrir = reabrir;
globalThis.carregarJsQR = carregarJsQR;
globalThis.CONTADOR_URL = CONTADOR_URL;
globalThis.RPER = RPER;
globalThis.renderRelMes = renderRelMes;
globalThis.fatiasDoMes = fatiasDoMes;
globalThis.duracaoUtil = duracaoUtil;
globalThis.DB = DB;
globalThis.gerarPdfRelatorio = gerarPdfRelatorio;
`;
  try { w.eval(src); }
  catch (e) { throw new Error('app.js falhou ao carregar: ' + (e && e.stack || e)); }
  w.__chamadas = chamadas;
  return w;
}

function fixture() {
  return base([
    carro({
      id: 'carro-a', os: 'OS-TESTE-001', dataInicio: '2026-11-01', horaInicio: '08:00',
      dataTermino: '2026-11-03', horaTermino: '18:00', situacao: 'Finalizado', updatedAt: 1,
      pausas: [
        { motivo: 'Fim de expediente', inicio: '2026-11-01T18:00', fim: '2026-11-02T08:00' },
        { motivo: 'Faltando peça', inicio: '2026-11-02T10:00', fim: '2026-11-02T11:00' }
      ]
    }),
    carro({
      id: 'carro-b', os: 'OS-TESTE-002', empresa: 'Marc Blindagem', setor: 'Qualidade',
      dataInicio: '2026-11-20', horaInicio: '08:00', dataTermino: '2026-11-30', horaTermino: '12:00',
      situacao: 'Finalizado', updatedAt: 2
    }),
    carro({
      id: 'carro-e', os: 'OS-TESTE-003', empresa: 'EB Blindados', setor: 'Steel',
      dataInicio: '2026-11-09', horaInicio: '08:00', dataTermino: '2026-11-10', horaTermino: '18:00',
      situacao: 'Finalizado', updatedAt: 3
    }),
    carro({
      id: 'carro-c', os: 'OS-TESTE-004', empresa: 'EB Blindados', setor: 'Aço Maçaneta',
      dataInicio: '2026-11-04', dataTermino: null, horaInicio: null, horaTermino: null,
      situacao: 'Faltando peça', updatedAt: 4
    }),
    carro({
      id: 'carro-d', os: 'OS-TESTE-005', empresa: 'VRZ Blindados', setor: 'Tapeçaria',
      dataInicio: '2026-10-20', dataTermino: null, horaInicio: null, horaTermino: null,
      situacao: 'Em processo', updatedAt: 5
    }),
    carro({
      id: 'carro-f', os: 'OS-TESTE-006', empresa: 'Carbon Blindados', setor: 'Steel',
      dataInicio: '2026-11-20', dataTermino: null, horaInicio: null, horaTermino: null,
      situacao: 'Faltando vidro', updatedAt: 6
    })
  ]);
}

function situacao(w, nome) {
  const bloco = [...w.document.querySelectorAll('#rm-situacoes .sit-cnt')].find(el => el.textContent.includes(nome));
  assert.ok(bloco, nome);
  return bloco.querySelector('b').textContent;
}

test('catálogo v19 permanece: 7 empresas e 13 setores, com QR, pausa e reabertura', () => {
  const w = carregar(fixture());
  assert.equal(w.EMPRESAS.length, 7);
  assert.equal(w.SETORES.length, 13);
  assert.ok(w.EMPRESAS.includes('Marc Blindagem'));
  assert.ok(w.EMPRESAS.includes('EB Blindados'));
  assert.ok(w.SETORES.includes('Qualidade'));
  assert.ok(w.SETORES.includes('Aço Maçaneta'));
  assert.ok(w.SETORES.includes('Steel'));
  assert.equal(w.MOTIVO_FIM, 'Fim de expediente');
  assert.equal(typeof w.reabrir, 'function');
  assert.equal(typeof w.carregarJsQR, 'function');
  assert.equal(w.FolhaPersistencia.KEY, 'folhazero_v1');
  const fonte = fs.readFileSync(path.join(raiz, 'app.js'), 'utf8');
  assert.match(fonte, /CONTADOR_URL = 'https:\/\/script\.google\.com\/macros\/s\/AKfycbx21D_/);
  assert.equal(w.CONTADOR_URL, '');
  assert.deepEqual(w.__chamadas, []);
});

test('relatório do mês v19 conserva fim de expediente, e o mês é o padrão do seletor', () => {
  const w = carregar(fixture());
  const antes = w.localStorage.getItem('folhazero_v1');
  w.document.getElementById('rm-mes').value = '11';
  w.document.getElementById('rm-ano').value = '2026';
  w.renderRelMes();
  assert.equal(w.localStorage.getItem('folhazero_v1'), antes);
  assert.equal(w.RPER.modo, 'mes');
  assert.equal(w.document.querySelector('#rm-per-seg [data-modo="mes"]').classList.contains('active'), true);
  assert.equal(w.document.getElementById('rm-per-intervalo').textContent, 'Período: 01/11 a 30/11');
  assert.equal(/Semana \d+ de \d+/.test(w.document.getElementById('rm-periodo-card').textContent), false);
  assert.equal(w.document.getElementById('rm-per-prev').disabled, true);
  assert.equal(w.document.getElementById('rm-per-next').disabled, true);
  const linhas = [...w.document.querySelectorAll('#rm-semana .wk-row')].map(el => [el.querySelector('span').textContent, el.querySelector('b').textContent]);
  assert.deepEqual(linhas, [['Segunda', '1'], ['Terça', '2'], ['Quarta', '0'], ['Quinta', '0'], ['Sexta', '0'], ['Sábado', '0'], ['Domingo', '0']]);
  assert.equal(w.document.getElementById('rm-n').textContent, '3');
  assert.equal(situacao(w, 'Finalizado'), '3');
  assert.equal(situacao(w, 'Faltando peça'), '1');
  assert.equal(situacao(w, 'Em processo'), '1');
  assert.equal(situacao(w, 'Faltando vidro'), '1');
  assert.equal(w.document.getElementById('rm-sit-hint').textContent.includes('finalizados no mês'), true);
  assert.equal(w.document.getElementById('rm-pausa').textContent, '1h');
  assert.equal(w.document.getElementById('rm-fora').textContent, '14h');
  const util = w.duracaoUtil(w.DB.entries.find(e => e.id === 'carro-a'));
  assert.equal(util.util, true);
  assert.equal(util.fora, 840);
  assert.equal(util.min, 2640);
  assert.equal(w.gerarPdfRelatorio.toString().includes('RPER'), false);
  assert.equal(/[—–]/.test(w.document.getElementById('rm-periodo-card').textContent), false);
});

test('semana e quinzena filtram o gráfico e a situação sem mudar o resumo mensal', () => {
  const w = carregar(fixture());
  w.document.getElementById('rm-mes').value = '11';
  w.document.getElementById('rm-ano').value = '2026';
  const fatias = w.fatiasDoMes(2026, 11);
  assert.equal(fatias.semanas.length, 6);
  assert.equal(fatias.semanas[1].ini, '2026-11-02');
  assert.equal(fatias.semanas[1].fim, '2026-11-08');
  assert.equal(fatias.quinzenas[0].qual, '1ª');
  assert.equal(fatias.quinzenas[1].qual, '2ª');
  w.RPER.modo = 'semana';
  w.RPER.idx = 1;
  w.renderRelMes();
  assert.equal(w.document.getElementById('rm-per-intervalo').textContent, 'Período: 02/11 a 08/11');
  assert.equal(/Semana \d+ de \d+/.test(w.document.body.textContent), false);
  const terca = [...w.document.querySelectorAll('#rm-semana .wk-row')].find(el => el.querySelector('span').textContent === 'Terça');
  assert.equal(terca.querySelector('b').textContent, '1');
  assert.equal(w.document.getElementById('rm-n').textContent, '3');
  assert.equal(situacao(w, 'Finalizado'), '1');
  assert.equal(situacao(w, 'Faltando vidro'), '0');
  assert.equal(situacao(w, 'Faltando peça'), '1');
  w.document.getElementById('rm-per-prev').click();
  assert.equal(w.document.getElementById('rm-per-intervalo').textContent, 'Período: 01/11 a 01/11');
  assert.equal(w.document.getElementById('rm-per-prev').disabled, true);
  w.document.querySelector('#rm-per-seg [data-modo="quinzena"]').click();
  assert.equal(w.document.getElementById('rm-per-intervalo').textContent, '1ª quinzena: 01/11 a 15/11');
  assert.equal(situacao(w, 'Finalizado'), '2');
  assert.equal(situacao(w, 'Faltando vidro'), '0');
  assert.equal(w.document.getElementById('rm-n').textContent, '3');
  w.document.getElementById('rm-per-next').click();
  assert.equal(w.document.getElementById('rm-per-intervalo').textContent, '2ª quinzena: 16/11 a 30/11');
  assert.equal(situacao(w, 'Finalizado'), '1');
  assert.equal(situacao(w, 'Faltando vidro'), '1');
  assert.equal(w.document.getElementById('rm-prod').textContent.includes('min') || w.document.getElementById('rm-prod').textContent.includes('h') || w.document.getElementById('rm-prod').textContent.includes('dia'), true);
});

test('reabrir preserva OS, valor e pausas e continua na mesma chave', async () => {
  const w = carregar(fixture());
  const promessa = w.reabrir('carro-a');
  const botao = [...w.document.querySelectorAll('#m-actions button')].find(b => b.textContent.includes('Reabrir'));
  botao.click();
  assert.equal(await promessa, true);
  const e = w.DB.entries.find(x => x.id === 'carro-a');
  assert.equal(e.dataTermino, null);
  assert.equal(e.os, 'OS-TESTE-001');
  assert.equal(e.valor, 100);
  assert.equal(e.pausas.length, 2);
  assert.equal(e.situacao, 'Em processo');
  const guardado = JSON.parse(w.localStorage.getItem('folhazero_v1'));
  assert.equal(guardado.entries.find(x => x.id === 'carro-a').os, 'OS-TESTE-001');
  assert.equal(w.localStorage.getItem('folhazero_v1_apagado'), null);
  assert.deepEqual(w.__chamadas, []);
});
