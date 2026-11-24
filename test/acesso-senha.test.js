const test = require('node:test');
const assert = require('node:assert/strict');
const senha = require('../acesso-senha.js');

test('e-mail inválido e senha curta não chamam o projeto', async () => {
  let chamadas = 0;
  const cliente = { auth: { signInWithPassword() { chamadas += 1; return Promise.resolve({ data: {}, error: null }); } } };
  const vazio = senha.classificarEntrada('', '123456');
  assert.equal(vazio.motivo, 'email_invalido');
  assert.equal(senha.classificarEntrada('sem-arroba', '123456').motivo, 'email_invalido');
  assert.equal(senha.classificarEntrada('a@b', '123456').motivo, 'email_invalido');
  assert.equal(senha.classificarEntrada('pessoa@example.invalid', '12345').motivo, 'senha_curta');
  assert.equal(senha.classificarEntrada('pessoa@example.invalid', '123456').ok, true);
  const curto = await senha.entrar(cliente, 'pessoa@example.invalid', '12345');
  assert.equal(curto.motivo, 'senha_curta');
  assert.equal(curto.mensagem, 'A senha precisa ter pelo menos 6 caracteres.');
  const email = await senha.entrar(cliente, 'pessoa', '123456');
  assert.equal(email.mensagem, 'Digite um e-mail válido.');
  assert.equal(chamadas, 0);
  assert.equal(senha.mensagem('email_invalido').includes('\u2014'), false);
  assert.equal(senha.mensagem('senha_curta').includes('\u2014'), false);
});

test('credencial, confirmação e rede têm frase própria', async () => {
  assert.equal(senha.motivoDoErro({ code: 'invalid_credentials', message: 'Invalid login credentials' }), 'credencial_invalida');
  assert.equal(senha.motivoDoErro({ code: 'email_not_confirmed', message: 'Email not confirmed' }), 'confirmacao_pendente');
  assert.equal(senha.motivoDoErro(new TypeError('Failed to fetch')), 'rede');
  assert.equal(senha.motivoDoErro({ status: 503, message: 'timeout' }), 'rede');
  assert.equal(senha.motivoDoErro({ code: 'weak_password', message: 'Password should be at least 6 characters' }), 'senha_curta');
  const cliente = {
    auth: {
      signInWithPassword() { return Promise.resolve({ data: null, error: { code: 'invalid_credentials', message: 'Invalid login credentials' } }); }
    }
  };
  const ruim = await senha.entrar(cliente, 'pessoa@example.invalid', '123456');
  assert.equal(ruim.mensagem, 'E-mail ou senha não conferem.');
  const rede = {
    auth: { signInWithPassword() { return Promise.reject(new TypeError('Failed to fetch')); } }
  };
  const caiu = await senha.entrar(rede, 'pessoa@example.invalid', '123456');
  assert.equal(caiu.motivo, 'rede');
  assert.equal(caiu.mensagem, 'Não foi possível falar com o projeto. Tente de novo.');
  const pendente = {
    auth: { signInWithPassword() { return Promise.resolve({ data: { user: { email_confirmed_at: null }, session: null }, error: null }); } }
  };
  const falta = await senha.entrar(pendente, 'pessoa@example.invalid', '123456');
  assert.equal(falta.motivo, 'confirmacao_pendente');
  assert.equal(falta.mensagem, 'Falta confirmar o e-mail. Veja a caixa de entrada.');
});

test('criar conta e recuperar senha voltam para a página atual', async () => {
  const location = new URL('https://wild-voice-4f08.folha-zero-networkinova.workers.dev/acesso-teste?code=nao-usar#token');
  let cadastro;
  let recuperacao;
  const cliente = {
    auth: {
      signUp(args) { cadastro = args; return Promise.resolve({ data: { user: {}, session: null }, error: null }); },
      resetPasswordForEmail(email, opcoes) { recuperacao = { email, opcoes }; return Promise.resolve({ error: null }); }
    }
  };
  const criada = await senha.criarConta(cliente, 'Pessoa@Example.invalid', '12345', location);
  assert.equal(criada.motivo, 'senha_curta');
  assert.equal(cadastro, undefined);
  const ok = await senha.criarConta(cliente, 'Pessoa@Example.invalid', '123456', location);
  assert.equal(ok.motivo, 'cadastro_enviado');
  assert.equal(ok.mensagem, 'Enviamos a confirmação para o seu e-mail. Abra o link para concluir a conta.');
  assert.equal(cadastro.options.emailRedirectTo, 'https://wild-voice-4f08.folha-zero-networkinova.workers.dev/acesso-teste');
  assert.equal(cadastro.email, 'Pessoa@Example.invalid');
  const recuperada = await senha.recuperarSenha(cliente, 'pessoa@example.invalid', location);
  assert.equal(recuperada.motivo, 'recuperacao_enviada');
  assert.equal(recuperacao.opcoes.redirectTo, 'https://wild-voice-4f08.folha-zero-networkinova.workers.dev/acesso-teste');
  assert.equal(recuperada.mensagem.includes('\u2014'), false);
});
