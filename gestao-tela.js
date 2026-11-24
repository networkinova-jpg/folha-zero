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
    const carros = filtrarCarros(base.carros, filtro).map((carro) => detalheCarro(carro, base.sla, base.agora));
    const ind = logica().indicadores({
      carros: carros,
      inicio: base.inicio,
      fim: base.fim,
      agora: base.agora,
      sla: base.sla
    });
    return {
      ativos: ind.inicio.andamento,
      pausados: ind.inicio.pausasAbertas,
      concluidos: ind.inicio.finalizados,
      foraSla: ind.inicio.foraSla,
      gargalos: [ind.gargalos.etapaAnterior, ind.gargalos.maiorTempoUtil, ind.gargalos.maisPausa],
      porSetor: ind.porSetor,
      pausas: ind.pausas,
      sla: ind.sla,
      fora: carrosFora(carros, base.sla, base.agora),
      equipes: base.equipes || [],
      vinculos: base.vinculos || [],
      convites: base.convites || [],
      carros: carros
    };
  }

  function detalheCarro(carro, sla, agora) {
    const n = normalizarCarro(carro);
    const grupo = logica().agruparSetor(n.setor);
    const prazoItem = (sla || []).find((item) => item.setor === grupo);
    const oficial = logica().SETORES.indexOf(grupo) >= 0;
    const prazo = prazoItem
      ? Number(prazoItem.prazoHoras != null ? prazoItem.prazoHoras : prazoItem.prazo_horas_uteis)
      : (oficial ? logica().SLA_PADRAO : null);
    const util = logica().tempoUtil(n, agora);
    const limite = prazo ? prazo * 60 : null;
    const pct = util.horas && limite ? Math.min(100, Math.round((util.minutos / limite) * 100)) : 0;
    const fim = logica().FIM;
    const tempo = !util.horas
      ? 'Sem hora para calcular o SLA'
      : (limite ? Math.round(util.minutos / 60) + ' h úteis de ' + prazo + ' h' : Math.round(util.minutos / 60) + ' h úteis. Este grupo não tem SLA.');
    return Object.assign({}, n, {
      grupo: grupo,
      pct: pct,
      atrasado: !!(util.horas && limite && util.minutos >= limite),
      tempo: tempo,
      pausasOperacao: (n.pausas || []).filter((p) => !(p.motivo === fim && !p.outro)),
      expediente: (n.pausas || []).filter((p) => p.motivo === fim && !p.outro)
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
        { id: 'equipe-a', nome: 'Time A', status: 'ativa' },
        { id: 'equipe-b', nome: 'Time B', status: 'ativa' }
      ],
      vinculos: [
        { vinculo: 'v1', email: 'ana@example.invalid', nome: 'Ana', equipe_id: 'equipe-a', status: 'ativo' },
        { vinculo: 'v2', email: 'bruno@example.invalid', nome: 'Bruno', equipe_id: 'equipe-b', status: 'ativo' },
        { vinculo: 'v3', email: 'carla@example.invalid', nome: 'Carla', equipe_id: 'equipe-a', status: 'ativo' }
      ],
      convites: [
        { id: 'c1', codigo: 'exemplo10', email: 'novo@example.invalid', status: 'rascunho' }
      ],
      sla: logica().SETORES.map((setor) => ({ setor: setor, prazoHoras: setor === 'Vidro' ? 6 : logica().SLA_PADRAO })),
      dispositivo: { ativo: true, dispositivo_id: 'exemplo-celular-01', rotulo: 'Celular de exemplo' },
      carros: [
        {
          os: 'OS-100', veiculo: 'Exemplo tapa', setor: 'Tapeçaria', situacao: 'Aguardando etapa anterior',
          dataInicio: '2026-11-20', horaInicio: '08:00', dataTermino: '', horaTermino: '',
          equipeId: 'equipe-a', prestadorEmail: 'ana@example.invalid', prestadorNome: 'Ana',
          pausas: [{ motivo: 'Aguardando etapa anterior', outro: false, inicio: '2026-11-20T16:00', fim: null }]
        },
        {
          os: 'OS-200', veiculo: 'Exemplo vidro', setor: 'Vidro', situacao: 'Finalizado',
          dataInicio: '2026-11-10', horaInicio: '08:00', dataTermino: '2026-11-10', horaTermino: '12:00',
          equipeId: 'equipe-b', prestadorEmail: 'bruno@example.invalid', prestadorNome: 'Bruno',
          pausas: [{ motivo: 'Faltando vidro', outro: false, inicio: '2026-11-10T09:00', fim: '2026-11-10T09:20' }]
        },
        {
          os: 'OS-300', veiculo: 'Exemplo steel', setor: 'Steel', situacao: 'Finalizado',
          dataInicio: '2026-11-12', horaInicio: '08:00', dataTermino: '2026-11-12', horaTermino: '17:00',
          equipeId: 'equipe-a', prestadorEmail: 'carla@example.invalid', prestadorNome: 'Carla',
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
