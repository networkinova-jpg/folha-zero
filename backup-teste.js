/* Backup dos lançamentos de teste. A gravação na nuvem fica fechada
   até a migração backups_teste_app ser aplicada e conferida. */
(function (root) {
  const TABELA = 'backups_teste_app';
  const PROIBIDA = 'folhazero_v1';
  const LIMITE = 65536;

  function normalizar(doc) {
    const copia = JSON.parse(JSON.stringify(doc));
    function arrumar(obj) {
      const out = {};
      Object.keys(obj || {}).forEach((chave) => {
        const m = chave.match(/^(.*)\|(\d{4})\|(\d{2})\|([12])$/);
        out[m ? m[1] + '|' + m[2] + '-' + m[3] + '|' + m[4] : chave] = obj[chave];
      });
      return out;
    }
    copia.quinzenas = arrumar(copia.quinzenas);
    copia.descontos = arrumar(copia.descontos);
    return copia;
  }

  function validar(doc) {
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return { ok: false, motivo: 'carga_invalida' };
    if (doc.version !== 2 || !Array.isArray(doc.entries)) return { ok: false, motivo: 'carga_invalida' };
    if (doc.entries.length > 30) return { ok: false, motivo: 'carga_invalida' };
    const texto = JSON.stringify(doc);
    if (texto.length > LIMITE) return { ok: false, motivo: 'carga_grande' };
    const ids = {};
    for (const entrada of doc.entries) {
      if (!entrada || typeof entrada.id !== 'string' || !entrada.id) return { ok: false, motivo: 'carga_invalida' };
      if (ids[entrada.id]) return { ok: false, motivo: 'id_duplicado' };
      ids[entrada.id] = true;
      if (Object.prototype.hasOwnProperty.call(entrada, 'marca')) return { ok: false, motivo: 'carga_invalida' };
    }
    if (Object.prototype.hasOwnProperty.call(doc, 'marca')) return { ok: false, motivo: 'carga_invalida' };
    return { ok: true };
  }

  function podeEnviarDaConta(storage, contaAtual) {
    const marcada = storage.getItem('folhazero_teste_conta');
    if (marcada && contaAtual && marcada !== contaAtual) return { ok: false, motivo: 'conta_anterior' };
    return { ok: true };
  }

  function decidir(pedido, liberado) {
    if (liberado !== true) return { acao: 'bloquear', motivo: 'aguardando_migracao' };
    const v = validar(pedido && pedido.documento);
    if (!v.ok) return { acao: 'bloquear', motivo: v.motivo };
    if (!pedido.owner_id) return { acao: 'bloquear', motivo: 'sessao_ausente' };
    if (pedido.revisao == null) return { acao: 'inserir' };
    if (pedido.revisao < 1) return { acao: 'bloquear', motivo: 'revisao' };
    return { acao: 'atualizar' };
  }

  async function enviar(cliente, pedido, liberado) {
    const d = decidir(pedido, liberado);
    if (d.acao === 'bloquear') return { ok: false, enviou: false, motivo: d.motivo };
    const tabela = cliente.from(TABELA);
    let error;
    if (d.acao === 'inserir') {
      ({ error } = await tabela.insert({
        owner_id: pedido.owner_id, revisao: 1, bytes: 1, documento: pedido.documento
      }));
    } else {
      ({ error } = await tabela.update({
        documento: pedido.documento, revisao: pedido.revisao + 1, bytes: 1
      }).eq('owner_id', pedido.owner_id).eq('revisao', pedido.revisao));
    }
    if (!error) return { ok: true, enviou: true, substituiu: d.acao === 'atualizar' };
    if (String(error.code || '') === '23505') return { ok: true, enviou: false, jaExistia: true, motivo: 'ja_existe' };
    return { ok: false, enviou: false, motivo: 'envio_recusado' };
  }

  const api = { TABELA, PROIBIDA, LIMITE, normalizar, validar, podeEnviarDaConta, decidir, enviar };
  root.FolhaBackupTeste = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
