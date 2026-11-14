/* Regras de tela do painel. Não lê lançamentos e não mexe na chave do app. */
(function (root) {
  const FRASE_RECUSA = 'Esta conta não é do proprietário.';
  const FRASE_EXPIRADA = 'Sua sessão expirou. Entre de novo com sua conta Google.';
  const FRASE_TEMPORARIO = 'Não foi possível conferir agora. Tente de novo.';
  const TELAS = ['entrada', 'inicio', 'pedidos', 'avulsos', 'empresas', 'convites', 'pessoas', 'conta'];

  function vista(sessao, dono, escolhida, situacao) {
    const base = { entrada: false, recusa: false, painel: false, expirada: false, temporario: false, botoes: [] };
    if (situacao === 'sessao_expirada') {
      return Object.assign({}, base, { expirada: true, tela: 'expirada', botoes: ['entrar', 'sair'] });
    }
    if (situacao === 'erro_temporario') {
      return Object.assign({}, base, { temporario: true, tela: 'temporario', botoes: ['tentar'] });
    }
    if (!sessao) return Object.assign({}, base, { entrada: true, tela: 'entrada' });
    if (!dono) return Object.assign({}, base, { recusa: true, tela: 'recusa', botoes: ['sair'] });
    const tela = TELAS.indexOf(escolhida) >= 0 && escolhida !== 'entrada' ? escolhida : 'inicio';
    return Object.assign({}, base, { painel: true, tela: tela });
  }

  function classificarErro(erro) {
    const bruto = erro && typeof erro === 'object' ? erro : { message: erro == null ? '' : String(erro) };
    const status = Number(bruto.status != null ? bruto.status : bruto.statusCode);
    const code = String(bruto.code || bruto.error_code || '');
    const msg = [bruto.message, bruto.msg, bruto.details, bruto.hint, bruto.error_description, code]
      .filter((parte) => parte != null && parte !== '')
      .join(' ')
      .toLowerCase();
    if (status === 401 || code === 'PGRST301' || msg.includes('pgrst301') || msg.includes('jwt expired') || msg.includes('jwt expirado') || msg.includes('sessao_ausente')) {
      return 'sessao_expirada';
    }
    if (msg.includes('nao_proprietario')) return 'recusa';
    return 'erro_temporario';
  }

  function empresaAceita(nome) {
    const limpo = String(nome || '').trim().toLowerCase().replace(/\s+/g, ' ');
    return limpo.length > 1 && limpo !== 'inova blindagem';
  }

  function contadores(resumo) {
    const r = resumo || {};
    return {
      pedidos: Number(r.pedidos) || 0,
      avulsos: Number(r.avulsos) || 0,
      empresas: Number(r.empresas) || 0,
      vencem: Number(r.vencem_7_dias) || 0,
      pessoas: Number(r.pessoas_ativas) || 0,
      carros: Number(r.carros_lancados) || 0
    };
  }

  function pessoaVisivel(item) {
    const origem = item && typeof item === 'object' ? item : {};
    return {
      nome: origem.nome ? String(origem.nome) : 'Sem nome',
      email: origem.email ? String(origem.email) : '',
      ativa: origem.ativa === true,
      ultimo: origem.ultimo_acesso ? String(origem.ultimo_acesso) : ''
    };
  }

  const api = { FRASE_RECUSA, FRASE_EXPIRADA, FRASE_TEMPORARIO, TELAS, vista, classificarErro, empresaAceita, contadores, pessoaVisivel };
  root.FolhaPainelLogica = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
