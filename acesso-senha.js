/* E-mail e senha do site de teste. Não grava senha e não lê lançamentos. */
(function (root) {
  const MIN_SENHA = 6;

  function emailValido(email) {
    const texto = String(email || '').trim();
    if (!texto || texto.length > 320 || /\s/.test(texto)) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto);
  }

  function classificarEntrada(email, senha) {
    if (!emailValido(email)) return { ok: false, motivo: 'email_invalido' };
    if (String(senha || '').length < MIN_SENHA) return { ok: false, motivo: 'senha_curta' };
    return { ok: true, email: String(email).trim(), senha: String(senha) };
  }

  function classificarRecuperacao(email) {
    if (!emailValido(email)) return { ok: false, motivo: 'email_invalido' };
    return { ok: true, email: String(email).trim() };
  }

  function mensagem(motivo) {
    if (motivo === 'email_invalido') return 'Digite um e-mail válido.';
    if (motivo === 'senha_curta') return 'A senha precisa ter pelo menos 6 caracteres.';
    if (motivo === 'credencial_invalida') return 'E-mail ou senha não conferem.';
    if (motivo === 'confirmacao_pendente') return 'Falta confirmar o e-mail. Veja a caixa de entrada.';
    if (motivo === 'cadastro_enviado') return 'Enviamos a confirmação para o seu e-mail. Abra o link para concluir a conta.';
    if (motivo === 'recuperacao_enviada') return 'Se este e-mail tiver conta, enviamos o link para criar uma senha nova.';
    if (motivo === 'entrou') return 'Sessão iniciada.';
    if (motivo === 'rede') return 'Não foi possível falar com o projeto. Tente de novo.';
    return 'Não foi possível concluir. Tente de novo.';
  }

  function motivoDoErro(erro) {
    if (!erro) return 'outro';
    if (typeof erro === 'string') return motivoDoErro({ message: erro });
    const msg = String(erro.message || erro.msg || erro.error_description || '').toLowerCase();
    const code = String(erro.code || erro.error_code || erro.name || '').toLowerCase();
    const status = Number(erro.status != null ? erro.status : erro.statusCode);
    if (erro.name === 'TypeError' || code === 'authretryablefetcherror' || msg.includes('failed to fetch') || msg.includes('network') || status === 0) return 'rede';
    if (code === 'invalid_credentials' || msg.includes('invalid login') || msg.includes('invalid credentials')) return 'credencial_invalida';
    if (code === 'email_not_confirmed' || msg.includes('email not confirmed') || msg.includes('not confirmed')) return 'confirmacao_pendente';
    if (code === 'weak_password' || msg.includes('at least 6') || msg.includes('password should be')) return 'senha_curta';
    if (code === 'validation_failed' || msg.includes('unable to validate email') || msg.includes('invalid email')) return 'email_invalido';
    if (status >= 500) return 'rede';
    return 'outro';
  }

  function retornoDaPagina(location) {
    const u = new URL(location.href);
    return u.origin + u.pathname;
  }

  function resposta(motivo, ok) {
    return { ok: ok === true, motivo: motivo, mensagem: mensagem(motivo) };
  }

  async function entrar(cliente, email, senha) {
    const pedido = classificarEntrada(email, senha);
    if (!pedido.ok) return resposta(pedido.motivo, false);
    try {
      const { data, error } = await cliente.auth.signInWithPassword({ email: pedido.email, password: pedido.senha });
      if (error) return resposta(motivoDoErro(error) === 'outro' ? 'credencial_invalida' : motivoDoErro(error), false);
      const usuario = data && data.user;
      if (!data || !data.session) {
        if (usuario && usuario.email_confirmed_at == null && usuario.confirmed_at == null) return resposta('confirmacao_pendente', false);
        return resposta('confirmacao_pendente', false);
      }
      return resposta('entrou', true);
    } catch (erro) {
      return resposta(motivoDoErro(erro) === 'outro' ? 'rede' : motivoDoErro(erro), false);
    }
  }

  async function criarConta(cliente, email, senha, location) {
    const pedido = classificarEntrada(email, senha);
    if (!pedido.ok) return resposta(pedido.motivo, false);
    let redirectTo;
    try { redirectTo = retornoDaPagina(location); }
    catch (_) { return resposta('outro', false); }
    try {
      const { data, error } = await cliente.auth.signUp({
        email: pedido.email,
        password: pedido.senha,
        options: { emailRedirectTo: redirectTo }
      });
      if (error) return resposta(motivoDoErro(error) === 'outro' ? 'rede' : motivoDoErro(error), false);
      if (data && data.session) return resposta('entrou', true);
      return resposta('cadastro_enviado', true);
    } catch (erro) {
      return resposta(motivoDoErro(erro) === 'outro' ? 'rede' : motivoDoErro(erro), false);
    }
  }

  async function recuperarSenha(cliente, email, location) {
    const pedido = classificarRecuperacao(email);
    if (!pedido.ok) return resposta(pedido.motivo, false);
    let redirectTo;
    try { redirectTo = retornoDaPagina(location); }
    catch (_) { return resposta('outro', false); }
    try {
      const { error } = await cliente.auth.resetPasswordForEmail(pedido.email, { redirectTo: redirectTo });
      if (error) return resposta(motivoDoErro(error) === 'outro' ? 'rede' : motivoDoErro(error), false);
      return resposta('recuperacao_enviada', true);
    } catch (erro) {
      return resposta(motivoDoErro(erro) === 'outro' ? 'rede' : motivoDoErro(erro), false);
    }
  }

  const api = {
    MIN_SENHA, emailValido, classificarEntrada, classificarRecuperacao, mensagem, motivoDoErro,
    retornoDaPagina, entrar, criarConta, recuperarSenha
  };
  root.FolhaAcessoSenha = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
