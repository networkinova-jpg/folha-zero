/* Versão de teste do app. Não lê nem grava a chave do aplicativo publicado.
   A fixture local reproduz lançamentos e pausas. O remoto canônico é outra ação. */
(function (root) {
  const CHAVE_APP = 'folhazero_teste_app';
  const CHAVE_COPIA = 'folhazero_teste_app_copia';
  const CHAVE_CONTA = 'folhazero_teste_conta';
  const PROIBIDA = 'folhazero_v1';
  const VERSAO = 2;

  function documentoFixture() {
    return {
      version: VERSAO,
      entries: [
        {
          id: 'fx-aco-01', empresa: 'INOVA Blindagem', setor: 'Tapeçaria', os: 'OS-FIXTURE-01',
          veiculo: 'Veículo fictício', dataInicio: '2026-11-02', horaInicio: '08:15',
          dataTermino: '2026-11-02', horaTermino: '17:00', situacao: 'Finalizado',
          pausas: [
            { motivo: 'Fim de expediente', inicio: '2026-11-02T12:00', fim: '2026-11-02T13:00' },
            { motivo: 'Aço da maçaneta', inicio: '2026-11-02T15:00', fim: '2026-11-02T15:20', outro: true }
          ],
          valor: 0, ajudante: 0, obs: 'Peça de teste com acento', exemplo: true,
          createdAt: 1762041600000, updatedAt: 1762070400000
        },
        {
          id: 'fx-vidro-02', empresa: 'INOVA Blindagem', setor: 'Vidro', os: 'OS-FIXTURE-02',
          veiculo: 'Carro sem valor', dataInicio: '2026-11-03', horaInicio: '09:00',
          dataTermino: null, horaTermino: null, situacao: 'Em processo',
          pausas: [], valor: null, ajudante: null, obs: '', exemplo: true,
          createdAt: 1762128000000, updatedAt: 1762128000000
        }
      ],
      quinzenas: { 'INOVA Blindagem|2026|11|1': 'Aberta' },
      descontos: {},
      settings: {
        operador: 'Pessoa Exemplo', setorOperador: 'Tapeçaria', lastBackup: null,
        valorPadrao: { 'INOVA Blindagem': 0 }, aliquota: {}
      }
    };
  }

  function proibida(chave) { return chave === PROIBIDA; }

  function lerJson(storage, chave) {
    if (proibida(chave)) return { ok: false, motivo: 'chave_proibida' };
    const bruto = storage.getItem(chave);
    if (bruto == null || bruto === '') return { ok: true, vazio: true, documento: null };
    try { return { ok: true, vazio: false, documento: JSON.parse(bruto) }; }
    catch (_) { return { ok: false, motivo: 'documento_invalido' }; }
  }

  function resumo(entrada) {
    return JSON.stringify({
      id: entrada && entrada.id,
      dataInicio: entrada && entrada.dataInicio,
      dataTermino: entrada && entrada.dataTermino,
      valor: entrada && entrada.valor,
      situacao: entrada && entrada.situacao,
      os: entrada && entrada.os,
      obs: entrada && entrada.obs,
      pausas: entrada && entrada.pausas
    });
  }

  function previa(storage, novo) {
    const local = lerJson(storage, CHAVE_APP);
    const atuais = local.ok && local.documento && Array.isArray(local.documento.entries) ? local.documento.entries : [];
    const entradas = novo && Array.isArray(novo.entries) ? novo.entries : [];
    const mapa = new Map(atuais.map((e) => [e.id, resumo(e)]));
    const colisoes = entradas.filter((e) => mapa.has(e.id) && mapa.get(e.id) !== resumo(e)).map((e) => e.id);
    return {
      locais: atuais.length,
      novos: entradas.length,
      colisoes,
      versao: novo && novo.version,
      ids: entradas.map((e) => e.id)
    };
  }

  function semearSeVazio(storage) {
    if (storage.getItem(CHAVE_APP)) return { ok: true, semeou: false };
    storage.setItem(CHAVE_APP, JSON.stringify(documentoFixture()));
    return { ok: true, semeou: true };
  }

  function aplicarDocumento(storage, novo, confirmar) {
    const info = previa(storage, novo);
    if (!novo || novo.version !== VERSAO || !Array.isArray(novo.entries)) {
      return { ok: false, escreveu: false, motivo: 'versao', previa: info };
    }
    if (confirmar !== true) return { ok: false, escreveu: false, motivo: 'sem_confirmacao', previa: info };
    const atual = storage.getItem(CHAVE_APP);
    try {
      if (atual != null) storage.setItem(CHAVE_COPIA, atual);
      const texto = JSON.stringify(novo);
      storage.setItem(CHAVE_APP, texto);
      if (storage.getItem(CHAVE_APP) !== texto) throw new Error('leitura');
    } catch (_) {
      try {
        if (atual == null) storage.removeItem(CHAVE_APP);
        else storage.setItem(CHAVE_APP, atual);
      } catch (__) {}
      return { ok: false, escreveu: false, motivo: 'rollback', previa: info };
    }
    return { ok: true, escreveu: true, motivo: 'gravado', previa: info };
  }

  function sair(storage) {
    const antes = storage.getItem(CHAVE_APP);
    const copia = storage.getItem(CHAVE_COPIA);
    return { ok: storage.getItem(CHAVE_APP) === antes && storage.getItem(CHAVE_COPIA) === copia, apagou: false };
  }

  function trocarConta(storage, contaNova) {
    const antes = storage.getItem(CHAVE_APP);
    const anterior = storage.getItem(CHAVE_CONTA);
    storage.setItem(CHAVE_CONTA, contaNova || '');
    return {
      ok: storage.getItem(CHAVE_APP) === antes,
      trocou: !!(anterior && contaNova && anterior !== contaNova),
      enviou: false,
      apagou: false
    };
  }

  function aposFalha(storage, antes) {
    return { ok: storage.getItem(CHAVE_APP) === antes, perdeu: false };
  }

  const api = {
    CHAVE_APP, CHAVE_COPIA, CHAVE_CONTA, PROIBIDA, VERSAO,
    documentoFixture, previa, semearSeVazio, aplicarDocumento, sair, trocarConta, aposFalha
  };
  root.FolhaModoTeste = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root.FOLHA_ZERO_MODO_TESTE === true && typeof localStorage !== 'undefined') {
    try { api.semearSeVazio(localStorage); } catch (_) {}
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
