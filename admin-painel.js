import { createClient } from '@supabase/supabase-js';
import { FOLHA_ZERO_TESTE } from './acesso-teste-config.js';
import './login-google.js';
import './acesso-senha.js';
import './admin-painel-logica.js';

const L = globalThis.FolhaLoginGoogle;
const S = globalThis.FolhaAcessoSenha;
const R = globalThis.FolhaPainelLogica;
const $ = (id) => document.getElementById(id);
let telaAtual = 'inicio';
let supabaseAtual = null;
let cacheListas = { pessoas: [], avulsos: [], empresas: [], pedidos: [] };
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

function mostrar(tipo) {
  if (tipo !== 'dono') texto('chip-conta', '');
  if (tipo === 'dono') aplicarVista({ sessao: true, dono: true });
  else if (tipo === 'recusa') aplicarVista({ sessao: true, dono: false });
  else if (tipo === 'sessao_expirada') aplicarVista({ sessao: true, dono: false, situacao: 'sessao_expirada' });
  else if (tipo === 'erro_temporario') aplicarVista({ sessao: true, dono: false, situacao: 'erro_temporario' });
  else aplicarVista({ sessao: false, dono: false });
}

function avisar(msg) {
  const el = $('ux-toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2400);
}

function selo(status) {
  const s = String(status || '').toLowerCase();
  const el = document.createElement('span');
  let cor = 'ux-mut';
  if (s === 'ativo' || s === 'ativa' || s === 'aprovado') cor = 'ux-ok';
  else if (s.indexOf('degust') >= 0 || s === 'pendente' || s === 'rascunho' || s === 'suspenso' || s === 'suspensa') cor = 'ux-warn';
  else if (s === 'revogado' || s === 'revogada' || s === 'vencida' || s === 'recusado') cor = 'ux-err';
  el.className = 'ux-selo ' + cor;
  el.textContent = status || 'sem status';
  return el;
}

function vazio(caixa, msg) {
  const p = document.createElement('p');
  p.className = 'empty';
  p.textContent = msg;
  caixa.appendChild(p);
}

function cartao() {
  const el = document.createElement('div');
  el.className = 'ux-item';
  return el;
}

function aplicarVista(estado) {
  const v = R.vista(estado.sessao, estado.dono, telaAtual, estado.situacao);
  $('tela-entrada').classList.toggle('hidden', !v.entrada);
  $('st-recusa').classList.toggle('hidden', !v.recusa);
  $('st-expirada').classList.toggle('hidden', !v.expirada);
  $('st-temporario').classList.toggle('hidden', !v.temporario);
  $('painel').classList.toggle('hidden', !v.painel);
  R.TELAS.forEach((nome) => {
    const bloco = document.getElementById('tela-' + nome);
    if (!bloco || nome === 'entrada') return;
    bloco.classList.toggle('hidden', !v.painel || v.tela !== nome);
  });
  document.querySelectorAll('[data-tela]').forEach((botao) => {
    botao.classList.toggle('primary', botao.getAttribute('data-tela') === v.tela);
  });
}

function linha(partes) {
  const p = document.createElement('p');
  p.className = 'hint';
  p.textContent = partes.filter(Boolean).join(' · ');
  return p;
}

async function rpc(supabase, nome, args) {
  const { data, error } = await supabase.rpc(nome, args || {});
  if (error) throw error;
  return data;
}

async function renovar(supabase) {
  try {
    const renovada = await supabase.auth.refreshSession();
    return !!(renovada && !renovada.error && renovada.data && renovada.data.session);
  } catch (_) {
    return false;
  }
}

function criarChamada(supabase) {
  let renovou = false;
  return async function chamar(nome, args) {
    try {
      return { ok: true, data: await rpc(supabase, nome, args) };
    } catch (erro) {
      const tipo = R.classificarErro(erro);
      if (tipo === 'sessao_expirada' && !renovou) {
        renovou = true;
        if (await renovar(supabase)) {
          try { return { ok: true, data: await rpc(supabase, nome, args) }; }
          catch (erro2) { return { ok: false, tipo: R.classificarErro(erro2) }; }
        }
        return { ok: false, tipo: 'sessao_expirada' };
      }
      if (tipo === 'recusa' || tipo === 'sessao_expirada') return { ok: false, tipo: tipo };
      return { ok: false, tipo: 'erro_temporario' };
    }
  };
}

async function carregar(supabase) {
  const chamar = criarChamada(supabase);
  const resumoR = await chamar('painel_resumo');
  if (!resumoR.ok) return mostrar(resumoR.tipo);
  const resumo = R.contadores(resumoR.data);
  texto('n-pedidos', resumo.pedidos);
  texto('n-avulsos', resumo.avulsos);
  texto('n-empresas', resumo.empresas);
  texto('n-vencem', resumo.vencem);
  texto('n-ativas', resumo.pessoas);
  texto('n-carros', resumo.carros);
  texto('c-pedidos', resumo.pedidos);
  const euR = await chamar('painel_eu');
  if (!euR.ok) return mostrar(euR.tipo);
  const eu = euR.data;
  texto('chip-conta', eu && eu.email ? eu.email : 'Proprietário');
  texto('st-conta', eu && eu.dono
    ? 'Você é o proprietário. Esta conta não tem prazo. E-mail da sessão: ' + (eu.email || 'não informado')
    : R.FRASE_RECUSA);
  const pedidosR = await chamar('painel_listar_pedidos');
  if (!pedidosR.ok) return mostrar(pedidosR.tipo);
  cacheListas.pedidos = pedidosR.data || [];
  desenharPedidos(supabase);
  const avulsosR = await chamar('painel_listar_avulsos');
  if (!avulsosR.ok) return mostrar(avulsosR.tipo);
  cacheListas.avulsos = avulsosR.data || [];
  desenharAvulsos(supabase);
  const empresasR = await chamar('painel_listar_empresas');
  if (!empresasR.ok) return mostrar(empresasR.tipo);
  cacheListas.empresas = empresasR.data || [];
  desenharEmpresas(supabase);
  desenharLicencas(supabase);
  const pessoasR = await chamar('painel_listar_pessoas');
  if (!pessoasR.ok) return mostrar(pessoasR.tipo);
  cacheListas.pessoas = pessoasR.data || [];
  desenharPessoas();
  const convitesR = await chamar('painel_listar_convites');
  if (!convitesR.ok) return mostrar(convitesR.tipo);
  const convites = convitesR.data;
  const caixaConvites = $('lista-convites');
  caixaConvites.replaceChildren();
  if (!(convites || []).length) vazio(caixaConvites, 'Nenhum convite ainda. Crie um código e envie você mesmo.');
  (convites || []).forEach((item) => {
    const bloco = cartao();
    const topo = document.createElement('div');
    topo.className = 'ux-linha';
    const nome = document.createElement('b');
    nome.textContent = item.email || 'Sem e-mail';
    topo.appendChild(nome);
    topo.appendChild(selo(item.status));
    bloco.appendChild(topo);
    bloco.appendChild(linha([item.tipo, item.codigo]));
    const copiar = botao('Copiar código', async () => {
      try {
        await navigator.clipboard.writeText(item.codigo || '');
        copiar.textContent = 'Copiado!';
        avisar('Copiado!');
      } catch (_) {
        texto('st-convite', 'Código: ' + item.codigo);
      }
    });
    bloco.appendChild(copiar);
    caixaConvites.appendChild(bloco);
  });
}

function desenharPedidos(supabase) {
  const caixa = $('lista-pedidos');
  caixa.replaceChildren();
  if (!cacheListas.pedidos.length) vazio(caixa, 'Nenhum pedido esperando.');
  cacheListas.pedidos.forEach((item) => {
    const bloco = cartao();
    const topo = document.createElement('div');
    topo.className = 'ux-linha';
    const nome = document.createElement('b');
    nome.textContent = item.nome || item.email || 'Sem nome';
    topo.appendChild(nome);
    topo.appendChild(selo(item.status));
    bloco.appendChild(topo);
    bloco.appendChild(linha([item.email, item.tipo]));
    if (item.status === 'pendente') {
      const acoes = document.createElement('div');
      acoes.className = 'actions';
      acoes.appendChild(botao('Aprovar', () => decidir(supabase, item.id, true)));
      acoes.appendChild(botao('Recusar', () => decidir(supabase, item.id, false)));
      bloco.appendChild(acoes);
    }
    caixa.appendChild(bloco);
  });
}

function desenharAvulsos(supabase) {
  const caixa = $('lista-avulsos');
  caixa.replaceChildren();
  if (!cacheListas.avulsos.length) vazio(caixa, 'Nenhuma pessoa avulsa nesta lista.');
  cacheListas.avulsos.forEach((item) => {
    const bloco = cartao();
    const topo = document.createElement('div');
    topo.className = 'ux-linha';
    const nome = document.createElement('b');
    nome.textContent = item.nome || item.email || 'Sem nome';
    topo.appendChild(nome);
    topo.appendChild(selo(item.status));
    bloco.appendChild(topo);
    bloco.appendChild(linha([
      item.email,
      item.degustacao_fim ? 'degustação até ' + item.degustacao_fim : '',
      item.licenca_validade ? 'licença até ' + item.licenca_validade : 'sem licença',
      item.copia_existe ? 'backup ' + (item.copia_atualizado_em || '') : 'sem backup'
    ]));
    bloco.appendChild(acoesAvulso(supabase, item));
    caixa.appendChild(bloco);
  });
}

function acoesAvulso(supabase, item) {
  const acoes = document.createElement('div');
  acoes.className = 'actions';
  const validade = document.createElement('input');
  validade.type = 'date';
  acoes.appendChild(validade);
  acoes.appendChild(botao('Marcar licença', () => {
    if (!validade.value) return avisar('Escolha a data da licença.');
    return agir(supabase, 'painel_licenciar_avulso', { p_user: item.user_id, p_validade: validade.value });
  }));
  acoes.appendChild(botao('Degustação de 20 dias', () => agir(supabase, 'painel_degustar_avulso', { p_user: item.user_id })));
  acoes.appendChild(botao('Suspender', () => agir(supabase, 'painel_situacao_avulso', { p_user: item.user_id, p_status: 'suspenso' })));
  acoes.appendChild(botao('Revogar', () => agir(supabase, 'painel_situacao_avulso', { p_user: item.user_id, p_status: 'revogado' })));
  return acoes;
}

function desenharEmpresas(supabase) {
  const caixa = $('lista-empresas');
  caixa.replaceChildren();
  const lista = cacheListas.empresas.filter((item) => R.empresaAceita(item.nome));
  if (!lista.length) vazio(caixa, 'Nenhuma empresa nesta lista.');
  lista.forEach((item) => {
    const bloco = cartao();
    const topo = document.createElement('div');
    topo.className = 'ux-linha';
    const nome = document.createElement('b');
    nome.textContent = item.nome || 'Sem nome';
    topo.appendChild(nome);
    topo.appendChild(selo(item.status));
    bloco.appendChild(topo);
    bloco.appendChild(linha([item.gerente_email, item.licenca_validade ? 'licença até ' + item.licenca_validade : 'sem licença']));
    const acoes = document.createElement('div');
    acoes.className = 'actions';
    const validade = document.createElement('input');
    validade.type = 'date';
    acoes.appendChild(validade);
    acoes.appendChild(botao('Marcar licença', () => {
      if (!validade.value) return avisar('Escolha a data da licença.');
      return agir(supabase, 'painel_licenciar_empresa', { p_empresa: item.id, p_validade: validade.value });
    }));
    acoes.appendChild(botao('Suspender', () => agir(supabase, 'painel_situacao_empresa', { p_empresa: item.id, p_status: 'suspenso' })));
    acoes.appendChild(botao('Revogar', () => agir(supabase, 'painel_situacao_empresa', { p_empresa: item.id, p_status: 'revogado' })));
    bloco.appendChild(acoes);
    caixa.appendChild(bloco);
  });
}

function desenharLicencas(supabase) {
  const caixa = $('lista-licencas');
  if (!caixa) return;
  caixa.replaceChildren();
  const pessoas = cacheListas.avulsos.map((item) => ({
    titulo: item.nome || item.email,
    status: item.licenca_status || (item.licenca_validade ? 'ativa' : (item.degustacao_fim ? 'degustação' : 'sem prazo')),
    detalhe: item.licenca_validade ? 'licença até ' + item.licenca_validade : (item.degustacao_fim ? 'degustação até ' + item.degustacao_fim : 'Sem prazo definido')
  }));
  const empresas = cacheListas.empresas.filter((item) => R.empresaAceita(item.nome)).map((item) => ({
    titulo: item.nome,
    status: item.licenca_status || (item.licenca_validade ? 'ativa' : 'sem prazo'),
    detalhe: item.licenca_validade ? 'licença até ' + item.licenca_validade : 'Sem prazo definido'
  }));
  const tudo = pessoas.concat(empresas);
  if (!tudo.length) vazio(caixa, 'Nenhuma licença para mostrar. Marque o prazo na pessoa ou na empresa.');
  tudo.forEach((item) => {
    const bloco = cartao();
    const topo = document.createElement('div');
    topo.className = 'ux-linha';
    const nome = document.createElement('b');
    nome.textContent = item.titulo || 'Sem nome';
    topo.appendChild(nome);
    topo.appendChild(selo(item.status));
    bloco.appendChild(topo);
    bloco.appendChild(linha([item.detalhe]));
    caixa.appendChild(bloco);
  });
  void supabase;
}

function desenharPessoas() {
  const caixa = $('lista-pessoas');
  const q = ($('busca-pessoas') && $('busca-pessoas').value || '').trim().toLowerCase();
  caixa.replaceChildren();
  const lista = cacheListas.pessoas.filter((item) => {
    const visivel = R.pessoaVisivel(item);
    if (!q) return true;
    return (visivel.nome + ' ' + visivel.email).toLowerCase().indexOf(q) >= 0;
  });
  if (!lista.length) vazio(caixa, q ? 'Nenhuma pessoa com esse nome ou e-mail.' : 'Nenhuma pessoa cadastrada ainda.');
  lista.forEach((item) => {
    const visivel = R.pessoaVisivel(item);
    const bloco = cartao();
    const nome = document.createElement('b');
    nome.textContent = visivel.nome;
    const email = document.createElement('span');
    email.textContent = visivel.email;
    bloco.appendChild(nome);
    bloco.appendChild(document.createTextNode(' '));
    bloco.appendChild(email);
    bloco.appendChild(document.createTextNode(' '));
    bloco.appendChild(selo(visivel.ativa ? 'ativa' : 'inativa'));
    if (visivel.ultimo) bloco.appendChild(linha(['Último acesso ' + visivel.ultimo]));
    caixa.appendChild(bloco);
  });
}

function botao(rotulo, aoClicar) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'btn ghost';
  el.textContent = rotulo;
  el.addEventListener('click', aoClicar);
  return el;
}

