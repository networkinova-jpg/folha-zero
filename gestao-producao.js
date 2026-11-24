import { createClient } from '@supabase/supabase-js';
import { FOLHA_ZERO_TESTE } from './acesso-teste-config.js';
import './login-google.js';
import './acesso-senha.js';
import './gestao-producao-logica.js';
import './gestao-tela.js';

const G = globalThis.FolhaLoginGoogle;
const S = globalThis.FolhaAcessoSenha;
const T = globalThis.FolhaGestaoTela;
const $ = (id) => document.getElementById(id);
const CHAVE_APARELHO = 'folhazero_teste_dispositivo';

let supabaseAtual = null;
let estado = { sessao: false, situacao: '', papel: 'nenhum', demonstracao: false, sqlAusente: false };
let telaAtual = 'inicio';
let dados = null;
let filtro = { equipe: '', prestador: '', setor: '', situacao: '', busca: '' };
let equipeAberta = '';
let toastTimer = 0;

function texto(id, valor) {
  const el = $(id);
  if (el) el.textContent = valor == null ? '' : String(valor);
}

function cliente() {
  const cfg = FOLHA_ZERO_TESTE || {};
  const chave = cfg.publishableKey || '';
  if (!cfg.url || !chave.startsWith('sb_publishable_') || /service_role/i.test(chave)) return null;
  return createClient(cfg.url, chave, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' }
  });
}

function limpar(id) {
  const el = $(id);
  if (el) el.replaceChildren();
  return el;
}

function paragrafo(textoLinha) {
  const p = document.createElement('p');
  p.className = 'hint';
  p.textContent = textoLinha;
  return p;
}

function botao(rotulo, aoClicar) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'btn ghost';
  el.textContent = rotulo;
  el.addEventListener('click', aoClicar);
  return el;
}

function aparelhoLocal() {
  let id = '';
  try { id = localStorage.getItem(CHAVE_APARELHO) || ''; } catch (_) { id = ''; }
  if (id.length >= 8) return id;
  id = 'ap' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  try { localStorage.setItem(CHAVE_APARELHO, id); } catch (_) {}
  return id;
}

function periodoAtual() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return {
    inicio: d.getFullYear() + '-' + p(d.getMonth() + 1) + '-01',
    fim: d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(ultimo),
    agora: d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes())
  };
}

async function renovar(supabase) {
  try {
    const renovada = await supabase.auth.refreshSession();
    return !!(renovada && !renovada.error && renovada.data && renovada.data.session);
  } catch (_) { return false; }
}

function criarChamada(supabase) {
  let renovou = false;
  return async function chamar(nome, args) {
    try {
      const { data, error } = await supabase.rpc(nome, args || {});
      if (error) throw error;
      return { ok: true, data: data };
    } catch (erro) {
      const tipo = T.classificarFalha(erro);
      if (tipo === 'sessao_expirada' && !renovou) {
        renovou = true;
        if (await renovar(supabase)) return chamar(nome, args);
      }
      return { ok: false, tipo: tipo };
    }
  };
}

function desenhar() {
  const v = T.vista(estado);
  $('tela-entrada').classList.toggle('hidden', !v.entrada);
  $('st-expirada').classList.toggle('hidden', !v.expirada);
  $('st-temporario').classList.toggle('hidden', !v.temporario);
  $('st-sql').classList.toggle('hidden', !v.sqlAusente);
  $('painel').classList.toggle('hidden', !v.painel);
  $('nav-gerente').classList.toggle('hidden', !v.gerente);
  $('st-exemplo').classList.toggle('hidden', !v.demonstracao);
  $('tela-prestador').classList.toggle('hidden', !v.prestador);
  T.TELAS_GERENTE.forEach((nome) => {
    const bloco = $('tela-' + nome);
    if (bloco) bloco.classList.toggle('hidden', !v.gerente || telaAtual !== nome);
  });
  document.querySelectorAll('#nav-gerente [data-tela]').forEach((el) => {
    el.classList.toggle('primary', el.getAttribute('data-tela') === telaAtual);
  });
  texto('chip-modo', estado.demonstracao ? 'Demonstração local' : 'Ao vivo');
  texto('chip-papel', v.gerente ? 'Gerente' : (v.prestador ? 'Prestador' : ''));
  if (v.gerente && dados) pintarGerente();
  if (v.prestador) pintarPrestador();
}

