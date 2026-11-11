import { createClient } from '@supabase/supabase-js';
import { FOLHA_ZERO_TESTE } from './acesso-teste-config.js';
import './login-google.js';
import './admin-painel-logica.js';

const L = globalThis.FolhaLoginGoogle;
const R = globalThis.FolhaPainelLogica;
const $ = (id) => document.getElementById(id);
let telaAtual = 'inicio';

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

function aplicarVista(estado) {
  const v = R.vista(estado.sessao, estado.dono, telaAtual);
  $('tela-entrada').classList.toggle('hidden', !v.entrada);
  $('st-recusa').classList.toggle('hidden', !v.recusa);
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

async function carregar(supabase) {
  const resumo = R.contadores(await rpc(supabase, 'painel_resumo'));
  texto('n-pedidos', resumo.pedidos);
  texto('n-avulsos', resumo.avulsos);
  texto('n-empresas', resumo.empresas);
  texto('n-vencem', resumo.vencem);
  const eu = await rpc(supabase, 'painel_eu');
  texto('st-conta', eu && eu.dono
    ? 'Você é o proprietário. Esta conta não tem prazo. E-mail da sessão: ' + (eu.email || 'não informado')
    : R.FRASE_RECUSA);
  const pedidos = await rpc(supabase, 'painel_listar_pedidos');
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
  const avulsos = await rpc(supabase, 'painel_listar_avulsos');
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
  const empresas = await rpc(supabase, 'painel_listar_empresas');
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
  const convites = await rpc(supabase, 'painel_listar_convites');
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
  await rpc(supabase, 'painel_decidir_pedido', { p_pedido: id, p_aprovar: aprovar });
  await carregar(supabase);
}

async function agir(supabase, nome, args) {
  await rpc(supabase, nome, args);
  await carregar(supabase);
}

async function iniciar() {
  const aviso = L.erroVisivelNaUrl(window.location.href);
  if (aviso) texto('st-entrada', aviso);
  const supabase = cliente();
  if (!supabase) {
    texto('st-entrada', 'A chave pública de teste não está disponível.');
    aplicarVista({ sessao: false, dono: false });
    return;
  }
  const sess = await supabase.auth.getSession();
  const usuario = sess.data && sess.data.session && sess.data.session.user;
  if (!usuario) {
    aplicarVista({ sessao: false, dono: false });
    return;
  }
  let eu;
  try { eu = await rpc(supabase, 'painel_eu'); }
  catch (_) { eu = { dono: false }; }
  if (!eu || eu.dono !== true) {
    aplicarVista({ sessao: true, dono: false });
    return;
  }
  aplicarVista({ sessao: true, dono: true });
  await carregar(supabase);
  document.querySelectorAll('[data-tela]').forEach((botaoTela) => {
    botaoTela.addEventListener('click', () => {
      telaAtual = botaoTela.getAttribute('data-tela');
      aplicarVista({ sessao: true, dono: true });
    });
  });
  $('form-convite').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const criado = await rpc(supabase, 'painel_criar_convite', {
      p_email: $('conv-email').value,
      p_tipo: $('conv-tipo').value,
      p_empresa: null
    });
    texto('st-convite', 'Convite em rascunho. Código: ' + (criado && criado.codigo));
    await carregar(supabase);
  });
  $('form-empresa').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!R.empresaAceita($('emp-nome').value)) {
      texto('st-empresa', 'INOVA Blindagem fica só nos testes e não entra nesta lista.');
      return;
    }
    const criado = await rpc(supabase, 'painel_criar_empresa', {
      p_nome: $('emp-nome').value,
      p_email: $('emp-email').value
    });
    texto('st-empresa', 'Empresa criada. Código do gerente: ' + (criado && criado.codigo));
    await carregar(supabase);
  });
  $('btn-sair').addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.reload();
  });
}

$('btn-google').addEventListener('click', async () => {
  const supabase = cliente();
  if (!supabase) return;
  const r = await L.iniciarGoogle(supabase, window.location, (url) => { window.location.assign(url); });
  if (!r.ok) texto('st-entrada', 'O Google desta página ainda depende do endereço de retorno autorizado no projeto.');
});

iniciar();
