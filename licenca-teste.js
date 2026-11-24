/* Licença do app de teste. Cache separado. Não lê nem grava folhazero_v1. */
(function (root) {
  const CHAVE = 'folhazero_teste_licenca';
  const PROIBIDA = 'folhazero_v1';
  const AVISO_SUSPENSO = 'O acesso para carros novos está suspenso. Para voltar a lançar, fale com Ricardo Ribeiro. Edição, folhas e backup continuam liberados.';
  const AVISO_VENCIDO = 'O acesso para carros novos está vencido. Para voltar a lançar, fale com Ricardo Ribeiro. Edição, folhas e backup continuam liberados.';
  let atual = { bloqueiaNovo: false, resumo: '', aviso: '', motivo: 'deslogado', usouCache: false };

  function dataIso(valor) {
    const texto = String(valor || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(texto) ? texto : '';
  }

  function hojeLocal(data) {
    const d = data || new Date();
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function formatarData(valor) {
    const iso = dataIso(valor);
    if (!iso) return '';
    const partes = iso.split('-');
    return partes[2] + '/' + partes[1] + '/' + partes[0];
  }

  function dentroDoPrazo(fim, hoje) {
    const limite = dataIso(fim);
    const dia = dataIso(hoje);
    if (!limite || !dia) return false;
    return limite >= dia;
  }

  function enxugar(dados) {
    const origem = dados && typeof dados === 'object' ? dados : {};
    return {
      conta: origem.conta || null,
      degustacao: origem.degustacao || null,
      degustacao_fim: origem.degustacao_fim || null,
      licenca: origem.licenca || null,
      licenca_validade: origem.licenca_validade || null
    };
  }

  function livre(motivo, resumo) {
    return { bloqueiaNovo: false, resumo: resumo || '', aviso: '', motivo: motivo, usouCache: false };
  }

  function avaliar(dados, hoje) {
    const d = enxugar(dados);
    const conta = d.conta;
    const deg = d.degustacao;
    const lic = d.licenca;
    const degOk = deg === 'ativa' && dentroDoPrazo(d.degustacao_fim, hoje);
    const licOk = lic === 'ativa' && dentroDoPrazo(d.licenca_validade, hoje);
    if (conta === 'suspenso' || conta === 'revogado') {
      return { bloqueiaNovo: true, resumo: 'Acesso suspenso', aviso: AVISO_SUSPENSO, motivo: conta === 'revogado' ? 'revogado' : 'suspenso', usouCache: false };
    }
    if (licOk) return livre('licenca_ativa', 'Licença ativa até ' + formatarData(d.licenca_validade));
    if (degOk) return livre('degustacao_ativa', 'Degustação até ' + formatarData(d.degustacao_fim));
    if (lic === 'suspensa' || lic === 'revogada') {
      return { bloqueiaNovo: true, resumo: 'Acesso suspenso', aviso: AVISO_SUSPENSO, motivo: lic === 'revogada' ? 'revogado' : 'suspenso', usouCache: false };
    }
    const temConta = !!conta;
    const temDeg = !!deg;
    const temLic = !!lic;
    if (!temConta && !temDeg && !temLic) return livre('sem_registro', 'Sem prazo definido');
    if (temConta && !temDeg && !temLic) return livre('sem_registro', 'Sem prazo definido');
    return { bloqueiaNovo: true, resumo: 'Prazo vencido', aviso: AVISO_VENCIDO, motivo: 'vencido', usouCache: false };
  }

  function decidir(opcoes) {
    const o = opcoes || {};
    const hoje = o.hoje || hojeLocal();
    if (!o.sessao) return livre('deslogado', '');
    if (o.erroRede) {
      const cache = o.cache && o.cache.uid && o.sessao.uid && o.cache.uid === o.sessao.uid ? o.cache.dados : null;
      if (!cache) return livre('offline_sem_cache', 'Sem prazo definido');
      const r = avaliar(cache, hoje);
      r.usouCache = true;
      r.motivo = 'offline';
      return r;
    }
    return avaliar(o.dados, hoje);
  }

  function aplicar(resultado) {
    atual = resultado || livre('deslogado', '');
    return atual;
  }

  function bloqueioLocal() { return atual; }

  function proteger(storage, escrever) {
    const antes = storage.getItem(PROIBIDA);
    const r = escrever();
    if (storage.getItem(PROIBIDA) !== antes) {
      try { if (antes == null) storage.removeItem(PROIBIDA); else storage.setItem(PROIBIDA, antes); } catch (_) {}
      throw new Error('licenca alterou folhazero_v1');
    }
    return r;
  }

  function gravar(storage, uid, dados) {
    const corpo = JSON.stringify({ uid: uid, dados: enxugar(dados) });
    return proteger(storage, () => {
      storage.setItem(CHAVE, corpo);
      return corpo;
    });
  }

  function ler(storage, uid) {
    try {
      const bruto = storage.getItem(CHAVE);
      if (!bruto) return null;
      const json = JSON.parse(bruto);
      if (!json || json.uid !== uid || !json.dados) return null;
      return { uid: json.uid, dados: enxugar(json.dados) };
    } catch (_) {
      return null;
    }
  }

  const api = {
    CHAVE, PROIBIDA, AVISO_SUSPENSO, AVISO_VENCIDO,
    dataIso, hojeLocal, formatarData, enxugar, avaliar, decidir, aplicar, bloqueioLocal, gravar, ler
  };
  root.FolhaLicencaTeste = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
