import { createClient } from '@supabase/supabase-js';
import { FOLHA_ZERO_TESTE } from './acesso-teste-config.js';
import './login-google.js';
import './admin-painel-logica.js';

const L = globalThis.FolhaLoginGoogle;
const R = globalThis.FolhaPainelLogica;
const $ = (id) => document.getElementById(id);
let telaAtual = 'inicio';
let supabaseAtual = null;

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
  if (tipo === 'dono') aplicarVista({ sessao: true, dono: true });
  else if (tipo === 'recusa') aplicarVista({ sessao: true, dono: false });
  else if (tipo === 'sessao_expirada') aplicarVista({ sessao: true, dono: false, situacao: 'sessao_expirada' });
  else if (tipo === 'erro_temporario') aplicarVista({ sessao: true, dono: false, situacao: 'erro_temporario' });
  else aplicarVista({ sessao: false, dono: false });
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
  const euR = await chamar('painel_eu');
  if (!euR.ok) return mostrar(euR.tipo);
  const eu = euR.data;
  texto('st-conta', eu && eu.dono
    ? 'Você é o proprietário. Esta conta não tem prazo. E-mail da sessão: ' + (eu.email || 'não informado')
    : R.FRASE_RECUSA);
  const pedidosR = await chamar('painel_listar_pedidos');
  if (!pedidosR.ok) return mostrar(pedidosR.tipo);
  const pedidos = pedidosR.data;
  const caixaPedidos = $('lista-pedidos');
  caixaPedidos.replaceChildren();
  (pedidos || []).forEach((item) => {
    const bloco = document.createElement('div');
    bloco.appendChild(linha([item.nome || item.email, item.tipo, item.status]));
    if (item.status === 'pendente') {
      const acoes = document.createElement('div');
      acoes.className = 'actions';
      acoes.appendChild(botao('Aprovar', () => decidir(supabase, item.id, true)));
      acoes.appendChild(botao('Recusar', () => decidir(supabase, item.id, false)));
      bloco.appendChild(acoes);
    }
    caixaPedidos.appendChild(bloco);
  });
  const avulsosR = await chamar('painel_listar_avulsos');
  if (!avulsosR.ok) return mostrar(avulsosR.tipo);
  const avulsos = avulsosR.data;
  const caixaAvulsos = $('lista-avulsos');
  caixaAvulsos.replaceChildren();
  (avulsos || []).forEach((item) => {
    const bloco = document.createElement('div');
    bloco.appendChild(linha([
      item.nome || item.email,
      item.status,
      item.degustacao_fim ? 'degustação até ' + item.degustacao_fim : '',
      item.licenca_validade ? 'licença até ' + item.licenca_validade : '',
      item.copia_existe ? 'backup ' + (item.copia_atualizado_em || '') : 'sem backup'
    ]));
    const acoes = document.createElement('div');
    acoes.className = 'actions';
    const validade = document.createElement('input');
    validade.type = 'date';
    acoes.appendChild(validade);
    acoes.appendChild(botao('Marcar licença', () => {
      if (!validade.value) return;
      return agir(supabase, 'painel_licenciar_avulso', { p_user: item.user_id, p_validade: validade.value });
    }));
    acoes.appendChild(botao('Degustação de 20 dias', () => agir(supabase, 'painel_degustar_avulso', { p_user: item.user_id })));
    acoes.appendChild(botao('Suspender', () => agir(supabase, 'painel_situacao_avulso', { p_user: item.user_id, p_status: 'suspenso' })));
    acoes.appendChild(botao('Revogar', () => agir(supabase, 'painel_situacao_avulso', { p_user: item.user_id, p_status: 'revogado' })));
    bloco.appendChild(acoes);
    caixaAvulsos.appendChild(bloco);
  });
  const empresasR = await chamar('painel_listar_empresas');
  if (!empresasR.ok) return mostrar(empresasR.tipo);
  const empresas = empresasR.data;
  const caixaEmpresas = $('lista-empresas');
  caixaEmpresas.replaceChildren();
  (empresas || []).forEach((item) => {
    if (!R.empresaAceita(item.nome)) return;
    const bloco = document.createElement('div');
    bloco.appendChild(linha([item.nome, item.gerente_email, item.status, item.licenca_validade ? 'até ' + item.licenca_validade : '']));
    const validade = document.createElement('input');
    validade.type = 'date';
    const acoes = document.createElement('div');
    acoes.className = 'actions';
    acoes.appendChild(validade);
    acoes.appendChild(botao('Marcar licença', () => {
      if (!validade.value) return;
      return agir(supabase, 'painel_licenciar_empresa', { p_empresa: item.id, p_validade: validade.value });
    }));
    acoes.appendChild(botao('Suspender', () => agir(supabase, 'painel_situacao_empresa', { p_empresa: item.id, p_status: 'suspenso' })));
    acoes.appendChild(botao('Revogar', () => agir(supabase, 'painel_situacao_empresa', { p_empresa: item.id, p_status: 'revogado' })));
    bloco.appendChild(acoes);
    caixaEmpresas.appendChild(bloco);
  });
  const pessoasR = await chamar('painel_listar_pessoas');
  if (!pessoasR.ok) return mostrar(pessoasR.tipo);
  const pessoas = pessoasR.data;
  const caixaPessoas = $('lista-pessoas');
  caixaPessoas.replaceChildren();
  (pessoas || []).forEach((item) => {
    const visivel = R.pessoaVisivel(item);
    const bloco = document.createElement('div');
    const nome = document.createElement('b');
    nome.textContent = visivel.nome;
    const email = document.createElement('span');
    email.textContent = visivel.email;
    const extra = document.createElement('span');
    extra.textContent = (visivel.ativa ? 'ativa' : 'inativa') + (visivel.ultimo ? ' ' + visivel.ultimo : '');
    bloco.appendChild(nome);
    bloco.appendChild(document.createTextNode(' '));
    bloco.appendChild(email);
    bloco.appendChild(document.createTextNode(' '));
    bloco.appendChild(extra);
    caixaPessoas.appendChild(bloco);
  });
  const convitesR = await chamar('painel_listar_convites');
  if (!convitesR.ok) return mostrar(convitesR.tipo);
  const convites = convitesR.data;
  const caixaConvites = $('lista-convites');
  caixaConvites.replaceChildren();
  (convites || []).forEach((item) => {
    const bloco = document.createElement('div');
    bloco.appendChild(linha([item.email, item.tipo, item.status, item.codigo]));
    const copiar = botao('Copiar código', async () => {
      try { await navigator.clipboard.writeText(item.codigo); texto('st-convite', 'Código copiado.'); }
      catch (_) { texto('st-convite', 'Código: ' + item.codigo); }
    });
    bloco.appendChild(copiar);
    caixaConvites.appendChild(bloco);
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