async function decidir(supabase, id, aprovar) {
  const chamar = criarChamada(supabase);
  const feito = await chamar('painel_decidir_pedido', { p_pedido: id, p_aprovar: aprovar });
  if (!feito.ok) return mostrar(feito.tipo);
  await carregar(supabase);
}

async function agir(supabase, nome, args) {
  const chamar = criarChamada(supabase);
  const feito = await chamar(nome, args);
  if (!feito.ok) return mostrar(feito.tipo);
  await carregar(supabase);
}

async function sair() {
  const supabase = supabaseAtual || cliente();
  try { if (supabase) await supabase.auth.signOut(); }
  catch (_) { /* a página recarrega mesmo assim */ }
  window.location.reload();
}

async function entrarDeNovo() {
  const supabase = supabaseAtual || cliente();
  if (!supabase) return;
  try { await supabase.auth.signOut({ scope: 'local' }); }
  catch (_) { /* segue para o Google com a sessão local descartada */ }
  const r = await L.iniciarGoogle(supabase, window.location, (url) => { window.location.assign(url); });
  if (!r.ok) texto('st-expirada-extra', 'O Google desta página ainda depende do endereço de retorno autorizado no projeto.');
}

async function iniciar() {
  const aviso = L.erroVisivelNaUrl(window.location.href);
  if (aviso) texto('st-entrada', aviso);
  const supabase = cliente();
  supabaseAtual = supabase;
  if (!supabase) {
    texto('st-entrada', 'A chave pública de teste não está disponível.');
    mostrar('entrada');
    return;
  }
  let sess;
  try { sess = await supabase.auth.getSession(); }
  catch (_) { mostrar('erro_temporario'); return; }
  const usuario = sess.data && sess.data.session && sess.data.session.user;
  if (!usuario) {
    mostrar('entrada');
    return;
  }
  await abrirComoDono(supabase);
}

