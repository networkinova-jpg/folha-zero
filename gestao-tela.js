/* Estado da tela de teste da Gestão. Não lê folhazero_v1. */
(function (root) {
  const ROTULO_EXEMPLO = 'Exemplo local. Sem mexer no banco.';
  const FRASE_SQL = 'O banco da Gestão ainda não foi aplicado. Você pode ver a demonstração com dados de exemplo.';
  const FRASE_EXPIRADA = 'Sua sessão expirou. Entre de novo com sua conta Google.';
  const FRASE_REVOGAR = 'O vínculo é encerrado e os carros já enviados ficam no histórico da empresa. Nada é apagado do celular.';
  const TELAS_GERENTE = ['inicio', 'setores', 'pausas', 'sla', 'equipes'];
  const VISTO = ['os', 'veiculo', 'setor', 'situacao', 'datas', 'horas', 'pausas'];
  const SO_CELULAR = ['valor', 'ajudante', 'desconto', 'quinzena', 'observacao'];

  function logica() {
    return root.FolhaGestaoProducao;
  }

  function classificarFalha(erro) {
    const bruto = erro && typeof erro === 'object' ? erro : { message: erro == null ? '' : String(erro) };
    const status = Number(bruto.status != null ? bruto.status : bruto.statusCode);
    const code = String(bruto.code || bruto.error_code || '');
    const msg = [bruto.message, bruto.msg, bruto.details, bruto.hint, bruto.error_description, code]
      .filter((parte) => parte != null && parte !== '')
      .join(' ')
      .toLowerCase();
    if (code === 'PGRST202' || msg.includes('pgrst202') || msg.includes('could not find the function') || msg.includes('schema cache')) {
      return 'sql_ausente';
    }
    if (status === 401 || code === 'PGRST301' || msg.includes('pgrst301') || msg.includes('jwt expired') || msg.includes('jwt expirado') || msg.includes('sessao_ausente')) {
      return 'sessao_expirada';
    }
    return 'erro_temporario';
  }

  function vista(estado) {
    const item = estado || {};
    const base = { entrada: false, expirada: false, temporario: false, painel: false, gerente: false, prestador: false, demonstracao: false, sqlAusente: !!item.sqlAusente, botoes: [] };
    if (item.situacao === 'sessao_expirada') return Object.assign({}, base, { expirada: true, botoes: ['sair'] });
    if (item.situacao === 'erro_temporario' && !item.demonstracao) return Object.assign({}, base, { temporario: true, botoes: ['tentar', 'sair'] });
    if (item.sqlAusente && !item.demonstracao) return Object.assign({}, base, { sqlAusente: true, botoes: ['demo', 'sair'] });
    if (item.demonstracao || item.papel === 'gerente') {
      return Object.assign({}, base, { painel: true, gerente: true, demonstracao: !!item.demonstracao, sqlAusente: false, botoes: ['sair'] });
    }
    if (!item.sessao) return Object.assign({}, base, { entrada: true, botoes: ['google'] });
    return Object.assign({}, base, { painel: true, prestador: true, botoes: ['sair'] });
  }

  function textoConsentimento(empresa) {
    const nome = empresa || 'a empresa';
    return 'A empresa ' + nome + ' passa a ver OS, veículo, setor, situação, datas, horas e pausas. Valor, ajudante, desconto, quinzena e observação pessoal ficam só no celular.';
  }

  function filtrarCarros(carros, filtro) {
    const escolha = filtro || {};
    return (carros || []).filter((carro) => {
      const equipe = carro.equipeId || carro.equipe_id || '';
      const email = carro.prestadorEmail || carro.prestador_email || '';
      const setor = carro.setor || '';
      const situacao = carro.situacao || '';
      const busca = String(escolha.busca || '').trim().toLowerCase();
      if (escolha.equipe && equipe !== escolha.equipe) return false;
      if (escolha.prestador && email !== escolha.prestador) return false;
      if (escolha.setor && setor !== escolha.setor && logica().agruparSetor(setor) !== escolha.setor) return false;
      if (escolha.situacao && situacao !== escolha.situacao) return false;
      if (busca && ((carro.os || '') + ' ' + (carro.veiculo || '')).toLowerCase().indexOf(busca) < 0) return false;
      return true;
    });
  }

  function normalizarCarro(carro) {
    const ficha = logica().fichaPermitida(carro || {});
    return {
      os: ficha.os,
      veiculo: ficha.veiculo,
      setor: ficha.setor,
      situacao: ficha.situacao,
      dataInicio: ficha.dataInicio,
      horaInicio: ficha.horaInicio,
      dataTermino: ficha.dataTermino,
      horaTermino: ficha.horaTermino,
      pausas: ficha.pausas,
      equipeId: (carro && (carro.equipeId || carro.equipe_id)) || '',
      equipeNome: (carro && (carro.equipeNome || carro.equipe_nome)) || '',
      prestadorEmail: (carro && (carro.prestadorEmail || carro.prestador_email)) || '',
      prestadorNome: (carro && (carro.prestadorNome || carro.prestador_nome)) || 'Sem nome',
      status: (carro && carro.status) || 'ativo'
    };
  }

  function carrosFora(carros, sla, agora) {
    const prazos = {};
    (sla || []).forEach((item) => { prazos[item.setor] = Number(item.prazoHoras != null ? item.prazoHoras : item.prazo_horas_uteis); });
    return (carros || []).map(normalizarCarro).filter((carro) => {
      const grupo = logica().agruparSetor(carro.setor);
      const prazo = prazos[grupo] != null ? prazos[grupo] : logica().SLA_PADRAO;
      const util = logica().tempoUtil(carro, agora);
      return util.horas && util.minutos >= prazo * 60;
    });
  }

  function montarPainel(dados, filtro) {
    const base = dados || {};
    const geral = logica().indicadores({
      carros: base.carros,
      inicio: base.inicio,
      fim: base.fim,
      agora: base.agora,
      sla: base.sla
    });
    const escolhidos = filtrarCarros(base.carros, filtro);
    const ind = logica().indicadores({
      carros: escolhidos,
      inicio: base.inicio,
      fim: base.fim,
      agora: base.agora,
      sla: base.sla
    });
    const detalhes = (base.carros || []).map((carro) => detalheCarro(carro, geral.sla, base.agora));
    const osVistos = {};
    escolhidos.forEach((carro) => { osVistos[carro.os || 'Sem OS'] = true; });
    const ordem = logica().SETORES.concat([logica().OUTROS]);
    const porOs = {};
    detalhes.forEach((carro) => {
      const chave = carro.os || 'Sem OS';
      if (!porOs[chave]) porOs[chave] = { os: chave, veiculo: carro.veiculo || '', etapas: [] };
      if (!porOs[chave].veiculo && carro.veiculo) porOs[chave].veiculo = carro.veiculo;
      porOs[chave].etapas.push(carro);
    });
    const os = Object.keys(porOs).filter((chave) => osVistos[chave]).map((chave) => {
      const card = porOs[chave];
      card.etapas.sort((a, b) => ordem.indexOf(a.grupo) - ordem.indexOf(b.grupo) || String(a.dataInicio).localeCompare(String(b.dataInicio)));
      return card;
    });
    return {
      ativos: ind.inicio.andamento,
      pausados: ind.inicio.pausasAbertas,
      concluidos: ind.inicio.finalizados,
      foraSla: ind.inicio.foraSla,
      dentro: geral.inicio.dentro,
      perto: geral.inicio.perto,
      mediaGeral: logica().fmtDuracao(geral.inicio.mediaGeralMin),
      gargalos: [ind.gargalos.etapaAnterior, ind.gargalos.maiorTempoUtil, ind.gargalos.maisPausa],
      porSetor: ind.porSetor,
      pausas: ind.pausas,
      sla: geral.sla,
      fora: detalhes.filter((carro) => carro.atrasado && osVistos[carro.os || 'Sem OS']),
      equipes: base.equipes || [],
      vinculos: base.vinculos || [],
      convites: base.convites || [],
      carros: detalhes.filter((carro) => osVistos[carro.os || 'Sem OS']),
      os: os,
      equipesResumo: resumoEquipes(detalhes, base.equipes || [], base.vinculos || [])
    };
  }

  function resumoEquipes(detalhes, equipes, vinculos) {
    return (equipes || []).map((equipe) => {
      const etapas = detalhes.filter((carro) => (carro.equipeId || '') === equipe.id);
      const pessoas = {};
      etapas.forEach((carro) => {
        const email = carro.prestadorEmail || '';
        if (!pessoas[email]) pessoas[email] = { email: email, nome: carro.prestadorNome || 'Sem nome', etapas: [] };
        pessoas[email].etapas.push(carro);
      });
      (vinculos || []).filter((item) => (item.equipe_id || item.equipeId) === equipe.id).forEach((item) => {
        const email = item.email || '';
        if (!pessoas[email]) pessoas[email] = { email: email, nome: item.nome || 'Sem nome', etapas: [] };
      });
      return {
        id: equipe.id,
        nome: equipe.nome,
        status: equipe.status,
        andamento: etapas.filter((carro) => !carro.dataTermino).length,
        concluidos: etapas.filter((carro) => !!carro.dataTermino).length,
        foraSla: etapas.filter((carro) => carro.atrasado).length,
        prestadores: Object.keys(pessoas).map((email) => pessoas[email])
      };
    });
  }

  function detalheCarro(carro, sla, agora) {
    const n = normalizarCarro(carro);
    const grupo = logica().agruparSetor(n.setor);
    const prazoItem = (sla || []).find((item) => item.setor === grupo);
    const oficial = logica().SETORES.indexOf(grupo) >= 0;
    const referencia = prazoItem && prazoItem.referenciaHoras != null
      ? Number(prazoItem.referenciaHoras)
      : (oficial ? logica().SLA_PADRAO : null);
    const usouMedia = !!(prazoItem && prazoItem.usouMedia);
    const util = logica().tempoUtil(n, agora);
    const limite = referencia != null ? referencia * 60 : null;
    const pct = util.horas && limite ? Math.min(100, Math.round((util.minutos / limite) * 100)) : 0;
    const atrasado = !!(util.horas && limite != null && (usouMedia ? util.minutos > limite : util.minutos >= limite));
    const tempo = !util.horas
      ? 'Sem hora para calcular o SLA'
      : (limite != null ? logica().fmtDuracao(util.minutos) + ' de ' + logica().fmtDuracao(limite) : logica().fmtDuracao(util.minutos) + '. Este grupo não tem SLA.');
    const pausaAberta = (n.pausas || []).filter((pausa) => !pausa.fim);
    return Object.assign({}, n, {
      grupo: grupo,
      pct: pct,
      atrasado: atrasado,
      perto: !!(util.horas && limite != null && !atrasado && util.minutos >= limite * 0.8 && !(usouMedia && util.minutos >= limite)),
      tempo: tempo,
      horaInicioTexto: n.horaInicio || 'sem hora',
      horaPausaTexto: pausaAberta.length ? (pausaAberta[0].inicio || '').slice(11, 16) || 'aberta' : 'sem pausa aberta',
      horaTerminoTexto: n.horaTermino || (n.dataTermino ? 'sem hora' : 'em aberto'),
      pausasOperacao: (n.pausas || []).filter((pausa) => !logica().tipoFora(pausa)),
      expediente: (n.pausas || []).filter((pausa) => logica().tipoFora(pausa) === logica().FIM),
      almoco: (n.pausas || []).filter((pausa) => logica().tipoFora(pausa) === logica().ALMOCO)
    });
  }

  function exemploLocal() {
    return {
      rotulo: ROTULO_EXEMPLO,
      empresaNome: 'Oficina Exemplo',
      inicio: '2026-11-01',
      fim: '2026-11-30',
      agora: '2026-11-23T18:00',
      equipes: [
        { id: 'equipe-montagem', nome: 'Montagem', status: 'ativa' },
        { id: 'equipe-vidro', nome: 'Vidro', status: 'ativa' },
        { id: 'equipe-tapecaria', nome: 'Tapeçaria', status: 'ativa' }
      ],
      vinculos: [
        { vinculo: 'v1', email: 'ana@example.invalid', nome: 'Ana', equipe_id: 'equipe-montagem', status: 'ativo' },
        { vinculo: 'v2', email: 'bruno@example.invalid', nome: 'Bruno', equipe_id: 'equipe-vidro', status: 'ativo' },
        { vinculo: 'v3', email: 'carla@example.invalid', nome: 'Carla', equipe_id: 'equipe-tapecaria', status: 'ativo' }
      ],
      convites: [
        { id: 'c1', codigo: 'exemplo10', email: 'novo@example.invalid', status: 'rascunho' }
      ],
      sla: logica().SETORES.map((setor) => ({ setor: setor, prazoHoras: logica().SLA_PADRAO })),
      dispositivo: { ativo: true, dispositivo_id: 'exemplo-celular-01', rotulo: 'Celular de exemplo' },
      carros: [
        {
          os: 'OS-100', veiculo: 'Hilux exemplo', setor: 'Desmontagem', situacao: 'Finalizado',
          dataInicio: '2026-11-18', horaInicio: '08:00', dataTermino: '2026-11-18', horaTermino: '12:00',
          equipeId: 'equipe-montagem', prestadorEmail: 'ana@example.invalid', prestadorNome: 'Ana',
          pausas: []
        },
        {
          os: 'OS-100', veiculo: 'Hilux exemplo', setor: 'Manta', situacao: 'Finalizado',
          dataInicio: '2026-11-19', horaInicio: '08:00', dataTermino: '2026-11-19', horaTermino: '12:30',
          equipeId: 'equipe-montagem', prestadorEmail: 'ana@example.invalid', prestadorNome: 'Ana',
          pausas: [{ motivo: 'Almoço/café', outro: false, inicio: '2026-11-19T12:00', fim: '2026-11-19T12:30' }]
        },
        {
          os: 'OS-100', veiculo: 'Hilux exemplo', setor: 'Vidro', situacao: 'Finalizado',
          dataInicio: '2026-11-20', horaInicio: '08:00', dataTermino: '2026-11-20', horaTermino: '14:00',
          equipeId: 'equipe-vidro', prestadorEmail: 'bruno@example.invalid', prestadorNome: 'Bruno',
          pausas: [{ motivo: 'Almoço/café', outro: false, inicio: '2026-11-20T12:00', fim: '2026-11-20T13:00' }]
        },
        {
          os: 'OS-100', veiculo: 'Hilux exemplo', setor: 'Tapeçaria', situacao: 'Aguardando etapa anterior',
          dataInicio: '2026-11-23', horaInicio: '08:00', dataTermino: '', horaTermino: '',
          equipeId: 'equipe-tapecaria', prestadorEmail: 'carla@example.invalid', prestadorNome: 'Carla',
          pausas: [{ motivo: 'Aguardando etapa anterior', outro: false, inicio: '2026-11-23T14:00', fim: null }]
        },
        {
          os: 'OS-300', veiculo: 'Exemplo steel', setor: 'Steel', situacao: 'Finalizado',
          dataInicio: '2026-11-12', horaInicio: '08:00', dataTermino: '2026-11-12', horaTermino: '17:00',
          equipeId: 'equipe-montagem', prestadorEmail: 'ana@example.invalid', prestadorNome: 'Ana',
          pausas: [{ motivo: 'Fim de expediente', outro: false, inicio: '2026-11-12T12:00', fim: '2026-11-12T13:00' }],
          valor: 999, observacao: 'nao mostrar'
        }
      ]
    };
  }

  const api = {
    ROTULO_EXEMPLO, FRASE_SQL, FRASE_EXPIRADA, FRASE_REVOGAR, TELAS_GERENTE, VISTO, SO_CELULAR,
    classificarFalha, vista, textoConsentimento, filtrarCarros, normalizarCarro, montarPainel, exemploLocal
  };
  root.FolhaGestaoTela = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
