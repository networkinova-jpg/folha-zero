/* Conjunto fictício da tela de teste.
   Grava só em chaves próprias. Não lê nem escreve o aplicativo.
   O envio à nuvem fica desligado até a migração de validação ser aplicada no projeto. */
(function (root) {
  const CHAVE = 'folhazero_teste_fixture';
  const CHAVE_B = 'folhazero_teste_fixture_b';
  const PROIBIDA = 'folhazero_v1';
  const LIMITE_BYTES = 65536;
  const MAX_COPIAS = 3;

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
    if (doc.marca !== 'fixture-teste' || doc.version !== 2) return { ok: false, motivo: 'carga_invalida' };
    if (!Array.isArray(doc.entries) || doc.entries.length < 1 || doc.entries.length > 8) return { ok: false, motivo: 'carga_invalida' };
    if (!doc.settings || doc.settings.operador !== 'Pessoa Exemplo') return { ok: false, motivo: 'carga_invalida' };
    for (const entrada of doc.entries) {
      if (!entrada || typeof entrada.id !== 'string' || !entrada.id || entrada.id.length > 40) return { ok: false, motivo: 'carga_invalida' };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(entrada.dataInicio || '')) return { ok: false, motivo: 'carga_invalida' };
      if (!Array.isArray(entrada.pausas)) return { ok: false, motivo: 'carga_invalida' };
      if (Object.prototype.hasOwnProperty.call(entrada, 'valor') && entrada.valor !== null && typeof entrada.valor !== 'number') {
        return { ok: false, motivo: 'carga_invalida' };
      }
      if (typeof entrada.obs === 'string' && entrada.obs.length > 200) return { ok: false, motivo: 'carga_grande' };
      for (const pausa of entrada.pausas) {
        if (!pausa || typeof pausa.motivo !== 'string' || !pausa.motivo) return { ok: false, motivo: 'carga_invalida' };
        if (!/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(pausa.inicio || '')) return { ok: false, motivo: 'carga_invalida' };
      }
    }
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

  function tentarEnvioRemoto(sessao, agoraMs) {
    const expira = sessao && sessao.expires_at;
    const viva = !!(sessao && sessao.user && sessao.user.id && expira && expira * 1000 > agoraMs);
    if (!viva) return { ok: false, enviou: false, motivo: 'sessao_ausente' };
    return {
      ok: false,
      enviou: false,
      motivo: 'envio_bloqueado',
      pendencias: ['migracao_20261107234500_nao_aplicada', 'schema_private_conferido_sem_liberar_envio']
    };
  }

  const api = {
    CHAVE,
    CHAVE_B,
    PROIBIDA,
    LIMITE_BYTES,
    MAX_COPIAS,
    canon,
    gerarConjunto,
    validarDocumento,
    gravarFixture,
    gerarEGravar,
    comparar,
    simularOutroNavegador,
    tentarEnvioRemoto
  };
  root.FolhaFixture = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
