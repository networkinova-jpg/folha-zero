/* Backup variável dos lançamentos de teste.
   A página só habilita os botões no site isolado, com sessão.
   A gravação usa public.backup_teste_gravar(revisão esperada, documento). */
(function (root) {
  const TABELA = 'backups_teste_app';
  const PROIBIDA = 'folhazero_v1';
  const LIMITE = 65536;
  const ABERTO = true;
  const CHAVE_BASE = 'folhazero_teste_base';
  const CHAVE_FILA = 'folhazero_teste_fila';
  const INTERVALO_MS = 20000;
  const MAX_SEGUIMENTO = 3;
  const MENSAGEM_RECOLOCADA = 'Cópia variável recolocada nos lançamentos de teste. A versão anterior ficou na cópia local de segurança.';
  const MENSAGEM_GRAVADA = 'Lançamentos de teste gravados nesta conta. Este aparelho passou a conhecer essa revisão.';
  const MENSAGEM_ATUALIZADA = 'Lançamentos de teste enviados com a revisão que este aparelho já conhecia. A nuvem aceitou essa revisão.';
  const MENSAGEM_CONFLITO = 'A revisão que este aparelho conhece não é mais a da nuvem. Nada foi enviado de novo. Os lançamentos daqui continuam neste aparelho.';
  const MENSAGEM_SEM_BASE = 'Este aparelho ainda não conhece a revisão desta conta. Nada foi enviado. Abra a prévia e confirme a recuperação antes de enviar daqui.';
  const MENSAGEM_AMBIGUO = 'Salvo neste aparelho. O envio ficou sem resposta. A cópia automática não manda de novo no escuro.';
  const MENSAGEM_PENDENTE = 'Salvo neste aparelho. Envio da cópia de teste pendente.';
  const MENSAGEM_ENVIANDO = 'Salvo neste aparelho. Enviando a cópia de teste.';
  const MENSAGEM_ENVIADO = 'Salvo neste aparelho e enviado com a revisão que este aparelho já conhecia.';

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

  function estavel(valor) {
    if (Array.isArray(valor)) return '[' + valor.map(estavel).join(',') + ']';
    if (valor && typeof valor === 'object') {
      return '{' + Object.keys(valor).sort().map((chave) => JSON.stringify(chave) + ':' + estavel(valor[chave])).join(',') + '}';
    }
    return JSON.stringify(valor);
  }

  function impressao(doc) {
    if (!doc) return '';
    return estavel(normalizar(doc));
  }

  function mapaFila(storage) {
    try {
      const mapa = JSON.parse(storage.getItem(CHAVE_FILA) || '{}');
      if (!mapa || typeof mapa !== 'object' || Array.isArray(mapa)) return {};
      return mapa;
    } catch (_) { return {}; }
  }

  function filaVazia() {
    return {
      estado: 'salvo', geracao: 0, geracaoEnvio: 0, revisaoEnvio: null,
      canonEnvio: null, canonAceito: null, motivo: null, ultimaTentativa: 0
    };
  }

  function lerFila(storage, conta) {
    const item = mapaFila(storage)[conta];
    if (!item || typeof item !== 'object') return filaVazia();
    return Object.assign(filaVazia(), item);
  }

  function gravarFila(storage, conta, fila) {
    if (!conta) return { ok: false };
    const mapa = mapaFila(storage);
    mapa[conta] = fila;
    storage.setItem(CHAVE_FILA, JSON.stringify(mapa));
    return { ok: true };
  }

  function anotarMudanca(storage, conta) {
    if (!conta) return { ok: false, motivo: 'sessao_ausente' };
    const fila = lerFila(storage, conta);
    fila.geracao += 1;
    if (fila.estado !== 'conflito' && fila.estado !== 'ambiguo' && fila.estado !== 'bloqueado' && fila.estado !== 'enviando') {
      fila.estado = 'pendente';
      fila.motivo = null;
    }
    gravarFila(storage, conta, fila);
    return { ok: true, fila };
  }

  function retomarFila(storage, conta) {
    const fila = lerFila(storage, conta);
    if (fila.estado === 'enviando') {
      fila.estado = 'ambiguo';
      fila.motivo = 'resposta_ausente';
      gravarFila(storage, conta, fila);
    }
    return fila;
  }

  function registrarCopiaAceita(storage, conta, documento, revisao) {
    const base = gravarBase(storage, conta, revisao);
    if (!base.ok) return base;
    const fila = lerFila(storage, conta);
    fila.estado = 'enviado';
    fila.canonAceito = impressao(documento);
    fila.canonEnvio = null;
    fila.revisaoEnvio = null;
    fila.geracaoEnvio = fila.geracao;
    fila.motivo = null;
    gravarFila(storage, conta, fila);
    return { ok: true, revisao, fila };
  }

  function textoEstado(fila) {
    const estado = fila && fila.estado;
    if (estado === 'pendente') return MENSAGEM_PENDENTE;
    if (estado === 'enviando') return MENSAGEM_ENVIANDO;
    if (estado === 'enviado') return MENSAGEM_ENVIADO;
    if (estado === 'conflito') return MENSAGEM_CONFLITO;
    if (estado === 'bloqueado') return MENSAGEM_SEM_BASE;
    if (estado === 'ambiguo') return MENSAGEM_AMBIGUO;
    if (estado === 'erro') return 'Salvo neste aparelho. O envio automático não concluiu. Os lançamentos continuam aqui.';
    return 'Salvo neste aparelho. A cópia automática só roda neste site isolado, depois de uma alteração, com sessão. Nada é restaurado sozinho.';
  }

  async function reconciliar(cliente, storage, conta, documento, agora) {
    const fila = lerFila(storage, conta);
    const lido = await lerPropria(cliente);
    fila.ultimaTentativa = agora || Date.now();
    if (!lido.ok) {
      fila.estado = 'ambiguo';
      fila.motivo = lido.motivo;
      gravarFila(storage, conta, fila);
      return { seguiu: false, motivo: lido.motivo };
    }
    const base = lerBase(storage, conta);
    if (lido.vazio) {
      if (fila.revisaoEnvio == null) {
        fila.estado = 'pendente';
        fila.motivo = null;
        gravarFila(storage, conta, fila);
        return { seguiu: true };
      }
      fila.estado = 'conflito';
      fila.motivo = 'revisao_divergente';
      gravarFila(storage, conta, fila);
      return { seguiu: false, motivo: 'revisao_divergente' };
    }
    if (fila.canonEnvio && impressao(lido.documento) === fila.canonEnvio) {
      gravarBase(storage, conta, lido.revisao);
      fila.canonAceito = fila.canonEnvio;
      fila.canonEnvio = null;
      fila.revisaoEnvio = null;
      fila.estado = impressao(documento) === fila.canonAceito ? 'enviado' : 'pendente';
      fila.motivo = null;
      if (fila.estado === 'enviado') fila.geracaoEnvio = fila.geracao;
      gravarFila(storage, conta, fila);
      return { seguiu: fila.estado === 'pendente', revisao: lido.revisao };
    }
    if (base != null && lido.revisao === base && fila.revisaoEnvio === base) {
      fila.estado = 'pendente';
      fila.motivo = null;
      gravarFila(storage, conta, fila);
      return { seguiu: true };
    }
    fila.estado = 'conflito';
    fila.motivo = 'revisao_divergente';
    gravarFila(storage, conta, fila);
    return { seguiu: false, motivo: 'revisao_divergente' };
  }

  async function rodarFila(cliente, storage, opts) {
    const conta = opts && opts.conta;
    const agora = opts && opts.agora || Date.now();
    if (!conta) return { ok: false, enviou: false, motivo: 'sessao_ausente', repetiu: false };
    if (opts.origemOk !== true || opts.liberado !== true) {
      return { ok: false, enviou: false, motivo: 'origem_nao_autorizada', repetiu: false };
    }
    if (opts.online === false) return { ok: false, enviou: false, motivo: 'offline', repetiu: false };
    const dono = podeEnviarDaConta(storage, conta);
    if (!dono.ok) return { ok: false, enviou: false, motivo: dono.motivo, repetiu: false };
    if (!opts.sessao || !opts.sessao.user) {
      return { ok: false, enviou: false, motivo: 'sessao_ausente', repetiu: false };
    }
    if (opts.sessao.user.id !== conta) {
      return { ok: false, enviou: false, motivo: 'conta_anterior', repetiu: false };
    }
    let fila = lerFila(storage, conta);
    if (fila.estado === 'enviando') return { ok: false, enviou: false, motivo: 'enviando', repetiu: false };
    if (fila.estado === 'conflito' || fila.estado === 'bloqueado') {
      return {
        ok: false, enviou: false, repetiu: false,
        motivo: fila.estado === 'bloqueado' ? 'base_ausente' : 'revisao_divergente'
      };
    }
    if (fila.estado === 'ambiguo' && !opts.manual && !opts.retomada) {
      return { ok: false, enviou: false, motivo: 'resposta_ausente', repetiu: false };
    }
    if (!opts.manual && fila.estado === 'ambiguo' && fila.motivo === 'leitura_recusada' && fila.ultimaTentativa && agora - fila.ultimaTentativa < INTERVALO_MS) {
      return { ok: false, enviou: false, motivo: 'aguardando', repetiu: false };
    }
    if (!opts.manual && fila.estado !== 'pendente' && fila.estado !== 'ambiguo') {
      return { ok: true, enviou: false, motivo: 'ocioso', repetiu: false };
    }
    if (!opts.manual && fila.estado === 'pendente' && fila.ultimaTentativa && agora - fila.ultimaTentativa < INTERVALO_MS && fila.geracao === fila.geracaoEnvio) {
      return { ok: false, enviou: false, motivo: 'aguardando', repetiu: false };
    }
    if (fila.estado === 'ambiguo') {
      const conferencia = await reconciliar(cliente, storage, conta, opts.documento, agora);
      if (!conferencia.seguiu) return { ok: false, enviou: false, motivo: conferencia.motivo || 'resposta_ausente', repetiu: false };
      fila = lerFila(storage, conta);
    }
    let enviados = 0;
    let ultimo = { ok: true, enviou: false, motivo: 'ocioso', repetiu: false };
    while (enviados < MAX_SEGUIMENTO) {
      fila = lerFila(storage, conta);
      const documento = opts.documentoAtual ? opts.documentoAtual() : opts.documento;
      if (fila.canonAceito && impressao(documento) === fila.canonAceito) {
        fila.estado = 'enviado';
        fila.geracaoEnvio = fila.geracao;
        fila.motivo = null;
        gravarFila(storage, conta, fila);
        return { ok: true, enviou: false, motivo: 'igual', repetiu: false, enviados };
      }
      const conhecida = lerBase(storage, conta);
      fila.estado = 'enviando';
      fila.geracaoEnvio = fila.geracao;
      fila.revisaoEnvio = conhecida;
      fila.canonEnvio = impressao(documento);
      fila.ultimaTentativa = agora;
      gravarFila(storage, conta, fila);
      let resposta;
      try {
        resposta = await enviarDaBase(cliente, storage, {
          liberado: true, sessao: opts.sessao, storage, documento
        });
      } catch (_) {
        const atual = lerFila(storage, conta);
        atual.estado = 'ambiguo';
        atual.motivo = 'resposta_ausente';
        gravarFila(storage, conta, atual);
        return { ok: false, enviou: false, motivo: 'resposta_ausente', repetiu: false, enviados };
      }
      if (resposta.motivo === 'base_ausente') {
        const atual = lerFila(storage, conta);
        atual.estado = 'bloqueado';
        atual.motivo = 'base_ausente';
        gravarFila(storage, conta, atual);
        return Object.assign({ repetiu: false, enviados }, resposta);
      }
      if (resposta.motivo === 'revisao_divergente' || resposta.motivo === 'ja_existe' || resposta.motivo === 'carga_invalida' || resposta.motivo === 'carga_grande' || resposta.motivo === 'quota_revisao') {
        const atual = lerFila(storage, conta);
        atual.estado = resposta.motivo === 'revisao_divergente' || resposta.motivo === 'ja_existe' ? 'conflito' : 'erro';
        atual.motivo = resposta.motivo;
        gravarFila(storage, conta, atual);
        return Object.assign({ repetiu: false, enviados }, resposta);
      }
      if (!resposta.enviou) {
        const atual = lerFila(storage, conta);
        if (resposta.motivo === 'sessao_ausente' || resposta.motivo === 'conta_anterior') {
          atual.estado = 'pendente';
        } else {
          atual.estado = 'ambiguo';
          atual.motivo = resposta.motivo || 'resposta_ausente';
        }
        gravarFila(storage, conta, atual);
        return Object.assign({ repetiu: false, enviados }, resposta);
      }
      const aceito = lerFila(storage, conta);
      aceito.canonAceito = aceito.canonEnvio;
      aceito.canonEnvio = null;
      aceito.revisaoEnvio = null;
      aceito.estado = 'enviado';
      aceito.motivo = null;
      gravarFila(storage, conta, aceito);
      enviados += 1;
      ultimo = Object.assign({ repetiu: false, enviados }, resposta);
      const seguinte = opts.documentoAtual ? opts.documentoAtual() : documento;
      if (!impressao(seguinte) || impressao(seguinte) === aceito.canonAceito) return ultimo;
      const marcada = lerFila(storage, conta);
      marcada.estado = 'pendente';
      gravarFila(storage, conta, marcada);
      opts = Object.assign({}, opts, { documento: seguinte });
    }
    return ultimo;
  }

  function recuperar(storage, documento, confirmar) {
    const modo = root.FolhaModoTeste;
    if (!modo) return { ok: false, escreveu: false, motivo: 'modo_ausente' };
    const v = validar(documento);
    if (!v.ok) return { ok: false, escreveu: false, motivo: v.motivo, previa: modo.previa(storage, documento) };
    return modo.aplicarDocumento(storage, documento, confirmar === true);
  }

  const api = {
    TABELA, PROIBIDA, LIMITE, ABERTO, CHAVE_BASE, CHAVE_FILA, INTERVALO_MS,
    MENSAGEM_RECOLOCADA, MENSAGEM_GRAVADA, MENSAGEM_ATUALIZADA, MENSAGEM_CONFLITO, MENSAGEM_SEM_BASE,
    MENSAGEM_AMBIGUO, MENSAGEM_PENDENTE, MENSAGEM_ENVIANDO, MENSAGEM_ENVIADO,
    normalizar, validar, podeEnviarDaConta, lerBase, gravarBase, limparBase, adotarRevisao,
    impressao, anotarMudanca, retomarFila, lerFila, registrarCopiaAceita, textoEstado,
    decidir, planejarEnvio, classificar, lerPropria, enviar, enviarDaBase, rodarFila, recuperar
  };
  root.FolhaBackupTeste = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
