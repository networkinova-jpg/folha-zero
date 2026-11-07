import { createClient } from '@supabase/supabase-js';
import { FOLHA_ZERO_TESTE } from './acesso-teste-config.js';
import './persistencia.js';
import './snapshot-remoto.js';

const S = globalThis.FolhaSnapshot;
const $ = (id) => document.getElementById(id);

function texto(id, valor) { const el = $(id); if (el) el.textContent = valor; }

function clienteSeguro() {
  const cfg = FOLHA_ZERO_TESTE || {};
  if (!cfg.url || !S.chavePublicaAceita(cfg.publishableKey)) return null;
  return createClient(cfg.url, cfg.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
}

async function sondar(cliente) {
  const out = { conectado: false, google: false, email: false, signup: false, snapshot: 'desconhecido', sessao: null };
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
    const tab = await fetch(cliente.supabaseUrl + '/rest/v1/snapshots_privados?select=id&limit=0', {
      headers: { apikey: cliente.supabaseKey, Authorization: 'Bearer ' + cliente.supabaseKey }
    });
    out.snapshot = tab.status === 404 ? 'ausente' : tab.ok ? 'presente' : 'erro';
    const sess = await cliente.auth.getSession();
    out.sessao = sess.data && sess.data.session ? sess.data.session.user.id : null;
  } catch (_) {
    out.conectado = false;
  }
  return out;
}

function remotoDe(cliente) {
  return {
    async gravar(item) {
      const { data: sess } = await cliente.auth.getSession();
      const uid = sess.session && sess.session.user.id;
      if (!uid) return { ok: false, motivo: 'sem_sessao' };
      const { error } = await cliente.from('snapshots_privados').upsert({
        owner_id: uid, sha256: item.sha256, bytes: item.bytes, documento: item.documento
      }, { onConflict: 'owner_id,sha256' });
      if (error) return { ok: false, motivo: 'gravacao_falhou' };
      return { ok: true };
    },
    async ler(sha) {
      const { data, error } = await cliente.from('snapshots_privados').select('sha256,bytes,documento').eq('sha256', sha).limit(1);
      if (error || !data || !data[0]) return { ok: false, motivo: 'nao_encontrado' };
      const doc = data[0].documento || {};
      return { ok: true, sha256: data[0].sha256, bytes: data[0].bytes, lancamentos: (doc.entries || []).length, documento: doc };
    },
    async listar() {
      const { data, error } = await cliente.from('snapshots_privados').select('sha256,bytes,criado_em').order('criado_em', { ascending: false });
      if (error) return { ok: false, motivo: 'lista_falhou', itens: [] };
      return { ok: true, itens: data || [] };
    }
  };
}

function pintar(estado) {
  texto('st-conexao', estado.conectado ? 'Projeto de teste alcançado. Banco de contas ainda sem usuários criados por esta tela.' : 'Não foi possível falar com o projeto.');
  texto('st-google', estado.google ? 'Google ligado no projeto.' : 'Pendente: o provedor Google está desligado. Não há client id nesta etapa e esta tela não usa outro provedor.');
  texto('st-email', 'Entrar com e-mail e senha só funciona para uma conta que já exista. Criar conta está desligado: a confirmação sairia pelo envio padrão, que não serve para clientes.');
  texto('st-snapshot', estado.snapshot === 'ausente'
    ? 'A tabela de cópia privada ainda não existe no projeto. O envio fica bloqueado até a migração incremental ser aplicada.'
    : estado.snapshot === 'presente'
      ? 'A tabela de cópia privada responde. Nada é enviado sem a caixa de autorização.'
      : 'Não deu para confirmar a tabela de cópia.');
  texto('st-sessao', estado.sessao ? 'Sessão ativa neste navegador.' : 'Sem sessão de usuário do Folha Zero.');
  const google = $('btn-google');
  if (google) google.disabled = !estado.google;
  const entrar = $('btn-entrar');
  if (entrar) entrar.disabled = !estado.email;
  const enviar = $('btn-enviar');
  if (enviar) enviar.disabled = estado.snapshot !== 'presente' || !estado.sessao;
}

async function iniciar() {
  if (!S.chavePublicaAceita(FOLHA_ZERO_TESTE && FOLHA_ZERO_TESTE.publishableKey)) {
    texto('st-conexao', 'A chave pública foi recusada. Nada foi conectado.');
    return;
  }
  const cliente = clienteSeguro();
  const estado = await sondar(cliente);
  pintar(estado);
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
  $('btn-enviar').addEventListener('click', async () => {
    if (!$('autorizo').checked) {
      texto('st-copia', 'Nada enviado. Marque a autorização explícita antes.');
      return;
    }
    texto('st-copia', 'Enviando só depois da cópia local e da conferência.');
    const r = await S.enviarCopiaAutorizada(localStorage, true, remotoDe(cliente));
    texto('st-copia', r.verificado ? 'Cópia conferida no projeto. O documento local permanece.' : 'Não concluído: ' + (r.motivo || 'falha') + '. O documento local não foi apagado.');
  });
  $('btn-listar').addEventListener('click', async () => {
    const lista = await remotoDe(cliente).listar();
    const ul = $('lista-copias');
    ul.innerHTML = '';
    if (!lista.ok || !lista.itens.length) {
      ul.innerHTML = '<li>Nenhuma cópia desta sessão. O documento local não foi alterado.</li>';
      return;
    }
    lista.itens.forEach((item) => {
      const li = document.createElement('li');
      li.textContent = 'FIXTURE remota ' + item.sha256.slice(0, 12) + '… ' + item.bytes + ' bytes';
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = 'Ver prévia';
      b.addEventListener('click', async () => {
        const previa = await S.prepararRestauracao(localStorage, item.sha256, remotoDe(cliente));
        texto('st-restauro', previa.ok ? 'Prévia: ' + previa.preview.lancamentos + ' lançamentos. Nada foi escrito.' : 'Sem escrita: ' + previa.motivo);
        $('btn-confirmar').dataset.sha = previa.ok ? item.sha256 : '';
      });
      li.appendChild(b);
      ul.appendChild(li);
    });
  });
  $('btn-confirmar').addEventListener('click', async () => {
    const sha = $('btn-confirmar').dataset.sha;
    if (!sha) { texto('st-restauro', 'Escolha uma prévia antes.'); return; }
    const r = await S.restaurarConfirmada(localStorage, sha, true, remotoDe(cliente));
    texto('st-restauro', r.ok ? 'Restaurado depois da cópia de segurança local.' : 'Não restaurou: ' + (r.motivo || 'falha'));
  });
}

iniciar();
