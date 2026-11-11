/* Regras de tela do painel. Não lê lançamentos e não mexe na chave do app. */
(function (root) {
  const FRASE_RECUSA = 'Esta conta não é do proprietário.';
  const TELAS = ['entrada', 'inicio', 'pedidos', 'avulsos', 'empresas', 'convites', 'conta'];

  function vista(sessao, dono, escolhida) {
    if (!sessao) return { entrada: true, recusa: false, painel: false, tela: 'entrada' };
    if (!dono) return { entrada: false, recusa: true, painel: false, tela: 'recusa' };
    const tela = TELAS.indexOf(escolhida) >= 0 && escolhida !== 'entrada' ? escolhida : 'inicio';
    return { entrada: false, recusa: false, painel: true, tela: tela };
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
      vencem: Number(r.vencem_7_dias) || 0
    };
  }

  const api = { FRASE_RECUSA, TELAS, vista, empresaAceita, contadores };
  root.FolhaPainelLogica = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
