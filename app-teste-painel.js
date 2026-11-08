import { createClient } from '@supabase/supabase-js';
import { FOLHA_ZERO_TESTE } from './acesso-teste-config.js';
import './login-google.js';
import './fixture-teste.js';

const M = globalThis.FolhaModoTeste;
const F = globalThis.FolhaFixture;
const $ = (id) => document.getElementById(id);

function texto(id, valor) { const el = $(id); if (el) el.textContent = valor; }

function cliente() {
  const cfg = FOLHA_ZERO_TESTE || {};
  if (!cfg.url || !cfg.publishableKey || !String(cfg.publishableKey).startsWith('sb_publishable_')) return null;
  return createClient(cfg.url, cfg.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce' }
  });
}

function mensagem(motivo) {
  if (motivo === 'origem_producao') return 'O GitHub Pages não envia esta cópia.';
  if (motivo === 'origem_nao_autorizada') return 'Este endereço não envia a fixture. Use o site de teste isolado.';
  if (motivo === 'sessao_ausente') return 'Entre com o Google na tela de acesso antes de usar a nuvem.';
  if (motivo === 'ja_existe') return 'Esta conta já tem a fixture canônica. Nada foi apagado.';
  if (motivo === 'sem_confirmacao') return 'Nada foi recolocado. A prévia está acima.';
  if (motivo === 'versao') return 'A versão do documento não é a desta tela. Nada foi gravado.';
  if (motivo === 'rollback') return 'A gravação falhou. Os lançamentos de teste anteriores foram mantidos.';
  return 'Não foi possível concluir. Os lançamentos de teste não foram apagados.';
}

async function pintar() {
  M.semearSeVazio(localStorage);
  const local = localStorage.getItem(M.CHAVE_APP);
  let n = 0;
  try { n = JSON.parse(local).entries.length; } catch (_) {}
  texto('st-teste-local', 'Armazenamento de teste: ' + n + ' lançamentos fictícios. A cópia local de segurança fica separada. O aplicativo publicado não é lido.');
  const supabase = cliente();
  let sessao = null;
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    sessao = data && data.session;
  }
  texto('st-teste-sessao', sessao ? 'Sessão ativa nesta conta. Nenhum token é mostrado.' : 'Sem sessão. O login Google continua na tela de acesso.');
  const origem = F.paginaPermitida(window.location);
  texto('st-teste-remoto', origem.ok
    ? 'O envio remoto grava só a fixture canônica, não os carros desta tela. O backup genérico está fechado.'
    : 'Backup genérico fechado. ' + mensagem(origem.motivo));
  const pode = origem.ok && !!sessao;
  ['btn-teste-enviar', 'btn-teste-recuperar'].forEach((id) => { const el = $(id); if (el) el.disabled = !pode; });
  const link = $('link-acesso');
  if (link) link.href = window.location.hostname === F.HOST_TESTE ? '/acesso-teste' : 'acesso-teste.html';
}

async function iniciar() {
  await pintar();
  $('btn-previa-fixture').addEventListener('click', () => {
    const info = M.previa(localStorage, M.documentoFixture());
    const extra = info.colisoes.length ? ' Colisão de id: ' + info.colisoes.join(', ') + '.' : ' Sem colisão de conteúdo.';
    texto('st-teste-previa', 'Prévia: ' + info.novos + ' lançamentos, valor zero e sem valor, pausas e situação. Locais agora: ' + info.locais + '.' + extra + ' Nada foi gravado.');
    $('btn-confirmar-fixture').disabled = false;
  });
  $('btn-confirmar-fixture').addEventListener('click', () => {
    const r = M.aplicarDocumento(localStorage, M.documentoFixture(), true);
    texto('st-teste-previa', r.ok
      ? 'Fixture recolocada no app de teste. A versão anterior ficou na cópia local de segurança.'
      : mensagem(r.motivo));
    if (r.ok) window.location.reload();
  });
  $('btn-teste-enviar').addEventListener('click', async () => {
    const supabase = cliente();
    const { data } = await supabase.auth.getSession();
    const plano = F.planejarEnvio({
      location: window.location,
      sessao: data && data.session,
      agoraMs: Date.now(),
      documento: F.gerarConjunto()
    });
    if (!plano.ok) { texto('st-teste-nuvem', mensagem(plano.motivo)); return; }
    const r = await F.enviarComCliente(supabase, plano.pedido);
    texto('st-teste-nuvem', r.jaExistia
      ? mensagem('ja_existe')
      : r.enviou
        ? 'Fixture canônica gravada nesta conta. Os carros desta tela não foram enviados.'
        : mensagem(r.motivo));
  });
  $('btn-teste-recuperar').addEventListener('click', async () => {
    const supabase = cliente();
    const r = await F.restaurarComCliente(supabase, localStorage);
    texto('st-teste-nuvem', r.ok
      ? 'Integridade confere na chave da fixture. Ids ' + r.ids.join(', ') + '. O app de teste não foi substituído.'
      : mensagem(r.motivo));
  });
}

iniciar();
