/* Fundação de persistência do Folha Zero.
   Não apaga nem renomeia folhazero_v1. Não fala com a rede.
   A cópia online só existe quando o projeto autorizado entregar url e anonKey
   em window.FOLHA_ZERO_NUVEM, e mesmo assim o transporte é injetado por quem
   configura. Este arquivo não tem endpoint, não tem fetch e não aceita service_role. */
(function (root) {
  const KEY = 'folhazero_v1';
  const GUARD = 'folhazero_guardiao';
  const COPIA_PREFIX = 'folhazero_copia_';

  function texto(valor) { return valor == null ? null : String(valor); }

  async function sha256(valor) {
    const dados = new TextEncoder().encode(String(valor));
    const buf = await crypto.subtle.digest('SHA-256', dados);
    return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
  }

  function guardiaoVazio() {
    return {
      versao: 1,
      backups: [],
      vinculo: null,
      fila: [],
      nuvem: { estado: 'desligada', sha256Enviado: null, sha256Confirmado: null, ultimoErro: null }
    };
  }

  function lerGuardiao(storage) {
    try {
      const raw = storage.getItem(GUARD);
      if (!raw) return guardiaoVazio();
      const g = JSON.parse(raw);
      if (!g || typeof g !== 'object') return guardiaoVazio();
      g.versao = 1;
      g.backups = Array.isArray(g.backups) ? g.backups : [];
      g.fila = Array.isArray(g.fila) ? g.fila : [];
      g.vinculo = g.vinculo && typeof g.vinculo === 'object' ? g.vinculo : null;
      g.nuvem = Object.assign(guardiaoVazio().nuvem, g.nuvem || {});
      return g;
    } catch (_) {
      return guardiaoVazio();
    }
  }

  function gravarGuardiao(storage, g) {
    const antes = storage.getItem(KEY);
    storage.setItem(GUARD, JSON.stringify(g));
    if (storage.getItem(KEY) !== antes) throw new Error('guardiao alterou folhazero_v1');
  }

  /* Recusa segredo de servidor. Não devolve o valor recebido. */
  function lerConfig(ambiente) {
    const c = ambiente && ambiente.FOLHA_ZERO_NUVEM;
    if (!c || typeof c !== 'object') return null;
    const chaves = Object.keys(c);
    if (chaves.some(k => /service[_-]?role|senha|secret/i.test(k))) return { erro: 'recusado', motivo: 'segredo_proibido' };
    if (c.anonKey != null && /service_role/i.test(String(c.anonKey))) return { erro: 'recusado', motivo: 'chave_suspeita' };
    if (!c.url || !c.anonKey) return null;
    return { url: String(c.url), anonKey: String(c.anonKey), habilitada: true };
  }

  function configHabilitada(ambiente) {
    const c = lerConfig(ambiente);
    return !!(c && c.habilitada && !c.erro);
  }

  function resumir(doc) {
    const d = doc && typeof doc === 'object' ? doc : {};
    const entries = Array.isArray(d.entries) ? d.entries : [];
    return {
      lancamentos: entries.length,
      ids: entries.map(e => e && e.id).filter(Boolean),
      quinzenas: d.quinzenas && typeof d.quinzenas === 'object' ? Object.keys(d.quinzenas).length : 0,
      descontos: d.descontos && typeof d.descontos === 'object' ? Object.keys(d.descontos).length : 0
    };
  }

  function lerDocumento(raw) {
    if (raw == null || raw === '') return { entries: [], quinzenas: {}, descontos: {}, settings: {} };
    const doc = JSON.parse(raw);
    if (!doc || typeof doc !== 'object' || !Array.isArray(doc.entries)) {
      const err = new Error('documento invalido');
      err.codigo = 'documento_invalido';
      throw err;
    }
    return doc;
  }

  async function escreverCopia(storage, conteudo, motivo) {
    const textoCopia = conteudo == null ? '' : String(conteudo);
    const sha = await sha256(textoCopia);
    const g = lerGuardiao(storage);
    const ja = g.backups.find(b => b.sha256 === sha && b.motivo === motivo && storage.getItem(b.chave) === textoCopia);
    if (ja) return { ok: true, id: ja.id, sha256: sha, chave: ja.chave, repetido: true };
    const id = 'b' + sha.slice(0, 16);
    const chave = COPIA_PREFIX + id;
    const origem = storage.getItem(KEY);
    try {
      storage.setItem(chave, textoCopia);
    } catch (e) {
      return { ok: false, motivo: 'quota_ou_escrita' };
    }
    if (storage.getItem(chave) !== textoCopia) return { ok: false, motivo: 'copia_nao_confere' };
    if (storage.getItem(KEY) !== origem) return { ok: false, motivo: 'origem_alterada' };
    g.backups.push({ id, criadoEm: new Date().toISOString(), bytes: textoCopia.length, sha256: sha, chave, motivo });
    try { gravarGuardiao(storage, g); }
    catch (_) { return { ok: false, motivo: 'quota_ou_escrita', id, sha256: sha, chave }; }
    return { ok: true, id, sha256: sha, chave, repetido: false };
  }

  async function prepararMigracao(storage) {
    const origem = storage.getItem(KEY);
    const copia = await escreverCopia(storage, origem == null ? '' : String(origem), 'pre_migracao');
    if (!copia.ok) return copia;
    if (storage.getItem(KEY) !== origem) return { ok: false, motivo: 'origem_alterada' };
    const g = lerGuardiao(storage);
    if (!(g.nuvem.estado === 'verificada' && g.nuvem.sha256Confirmado === copia.sha256)) {
      g.nuvem.estado = 'backup_local';
      g.nuvem.ultimoErro = null;
    }
    try { gravarGuardiao(storage, g); }
    catch (_) { return { ok: false, motivo: 'quota_ou_escrita', backupId: copia.id, sha256: copia.sha256 }; }
    let ids = [];
    if (origem) {
      try { ids = resumir(lerDocumento(origem)).ids; }
      catch (_) { return { ok: false, motivo: 'documento_invalido', backupId: copia.id }; }
    }
    return { ok: true, backupId: copia.id, sha256: copia.sha256, repetido: copia.repetido, ids, bytes: origem == null ? 0 : String(origem).length };
  }

  function preverRestauracao(storage, backupId) {
    const g = lerGuardiao(storage);
    const b = g.backups.find(x => x.id === backupId);
    if (!b) return { ok: false, motivo: 'backup_ausente' };
    const copia = storage.getItem(b.chave);
    if (copia == null) return { ok: false, motivo: 'copia_ausente' };
    let doc;
    try { doc = lerDocumento(copia); }
    catch (_) { return { ok: false, motivo: 'copia_invalida' }; }
    const atualRaw = storage.getItem(KEY);
    let atual = { lancamentos: 0, ids: [], quinzenas: 0, descontos: 0 };
    if (atualRaw) {
      try { atual = resumir(lerDocumento(atualRaw)); }
      catch (_) { atual = { lancamentos: 0, ids: [], quinzenas: 0, descontos: 0, aviso: 'atual_invalido' }; }
    }
    const copiaResumo = resumir(doc);
    const setCopia = new Set(copiaResumo.ids);
    return {
      ok: true,
      backupId,
      atual,
      copia: copiaResumo,
      idsQueEntram: copiaResumo.ids.filter(id => !atual.ids.includes(id)),
      idsQueSaem: atual.ids.filter(id => !setCopia.has(id))
    };
  }

  async function restaurarBackup(storage, backupId, confirmar) {
    if (confirmar !== true) return { ok: false, motivo: 'sem_confirmacao' };
    const previsto = preverRestauracao(storage, backupId);
    if (!previsto.ok) return previsto;
    const g = lerGuardiao(storage);
    const b = g.backups.find(x => x.id === backupId);
    const copia = storage.getItem(b.chave);
    const atual = storage.getItem(KEY);
    const seguranca = await escreverCopia(storage, atual == null ? '' : String(atual), 'pre_restauracao');
    if (!seguranca.ok) return { ok: false, motivo: 'backup_atual_falhou' };
    if (storage.getItem(KEY) !== atual) return { ok: false, motivo: 'origem_alterada', backupAtual: seguranca.id };
    try {
      storage.setItem(KEY, copia);
    } catch (_) {
      try { if (atual == null) storage.removeItem(KEY); else storage.setItem(KEY, atual); } catch (__) {}
      return { ok: false, motivo: 'escrita_falhou', backupAtual: seguranca.id };
    }
    if (storage.getItem(KEY) !== copia) {
      try { if (atual == null) storage.removeItem(KEY); else storage.setItem(KEY, atual); } catch (__) {}
      return { ok: false, motivo: 'verificacao_falhou', backupAtual: seguranca.id };
    }
    return { ok: true, backupId, backupAtual: seguranca.id, resumo: previsto.copia };
  }

  function atualizadoEm(e) { return String(e && e.updatedAt != null ? e.updatedAt : ''); }

  function mesclarEntradas(a, b) {
    const map = new Map();
    const semId = [];
    const vistosSemId = new Set();
    function por(lista) {
      (lista || []).forEach(e => {
        if (!e || typeof e !== 'object') return;
        if (!e.id) {
          const marca = JSON.stringify(e);
          if (!vistosSemId.has(marca)) { vistosSemId.add(marca); semId.push(e); }
          return;
        }
        const prev = map.get(e.id);
        if (!prev || atualizadoEm(e) > atualizadoEm(prev)) map.set(e.id, e);
      });
    }
    por(a); por(b);
    return Array.from(map.values()).concat(semId);
  }

  function unirMapas(a, b) {
    const out = Object.assign({}, a || {});
    Object.keys(b || {}).forEach(k => { if (!(k in out)) out[k] = b[k]; });
    return out;
  }

  function mesclarEstado(a, b) {
    return {
      entries: mesclarEntradas(a && a.entries, b && b.entries),
      quinzenas: unirMapas(a && a.quinzenas, b && b.quinzenas),
      descontos: unirMapas(a && a.descontos, b && b.descontos)
    };
  }

  function decidirAplicacaoRemota(localDoc, remoto) {
    const localN = localDoc && Array.isArray(localDoc.entries) ? localDoc.entries.length : 0;
    const remotoN = remoto && Array.isArray(remoto.entries) ? remoto.entries.length : 0;
    if (!remoto || typeof remoto !== 'object') return { acao: 'manter_local', motivo: 'remoto_ausente' };
    if (remotoN === 0 && localN > 0) return { acao: 'manter_local', motivo: 'conta_vazia' };
    return { acao: 'mesclar', motivo: 'remoto_com_dados' };
  }

  function aplicarRemoto(localRaw, remoto, escrever) {
    const local = lerDocumento(localRaw || '{"entries":[]}');
    const decisao = decidirAplicacaoRemota(local, remoto);
    if (decisao.acao !== 'mesclar') return Object.assign({ escreveu: false }, decisao);
    const mesclado = mesclarEstado(local, remoto);
    const textoNovo = JSON.stringify(Object.assign({}, local, mesclado));
    if (typeof escrever === 'function') escrever(textoNovo);
    return { acao: 'mesclar', escreveu: typeof escrever === 'function', entries: mesclado.entries.length, ids: mesclado.entries.map(e => e.id).filter(Boolean) };
  }

  function vincularLegado(storage, uid, confirma) {
    if (confirma !== true) return { ok: false, motivo: 'sem_confirmacao' };
    if (!uid || typeof uid !== 'string') return { ok: false, motivo: 'uid_invalido' };
    const antes = storage.getItem(KEY);
    const g = lerGuardiao(storage);
    if (g.vinculo && g.vinculo.uid && g.vinculo.uid !== uid) return { ok: false, motivo: 'outro_perfil' };
    g.vinculo = { uid, confirmadoEm: new Date().toISOString() };
    gravarGuardiao(storage, g);
    if (storage.getItem(KEY) !== antes) return { ok: false, motivo: 'origem_alterada' };
    return { ok: true, uid };
  }

  function sair(storage) {
    const antes = storage.getItem(KEY);
    const g = lerGuardiao(storage);
    g.vinculo = null;
    g.fila = [];
    g.nuvem.estado = 'desligada';
    g.nuvem.sha256Enviado = null;
    gravarGuardiao(storage, g);
    if (storage.getItem(KEY) !== antes) throw new Error('logout alterou folhazero_v1');
    return { ok: true, dadosLocaisPreservados: true };
  }

  function trocarUsuario(storage, novoUid) {
    const antes = storage.getItem(KEY);
    const g = lerGuardiao(storage);
    if (g.vinculo && g.vinculo.uid && g.vinculo.uid !== novoUid) {
      g.vinculo = null;
      g.fila = [];
      g.nuvem.estado = 'desligada';
      g.nuvem.sha256Enviado = null;
      gravarGuardiao(storage, g);
      if (storage.getItem(KEY) !== antes) throw new Error('troca alterou folhazero_v1');
      return { ok: true, acao: 'desvinculou', dadosLocaisPreservados: true };
    }
    if (storage.getItem(KEY) !== antes) throw new Error('troca alterou folhazero_v1');
    return { ok: true, acao: 'mesmo_ou_sem_vinculo', dadosLocaisPreservados: true };
  }

  function marcarConcluida(registro, ack) {
    if (!ack || ack.verificado !== true) return { ok: false, motivo: 'sem_ack', estado: 'aguardando_ack' };
    if (!registro || ack.sha256 !== registro.sha256) return { ok: false, motivo: 'sha_diverge', estado: 'aguardando_ack' };
    if (!Array.isArray(ack.ids) || !Array.isArray(registro.ids)) return { ok: false, motivo: 'ids_ausentes', estado: 'aguardando_ack' };
    const esp = registro.ids.slice().sort().join('|');
    const rec = ack.ids.slice().sort().join('|');
    if (esp !== rec) return { ok: false, motivo: 'ids_divergem', estado: 'aguardando_ack' };
    return { ok: true, estado: 'verificada' };
  }

  function planoDeLinhas(doc, uid) {
    if (!uid || typeof uid !== 'string') {
      const err = new Error('uid obrigatorio');
      err.codigo = 'uid_invalido';
      throw err;
    }
    const entries = Array.isArray(doc && doc.entries) ? doc.entries : [];
    const lancamentos = [];
    const valores = [];
    const pausas = [];
    entries.forEach(e => {
      if (!e || !e.id) return;
      lancamentos.push({
        client_id: e.id,
        owner_id: uid,
        org_id: null,
        empresa: e.empresa || '',
        setor: e.setor || '',
        os: e.os || '',
        veiculo: e.veiculo || '',
        data_inicio: e.dataInicio || null,
        hora_inicio: e.horaInicio || null,
        data_termino: e.dataTermino || null,
        hora_termino: e.horaTermino || null,
        situacao: e.situacao || null,
        obs: e.obs || ''
      });
      valores.push({ client_id: e.id, owner_id: uid, valor: e.valor == null ? null : e.valor, ajudante: e.ajudante == null ? null : e.ajudante });
      (e.pausas || []).forEach(p => pausas.push({ client_id: e.id, owner_id: uid, motivo: p.motivo || '', inicio: p.inicio || null, fim: p.fim || null, outro: !!p.outro }));
    });
    const ajustes = {
      owner_id: uid,
      quinzenas: doc && doc.quinzenas || {},
      descontos: doc && doc.descontos || {},
      valor_padrao: doc && doc.settings && doc.settings.valorPadrao || {},
      aliquota: doc && doc.settings && doc.settings.aliquota || {}
    };
    return { lancamentos, valores, pausas, ajustes };
  }

  async function enviarSeConfigurado(storage, ambiente, transport) {
    const cfg = lerConfig(ambiente);
    if (!cfg || cfg.erro || !cfg.habilitada) return { ok: false, motivo: cfg && cfg.erro ? cfg.motivo : 'desabilitada', rede: false };
    if (typeof transport !== 'function') return { ok: false, motivo: 'sem_transporte', rede: false };
    const g0 = lerGuardiao(storage);
    if (!g0.vinculo || !g0.vinculo.uid) return { ok: false, motivo: 'sem_vinculo', rede: false };
    const prep = await prepararMigracao(storage);
    if (!prep.ok) return prep;
    const g = lerGuardiao(storage);
    if (g.nuvem.estado === 'verificada' && g.nuvem.sha256Confirmado === prep.sha256) {
      return { ok: true, repetido: true, estado: 'verificada', rede: false, sha256: prep.sha256 };
    }
    const mutationId = 'm-' + prep.sha256;
    const fila = g.fila.find(f => f.mutationId === mutationId);
    const ids = fila && Array.isArray(fila.idsPendentes) ? fila.idsPendentes.slice() : prep.ids.slice();
    let resp;
    try {
      resp = await transport({ url: cfg.url, mutationId, sha256: prep.sha256, ids, uid: g0.vinculo.uid });
    } catch (e) {
      const item = { mutationId, idsPendentes: ids, estado: 'erro', ultimoErro: 'rede' };
      const i = g.fila.findIndex(f => f.mutationId === mutationId);
      if (i >= 0) g.fila[i] = item; else g.fila.push(item);
      g.nuvem.estado = 'erro';
      g.nuvem.ultimoErro = 'rede';
      g.nuvem.sha256Enviado = prep.sha256;
      gravarGuardiao(storage, g);
      return { ok: false, motivo: 'rede', estado: 'erro', sha256: prep.sha256 };
    }
    if (resp && Array.isArray(resp.idsPendentes) && resp.idsPendentes.length && resp.verificado !== true) {
      const item = { mutationId, idsPendentes: resp.idsPendentes.slice(), estado: 'parcial', ultimoErro: null };
      const i = g.fila.findIndex(f => f.mutationId === mutationId);
      if (i >= 0) g.fila[i] = item; else g.fila.push(item);
      g.nuvem.estado = 'aguardando_ack';
      g.nuvem.sha256Enviado = prep.sha256;
      g.nuvem.sha256Confirmado = null;
      gravarGuardiao(storage, g);
      return { ok: false, motivo: 'parcial', estado: 'aguardando_ack', idsPendentes: resp.idsPendentes.slice() };
    }
    const marca = marcarConcluida({ sha256: prep.sha256, ids: prep.ids }, resp);
    if (!marca.ok) {
      g.nuvem.estado = 'aguardando_ack';
      g.nuvem.sha256Enviado = prep.sha256;
      g.nuvem.sha256Confirmado = null;
      g.nuvem.ultimoErro = marca.motivo;
      gravarGuardiao(storage, g);
      return marca;
    }
    g.fila = g.fila.filter(f => f.mutationId !== mutationId);
    g.nuvem.estado = 'verificada';
    g.nuvem.sha256Enviado = prep.sha256;
    g.nuvem.sha256Confirmado = prep.sha256;
    g.nuvem.ultimoErro = null;
    gravarGuardiao(storage, g);
    return { ok: true, estado: 'verificada', sha256: prep.sha256, repetido: false };
  }

  root.FolhaPersistencia = {
    KEY,
    GUARD,
    lerConfig,
    configHabilitada,
    prepararMigracao,
    preverRestauracao,
    restaurarBackup,
    mesclarEntradas,
    mesclarEstado,
    decidirAplicacaoRemota,
    aplicarRemoto,
    vincularLegado,
    sair,
    trocarUsuario,
    marcarConcluida,
    planoDeLinhas,
    enviarSeConfigurado,
    resumir,
    sha256
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