function avisar(msg) {
  const el = $('ux-toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2400);
}

function pintarGerente() {
  const geral = T.montarPainel(dados, {});
  const painel = T.montarPainel(dados, filtro);
  texto('st-empresa', (estado.demonstracao ? T.ROTULO_EXEMPLO + ' ' : '') + (dados.empresaNome || 'Sua empresa'));
  texto('n-ativos', geral.ativos);
  texto('n-pausados', geral.pausados);
  texto('n-concluidos', geral.concluidos);
  texto('n-fora', geral.foraSla);
  texto('n-dentro', geral.dentro);
  texto('n-perto', geral.perto);
  texto('n-media', geral.mediaGeral);
  const gargalos = limpar('lista-gargalos');
  [
    'Mais carros aguardando etapa anterior: ' + painel.gargalos[0],
    'Maior tempo útil: ' + painel.gargalos[1],
    'Mais tempo de pausa: ' + painel.gargalos[2]
  ].forEach((linha) => gargalos.appendChild(paragrafo(linha)));
  preencherFiltros();
  desenharChips();
  const setores = limpar('lista-setores');
  painel.porSetor.forEach((item) => {
    const botaoSetor = document.createElement('button');
    botaoSetor.type = 'button';
    if (item.atrasado || filtro.setor === item.setor) botaoSetor.className = 'alerta';
    const nome = document.createElement('span');
    nome.textContent = item.setor;
    const extra = document.createElement('small');
    extra.textContent = item.andamento + ' ativos · ' + item.finalizados + ' concluídos · SLA ' + item.atrasado;
    botaoSetor.appendChild(nome);
    botaoSetor.appendChild(extra);
    botaoSetor.addEventListener('click', () => {
      filtro.setor = filtro.setor === item.setor ? '' : item.setor;
      desenhar();
    });
    setores.appendChild(botaoSetor);
  });
  const carros = limpar('lista-carros');
  if (!painel.os.length) carros.appendChild(paragrafo('Nenhum carro neste filtro.'));
  painel.os.forEach((card) => carros.appendChild(cartaoOs(card)));
  desenharEquipesInicio(geral);
  const pausas = limpar('lista-pausas');
  painel.pausas.forEach((item) => {
    if (!item.qtd && !item.fimExp) return;
    const extra = item.fimExp ? ' Fora do tempo útil.' : '';
    pausas.appendChild(paragrafo(item.motivo + ': ' + item.qtd + ' vezes, ' + item.min + ' min.' + extra));
  });
  const fora = limpar('lista-fora');
  if (!painel.fora.length) fora.appendChild(paragrafo('Nenhum carro fora do SLA neste recorte.'));
  painel.fora.forEach((carro) => {
    fora.appendChild(paragrafo(carro.os + ' ' + carro.veiculo + ' ' + carro.setor + ' ' + carro.prestadorNome));
  });
  const sla = limpar('lista-sla');
  geral.sla.forEach((item) => sla.appendChild(blocoSla(item)));
  const equipes = limpar('lista-equipes');
  (dados.equipes || []).forEach((equipe) => {
    const bloco = document.createElement('div');
    bloco.className = 'ux-linha';
    const nome = document.createElement('b');
    nome.textContent = equipe.nome || 'Sem nome';
    bloco.appendChild(nome);
    bloco.appendChild(selo(equipe.status === 'ativa' ? 'Ativa' : 'Arquivada'));
    if (equipe.status === 'ativa') {
      const acao = botao('Arquivar', () => arquivarEquipe(equipe));
      acao.classList.add('ux-arquivar');
      bloco.appendChild(acao);
    }
    equipes.appendChild(bloco);
  });
  const convites = limpar('lista-convites');
  (dados.convites || []).forEach((convite) => {
    const bloco = document.createElement('div');
    bloco.className = 'ux-item';
    bloco.appendChild(paragrafo(convite.email + ' ' + convite.status + ' ' + (convite.codigo || '')));
    const botaoCopia = botao('Copiar código', async () => {
      try {
        await navigator.clipboard.writeText(convite.codigo || '');
        avisar('Copiado!');
        botaoCopia.textContent = 'Copiado!';
      } catch (_) {
        texto('st-convite', 'Código: ' + (convite.codigo || ''));
      }
    });
    bloco.appendChild(botaoCopia);
    if (convite.status === 'rascunho') bloco.appendChild(botao('Cancelar', () => cancelarConvite(convite)));
    convites.appendChild(bloco);
  });
  const vinculos = limpar('lista-vinculos');
  (dados.vinculos || []).forEach((vinculo) => {
    const bloco = document.createElement('div');
    bloco.className = 'ux-linha';
    const nome = document.createElement('b');
    nome.textContent = (vinculo.nome || 'Sem nome') + ' · ' + (vinculo.email || '');
    bloco.appendChild(nome);
    bloco.appendChild(selo(vinculo.status || 'sem status'));
    vinculos.appendChild(bloco);
  });
  const selectEquipe = $('conv-equipe');
  if (selectEquipe) {
    const atual = selectEquipe.value;
    selectEquipe.replaceChildren();
    const vazio = document.createElement('option');
    vazio.value = '';
    vazio.textContent = 'Sem equipe';
    selectEquipe.appendChild(vazio);
    (dados.equipes || []).filter((equipe) => equipe.status === 'ativa').forEach((equipe) => {
      const opcao = document.createElement('option');
      opcao.value = equipe.id;
      opcao.textContent = equipe.nome;
      selectEquipe.appendChild(opcao);
    });
    selectEquipe.value = atual;
  }
}

function preencherFiltros() {
  const equipe = $('filtro-equipe');
  const prestador = $('filtro-prestador');
  if (equipe && equipe.options.length <= 1) {
    (dados.equipes || []).forEach((item) => {
      const opcao = document.createElement('option');
      opcao.value = item.id;
      opcao.textContent = item.nome;
      equipe.appendChild(opcao);
    });
  }
  if (prestador && prestador.options.length <= 1) {
    (dados.vinculos || []).forEach((item) => {
      const opcao = document.createElement('option');
      opcao.value = item.email;
      opcao.textContent = (item.nome || 'Sem nome') + ' ' + item.email;
      prestador.appendChild(opcao);
    });
  }
}

function desenharChips() {
  const situacoes = [''].concat((dados.carros || []).map((carro) => carro.situacao).filter(Boolean));
  const unicas = situacoes.filter((item, i) => situacoes.indexOf(item) === i);
  montarChips('chips-situacao', unicas.map((item) => ({
    valor: item,
    rotulo: item || 'Todas as situações',
    ativo: filtro.situacao === item,
    aoClicar: () => { filtro.situacao = item; desenhar(); }
  })));
  montarChips('chips-equipe', [{
    valor: '', rotulo: 'Todas as equipes', ativo: !filtro.equipe,
    aoClicar: () => { filtro.equipe = ''; if ($('filtro-equipe')) $('filtro-equipe').value = ''; desenhar(); }
  }].concat((dados.equipes || []).map((item) => ({
    valor: item.id,
    rotulo: item.nome,
    ativo: filtro.equipe === item.id,
    aoClicar: () => { filtro.equipe = item.id; if ($('filtro-equipe')) $('filtro-equipe').value = item.id; desenhar(); }
  }))));
  montarChips('chips-prestador', [{
    valor: '', rotulo: 'Todos os prestadores', ativo: !filtro.prestador,
    aoClicar: () => { filtro.prestador = ''; if ($('filtro-prestador')) $('filtro-prestador').value = ''; desenhar(); }
  }].concat((dados.vinculos || []).map((item) => ({
    valor: item.email,
    rotulo: item.nome || item.email,
    ativo: filtro.prestador === item.email,
    aoClicar: () => { filtro.prestador = item.email; if ($('filtro-prestador')) $('filtro-prestador').value = item.email; desenhar(); }
  }))));
}

function montarChips(id, itens) {
  const caixa = $(id);
  if (!caixa) return;
  caixa.replaceChildren();
  itens.forEach((item) => {
    const el = document.createElement('button');
    el.type = 'button';
    if (item.ativo) el.className = 'ativo';
    el.textContent = item.rotulo;
    el.addEventListener('click', item.aoClicar);
    caixa.appendChild(el);
  });
}

function desenharEquipesInicio(geral) {
  const caixa = limpar('lista-equipes-inicio');
  if (!caixa) return;
  (geral.equipesResumo || []).forEach((equipe) => {
    const botaoEquipe = document.createElement('button');
    botaoEquipe.type = 'button';
    if (equipeAberta === equipe.id) botaoEquipe.className = 'alerta';
    const nome = document.createElement('span');
    nome.textContent = equipe.nome;
    const extra = document.createElement('small');
    extra.textContent = equipe.andamento + ' ativos · ' + equipe.concluidos + ' concluídos · fora ' + equipe.foraSla;
    botaoEquipe.appendChild(nome);
    botaoEquipe.appendChild(extra);
    botaoEquipe.addEventListener('click', () => {
      equipeAberta = equipeAberta === equipe.id ? '' : equipe.id;
      filtro.equipe = equipeAberta;
      if ($('filtro-equipe')) $('filtro-equipe').value = equipeAberta;
      desenhar();
    });
    caixa.appendChild(botaoEquipe);
  });
  const detalhe = limpar('detalhe-equipe');
  if (!detalhe) return;
  const escolhida = (geral.equipesResumo || []).find((equipe) => equipe.id === equipeAberta);
  if (!escolhida) {
    detalhe.appendChild(paragrafo('Nenhuma equipe aberta. Os números acima juntam todas as equipes, setores e etapas.'));
    return;
  }
  const titulo = document.createElement('h3');
  titulo.textContent = escolhida.nome;
  detalhe.appendChild(titulo);
  if (!escolhida.prestadores.length) detalhe.appendChild(paragrafo('Esta equipe ainda não tem prestador vinculado.'));
  escolhida.prestadores.forEach((pessoa) => {
    const bloco = document.createElement('article');
    bloco.className = 'ux-item';
    const nome = document.createElement('b');
    nome.textContent = pessoa.nome + ' · ' + pessoa.email;
    bloco.appendChild(nome);
    if (!pessoa.etapas.length) bloco.appendChild(paragrafo('Nenhum carro desta pessoa nesta equipe.'));
    pessoa.etapas.forEach((etapa) => bloco.appendChild(linhaEtapa(etapa)));
    detalhe.appendChild(bloco);
  });
  detalhe.appendChild(botao('Ver esta equipe na produção', () => { telaAtual = 'setores'; desenhar(); }));
}

function blocoSla(item) {
  const bloco = document.createElement('div');
  bloco.className = 'ux-item';
  const partes = GestoesLogica().partesPrazo(item.prazoHoras);
  const rotulo = document.createElement('b');
  rotulo.textContent = item.setor;
  bloco.appendChild(rotulo);
  const media = document.createElement('p');
  media.className = 'hint';
  media.textContent = item.mediaRealMin != null
    ? 'Média real dos finalizados: ' + GestoesLogica().fmtDuracao(item.mediaRealMin) + '. Referência em uso: ' + GestoesLogica().fmtDuracao(item.referenciaHoras * 60) + '.'
    : 'Ainda sem finalizados. Referência em uso: ' + GestoesLogica().fmtDuracao((item.prazoHoras || 8) * 60) + '.';
  bloco.appendChild(media);
  const campos = document.createElement('div');
  campos.className = 'ux-par';
  const horas = document.createElement('input');
  horas.type = 'number';
  horas.min = '0';
  horas.value = String(partes.horas);
  horas.setAttribute('aria-label', 'Horas de ' + item.setor);
  const minutos = document.createElement('input');
  minutos.type = 'number';
  minutos.min = '0';
  minutos.max = '59';
  minutos.value = String(partes.minutos);
  minutos.setAttribute('aria-label', 'Minutos de ' + item.setor);
  const lh = document.createElement('label');
  lh.appendChild(document.createTextNode('Horas'));
  lh.appendChild(horas);
  const lm = document.createElement('label');
  lm.appendChild(document.createTextNode('Minutos'));
  lm.appendChild(minutos);
  campos.appendChild(lh);
  campos.appendChild(lm);
  bloco.appendChild(campos);
  bloco.appendChild(paragrafo('Dentro ' + item.dentro + ', perto ' + item.perto + ', fora ' + item.atrasado));
  if (item.mediaRealMin != null) {
    bloco.appendChild(botao('Usar a média', () => {
      const mediaPartes = GestoesLogica().partesPrazo(item.mediaRealMin / 60);
      horas.value = String(mediaPartes.horas);
      minutos.value = String(mediaPartes.minutos);
    }));
  }
  bloco.appendChild(botao('Salvar ' + item.setor, () => salvarSla(item.setor, horas.value, minutos.value)));
  return bloco;
}

function GestoesLogica() {
  return globalThis.FolhaGestaoProducao;
}

function cartaoOs(card) {
  const bloco = document.createElement('article');
  bloco.className = 'ux-item';
  const os = document.createElement('div');
  os.className = 'ux-os';
  os.textContent = card.os || 'Sem OS';
  bloco.appendChild(os);
  const veiculo = document.createElement('p');
  veiculo.textContent = card.veiculo || 'Veículo não informado';
  bloco.appendChild(veiculo);
  (card.etapas || []).forEach((etapa) => bloco.appendChild(linhaEtapa(etapa)));
  return bloco;
}

function linhaEtapa(etapa) {
  const linha = document.createElement('div');
  linha.className = 'ux-etapa' + (etapa.atrasado ? ' atrasado' : (etapa.dataTermino ? ' ok' : ''));
  const titulo = document.createElement('b');
  titulo.textContent = (etapa.setor || 'Setor') + ' · ' + (etapa.prestadorNome || 'Sem prestador');
  linha.appendChild(titulo);
  linha.appendChild(selo(etapa.situacao));
  linha.appendChild(paragrafo('Início ' + etapa.horaInicioTexto + ' · pausa ' + etapa.horaPausaTexto + ' · término ' + etapa.horaTerminoTexto));
  linha.appendChild(paragrafo('Tempo útil ' + etapa.tempo));
  if (String(etapa.tempo || '').indexOf(' de ') >= 0) {
    const barra = document.createElement('div');
    barra.className = 'ux-bar' + (etapa.atrasado ? ' atrasado' : '');
    const marca = document.createElement('i');
    marca.style.width = Math.max(0, Math.min(100, etapa.pct || 0)) + '%';
    barra.appendChild(marca);
    linha.appendChild(barra);
  }
  (etapa.pausasOperacao || []).forEach((pausa) => linha.appendChild(paragrafo('Pausa: ' + (pausa.outro || pausa.motivo || 'sem motivo'))));
  (etapa.expediente || []).forEach(() => linha.appendChild(seloFim()));
  (etapa.almoco || []).forEach(() => linha.appendChild(seloAlmoco()));
  return linha;
}

function cartaoCarro(carro) {
  const bloco = document.createElement('article');
  bloco.className = 'ux-item';
  const os = document.createElement('div');
  os.className = 'ux-os';
  os.textContent = carro.os || 'Sem OS';
  bloco.appendChild(os);
  const veiculo = document.createElement('p');
  veiculo.textContent = carro.veiculo || 'Veículo não informado';
  bloco.appendChild(veiculo);
  bloco.appendChild(selo(carro.setor));
  bloco.appendChild(selo(carro.situacao));
  if (carro.prestadorNome) bloco.appendChild(selo(carro.prestadorNome));
  if (String(carro.tempo || '').indexOf(' de ') >= 0) {
    const barra = document.createElement('div');
    barra.className = 'ux-bar' + (carro.atrasado ? ' atrasado' : '');
    const marca = document.createElement('i');
    marca.style.width = Math.max(0, Math.min(100, carro.pct || 0)) + '%';
    barra.appendChild(marca);
    bloco.appendChild(barra);
  }
  const tempo = document.createElement('p');
  tempo.className = 'hint';
  tempo.textContent = carro.tempo;
  bloco.appendChild(tempo);
  (carro.pausasOperacao || []).forEach((pausa) => bloco.appendChild(paragrafo('Pausa: ' + (pausa.outro || pausa.motivo || 'sem motivo'))));
  (carro.expediente || []).forEach(() => bloco.appendChild(seloFim()));
  return bloco;
}

function selo(rotulo) {
  const el = document.createElement('span');
  const s = String(rotulo || '').toLowerCase();
  let cor = '';
  if (s === 'ativa' || s === 'ativo' || s === 'finalizado' || s === 'rascunho') cor = ' ok';
  else if (s === 'arquivada' || s === 'cancelado' || s === 'revogado') cor = ' fim';
  el.className = 'ux-selo' + cor;
  el.textContent = rotulo || '';
  return el;
}

function seloFim() {
  const el = selo('Fim de expediente');
  el.classList.add('fim');
  return el;
}

function seloAlmoco() {
  const el = selo('Almoço/café');
  el.classList.add('fim');
  return el;
}

function pintarPrestador() {
  texto('st-prestador', dados && dados.empresaNome ? 'Empresa: ' + dados.empresaNome + '. Status: ' + (dados.statusVinculo || 'sem vínculo') : 'Você ainda não tem vínculo. Aceite um código de convite.');
  texto('st-visto', T.textoConsentimento(dados && dados.empresaNome));
  texto('st-celular', 'Fica só no celular: ' + T.SO_CELULAR.join(', ') + '.');
  texto('st-revoga', T.FRASE_REVOGAR);
  const aparelho = dados && dados.dispositivo;
  texto('st-aparelho', aparelho && aparelho.ativo
    ? 'Aparelho ativo: ' + (aparelho.rotulo || aparelho.dispositivo_id)
    : 'Nenhum aparelho ativo nesta conta. Este navegador pode assumir a vez.');
}

function entrarDemonstracao() {
  dados = T.exemploLocal();
  filtro = { equipe: '', prestador: '', setor: '', situacao: '', busca: '' };
  equipeAberta = '';
  estado.demonstracao = true;
  estado.situacao = '';
  estado.papel = 'gerente';
  telaAtual = 'inicio';
  desenhar();
}

async function salvarSla(setor, horas, minutos) {
  const prazo = GestoesLogica().prazoDecimal(horas, minutos == null ? 0 : minutos);
  if (prazo == null) { texto('st-empresa', 'Informe horas e minutos válidos.'); return; }
  if (estado.demonstracao) {
    dados.sla = dados.sla.map((item) => item.setor === setor ? { setor: setor, prazoHoras: prazo } : item);
    texto('st-empresa', T.ROTULO_EXEMPLO);
    desenhar();
    return;
  }
  const supabase = supabaseAtual;
  if (!supabase || !estado.empresaId) return;
  const r = await criarChamada(supabase)('gestao_sla_definir', { p_empresa: estado.empresaId, p_setor: setor, p_horas: prazo });
  if (!r.ok) return tratar(r.tipo);
  await carregarGerente();
}

async function arquivarEquipe(equipe) {
  if (estado.demonstracao) {
    equipe.status = 'arquivada';
    desenhar();
    return;
  }
  const r = await criarChamada(supabaseAtual)('gestao_arquivar_equipe', { p_equipe: equipe.id });
  if (!r.ok) return tratar(r.tipo);
  await carregarGerente();
}

async function cancelarConvite(convite) {
  if (estado.demonstracao) {
    convite.status = 'cancelado';
    desenhar();
    return;
  }
  const r = await criarChamada(supabaseAtual)('gestao_cancelar_convite', { p_convite: convite.id });
  if (!r.ok) return tratar(r.tipo);
  await carregarGerente();
}

function tratar(tipo) {
  if (tipo === 'sql_ausente') { estado.sqlAusente = true; estado.demonstracao = false; }
  else estado.situacao = tipo;
  desenhar();
}

async function carregarGerente() {
  const supabase = supabaseAtual;
  const chamar = criarChamada(supabase);
  const empresa = estado.empresaId;
  const carros = await chamar('gestao_listar_carros', { p_empresa: empresa });
  if (!carros.ok) return tratar(carros.tipo);
  const vinculos = await chamar('gestao_listar_vinculos', { p_empresa: empresa });
  if (!vinculos.ok) return tratar(vinculos.tipo);
  const sla = await chamar('gestao_sla_listar', { p_empresa: empresa });
  if (!sla.ok) return tratar(sla.tipo);
  const periodo = periodoAtual();
  dados = {
    empresaNome: estado.empresaNome,
    inicio: periodo.inicio,
    fim: periodo.fim,
    agora: periodo.agora,
    carros: carros.data || [],
    vinculos: vinculos.data || [],
    sla: sla.data || [],
    equipes: [],
    convites: []
  };
  desenhar();
}

async function carregarPrestador(posicao) {
  const supabase = supabaseAtual;
  const visto = await criarChamada(supabase)('gestao_dispositivo_ver');
  if (!visto.ok) return tratar(visto.tipo);
  const aberto = await criarChamada(supabase)('gestao_dispositivo_abrir', { p_dispositivo: aparelhoLocal(), p_rotulo: 'Este navegador' });
  if (!aberto.ok) return tratar(aberto.tipo);
  dados = {
    empresaNome: posicao.empresa_nome || '',
    statusVinculo: posicao.status || '',
    vinculo: posicao.vinculo || '',
    dispositivo: aberto.data && aberto.data.motivo === 'troca_pendente' ? { ativo: false, rotulo: 'Há outro celular ativo' } : (visto.data || { ativo: false })
  };
  desenhar();
}

async function conferir() {
  const supabase = supabaseAtual;
  if (!supabase) { estado.situacao = 'erro_temporario'; desenhar(); return; }
  const posicao = await criarChamada(supabase)('gestao_minha_posicao');
  if (!posicao.ok) return tratar(posicao.tipo);
  estado.sqlAusente = false;
  estado.situacao = '';
  estado.papel = posicao.data.papel || 'nenhum';
  estado.empresaId = posicao.data.empresa_id || null;
  estado.empresaNome = posicao.data.empresa_nome || '';
  if (estado.papel === 'gerente') await carregarGerente();
  else await carregarPrestador(posicao.data);
}

async function sair() {
  const supabase = supabaseAtual || cliente();
  try { if (supabase) await supabase.auth.signOut(); } catch (_) {}
  window.location.reload();
}

async function entrarDeNovo() {
  const supabase = supabaseAtual || cliente();
  if (!supabase) return;
  try { await supabase.auth.signOut({ scope: 'local' }); } catch (_) {}
  const r = await G.iniciarGoogle(supabase, window.location, (url) => { window.location.assign(url); });
  if (!r.ok) texto('st-expirada-extra', 'O Google desta página ainda depende do endereço de retorno autorizado no projeto.');
}

async function iniciar() {
  const aviso = G.erroVisivelNaUrl(window.location.href);
  if (aviso) texto('st-entrada', aviso);
  const supabase = cliente();
  supabaseAtual = supabase;
  if (!supabase) {
    texto('st-entrada', 'A chave pública de teste não está disponível.');
    desenhar();
    return;
  }
  let sess;
  try { sess = await supabase.auth.getSession(); }
  catch (_) { estado.situacao = 'erro_temporario'; desenhar(); return; }
  const usuario = sess.data && sess.data.session && sess.data.session.user;
  if (!usuario) { estado.sessao = false; desenhar(); return; }
  estado.sessao = true;
  await conferir();
}

document.querySelectorAll('#nav-gerente [data-tela]').forEach((el) => {
  el.addEventListener('click', () => { telaAtual = el.getAttribute('data-tela'); desenhar(); });
});
$('btn-sair-topo').addEventListener('click', sair);
$('btn-sair-demo').addEventListener('click', () => {
  estado.demonstracao = false;
  estado.papel = '';
  dados = null;
  filtro = { equipe: '', prestador: '', setor: '', situacao: '', busca: '' };
  equipeAberta = '';
  if (estado.sessao) conferir();
  else desenhar();
});
$('busca-carro').addEventListener('input', () => { filtro.busca = $('busca-carro').value; desenhar(); });
$('btn-demo-entrada').addEventListener('click', entrarDemonstracao);
$('btn-demo-sql').addEventListener('click', entrarDemonstracao);
if ($('btn-sair')) $('btn-sair').addEventListener('click', sair);
$('btn-sair-expirada').addEventListener('click', sair);
$('btn-sair-temporario').addEventListener('click', sair);
$('btn-sair-sql').addEventListener('click', sair);
$('btn-sair-prestador').addEventListener('click', sair);
$('btn-entrar-de-novo').addEventListener('click', entrarDeNovo);
$('btn-tentar').addEventListener('click', () => { estado.situacao = ''; iniciar(); });
$('btn-google').addEventListener('click', async () => {
  const supabase = cliente();
  if (!supabase) return;
  const r = await G.iniciarGoogle(supabase, window.location, (url) => { window.location.assign(url); });
  if (!r.ok) texto('st-entrada', 'O Google desta página ainda depende do endereço de retorno autorizado no projeto.');
});
$('form-entrar').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const supabase = cliente();
  if (!supabase) return;
  const r = await S.entrar(supabase, $('acesso-email').value, $('acesso-senha').value);
  $('acesso-senha').value = '';
  texto('st-login', r.mensagem);
  if (r.ok && r.motivo === 'entrou') { estado.sessao = true; supabaseAtual = supabase; await conferir(); }
});
$('btn-criar').addEventListener('click', async () => {
  const supabase = cliente();
  if (!supabase) return;
  const r = await S.criarConta(supabase, $('acesso-email').value, $('acesso-senha').value, window.location);
  $('acesso-senha').value = '';
  texto('st-login', r.mensagem);
});
$('btn-senha').addEventListener('click', async () => {
  const supabase = cliente();
  if (!supabase) return;
  const r = await S.recuperarSenha(supabase, $('acesso-email').value, window.location);
  texto('st-login', r.mensagem);
});
$('filtro-equipe').addEventListener('change', () => { filtro.equipe = $('filtro-equipe').value; desenhar(); });
$('filtro-prestador').addEventListener('change', () => { filtro.prestador = $('filtro-prestador').value; desenhar(); });
$('form-equipe').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const nome = $('equipe-nome').value.trim();
  if (!nome) return;
  if (estado.demonstracao) {
    dados.equipes.push({ id: 'local-' + dados.equipes.length, nome: nome, status: 'ativa' });
    $('equipe-nome').value = '';
    desenhar();
    return;
  }
  const r = await criarChamada(supabaseAtual)('gestao_criar_equipe', { p_empresa: estado.empresaId, p_nome: nome });
  if (!r.ok) return tratar(r.tipo);
  texto('st-convite', 'Equipe criada.');
  await carregarGerente();
});
$('form-convite').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const email = $('conv-email').value.trim();
  const equipe = $('conv-equipe').value || null;
  if (estado.demonstracao) {
    dados.convites.push({ id: 'local-c', codigo: 'exemplo11', email: email, status: 'rascunho' });
    texto('st-convite', 'Exemplo local. Código: exemplo11. Nenhum e-mail foi enviado.');
    desenhar();
    return;
  }
  const r = await criarChamada(supabaseAtual)('gestao_criar_convite', { p_empresa: estado.empresaId, p_email: email, p_equipe: equipe });
  if (!r.ok) return tratar(r.tipo);
  texto('st-convite', 'Convite em rascunho. Código: ' + (r.data && r.data.codigo) + '. Nenhum e-mail foi enviado.');
});
$('form-codigo').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  if (estado.demonstracao) { texto('st-codigo', T.ROTULO_EXEMPLO); return; }
  const r = await criarChamada(supabaseAtual)('gestao_aceitar_convite', { p_codigo: $('codigo-convite').value.trim() });
  if (!r.ok) return tratar(r.tipo);
  texto('st-codigo', 'Convite aceito. Falta o consentimento. Ainda não há ficha compartilhada.');
  await conferir();
});
$('btn-consentir').addEventListener('click', async () => {
  if (estado.demonstracao) { texto('st-codigo', T.ROTULO_EXEMPLO); return; }
  const textoOk = T.textoConsentimento(dados && dados.empresaNome);
  const r = await criarChamada(supabaseAtual)('gestao_consentir', { p_vinculo: dados.vinculo, p_texto: textoOk, p_confirma: true });
  if (!r.ok) return tratar(r.tipo);
  texto('st-codigo', 'Consentimento registrado.');
  await conferir();
});
$('btn-revogar').addEventListener('click', async () => {
  if (estado.demonstracao) { texto('st-codigo', T.FRASE_REVOGAR); return; }
  const r = await criarChamada(supabaseAtual)('gestao_revogar_vinculo', { p_vinculo: dados.vinculo });
  if (!r.ok) return tratar(r.tipo);
  texto('st-codigo', T.FRASE_REVOGAR);
  await conferir();
});
$('btn-trocar').addEventListener('click', async () => {
  if (estado.demonstracao) { texto('st-aparelho', T.ROTULO_EXEMPLO); return; }
  const r = await criarChamada(supabaseAtual)('gestao_dispositivo_confirmar', { p_dispositivo: aparelhoLocal(), p_rotulo: 'Este navegador', p_confirma: true });
  if (!r.ok) return tratar(r.tipo);
  texto('st-aparelho', 'Este aparelho ficou ativo. O outro deixa de enviar até confirmar de novo.');
});

iniciar();
