/* Conjunto fictício da tela de teste.
   Grava só em chaves próprias. Não lê nem escreve o aplicativo.
   A nuvem usa só copias_fixture_teste, no site isolado, com a fixture canônica. */
(function (root) {
  const CHAVE = 'folhazero_teste_fixture';
  const CHAVE_B = 'folhazero_teste_fixture_b';
  const PROIBIDA = 'folhazero_v1';
  const LIMITE_BYTES = 65536;
  const SUPERFICIE = 'copias_fixture_teste';
  const MAX_COPIAS = 1;
  const SHA256_CANON = '57228492711d49c94d20903583163d3241c7861859d12164a5fdc8ac97b2e365';
  const HOST_TESTE = 'wild-voice-4f08.folha-zero-networkinova.workers.dev';
  const PAGINA_NUVEM = 'https://' + HOST_TESTE + '/acesso-teste';
  const PAGINA_APP = 'https://' + HOST_TESTE + '/app-teste';

  function gerarConjunto() {
    return {
      version: 2,
      marca: 'fixture-teste',
      entries: [
        {
          id: 'fx-aco-01',
          empresa: 'INOVA Blindagem',
          setor: 'Tapeçaria',
          os: 'OS-FIXTURE-01',
          veiculo: 'Veículo fictício',
          dataInicio: '2026-11-02',
          horaInicio: '08:15',
          dataTermino: '2026-11-02',
          horaTermino: '17:00',
          situacao: 'Finalizado',
          pausas: [
            { motivo: 'Fim de expediente', inicio: '2026-11-02T12:00', fim: '2026-11-02T13:00' },
            { motivo: 'Aço da maçaneta', inicio: '2026-11-02T15:00', fim: '2026-11-02T15:20', outro: true }
          ],
          valor: 0,
          ajudante: 0,
          obs: 'Peça de teste com acento',
          exemplo: true,
          createdAt: 1762041600000,
          updatedAt: 1762070400000
        },
        {
          id: 'fx-vidro-02',
          empresa: 'INOVA Blindagem',
          setor: 'Vidro',
          os: 'OS-FIXTURE-02',
          veiculo: 'Carro sem valor',
          dataInicio: '2026-11-03',
          horaInicio: '09:00',
          dataTermino: null,
          horaTermino: null,
          situacao: 'Em processo',
          pausas: [],
          valor: null,
          ajudante: null,
          obs: '',
          exemplo: true,
          createdAt: 1762128000000,
          updatedAt: 1762128000000
        }
      ],
      quinzenas: {},
      descontos: {},
      settings: {
        operador: 'Pessoa Exemplo',
        setorOperador: 'Tapeçaria',
        lastBackup: null,
        valorPadrao: { 'INOVA Blindagem': 0 },
        aliquota: {}
      }
    };
  }

  function canon(valor) {
    if (Array.isArray(valor)) return '[' + valor.map(canon).join(',') + ']';
    if (valor && typeof valor === 'object') {
      return '{' + Object.keys(valor).sort().map((k) => JSON.stringify(k) + ':' + canon(valor[k])).join(',') + '}';
    }
    return JSON.stringify(valor);
  }

  function validarDocumento(doc) {
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return { ok: false, motivo: 'carga_invalida' };
    const texto = canon(doc);
    if (texto.length > LIMITE_BYTES) return { ok: false, motivo: 'carga_grande' };
    if (texto !== canon(gerarConjunto())) return { ok: false, motivo: 'carga_invalida' };
    return { ok: true };
  }

  function gravarFixture(storage, chave, documento) {
    if (chave === PROIBIDA || (chave !== CHAVE && chave !== CHAVE_B)) {
      return { ok: false, motivo: 'chave_proibida', escreveu: false };
    }
    const v = validarDocumento(documento);
    if (!v.ok) return { ok: false, motivo: v.motivo, escreveu: false };
    storage.setItem(chave, canon(documento));
    return { ok: true, escreveu: true, chave };
  }

  function gerarEGravar(storage) {
    const documento = gerarConjunto();
    const gravado = gravarFixture(storage, CHAVE, documento);
    return Object.assign({ documento }, gravado);
  }

  function comparar(a, b) {
    const ca = canon(a);
    const cb = canon(b);
    const ids = (a.entries || []).map((e) => e.id);
    const pausas = (a.entries || []).reduce((n, e) => n + (e.pausas || []).length, 0);
    const zero = (a.entries || []).some((e) => e.valor === 0);
    const ausente = (a.entries || []).some((e) => e.valor === null);
    const acentos = /[áàãâéêíóôõúç]/i.test(ca);
    const ok = ca === cb && ids.length === 2 && pausas === 2 && zero && ausente && acentos;
    return { ok, ids, pausas, valorZero: zero, valorAusente: ausente, acentos, motivo: ok ? 'integro' : 'divergente' };
  }

  function simularOutroNavegador(storageA, storageB) {
    const bruto = storageA.getItem(CHAVE);
    if (bruto == null) return { ok: false, motivo: 'sem_fixture' };
    let doc;
    try { doc = JSON.parse(bruto); }
    catch (_) { return { ok: false, motivo: 'carga_invalida' }; }
    const gravado = gravarFixture(storageB, CHAVE_B, doc);
    if (!gravado.ok) return gravado;
    return comparar(doc, JSON.parse(storageB.getItem(CHAVE_B)));
  }

  function paginaPermitida(location) {
    try {
      const u = new URL(location.href);
      if (u.hostname === 'networkinova-jpg.github.io') return { ok: false, motivo: 'origem_producao' };
      const aqui = u.origin + u.pathname;
      if (u.protocol !== 'https:' || u.hostname !== HOST_TESTE || (aqui !== PAGINA_NUVEM && aqui !== PAGINA_APP)) {
        return { ok: false, motivo: 'origem_nao_autorizada' };
      }
      return { ok: true };
    } catch (_) {
      return { ok: false, motivo: 'origem_nao_autorizada' };
    }
  }

  function sessaoViva(sessao, agoraMs) {
    const expira = sessao && sessao.expires_at;
    return !!(sessao && sessao.user && sessao.user.id && expira && expira * 1000 > agoraMs);
  }

  function planejarEnvio(opts) {
    const origem = paginaPermitida(opts.location);
    if (!origem.ok) return { ok: false, enviou: false, motivo: origem.motivo };
    if (!sessaoViva(opts.sessao, opts.agoraMs)) return { ok: false, enviou: false, motivo: 'sessao_ausente' };
    const doc = gerarConjunto();
    if (opts.documento && canon(opts.documento) !== canon(doc)) return { ok: false, enviou: false, motivo: 'nao_canonico' };
    return {
      ok: true,
      enviou: false,
      pedido: { owner_id: opts.sessao.user.id, sha256: SHA256_CANON, bytes: 1, documento: doc }
    };
  }

  function resumirErro(error) {
    const codigo = String(error && error.code || '');
    if (codigo === '23505') return 'ja_existe';
    if (codigo === '23514') return 'carga_recusada';
    if (codigo === '42501' || codigo === 'PGRST301') return 'sessao_ausente';
    return 'envio_recusado';
  }

  async function enviarComCliente(cliente, pedido) {
    if (!pedido || pedido.sha256 !== SHA256_CANON || canon(pedido.documento) !== canon(gerarConjunto())) {
      return { ok: false, enviou: false, motivo: 'nao_canonico' };
    }
    const { error } = await cliente.from(SUPERFICIE).insert({
      owner_id: pedido.owner_id,
      sha256: pedido.sha256,
      bytes: pedido.bytes,
      documento: pedido.documento
    });
    if (!error) return { ok: true, enviou: true, jaExistia: false };
    const motivo = resumirErro(error);
    if (motivo === 'ja_existe') return { ok: true, enviou: false, jaExistia: true, motivo };
    return { ok: false, enviou: false, motivo };
  }

  async function listarComCliente(cliente) {
    const { data, error } = await cliente.from(SUPERFICIE).select('sha256,bytes,criado_em').order('criado_em', { ascending: false }).limit(1);
    if (error) return { ok: false, motivo: 'lista_recusada', itens: [] };
    return { ok: true, itens: (data || []).map((item) => ({ sha256: item.sha256, bytes: item.bytes })) };
  }

  async function restaurarComCliente(cliente, storage) {
    const { data, error } = await cliente.from(SUPERFICIE).select('sha256,documento').limit(1);
    if (error) return { ok: false, escreveu: false, motivo: 'leitura_recusada' };
    const doc = gerarConjunto();
    const alvo = (data || []).find((row) => row && row.sha256 === SHA256_CANON && canon(row.documento) === canon(doc));
    if (!alvo) return { ok: false, escreveu: false, motivo: 'canonico_ausente' };
    const gravado = gravarFixture(storage, CHAVE, doc);
    if (!gravado.ok) return { ok: false, escreveu: false, motivo: gravado.motivo };
    return Object.assign({ escreveu: true }, comparar(doc, JSON.parse(storage.getItem(CHAVE))));
  }

  const api = {
    CHAVE,
    CHAVE_B,
    PROIBIDA,
    LIMITE_BYTES,
    SUPERFICIE,
    MAX_COPIAS,
    SHA256_CANON,
    HOST_TESTE,
    PAGINA_NUVEM,
    PAGINA_APP,
    paginaPermitida,
    planejarEnvio,
    enviarComCliente,
    listarComCliente,
    restaurarComCliente,
    canon,
    gerarConjunto,
    validarDocumento,
    gravarFixture,
    gerarEGravar,
    comparar,
    simularOutroNavegador
  };
  root.FolhaFixture = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
