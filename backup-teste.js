/* Backup variável dos lançamentos de teste.
   A página só habilita os botões no site isolado, com sessão.
   A gravação usa public.backup_teste_gravar(revisão esperada, documento). */
(function (root) {
  const TABELA = 'backups_teste_app';
  const PROIBIDA = 'folhazero_v1';
  const LIMITE = 65536;
  const ABERTO = true;
  const CHAVE_BASE = 'folhazero_teste_base';
  const MENSAGEM_RECOLOCADA = 'Cópia variável recolocada nos lançamentos de teste. A versão anterior ficou na cópia local de segurança.';
  const MENSAGEM_GRAVADA = 'Lançamentos de teste gravados nesta conta. Este aparelho passou a conhecer essa revisão.';
  const MENSAGEM_ATUALIZADA = 'Lançamentos de teste enviados com a revisão que este aparelho já conhecia. A nuvem aceitou essa revisão.';
  const MENSAGEM_CONFLITO = 'A revisão que este aparelho conhece não é mais a da nuvem. Nada foi enviado de novo. Os lançamentos daqui continuam neste aparelho.';
  const MENSAGEM_SEM_BASE = 'Este aparelho ainda não conhece a revisão desta conta. Nada foi enviado. Abra a prévia e confirme a recuperação antes de enviar daqui.';

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

  function mapaBase(storage) {
    try {
      const mapa = JSON.parse(storage.getItem(CHAVE_BASE) || '{}');
      if (!mapa || typeof mapa !== 'object' || Array.isArray(mapa)) return {};
      return mapa;
    } catch (_) { return {}; }
  }

  function lerBase(storage, conta) {
    const item = mapaBase(storage)[conta];
    if (!item || !Number.isInteger(item.revisao) || item.revisao < 1) return null;
    return item.revisao;
  }

  function gravarBase(storage, conta, revisao) {
    if (!conta || !Number.isInteger(revisao) || revisao < 1) return { ok: false };
    const mapa = mapaBase(storage);
    mapa[conta] = { revisao };
    storage.setItem(CHAVE_BASE, JSON.stringify(mapa));
    return { ok: true, revisao };
  }

  function limparBase(storage, conta) {
    const mapa = mapaBase(storage);
    if (conta) delete mapa[conta];
    storage.setItem(CHAVE_BASE, JSON.stringify(mapa));
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
    const { data, error } = await cliente.rpc('backup_teste_gravar', {
      p_revisao_esperada: d.acao === 'inserir' ? null : pedido.revisao,
      p_documento: pedido.documento
    });
    if (!error) {
      return {
        ok: true, enviou: true, substituiu: d.acao === 'atualizar', repetiu: false, apagou: false,
        revisao: Number.isInteger(data) ? data : null
      };
    }
    const motivo = classificar(error);
    if (motivo === 'ja_existe') return { ok: true, enviou: false, jaExistia: true, motivo, repetiu: false, apagou: false };
    return { ok: false, enviou: false, motivo, repetiu: false, apagou: false };
  }

  async function enviarDaBase(cliente, storage, opts) {
    const liberado = opts && opts.liberado;
    if (liberado !== true) return { ok: false, enviou: false, motivo: 'aguardando_migracao', repetiu: false, apagou: false };
    const conta = opts.sessao && opts.sessao.user && opts.sessao.user.id;
    if (!conta) return { ok: false, enviou: false, motivo: 'sessao_ausente', repetiu: false, apagou: false };
    const dono = podeEnviarDaConta(storage, conta);
    if (!dono.ok) return { ok: false, enviou: false, motivo: dono.motivo, repetiu: false, apagou: false };
    const conhecida = lerBase(storage, conta);
    let revisao = conhecida;
    if (conhecida == null) {
      const lido = await lerPropria(cliente);
      if (!lido.ok) return { ok: false, enviou: false, motivo: lido.motivo, repetiu: false, apagou: false };
      if (!lido.vazio) return { ok: false, enviou: false, motivo: 'base_ausente', repetiu: false, apagou: false };
      revisao = null;
    }
    const plano = planejarEnvio({
      liberado: true, sessao: opts.sessao, storage, documento: opts.documento, revisaoAtual: revisao
    });
    if (!plano.ok) return { ok: false, enviou: false, motivo: plano.motivo, repetiu: false, apagou: false };
    const r = await enviar(cliente, plano.pedido, true);
    if (!r.enviou) return r;
    const nova = Number.isInteger(r.revisao) ? r.revisao : (revisao == null ? 1 : revisao + 1);
    gravarBase(storage, conta, nova);
    r.base = nova;
    return r;
  }

  function adotarRevisao(storage, conta, revisao) {
    return gravarBase(storage, conta, revisao);
  }

  function recuperar(storage, documento, confirmar) {
    const modo = root.FolhaModoTeste;
    if (!modo) return { ok: false, escreveu: false, motivo: 'modo_ausente' };
    const v = validar(documento);
    if (!v.ok) return { ok: false, escreveu: false, motivo: v.motivo, previa: modo.previa(storage, documento) };
    return modo.aplicarDocumento(storage, documento, confirmar === true);
  }

  const api = {
    TABELA, PROIBIDA, LIMITE, ABERTO, CHAVE_BASE,
    MENSAGEM_RECOLOCADA, MENSAGEM_GRAVADA, MENSAGEM_ATUALIZADA, MENSAGEM_CONFLITO, MENSAGEM_SEM_BASE,
    normalizar, validar, podeEnviarDaConta, lerBase, gravarBase, limparBase, adotarRevisao,
    decidir, planejarEnvio, classificar, lerPropria, enviar, enviarDaBase, recuperar
  };
  root.FolhaBackupTeste = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
