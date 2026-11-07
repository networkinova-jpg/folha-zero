import { createClient } from '@supabase/supabase-js';
import { FOLHA_ZERO_TESTE } from './acesso-teste-config.js';
import './login-google.js';
import './fixture-teste.js';

const G = globalThis.FolhaLoginGoogle;
const F = globalThis.FolhaFixture;
const $ = (id) => document.getElementById(id);

function chavePublicaAceita(chave) {
  if (!chave || typeof chave !== 'string') return false;
  if (/service_role/i.test(chave)) return false;
  return chave.startsWith('sb_publishable_');
}

function texto(id, valor) { const el = $(id); if (el) el.textContent = valor; }

function clienteSeguro() {
  const cfg = FOLHA_ZERO_TESTE || {};
  if (!cfg.url || !chavePublicaAceita(cfg.publishableKey)) return null;
  return createClient(cfg.url, cfg.publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce'
    }
  });
}

async function sondar(cliente) {
  const out = { conectado: false, google: false, email: false, signup: false, sessao: null };
  try {
    const saude = await fetch(cliente.supabaseUrl + '/auth/v1/health', {
      headers: { apikey: cliente.supabaseKey, Authorization: 'Bearer ' + cliente.supabaseKey }
    });
    out.conectado = saude.ok;
    const ajustes = await fetch(cliente.supabaseUrl + '/auth/v1/settings', {
      headers: { apikey: cliente.supabaseKey, Authorization: 'Bearer ' + cliente.supabaseKey }
    });
    if (ajustes.ok) {
      const j = await ajustes.json();
      out.google = !!(j.external && j.external.google);
      out.email = !!(j.external && j.external.email);
      out.signup = j.disable_signup === false;
    }
    const sess = await cliente.auth.getSession();
    out.sessao = sess.data && sess.data.session ? sess.data.session.user.id : null;
  } catch (_) {
    out.conectado = false;
  }
  return out;
}

function pintar(estado) {
  texto('st-conexao', estado.conectado ? 'Projeto de teste alcançado. Banco de contas ainda sem usuários criados por esta tela.' : 'Não foi possível falar com o projeto.');
  const bloqueada = G.origemProducao(window.location.origin);
  texto('st-google', bloqueada
    ? 'Esta origem é a do aplicativo publicado. O login de teste não abre aqui.'
    : estado.google
      ? 'Google ligado no projeto. O retorno é esta mesma página.'
      : 'Pendente: o provedor Google está desligado no projeto.');
  texto('st-email', 'Entrar com e-mail e senha só funciona para uma conta que já exista. Criar conta está desligado: a confirmação sairia pelo envio padrão, que não serve para clientes.');
  texto('st-snapshot', 'A nuvem continua desligada. O envio remoto segue bloqueado até a aprovação da proteção corrigida.');
  texto('st-sessao', estado.sessao ? 'Sessão ativa neste navegador.' : 'Sem sessão de usuário do Folha Zero.');
  const google = $('btn-google');
  if (google) google.disabled = bloqueada || !estado.google;
  const entrar = $('btn-entrar');
  if (entrar) entrar.disabled = !estado.email;
  const enviar = $('btn-enviar');
  if (enviar) enviar.disabled = true;
  const listar = $('btn-listar');
  if (listar) listar.disabled = true;
  const confirmar = $('btn-confirmar');
  if (confirmar) confirmar.disabled = true;
}

async function iniciar() {
  const hrefInicial = window.location.href;
  const avisoUrl = G.erroVisivelNaUrl(hrefInicial);
  if (avisoUrl) {
    const limpa = G.limparUrl(hrefInicial);
    if (limpa !== hrefInicial) window.history.replaceState(window.history.state, '', limpa);
  }
  if (!chavePublicaAceita(FOLHA_ZERO_TESTE && FOLHA_ZERO_TESTE.publishableKey)) {
    texto('st-conexao', 'A chave pública foi recusada. Nada foi conectado.');
    return;
  }
  const cliente = clienteSeguro();
  const estado = await sondar(cliente);
  pintar(estado);
  const msg = G.mensagemDeSessao(hrefInicial, estado.sessao, avisoUrl);
  if (msg) texto('st-login', msg);
  if (!avisoUrl && /[?&#]code=/.test(hrefInicial)) {
    const limpa = G.limparUrl(window.location.href);
    if (limpa !== window.location.href) window.history.replaceState(window.history.state, '', limpa);
  }
  $('btn-google').addEventListener('click', async () => {
    texto('st-login', 'Abrindo o Google. O retorno será esta mesma página.');
    const r = await G.iniciarGoogle(cliente, window.location, (url) => { window.location.assign(url); });
    if (!r.ok) texto('st-login', r.mensagem || (r.motivo === 'origem_producao' ? 'Login de teste bloqueado nesta origem.' : 'Não foi possível abrir o Google.'));
  });
  $('form-entrar').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const email = $('acesso-email').value.trim();
    const senha = $('acesso-senha').value;
    $('acesso-senha').value = '';
    texto('st-login', 'Tentando entrar. Esta ação não cria conta e não pede e-mail de cadastro.');
    const { error } = await cliente.auth.signInWithPassword({ email, password: senha });
    texto('st-login', error ? 'Não entrou. Se a conta não existe, ela não foi criada.' : 'Sessão iniciada.');
    pintar(await sondar(cliente));
  });
  $('btn-sair').addEventListener('click', async () => {
    await cliente.auth.signOut();
    texto('st-login', 'Sessão encerrada neste navegador. Os lançamentos locais não foram apagados.');
    pintar(await sondar(cliente));
  });
  $('btn-gerar').addEventListener('click', () => {
    const r = F.gerarEGravar(localStorage);
    texto('st-copia', r.ok
      ? 'Conjunto fictício gravado na chave de teste. Dois lançamentos, sem leitura do aplicativo.'
      : 'Não gravou: ' + (r.motivo || 'falha'));
  });
  $('btn-comparar').addEventListener('click', () => {
    const outro = memoria();
    const r = F.simularOutroNavegador(localStorage, outro);
    texto('st-restauro', r.ok
      ? 'Integridade confere no outro contexto de teste. Ids ' + r.ids.join(', ') + '. A nuvem não recebeu esta cópia.'
      : 'Sem conferência: ' + (r.motivo || 'falha') + '.');
  });
  $('btn-enviar').addEventListener('click', () => {
    const r = F.tentarEnvioRemoto(null, Date.now());
    texto('st-copia', r.enviou ? 'Envio inesperado.' : 'Envio remoto bloqueado. Nenhuma cópia saiu deste navegador.');
  });
}

function memoria() {
  const dados = new Map();
  return {
    getItem(chave) { return dados.has(chave) ? dados.get(chave) : null; },
    setItem(chave, valor) { dados.set(chave, String(valor)); }
  };
}

iniciar();
