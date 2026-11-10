/* Cópia individual dos lançamentos reais. Não usa a tabela de teste.
   O uso local não exige login. Nada é enviado antes da associação explícita.
   O documento guardado não é reescrito para caber no envio. */
(function (root) {
  const KEY = 'folhazero_v1';
  const BRUTO = 'folhazero_v1_bruto';
  const COPIA = 'folhazero_v1_copia';
  const VINCULO = 'folhazero_conta_vinculo';
  const CONSENTIMENTO = 'folhazero_consentimento_copia';
  const BASE = 'folhazero_conta_base';
  const FILA = 'folhazero_conta_fila';
  const TABELA = 'copias_conta';
  const LIMITE_BYTES = 2097152;
  const LIMITE_LANCAMENTOS = 20000;
  const LIMITE_REVISAO = 20000;
  const LIMITE_PAUSAS = 400;
  const INTERVALO_MS = 20000;
  const MAX_SEGUIMENTO = 3;
  const TEXTO_CONSENTIMENTO = 'Autorizo enviar os lançamentos deste aparelho para a conta Google que escolhi. O uso local não depende desse envio.';
  const MENSAGEM_CONFLITO = 'A revisão que este aparelho conhece não é mais a da nuvem. Nada foi enviado de novo. Os lançamentos continuam neste aparelho.';
  const MENSAGEM_SEM_BASE = 'Este aparelho ainda não conhece a revisão desta conta. Nada foi enviado. Veja a prévia e confirme a recuperação antes de enviar daqui.';
  const MENSAGEM_AMBIGUO = 'Salvo neste aparelho. O envio ficou sem resposta. A cópia automática não manda de novo no escuro.';
  const MENSAGEM_GRANDE = 'A cópia na conta não cabe no limite de 2 MB. Os lançamentos continuam neste aparelho. Exporte o arquivo.';
  const MENSAGEM_REVISAO = 'A cópia na conta chegou ao limite de revisões. Os lançamentos continuam neste aparelho. Exporte o arquivo.';

  function estavel(valor) {
    if (Array.isArray(valor)) return '[' + valor.map(estavel).join(',') + ']';
    if (valor && typeof valor === 'object') {
      return '{' + Object.keys(valor).sort().map((chave) => JSON.stringify(chave) + ':' + estavel(valor[chave])).join(',') + '}';
    }
    return JSON.stringify(valor);
  }

  function bytes(doc) {
    try { return new TextEncoder().encode(JSON.stringify(doc)).length; }
    catch (_) { return LIMITE_BYTES + 1; }
  }

  function aceitaEnvio(doc) {
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return { ok: false, motivo: 'carga_invalida' };
    if (typeof doc.version !== 'number' || !Number.isInteger(doc.version) || doc.version < 1 || doc.version > 20) {
      return { ok: false, motivo: 'carga_invalida' };
    }
    if (!Array.isArray(doc.entries)) return { ok: false, motivo: 'carga_invalida' };
    if (doc.entries.length > LIMITE_LANCAMENTOS) return { ok: false, motivo: 'limite_lancamentos' };
    for (const item of doc.entries) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return { ok: false, motivo: 'carga_invalida' };
      if (item.pausas != null) {
        if (!Array.isArray(item.pausas)) return { ok: false, motivo: 'carga_invalida' };
        if (item.pausas.length > LIMITE_PAUSAS) return { ok: false, motivo: 'limite_pausas' };
      }
    }
    for (const campo of ['quinzenas', 'descontos', 'settings']) {
      if (doc[campo] != null && (typeof doc[campo] !== 'object' || Array.isArray(doc[campo]))) {
        return { ok: false, motivo: 'carga_invalida' };
      }
    }
    if (bytes(doc) > LIMITE_BYTES) return { ok: false, motivo: 'carga_grande' };
    return { ok: true };
  }

  function lerDocumento(storage) {
    const bruto = storage.getItem(KEY);
    if (bruto == null) return { ok: true, vazio: true, bruto: null, documento: null };
    try { return { ok: true, vazio: false, bruto, documento: JSON.parse(bruto) }; }
    catch (_) { return { ok: false, vazio: false, bruto, motivo: 'documento_invalido' }; }
  }

  function guardarBruto(storage) {
    if (storage.getItem(BRUTO) == null && storage.getItem(KEY) != null) {
      storage.setItem(BRUTO, storage.getItem(KEY));
    }
    return storage.getItem(BRUTO);
  }

  function associar(storage, uid, consentiu, trocaExplicita) {
    if (consentiu !== true) return { ok: false, enviou: false, motivo: 'sem_consentimento' };
    if (!uid) return { ok: false, enviou: false, motivo: 'sessao_ausente' };
    const atual = storage.getItem(VINCULO);
    if (atual && atual !== uid && trocaExplicita !== true) {
      return { ok: false, enviou: false, motivo: 'conta_anterior' };
    }
    const antes = storage.getItem(KEY);
    guardarBruto(storage);
    storage.setItem(VINCULO, uid);
    storage.setItem(CONSENTIMENTO, JSON.stringify({ uid, texto: TEXTO_CONSENTIMENTO }));
    if (storage.getItem(KEY) !== antes) {
      if (antes == null) storage.removeItem(KEY);
      else storage.setItem(KEY, antes);
      return { ok: false, enviou: false, motivo: 'origem_alterada' };
    }
    return { ok: true, enviou: false, motivo: 'associado' };
  }

  function podeEnviar(storage, uid) {
    if (!uid) return { ok: false, motivo: 'sessao_ausente' };
    if (storage.getItem(VINCULO) !== uid) return { ok: false, motivo: 'conta_nao_associada' };
    let consentimento = null;
    try { consentimento = JSON.parse(storage.getItem(CONSENTIMENTO) || 'null'); } catch (_) { consentimento = null; }
    if (!consentimento || consentimento.uid !== uid || consentimento.texto !== TEXTO_CONSENTIMENTO) {
      return { ok: false, motivo: 'sem_consentimento' };
    }
    return { ok: true };
  }

  function mapa(storage, chave) {
    try {
      const valor = JSON.parse(storage.getItem(chave) || '{}');
      if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return {};
      return valor;
    } catch (_) { return {}; }
  }

  function lerBase(storage, uid) {
    const item = mapa(storage, BASE)[uid];
    if (!item || !Number.isInteger(item.revisao) || item.revisao < 1) return null;
    return item.revisao;
  }

  function gravarBase(storage, uid, revisao) {
    if (!uid || !Number.isInteger(revisao) || revisao < 1 || revisao > LIMITE_REVISAO) return { ok: false };
    const base = mapa(storage, BASE);
    base[uid] = { revisao };
    storage.setItem(BASE, JSON.stringify(base));
    return { ok: true, revisao };
  }

  function filaVazia() {
    return {
      estado: 'salvo', geracao: 0, geracaoEnvio: 0, revisaoEnvio: null,
      canonEnvio: null, canonAceito: null, motivo: null, ultimaTentativa: 0
    };
  }

  function lerFila(storage, uid) {
    const item = mapa(storage, FILA)[uid];
    if (!item || typeof item !== 'object') return filaVazia();
    return Object.assign(filaVazia(), item);
  }

  function gravarFila(storage, uid, fila) {
    const todas = mapa(storage, FILA);
    todas[uid] = fila;
    storage.setItem(FILA, JSON.stringify(todas));
  }

  function anotarMudanca(storage, uid) {
    const permitido = podeEnviar(storage, uid);
    if (!permitido.ok) return { ok: false, motivo: permitido.motivo };
    const fila = lerFila(storage, uid);
    fila.geracao += 1;
    if (fila.estado !== 'conflito' && fila.estado !== 'ambiguo' && fila.estado !== 'bloqueado' && fila.estado !== 'enviando') {
      fila.estado = 'pendente';
      fila.motivo = null;
    }
    gravarFila(storage, uid, fila);
    return { ok: true, fila };
  }

  function retomarFila(storage, uid) {
    const fila = lerFila(storage, uid);
    if (fila.estado === 'enviando') {
      fila.estado = 'ambiguo';
      fila.motivo = 'resposta_ausente';
      gravarFila(storage, uid, fila);
    }
    return fila;
  }

  function impressao(doc) {
    return estavel(doc);
  }

  function registrarCopiaAceita(storage, uid, documento, revisao) {
    const base = gravarBase(storage, uid, revisao);
    if (!base.ok) return base;
    const fila = lerFila(storage, uid);
    fila.estado = 'enviado';
    fila.canonAceito = impressao(documento);
    fila.canonEnvio = null;
    fila.revisaoEnvio = null;
    fila.geracaoEnvio = fila.geracao;
    fila.motivo = null;
    gravarFila(storage, uid, fila);
    return { ok: true, revisao };
  }

  async function lerPropria(cliente) {
    const { data, error } = await cliente.from(TABELA).select('revisao,documento').limit(1);
    if (error) return { ok: false, motivo: 'leitura_recusada', vazio: true };
    const linha = (data || [])[0];
    if (!linha) return { ok: true, vazio: true, revisao: null, documento: null };
    return { ok: true, vazio: false, revisao: linha.revisao, documento: linha.documento };
  }

  function classificar(error) {
    const texto = [error && error.message, error && error.details, error && error.hint].join(' ');
    if (texto.includes('revisao_divergente')) return 'revisao_divergente';
    if (texto.includes('quota_revisao')) return 'quota_revisao';
    if (texto.includes('carga_grande')) return 'carga_grande';
    if (texto.includes('carga_invalida')) return 'carga_invalida';
    if (texto.includes('sessao_ausente')) return 'sessao_ausente';
    if (String(error && error.code || '') === '42501') return 'sessao_ausente';
    return 'envio_recusado';
  }

  async function enviar(cliente, documento, revisao) {
    const v = aceitaEnvio(documento);
    if (!v.ok) return { ok: false, enviou: false, motivo: v.motivo, repetiu: false };
    const { data, error } = await cliente.rpc('copia_conta_gravar', {
      p_revisao_esperada: revisao == null ? null : revisao,
      p_documento: documento
    });
    if (!error) return { ok: true, enviou: true, revisao: Number.isInteger(data) ? data : null, repetiu: false };
    return { ok: false, enviou: false, motivo: classificar(error), repetiu: false };
  }

  async function enviarDaBase(cliente, storage, uid, documento) {
    const permitido = podeEnviar(storage, uid);
    if (!permitido.ok) return { ok: false, enviou: false, motivo: permitido.motivo, repetiu: false };
    const conhecida = lerBase(storage, uid);
    if (conhecida == null) {
      const lido = await lerPropria(cliente);
      if (!lido.ok) return { ok: false, enviou: false, motivo: lido.motivo, repetiu: false };
      if (!lido.vazio) return { ok: false, enviou: false, motivo: 'base_ausente', repetiu: false };
    }
    const resposta = await enviar(cliente, documento, conhecida);
    if (!resposta.enviou) return resposta;
    const nova = Number.isInteger(resposta.revisao) ? resposta.revisao : (conhecida == null ? 1 : conhecida + 1);
    gravarBase(storage, uid, nova);
    resposta.base = nova;
    return resposta;
  }

  async function reconciliar(cliente, storage, uid, documento, agora) {
    const fila = lerFila(storage, uid);
    const lido = await lerPropria(cliente);
    fila.ultimaTentativa = agora || Date.now();
    if (!lido.ok) {
      fila.estado = 'ambiguo';
      fila.motivo = 'leitura_recusada';
      gravarFila(storage, uid, fila);
      return { seguiu: false, motivo: lido.motivo };
    }
    const base = lerBase(storage, uid);
    if (lido.vazio && fila.revisaoEnvio == null) {
      fila.estado = 'pendente';
      fila.motivo = null;
      gravarFila(storage, uid, fila);
      return { seguiu: true };
    }
    if (fila.canonEnvio && impressao(lido.documento) === fila.canonEnvio) {
      gravarBase(storage, uid, lido.revisao);
      fila.canonAceito = fila.canonEnvio;
      fila.canonEnvio = null;
      fila.revisaoEnvio = null;
      fila.estado = impressao(documento) === fila.canonAceito ? 'enviado' : 'pendente';
      fila.motivo = null;
      gravarFila(storage, uid, fila);
      return { seguiu: fila.estado === 'pendente' };
    }
    if (base != null && lido.revisao === base && fila.revisaoEnvio === base) {
      fila.estado = 'pendente';
      fila.motivo = null;
      gravarFila(storage, uid, fila);
      return { seguiu: true };
    }
    fila.estado = 'conflito';
    fila.motivo = 'revisao_divergente';
    gravarFila(storage, uid, fila);
    return { seguiu: false, motivo: 'revisao_divergente' };
  }

  async function rodarFila(cliente, storage, opts) {
    const uid = opts && opts.uid;
    const agora = (opts && opts.agora) || Date.now();
    if (!uid) return { ok: false, enviou: false, motivo: 'sessao_ausente', repetiu: false };
    if (opts.origemOk !== true) return { ok: false, enviou: false, motivo: 'origem_nao_autorizada', repetiu: false };
    if (opts.online === false) return { ok: false, enviou: false, motivo: 'offline', repetiu: false };
    const permitido = podeEnviar(storage, uid);
    if (!permitido.ok) return { ok: false, enviou: false, motivo: permitido.motivo, repetiu: false };
    let fila = lerFila(storage, uid);
    if (fila.estado === 'enviando') return { ok: false, enviou: false, motivo: 'enviando', repetiu: false };
    if (fila.estado === 'conflito' || fila.estado === 'bloqueado') {
      return { ok: false, enviou: false, repetiu: false, motivo: fila.estado === 'bloqueado' ? 'base_ausente' : 'revisao_divergente' };
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
    const lido = lerDocumento(storage);
    if (!lido.ok) return { ok: false, enviou: false, motivo: lido.motivo, repetiu: false };
    if (lido.vazio) return { ok: true, enviou: false, motivo: 'sem_documento', repetiu: false };
    if (fila.estado === 'ambiguo') {
      const conferencia = await reconciliar(cliente, storage, uid, lido.documento, agora);
      if (!conferencia.seguiu) return { ok: false, enviou: false, motivo: conferencia.motivo || 'resposta_ausente', repetiu: false };
      fila = lerFila(storage, uid);
    }
    let enviados = 0;
    let ultimo = { ok: true, enviou: false, motivo: 'ocioso', repetiu: false };
    while (enviados < MAX_SEGUIMENTO) {
      fila = lerFila(storage, uid);
      const atual = lerDocumento(storage);
      if (!atual.ok || atual.vazio) return { ok: false, enviou: false, motivo: atual.motivo || 'sem_documento', repetiu: false, enviados };
      if (fila.canonAceito && impressao(atual.documento) === fila.canonAceito) {
        fila.estado = 'enviado';
        fila.geracaoEnvio = fila.geracao;
        gravarFila(storage, uid, fila);
        return { ok: true, enviou: false, motivo: 'igual', repetiu: false, enviados };
      }
      const conhecida = lerBase(storage, uid);
      fila.estado = 'enviando';
      fila.geracaoEnvio = fila.geracao;
      fila.revisaoEnvio = conhecida;
      fila.canonEnvio = impressao(atual.documento);
      fila.ultimaTentativa = agora;
      gravarFila(storage, uid, fila);
      let resposta;
      try {
        resposta = await enviarDaBase(cliente, storage, uid, atual.documento);
      } catch (_) {
        const marcada = lerFila(storage, uid);
        marcada.estado = 'ambiguo';
        marcada.motivo = 'resposta_ausente';
        gravarFila(storage, uid, marcada);
        return { ok: false, enviou: false, motivo: 'resposta_ausente', repetiu: false, enviados };
      }
      if (resposta.motivo === 'base_ausente') {
        const marcada = lerFila(storage, uid);
        marcada.estado = 'bloqueado';
        marcada.motivo = 'base_ausente';
        gravarFila(storage, uid, marcada);
        return Object.assign({ repetiu: false, enviados }, resposta);
      }
      if (resposta.motivo === 'revisao_divergente') {
        const marcada = lerFila(storage, uid);
        marcada.estado = 'conflito';
        marcada.motivo = 'revisao_divergente';
        gravarFila(storage, uid, marcada);
        return Object.assign({ repetiu: false, enviados }, resposta);
      }
      if (!resposta.enviou) {
        const marcada = lerFila(storage, uid);
        marcada.estado = resposta.motivo === 'sessao_ausente' ? 'pendente' : 'erro';
        marcada.motivo = resposta.motivo;
        gravarFila(storage, uid, marcada);
        return Object.assign({ repetiu: false, enviados }, resposta);
      }
      const aceita = lerFila(storage, uid);
      aceita.canonAceito = aceita.canonEnvio;
      aceita.canonEnvio = null;
      aceita.revisaoEnvio = null;
      aceita.estado = 'enviado';
      aceita.motivo = null;
      gravarFila(storage, uid, aceita);
      enviados += 1;
      ultimo = Object.assign({ repetiu: false, enviados }, resposta);
      const seguinte = lerDocumento(storage);
      if (!seguinte.ok || seguinte.vazio || impressao(seguinte.documento) === aceita.canonAceito) return ultimo;
      const pendente = lerFila(storage, uid);
      pendente.estado = 'pendente';
      gravarFila(storage, uid, pendente);
    }
    return ultimo;
  }

  function restaurar(storage, documento, confirmar) {
    if (confirmar !== true) return { ok: false, escreveu: false, motivo: 'sem_confirmacao' };
    const v = aceitaEnvio(documento);
    if (!v.ok) return { ok: false, escreveu: false, motivo: v.motivo };
    const atual = storage.getItem(KEY);
    if (atual != null) storage.setItem(COPIA, atual);
    const texto = JSON.stringify(documento);
    storage.setItem(KEY, texto);
    return { ok: true, escreveu: true, texto };
  }

  function textoEstado(fila) {
    const estado = fila && fila.estado;
    if (estado === 'pendente') return 'Salvo neste aparelho. Envio da cópia da conta pendente.';
    if (estado === 'enviando') return 'Salvo neste aparelho. Enviando a cópia da conta.';
    if (estado === 'enviado') return 'Salvo neste aparelho e enviado com a revisão que este aparelho já conhecia.';
    if (estado === 'conflito') return MENSAGEM_CONFLITO;
    if (estado === 'bloqueado') return MENSAGEM_SEM_BASE;
    if (estado === 'ambiguo') return MENSAGEM_AMBIGUO;
    if (estado === 'erro' && fila.motivo === 'carga_grande') return MENSAGEM_GRANDE;
    if (estado === 'erro' && fila.motivo === 'quota_revisao') return MENSAGEM_REVISAO;
    if (estado === 'erro') return 'Salvo neste aparelho. O envio não concluiu. Os lançamentos continuam aqui.';
    return 'Os lançamentos continuam neste aparelho. A cópia na conta só começa depois que você associar a conta Google.';
  }

  const api = {
    KEY, BRUTO, COPIA, VINCULO, CONSENTIMENTO, BASE, FILA, TABELA,
    LIMITE_BYTES, LIMITE_LANCAMENTOS, LIMITE_REVISAO, LIMITE_PAUSAS, TEXTO_CONSENTIMENTO,
    MENSAGEM_CONFLITO, MENSAGEM_SEM_BASE, MENSAGEM_AMBIGUO, MENSAGEM_GRANDE, MENSAGEM_REVISAO,
    aceitaEnvio, lerDocumento, guardarBruto, associar, podeEnviar, lerBase, gravarBase,
    anotarMudanca, retomarFila, lerFila, registrarCopiaAceita, enviar, enviarDaBase, rodarFila, restaurar, textoEstado
  };
  root.FolhaCopiaConta = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
