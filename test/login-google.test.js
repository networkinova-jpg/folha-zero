const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const login = require('../login-google.js');

const PROJETO = 'https://vyxfjdhhlzluwfesxgra.supabase.co';
const PAGINA = 'https://folha-teste.pages.dev/acesso-teste.html';

function clienteCom(responder) {
  const chamadas = [];
  return {
    chamadas,
    supabaseUrl: PROJETO,
    auth: {
      signInWithOAuth: async (args) => {
        chamadas.push(args);
        return responder(args);
      }
    }
  };
}

function urlGoogle(redirectTo) {
  const u = new URL(PROJETO + '/auth/v1/authorize');
  u.searchParams.set('provider', 'google');
  u.searchParams.set('redirect_to', redirectTo);
  return u.toString();
}

test('o clique inicia o OAuth do Google com retorno só da própria página', async () => {
  const dom = new JSDOM('<button id="btn-google" type="button">Entrar com Google</button>', { url: PAGINA + '?next=https://evil.example/roubo' });
  const lidos = [];
  dom.window.localStorage.getItem = (k) => { lidos.push(k); return null; };
  const cliente = clienteCom((args) => ({ data: { url: urlGoogle(args.options.redirectTo) }, error: null }));
  let destino = null;
  dom.window.document.getElementById('btn-google').addEventListener('click', () => {
    return login.iniciarGoogle(cliente, dom.window.location, (url) => { destino = url; });
  });
  dom.window.document.getElementById('btn-google').click();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(cliente.chamadas.length, 1);
  assert.equal(cliente.chamadas[0].provider, 'google');
  assert.equal(cliente.chamadas[0].options.skipBrowserRedirect, true);
  assert.equal(cliente.chamadas[0].options.redirectTo, PAGINA);
  assert.equal(destino, urlGoogle(PAGINA));
  assert.equal(lidos.includes('folhazero_v1'), false);
  assert.equal(JSON.stringify(cliente.chamadas).includes('script.google.com'), false);
  assert.equal(JSON.stringify(cliente.chamadas).includes('signUp'), false);
});

test('a origem publicada não chama o OAuth', async () => {
  const cliente = clienteCom(() => ({ data: { url: urlGoogle('https://networkinova-jpg.github.io/folha-zero/acesso-teste.html') }, error: null }));
  let destino = null;
  const r = await login.iniciarGoogle(cliente, new URL('https://networkinova-jpg.github.io/folha-zero/acesso-teste.html'), (url) => { destino = url; });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, 'origem_producao');
  assert.equal(cliente.chamadas.length, 0);
  assert.equal(destino, null);
});

test('recusa destino fora do projeto e retorno trocado', async () => {
  const location = new URL(PAGINA);
  const externo = clienteCom(() => ({ data: { url: 'https://evil.example/auth/v1/authorize?provider=google&redirect_to=' + encodeURIComponent(PAGINA) }, error: null }));
  let destino = null;
  const a = await login.iniciarGoogle(externo, location, (url) => { destino = url; });
  assert.equal(a.ok, false);
  assert.equal(a.motivo, 'destino_recusado');
  assert.equal(destino, null);

  destino = null;
  const trocado = clienteCom(() => ({ data: { url: urlGoogle('https://evil.example/callback') }, error: null }));
  const b = await login.iniciarGoogle(trocado, location, (url) => { destino = url; });
  assert.equal(b.ok, false);
  assert.equal(destino, null);
});

test('erro de retorno não mostra token e a URL fica só na página', () => {
  const segredo = 'access_token=segredo-nao-mostrar';
  const href = PAGINA + '?error=access_denied&error_description=' + encodeURIComponent(segredo) + '&code=codigo-nao-mostrar#access_token=outro-segredo';
  const msg = login.erroVisivelNaUrl(href);
  assert.equal(msg, 'Entrada cancelada no Google. Nenhum token foi mostrado.');
  assert.equal(msg.includes('segredo'), false);
  assert.equal(msg.includes('codigo'), false);
  assert.equal(msg.includes('access_token'), false);
  assert.equal(login.limparUrl(href), PAGINA);
  const falha = login.mensagemDeSessao(PAGINA + '?code=codigo-nao-mostrar', null, null);
  assert.equal(falha.includes('codigo-nao-mostrar'), false);
  assert.match(falha, /sessão não foi criada/);
  const ok = login.mensagemDeSessao(PAGINA, 'usuario', null);
  assert.equal(ok, 'Sessão iniciada neste navegador.');
  assert.equal(ok.includes('usuario'), false);
});
