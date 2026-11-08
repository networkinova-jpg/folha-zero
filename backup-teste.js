/* Backup variável dos lançamentos de teste.
   A página só habilita os botões no site isolado, com sessão.
   A gravação usa public.backup_teste_gravar(revisão esperada, documento). */
(function (root) {
  const TABELA = 'backups_teste_app';
  const PROIBIDA = 'folhazero_v1';
  const LIMITE = 65536;
  const ABERTO = true;
  const MENSAGEM_RECOLOCADA = 'Cópia variável recolocada nos lançamentos de teste. A versão anterior ficou na cópia local de segurança.';

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
    if (!Number.isInteger(pedido.revisao) || pedido.revisao < 1) return { acao: 'bloquear', motivo: 'revisao' };
    return { acao: 'atualizar' };
  }

  function classificar(error) {
    const texto = [error && error.message, error && error.details, error && error.hint].join(' ');
    if (texto.includes('revisao_divergente')) return 'revisao_divergente';
    if (texto.includes('sessao_ausente')) return 'sessao_ausente';
    if (texto.includes('carga_grande')) return 'carga_grande';
    if (texto.includes('quota_revisao') || texto.includes('carga_invalida')) return 'carga_invalida';
    if (String(error && error.code || '') === '23505') return 'ja_existe';
    if (String(error && error.code || '') === '42501') return 'sessao_ausente';
    return 'envio_recusado';
  }

  function planejarEnvio(opts) {
    const liberado = opts && opts.liberado;
    if (liberado !== true) return { ok: false, enviou: false, motivo: 'aguardando_migracao' };
    const sessao = opts.sessao;
    const conta = sessao && sessao.user && sessao.user.id;
    if (!conta) return { ok: false, enviou: false, motivo: 'sessao_ausente' };
    const dono = podeEnviarDaConta(opts.storage || { getItem() { return null; } }, conta);
    if (!dono.ok) return { ok: false, enviou: false, motivo: dono.motivo };
    const documento = normalizar(opts.documento);
    const v = validar(documento);
    if (!v.ok) return { ok: false, enviou: false, motivo: v.motivo };
    const revisao = opts.revisaoAtual == null ? null : opts.revisaoAtual;
    if (revisao != null && (!Number.isInteger(revisao) || revisao < 1)) {
      return { ok: false, enviou: false, motivo: 'revisao' };
    }
    return { ok: true, enviou: false, pedido: { owner_id: conta, revisao, documento } };
  }

  async function lerPropria(cliente) {
    const { data, error } = await cliente.from(TABELA).select('revisao,documento').limit(1);
    if (error) return { ok: false, motivo: 'leitura_recusada', vazio: true };
    const linha = (data || [])[0];
    if (!linha) return { ok: true, vazio: true, revisao: null, documento: null };
    return { ok: true, vazio: false, revisao: linha.revisao, documento: linha.documento };
  }

  async function enviar(cliente, pedido, liberado) {
    const d = decidir(pedido, liberado);
    if (d.acao === 'bloquear') return { ok: false, enviou: false, motivo: d.motivo, repetiu: false, apagou: false };
    const { error } = await cliente.rpc('backup_teste_gravar', {
      p_revisao_esperada: d.acao === 'inserir' ? null : pedido.revisao,
      p_documento: pedido.documento
    });
    if (!error) return { ok: true, enviou: true, substituiu: d.acao === 'atualizar', repetiu: false, apagou: false };
    const motivo = classificar(error);
    if (motivo === 'ja_existe') return { ok: true, enviou: false, jaExistia: true, motivo, repetiu: false, apagou: false };
    return { ok: false, enviou: false, motivo, repetiu: false, apagou: false };
  }

  function recuperar(storage, documento, confirmar) {
    const modo = root.FolhaModoTeste;
    if (!modo) return { ok: false, escreveu: false, motivo: 'modo_ausente' };
    const v = validar(documento);
    if (!v.ok) return { ok: false, escreveu: false, motivo: v.motivo, previa: modo.previa(storage, documento) };
    return modo.aplicarDocumento(storage, documento, confirmar === true);
  }

  const api = {
    TABELA, PROIBIDA, LIMITE, ABERTO, MENSAGEM_RECOLOCADA,
    normalizar, validar, podeEnviarDaConta, decidir, planejarEnvio, classificar, lerPropria, enviar, recuperar
  };
  root.FolhaBackupTeste = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
