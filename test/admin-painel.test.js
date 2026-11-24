const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const logica = require('../admin-painel-logica.js');

const html = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
const pagina = fs.readFileSync(path.join(__dirname, '..', 'admin-painel.js'), 'utf8');

test('sem sessão mostra a entrada e quem não é dono só vê a recusa', () => {
  assert.deepEqual(logica.vista(false, false, 'pedidos'), {
    entrada: true, recusa: false, painel: false, expirada: false, temporario: false, tela: 'entrada', botoes: []
  });
  const recusa = logica.vista(true, false, 'pedidos');
  assert.equal(recusa.recusa, true);
  assert.equal(recusa.painel, false);
  assert.equal(recusa.entrada, false);
  assert.deepEqual(recusa.botoes, ['sair']);
  const dono = logica.vista(true, true, 'convites');
  assert.equal(dono.painel, true);
  assert.equal(dono.tela, 'convites');
  assert.equal(logica.FRASE_RECUSA, 'Esta conta não é do proprietário.');
});

test('401 e JWT expirado são sessão expirada, recusa e rede ficam à parte', () => {
  assert.equal(logica.classificarErro({ status: 401, message: 'Unauthorized' }), 'sessao_expirada');
  assert.equal(logica.classificarErro({ code: 'PGRST301', message: 'JWT expired' }), 'sessao_expirada');
  assert.equal(logica.classificarErro({ message: 'JWT expirado' }), 'sessao_expirada');
  assert.equal(logica.classificarErro({ message: 'sessao_ausente', code: '42501' }), 'sessao_expirada');
  assert.equal(logica.classificarErro({ message: 'nao_proprietario', code: '42501' }), 'recusa');
  assert.equal(logica.classificarErro(new TypeError('Failed to fetch')), 'erro_temporario');
  const expirada = logica.vista(true, false, 'inicio', 'sessao_expirada');
  assert.equal(expirada.expirada, true);
  assert.equal(expirada.recusa, false);
  assert.equal(expirada.entrada, false);
  assert.equal(expirada.painel, false);
  assert.deepEqual(expirada.botoes, ['entrar', 'sair']);
  const temporario = logica.vista(true, true, 'inicio', 'erro_temporario');
  assert.equal(temporario.temporario, true);
  assert.equal(temporario.painel, false);
  assert.deepEqual(temporario.botoes, ['tentar']);
  assert.equal(logica.FRASE_EXPIRADA, 'Sua sessão expirou. Entre de novo com sua conta Google.');
  assert.equal(logica.FRASE_TEMPORARIO, 'Não foi possível conferir agora. Tente de novo.');
});

test('INOVA não entra na lista real e os contadores são só números', () => {
  assert.equal(logica.empresaAceita('INOVA Blindagem'), false);
  assert.equal(logica.empresaAceita('INOVA BLINDAGEM '), false);
  assert.equal(logica.empresaAceita('Inova  Blindagem'), false);
  assert.equal(logica.empresaAceita('  inova blindagem '), false);
  assert.equal(logica.empresaAceita('Oficina Norte'), true);
  assert.deepEqual(logica.contadores({ pedidos: 2, avulsos: 3, empresas: 1, vencem_7_dias: 4, pessoas_ativas: 5, carros_lancados: 9 }), {
    pedidos: 2, avulsos: 3, empresas: 1, vencem: 4, pessoas: 5, carros: 9
  });
  const pessoa = logica.pessoaVisivel({
    nome: '<b>Helena</b>', email: 'suspensa@example.invalid', ativa: false,
    ultimo_acesso: '2026-11-01', uid: 'secreto', user_id: 'x'
  });
  assert.deepEqual(Object.keys(pessoa).sort(), ['ativa', 'email', 'nome', 'ultimo']);
  assert.equal(pessoa.uid, undefined);
});

test('a página do painel fica fora do app publicado', () => {
  ['Entrada', 'Início', 'Pedidos', 'Pessoas avulsas', 'Empresas', 'Convites', 'Minha conta'].forEach((titulo) => {
    assert.equal(html.includes(titulo), true, titulo);
  });
  assert.equal(html.includes(logica.FRASE_RECUSA), true);
  assert.equal(html.includes('folhazero_v1'), false);
  assert.equal(html.includes('app.js'), false);
  assert.equal(html.includes('service_role'), false);
  assert.equal(pagina.includes('documento'), false);
  assert.equal(pagina.includes('painel_eu'), true);
  assert.equal(pagina.includes('folhazero_v1'), false);
  const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  assert.equal(index.includes('admin.html'), false);
  assert.equal(sw.includes('admin.html'), false);
  assert.equal(html.includes('Pessoas ativas'), true);
  assert.equal(html.includes('Entraram ou fizeram backup em 30 dias'), true);
  assert.equal(html.includes('Carros lançados'), true);
  assert.equal(html.includes('Somando os backups na nuvem'), true);
  assert.equal(html.includes('Pessoas cadastradas'), true);
  assert.equal(html.includes('<small style="display:block">Entraram ou fizeram backup em 30 dias</small>'), true);
  assert.equal(html.includes('<small style="display:block">Somando os backups na nuvem</small>'), true);
  assert.equal(html.includes(logica.FRASE_EXPIRADA), true);
  assert.equal(html.includes(logica.FRASE_TEMPORARIO), true);
  assert.equal(html.includes('Entrar de novo'), true);
  assert.equal(html.includes('Tentar de novo'), true);
  assert.equal(html.includes('id="btn-sair-recusa"'), true);
  assert.equal(pagina.includes('refreshSession'), true);
  assert.equal(pagina.includes("scope: 'local'"), true);
  assert.equal(pagina.includes('classificarErro'), true);
  assert.equal(pagina.includes('painel_listar_pessoas'), true);
  assert.equal(pagina.includes('nome.textContent'), true);
  assert.equal(pagina.includes('email.textContent'), true);
  assert.equal(pagina.includes('lista-pessoas') && pagina.includes('innerHTML'), false);
  assert.equal(html.includes('\u2014'), false);
  assert.equal(pagina.includes('\u2014'), false);
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20261114200000_painel_pessoas_ativas.sql'), 'utf8');
  assert.equal(sql.includes('perform private.painel_exigir_dono()'), true);
  assert.equal(sql.includes('security definer'), true);
  assert.equal(sql.includes('security invoker'), true);
  assert.equal(sql.includes("set search_path = ''"), true);
  assert.equal(sql.includes('pessoas_ativas'), true);
  assert.equal(sql.includes('carros_lancados'), true);
  assert.equal(sql.includes("'uid'"), false);
  assert.equal(sql.includes('documento ->'), true);
  const { JSDOM } = require('jsdom');
  const cartoes = new JSDOM(html);
  const dicas = [...cartoes.window.document.querySelectorAll('.num small')].map((el) => el.textContent);
  assert.deepEqual(dicas, ['Entraram ou fizeram backup em 30 dias', 'Somando os backups na nuvem']);
  assert.equal(cartoes.window.getComputedStyle(cartoes.window.document.querySelector('.num small')).display, 'block');
  const dom = new JSDOM('<div id="lista"></div>');
  const nome = dom.window.document.createElement('b');
  nome.textContent = '<img src=x onerror=alert(1)>';
  dom.window.document.getElementById('lista').appendChild(nome);
  assert.equal(dom.window.document.querySelector('img'), null);
  assert.equal(nome.textContent, '<img src=x onerror=alert(1)>');
});
