/* Indicadores da Gestão de Produção. Não lê folhazero_v1 nem a cópia da conta. */
(function (root) {
  const SETORES = ['Desmontagem', 'Manta', 'Aço', 'Overlap', 'Tampa', 'Vidro', 'Montagem', 'Tapeçaria', 'Aço de retrovisor', 'Churrasqueira'];
  const OUTROS = 'Outros';
  const MOTIVOS = ['Faltando peça', 'Faltando vidro', 'Problemas elétricos', 'Problemas com vidro', 'Aguardando etapa anterior', 'Aguardando vidraceiro', 'Aguardando ajuste da produção', 'Impasse na resolução de um problema'];
  const FIM = 'Fim de expediente';
  const ETAPA = 'Aguardando etapa anterior';
  const SLA_PADRAO = 8;
  const CAMPOS = ['os', 'veiculo', 'setor', 'situacao', 'dataInicio', 'horaInicio', 'dataTermino', 'horaTermino', 'pausas'];
  const PROIBIDOS = ['valor', 'ajudante', 'desconto', 'quinzena', 'observacao', 'obs', 'documento', 'aliquota', 'copias_conta'];

  function agruparSetor(setor) {
    return SETORES.indexOf(setor) >= 0 ? setor : OUTROS;
  }

  function fichaPermitida(entrada) {
    const item = entrada && typeof entrada === 'object' ? entrada : {};
    const pausas = Array.isArray(item.pausas) ? item.pausas.map((pausa) => ({
      motivo: String(pausa && pausa.motivo || ''),
      outro: !!(pausa && pausa.outro),
      inicio: pausa && pausa.inicio ? String(pausa.inicio) : '',
      fim: pausa && pausa.fim ? String(pausa.fim) : null
    })) : [];
    const ficha = {
      os: item.os ? String(item.os) : '',
      veiculo: item.veiculo ? String(item.veiculo) : '',
      setor: item.setor ? String(item.setor) : '',
      situacao: item.situacao ? String(item.situacao) : '',
      dataInicio: item.dataInicio || item.data_inicio || '',
      horaInicio: item.horaInicio || item.hora_inicio || '',
      dataTermino: item.dataTermino || item.data_termino || '',
      horaTermino: item.horaTermino || item.hora_termino || '',
      pausas: pausas
    };
    PROIBIDOS.forEach((chave) => { delete ficha[chave]; });
    return ficha;
  }

  function consentir(pedido) {
    const item = pedido || {};
    const texto = String(item.texto || '').trim();
    const empresa = String(item.empresa || '').trim();
    if (item.confirma !== true) return { ok: false, motivo: 'sem_confirmacao', compartilhou: false };
    if (!texto) return { ok: false, motivo: 'texto_ausente', compartilhou: false };
    if (empresa && texto.indexOf(empresa) < 0) return { ok: false, motivo: 'empresa_ausente_no_texto', compartilhou: false };
    return { ok: true, motivo: 'aceitou', compartilhou: false, acao: 'aceitou', escopo: CAMPOS.slice() };
  }

  function revogar() {
    return { ok: true, acao: 'revogou', apagaLocal: false, encerraFichas: true, enviaNovo: false };
  }

  function decidirDispositivo(pedido) {
    const item = pedido || {};
    const novo = String(item.novoId || '');
    const ativo = item.ativo && item.ativo.id ? String(item.ativo.id) : '';
    if (novo.length < 8) return { ok: false, motivo: 'dispositivo_invalido' };
    if (!ativo) return { ok: true, acao: 'ativar', ativoId: novo };
    if (ativo === novo) return { ok: true, acao: 'mesmo', ativoId: novo };
    if (item.confirma !== true) return { ok: false, motivo: 'troca_pendente', ativoId: ativo };
    return { ok: true, acao: 'trocar', ativoId: novo, anterior: ativo, apagaLocal: false };
  }

  function minutosDe(texto) {
    if (!texto || String(texto).length < 16) return null;
    const dia = String(texto).slice(0, 10).split('-').map(Number);
    const hora = String(texto).slice(11, 16).split(':').map(Number);
    if (dia.length < 3 || hora.length < 2) return null;
    return Date.UTC(dia[0], dia[1] - 1, dia[2], hora[0], hora[1]) / 60000;
  }

  function instante(data, hora) {
    if (!data || !hora) return null;
    return minutosDe(data + 'T' + hora);
  }

  function tempoUtil(carro, agora) {
    const inicio = instante(carro.dataInicio, carro.horaInicio);
    const fimInformado = instante(carro.dataTermino, carro.horaTermino);
    const fim = fimInformado != null ? fimInformado : (carro.dataTermino ? null : minutosDe(agora));
    if (inicio == null || fim == null || fim < inicio) return { minutos: null, horas: false, pausa: 0, fora: 0 };
    let pausa = 0;
    let fora = 0;
    (carro.pausas || []).forEach((item) => {
      const a = minutosDe(item.inicio);
      const b = item.fim ? minutosDe(item.fim) : minutosDe(agora);
      if (a == null || b == null) return;
      const trecho = Math.max(0, Math.min(b, fim) - Math.max(a, inicio));
      if (item.motivo === FIM && !item.outro) fora += trecho;
      else pausa += trecho;
    });
    return { minutos: Math.max(0, fim - inicio - pausa - fora), horas: true, pausa: pausa, fora: fora };
  }

  function noPeriodo(carro, inicio, fim) {
    if (carro.dataTermino) return carro.dataTermino >= inicio && carro.dataTermino <= fim;
    return !!carro.dataInicio && carro.dataInicio <= fim;
  }

  function pausaAberta(carro) {
    const lista = carro.pausas || [];
    if (carro.dataTermino || !lista.length) return null;
    const ultima = lista[lista.length - 1];
    return ultima && !ultima.fim ? ultima : null;
  }

  function vazioSetor(nome) {
    return {
      setor: nome, andamento: 0, finalizados: 0, tempoUtilMin: 0, comHora: 0,
      etapaAnterior: 0, pausaMin: 0, dentro: 0, perto: 0, atrasado: 0, semHora: 0
    };
  }

  function classeSla(minutos, prazoHoras) {
    if (minutos == null || prazoHoras == null) return 'sem_hora';
    const limite = Number(prazoHoras) * 60;
    if (minutos >= limite) return 'atrasado';
    if (minutos >= limite * 0.8) return 'perto';
    return 'dentro';
  }

  function indicadores(entrada) {
    const pedido = entrada || {};
    const inicio = pedido.inicio;
    const fim = pedido.fim;
    const agora = pedido.agora || (fim + 'T23:59');
    const prazos = {};
    (pedido.sla || []).forEach((item) => { prazos[item.setor] = Number(item.prazoHoras != null ? item.prazoHoras : item.prazo_horas_uteis); });
    SETORES.forEach((nome) => { if (prazos[nome] == null) prazos[nome] = SLA_PADRAO; });
    const setores = {};
    SETORES.forEach((nome) => { setores[nome] = vazioSetor(nome); });
    const equipes = {};
    const pessoas = {};
    const motivos = {};
    MOTIVOS.forEach((nome) => { motivos[nome] = { motivo: nome, outro: false, fimExp: false, min: 0, qtd: 0 }; });
    motivos[FIM] = { motivo: FIM, outro: false, fimExp: true, min: 0, qtd: 0 };
    let andamento = 0;
    let finalizados = 0;
    let pausasAbertas = 0;
    let foraSla = 0;
    (pedido.carros || []).filter((carro) => noPeriodo(carro, inicio, fim)).forEach((bruto) => {
      const carro = fichaPermitida(bruto);
      const grupo = agruparSetor(carro.setor);
      if (!setores[grupo]) setores[grupo] = vazioSetor(grupo);
      const box = setores[grupo];
      const aberto = !carro.dataTermino;
      const util = tempoUtil(carro, agora);
      const equipe = bruto.equipeId || bruto.equipe_id || 'sem equipe';
      const email = bruto.prestadorEmail || bruto.prestador_email || '';
      if (!equipes[equipe]) equipes[equipe] = { equipe: equipe, andamento: 0, finalizados: 0, tempoUtilMin: 0, comHora: 0, pausaMin: 0 };
      if (!pessoas[email]) pessoas[email] = { email: email, nome: bruto.prestadorNome || bruto.prestador_nome || 'Sem nome', equipe: equipe, andamento: 0, finalizados: 0, tempoUtilMin: 0, comHora: 0, pausaAberta: false };
      if (aberto) { andamento += 1; box.andamento += 1; equipes[equipe].andamento += 1; pessoas[email].andamento += 1; }
      else { finalizados += 1; box.finalizados += 1; equipes[equipe].finalizados += 1; pessoas[email].finalizados += 1; }
      if (carro.situacao === ETAPA) box.etapaAnterior += 1;
      if (util.horas) {
        box.tempoUtilMin += util.minutos;
        box.comHora += 1;
        box.pausaMin += util.pausa;
        equipes[equipe].tempoUtilMin += util.minutos;
        equipes[equipe].comHora += 1;
        equipes[equipe].pausaMin += util.pausa;
        pessoas[email].tempoUtilMin += util.minutos;
        pessoas[email].comHora += 1;
        const classe = classeSla(util.minutos, prazos[grupo]);
        if (classe === 'atrasado') { box.atrasado += 1; foraSla += 1; }
        else if (classe === 'perto') box.perto += 1;
        else if (classe === 'dentro') box.dentro += 1;
        else box.semHora += 1;
      } else box.semHora += 1;
      const aberta = pausaAberta(Object.assign({}, carro, { dataTermino: carro.dataTermino }));
      if (aberta && aberta.motivo !== FIM) { pausasAbertas += 1; pessoas[email].pausaAberta = true; }
      (carro.pausas || []).forEach((pausa) => {
        if (!pausa.fim) return;
        const a = minutosDe(pausa.inicio);
        const b = minutosDe(pausa.fim);
        if (a == null || b == null) return;
        const trecho = Math.max(0, b - a);
        const chave = pausa.motivo === FIM && !pausa.outro ? FIM : (pausa.outro || MOTIVOS.indexOf(pausa.motivo) < 0 ? 'outro:' + pausa.motivo : pausa.motivo);
        if (!motivos[chave]) motivos[chave] = { motivo: pausa.motivo, outro: chave !== FIM && chave !== pausa.motivo || !!pausa.outro, fimExp: chave === FIM, min: 0, qtd: 0 };
        if (chave.indexOf('outro:') === 0) motivos[chave].outro = true;
        motivos[chave].min += trecho;
        motivos[chave].qtd += 1;
      });
    });
    const listaSetores = SETORES.map((nome) => setores[nome]);
    if (setores[OUTROS] && (setores[OUTROS].andamento || setores[OUTROS].finalizados)) listaSetores.push(setores[OUTROS]);
    const media = (box) => box.comHora ? Math.round(box.tempoUtilMin / box.comHora) : null;
    let setorMaisParado = SETORES[0];
    let melhorParado = -1;
    SETORES.concat(setores[OUTROS] ? [OUTROS] : []).forEach((nome) => {
      const box = setores[nome];
      const nota = box.etapaAnterior * 100000 + box.pausaMin;
      if (nota > melhorParado) { melhorParado = nota; setorMaisParado = nome; }
    });
    function maior(campo) {
      let escolhido = SETORES[0];
      let valor = -1;
      listaSetores.forEach((box) => {
        const nota = campo === 'media' ? (media(box) || 0) : box[campo];
        if (nota > valor) { valor = nota; escolhido = box.setor; }
      });
      return escolhido;
    }
    const ordemMotivos = MOTIVOS.slice();
    Object.keys(motivos).forEach((chave) => { if (ordemMotivos.indexOf(chave) < 0 && chave !== FIM) ordemMotivos.push(chave); });
    ordemMotivos.push(FIM);
    return {
      inicio: { andamento: andamento, finalizados: finalizados, pausasAbertas: pausasAbertas, foraSla: foraSla, setorMaisParado: setorMaisParado },
      porSetor: listaSetores.map((box) => Object.assign({}, box, { tempoUtilMedioMin: media(box) })),
      porEquipe: Object.keys(equipes).map((chave) => Object.assign({}, equipes[chave], { tempoUtilMedioMin: media(equipes[chave]) })),
      porPrestador: Object.keys(pessoas).filter((chave) => chave).map((chave) => Object.assign({}, pessoas[chave], { tempoUtilMedioMin: media(pessoas[chave]) })),
      pausas: ordemMotivos.filter((chave) => motivos[chave]).map((chave) => motivos[chave]),
      gargalos: {
        etapaAnterior: maior('etapaAnterior'),
        maiorTempoUtil: maior('media'),
        maisPausa: maior('pausaMin')
      },
      sla: SETORES.map((nome) => ({
        setor: nome,
        prazoHoras: prazos[nome],
        dentro: setores[nome].dentro,
        perto: setores[nome].perto,
        atrasado: setores[nome].atrasado
      }))
    };
  }

  const api = {
    SETORES, OUTROS, MOTIVOS, FIM, SLA_PADRAO, CAMPOS, PROIBIDOS,
    agruparSetor, fichaPermitida, consentir, revogar, decidirDispositivo, tempoUtil, indicadores
  };
  root.FolhaGestaoProducao = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