async function abrirComoDono(supabase) {
  const euR = await criarChamada(supabase)('painel_eu');
  if (!euR.ok) return mostrar(euR.tipo);
  if (!euR.data || euR.data.dono !== true) return mostrar('recusa');
  mostrar('dono');
  await carregar(supabase);
}

document.querySelectorAll('[data-tela]').forEach((botaoTela) => {
  botaoTela.addEventListener('click', () => {
    telaAtual = botaoTela.getAttribute('data-tela');
    if (supabaseAtual) aplicarVista({ sessao: true, dono: true });
  });
});
$('form-convite').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const supabase = supabaseAtual;
  if (!supabase) return;
  const criado = await criarChamada(supabase)('painel_criar_convite', {
    p_email: $('conv-email').value,
    p_tipo: $('conv-tipo').value,
    p_empresa: null
  });
  if (!criado.ok) return mostrar(criado.tipo);
  texto('st-convite', 'Convite em rascunho. Código: ' + (criado.data && criado.data.codigo));
  await carregar(supabase);
});
$('form-empresa').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const supabase = supabaseAtual;
  if (!supabase) return;
  if (!R.empresaAceita($('emp-nome').value)) {
    texto('st-empresa', 'INOVA Blindagem fica só nos testes e não entra nesta lista.');
    return;
  }
  const criado = await criarChamada(supabase)('painel_criar_empresa', {
    p_nome: $('emp-nome').value,
    p_email: $('emp-email').value
  });
  if (!criado.ok) return mostrar(criado.tipo);
  texto('st-empresa', 'Empresa criada. Código do gerente: ' + (criado.data && criado.data.codigo));
  await carregar(supabase);
});
$('btn-sair').addEventListener('click', sair);
$('btn-sair-topo').addEventListener('click', sair);
$('btn-atualizar').addEventListener('click', async () => {
  if (!supabaseAtual) return;
  avisar('Atualizando.');
  await carregar(supabaseAtual);
  avisar('Painel atualizado.');
});
$('busca-pessoas').addEventListener('input', desenharPessoas);
$('form-entrar').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const supabase = cliente();
  if (!supabase) return;
  const r = await S.entrar(supabase, $('acesso-email').value, $('acesso-senha').value);
  $('acesso-senha').value = '';
  texto('st-login', r.mensagem);
  if (!(r.ok && r.motivo === 'entrou')) return;
  supabaseAtual = supabase;
  await abrirComoDono(supabase);
});
$('btn-sair-recusa').addEventListener('click', sair);
$('btn-sair-expirada').addEventListener('click', sair);
$('btn-entrar-de-novo').addEventListener('click', entrarDeNovo);
$('btn-tentar').addEventListener('click', () => iniciar());
$('btn-google').addEventListener('click', async () => {
  const supabase = cliente();
  if (!supabase) return;
  const r = await L.iniciarGoogle(supabase, window.location, (url) => { window.location.assign(url); });
  if (!r.ok) texto('st-entrada', 'O Google desta página ainda depende do endereço de retorno autorizado no projeto.');
});

iniciar();
