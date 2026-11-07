/* Cópia individual no projeto de teste.
   Não envia sem autorização explícita. Não marca concluído sem ler de volta o mesmo sha256.
   Conta remota vazia não substitui o documento local. */
(function (root) {
  function P() {
    if (!root.FolhaPersistencia) throw new Error('persistencia ausente');
    return root.FolhaPersistencia;
  }

  function chavePublicaAceita(chave) {
    if (!chave || typeof chave !== 'string') return false;
    if (/service_role/i.test(chave)) return false;
    return chave.startsWith('sb_publishable_');
  }

  async function enviarCopiaAutorizada(storage, autorizado, remoto) {
    if (autorizado !== true) return { ok: false, motivo: 'sem_autorizacao', enviou: false, verificado: false };
    const antes = storage.getItem(P().KEY);
    if (antes == null || antes === '') return { ok: false, motivo: 'sem_dados_locais', enviou: false, verificado: false };
    const prep = await P().prepararMigracao(storage);
    if (!prep.ok) return { ok: false, motivo: prep.motivo || 'backup_local_falhou', enviou: false, verificado: false };
    if (storage.getItem(P().KEY) !== antes) return { ok: false, motivo: 'origem_alterada', enviou: false, verificado: false };
    let doc;
    try { doc = JSON.parse(antes); }
    catch (_) { return { ok: false, motivo: 'documento_invalido', enviou: false, verificado: false }; }
    let gravado;
    try { gravado = await remoto.gravar({ sha256: prep.sha256, bytes: antes.length, documento: doc }); }
    catch (_) { return { ok: false, motivo: 'rede', enviou: false, verificado: false }; }
    if (!gravado || !gravado.ok) return { ok: false, motivo: (gravado && gravado.motivo) || 'gravacao_falhou', enviou: true, verificado: false };
    let lido;
    try { lido = await remoto.ler(prep.sha256); }
    catch (_) { return { ok: false, motivo: 'ack_ausente', enviou: true, verificado: false }; }
    if (!lido || !lido.ok || lido.sha256 !== prep.sha256) return { ok: false, motivo: 'ack_divergente', enviou: true, verificado: false };
    const entradas = Array.isArray(doc.entries) ? doc.entries.length : 0;
    if (lido.lancamentos !== entradas) return { ok: false, motivo: 'ack_divergente', enviou: true, verificado: false };
    return { ok: true, enviou: true, verificado: true, sha256: prep.sha256, lancamentos: entradas };
  }

  async function prepararRestauracao(storage, sha256, remoto) {
    const lista = await remoto.listar();
    const localRaw = storage.getItem(P().KEY);
    let locais = 0;
    if (localRaw) {
      try { locais = (JSON.parse(localRaw).entries || []).length; } catch (_) { locais = 0; }
    }
    if (!lista.ok) return { ok: false, motivo: lista.motivo || 'lista_falhou', acao: 'manter_local' };
    if (!lista.itens.length && locais > 0) return { ok: false, motivo: 'conta_vazia', acao: 'manter_local', escreveu: false };
    const item = lista.itens.find(i => i.sha256 === sha256);
    if (!item) return { ok: false, motivo: 'nao_encontrado', acao: 'manter_local' };
    const lido = await remoto.ler(sha256);
    if (!lido || !lido.ok || lido.sha256 !== sha256) return { ok: false, motivo: 'ack_divergente', acao: 'manter_local' };
    return {
      ok: true,
      acao: 'prever',
      preview: { sha256, lancamentos: lido.lancamentos, bytes: lido.bytes },
      escreveu: false
    };
  }

  async function restaurarConfirmada(storage, sha256, confirmar, remoto) {
    const previsto = await prepararRestauracao(storage, sha256, remoto);
    if (!previsto.ok) return previsto;
    if (confirmar !== true) return { ok: false, motivo: 'sem_confirmacao', preview: previsto.preview, escreveu: false };
    const antes = storage.getItem(P().KEY);
    const seg = await P().prepararMigracao(storage);
    if (!seg.ok) return { ok: false, motivo: 'backup_atual_falhou', escreveu: false };
    const lido = await remoto.ler(sha256);
    if (!lido || !lido.ok || typeof lido.documento !== 'object') {
      return { ok: false, motivo: 'ack_divergente', escreveu: false };
    }
    const texto = JSON.stringify(lido.documento);
    try { storage.setItem(P().KEY, texto); }
    catch (_) {
      try { if (antes == null) storage.removeItem(P().KEY); else storage.setItem(P().KEY, antes); } catch (__) {}
      return { ok: false, motivo: 'quota_ou_escrita', escreveu: false };
    }
    if (storage.getItem(P().KEY) !== texto) {
      try { if (antes == null) storage.removeItem(P().KEY); else storage.setItem(P().KEY, antes); } catch (__) {}
      return { ok: false, motivo: 'rollback', escreveu: false };
    }
    return { ok: true, escreveu: true, sha256, backupAtual: seg.backupId };
  }

  const api = { chavePublicaAceita, enviarCopiaAutorizada, prepararRestauracao, restaurarConfirmada };
  root.FolhaSnapshot = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
