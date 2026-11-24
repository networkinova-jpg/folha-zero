/* Login Google da tela de teste.
   O retorno é sempre a própria página. Não aceita endereço vindo de campo ou query.
   A origem publicada do app fica bloqueada. Erros não mostram token. */
(function (root) {
  const ORIGEM_PRODUCAO = 'networkinova-jpg.github.io';
  function origemProducao(origem) {
    try {
      return new URL(origem).hostname === ORIGEM_PRODUCAO;
    } catch (_) {
      return true;
    }
  }

  function retornoDaPagina(location) {
    const u = new URL(location.href);
    return u.origin + u.pathname;
  }

  const PAGINAS_PRODUCAO = [
    'https://networkinova-jpg.github.io/folha-zero/',
    'https://networkinova-jpg.github.io/folha-zero/index.html'
  ];

  function podeIniciarGoogleProducao(location) {
    if (!location || !location.href) return { ok: false, motivo: 'sem_pagina' };
    let redirectTo;
    try { redirectTo = retornoDaPagina(location); }
    catch (_) { return { ok: false, motivo: 'pagina_invalida' }; }
    if (PAGINAS_PRODUCAO.indexOf(redirectTo) < 0) return { ok: false, motivo: 'origem_nao_autorizada' };
    return { ok: true, redirectTo };
  }

  function podeIniciarGoogle(location) {
    if (!location || !location.href) return { ok: false, motivo: 'sem_pagina' };
    if (origemProducao(location.origin)) return { ok: false, motivo: 'origem_producao' };
    let redirectTo;
    try { redirectTo = retornoDaPagina(location); }
    catch (_) { return { ok: false, motivo: 'pagina_invalida' }; }
    if (origemProducao(redirectTo)) return { ok: false, motivo: 'origem_producao' };
    return { ok: true, redirectTo };
  }

  function mensagemDeErro(codigo) {
    if (codigo === 'access_denied') return 'Entrada cancelada no Google. Nenhum token foi mostrado.';
    return 'Não foi possível entrar com o Google. Nenhum token foi mostrado.';
  }

  function erroVisivelNaUrl(href) {
    const u = new URL(href);
    const hash = new URLSearchParams((u.hash || '').replace(/^#/, ''));
    const erro = u.searchParams.get('error') || hash.get('error');
    const code = u.searchParams.get('error_code') || hash.get('error_code');
    if (!erro && !code) return null;
    return mensagemDeErro(erro || code);
  }

  function limparUrl(href) {
    return retornoDaPagina({ href });
  }

  function mensagemDeSessao(href, sessao, aviso) {
    if (aviso) return aviso;
    const u = new URL(href);
    const hash = new URLSearchParams((u.hash || '').replace(/^#/, ''));
    const tinhaCodigo = u.searchParams.has('code') || hash.has('code');
    if (tinhaCodigo && !sessao) return 'O retorno chegou, mas a sessão não foi criada. Nenhum token foi mostrado.';
    if (sessao) return 'Sessão iniciada neste navegador.';
    return null;
  }

  function urlDeGoogleAceita(urlAutorizacao, projetoUrl, redirectTo) {
    let destino;
    let projeto;
    try {
      destino = new URL(urlAutorizacao);
      projeto = new URL(projetoUrl);
    } catch (_) {
      return false;
    }
    if (destino.origin !== projeto.origin) return false;
    if (destino.pathname !== '/auth/v1/authorize') return false;
    if (destino.searchParams.get('provider') !== 'google') return false;
    if (destino.searchParams.get('redirect_to') !== redirectTo) return false;
    return true;
  }

  async function iniciarGoogleProducao(cliente, location, navegar) {
    const permitido = podeIniciarGoogleProducao(location);
    if (!permitido.ok) return permitido;
    const { data, error } = await cliente.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: permitido.redirectTo, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } }
    });
    if (error || !data || !data.url) return { ok: false, motivo: 'oauth_falhou', mensagem: mensagemDeErro(error && error.code) };
    if (!urlDeGoogleAceita(data.url, cliente.supabaseUrl, permitido.redirectTo)) {
      return { ok: false, motivo: 'destino_recusado' };
    }
    if (typeof navegar === 'function') navegar(data.url);
    return { ok: true, redirectTo: permitido.redirectTo };
  }

  async function iniciarGoogle(cliente, location, navegar) {
    const permitido = podeIniciarGoogle(location);
    if (!permitido.ok) return permitido;
    const { data, error } = await cliente.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: permitido.redirectTo,
        skipBrowserRedirect: true
      }
    });
    if (error || !data || !data.url) return { ok: false, motivo: 'oauth_falhou', mensagem: mensagemDeErro(error && error.code) };
    if (!urlDeGoogleAceita(data.url, cliente.supabaseUrl, permitido.redirectTo)) {
      return { ok: false, motivo: 'destino_recusado' };
    }
    if (typeof navegar === 'function') navegar(data.url);
    return { ok: true, redirectTo: permitido.redirectTo };
  }

  const api = {
    ORIGEM_PRODUCAO,
    origemProducao,
    PAGINAS_PRODUCAO,
    podeIniciarGoogleProducao,
    podeIniciarGoogle,
    retornoDaPagina,
    erroVisivelNaUrl,
    limparUrl,
    mensagemDeSessao,
    urlDeGoogleAceita,
    iniciarGoogleProducao,
    iniciarGoogle,
    mensagemDeErro
  };
  root.FolhaLoginGoogle = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
