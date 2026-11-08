import { createClient } from '@supabase/supabase-js';
import { FOLHA_ZERO_TESTE } from './acesso-teste-config.js';
import './login-google.js';
import './fixture-teste.js';
import './backup-teste.js';

const M = globalThis.FolhaModoTeste;
const F = globalThis.FolhaFixture;
const B = globalThis.FolhaBackupTeste;
const AVISO = 'folhazero_teste_aviso';
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
  if (motivo === 'revisao_divergente') return B.MENSAGEM_CONFLITO;
  if (motivo === 'base_ausente') return B.MENSAGEM_SEM_BASE;
  if (motivo === 'conta_anterior') return 'Esta sessão não é a conta destes lançamentos. Nada foi enviado.';
  if (motivo === 'aguardando_migracao') return 'O envio dos lançamentos de teste ainda não está liberado. Nenhum carro saiu deste aparelho.';
  if (motivo === 'leitura_recusada') return 'Não foi possível ler a cópia desta conta. Nada foi gravado neste aparelho.';
  return 'Não foi possível concluir. Os lançamentos de teste não foram apagados.';
}

function lerAviso() {
  try {
    const t = sessionStorage.getItem(AVISO);
    if (t) sessionStorage.removeItem(AVISO);
    return t || '';
  } catch (_) { return ''; }
}

async function pintar() {
  M.semearSeVazio(localStorage);
  const aviso = lerAviso();
  if (aviso === B.MENSAGEM_RECOLOCADA) texto('st-backup-variavel', aviso);
  else if (aviso) texto('st-teste-previa', aviso);
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
    ? 'Enviar lançamentos de teste grava só a chave de teste. O aplicativo publicado continua sem cópia online.'
    : 'A cópia variável só abre no site isolado. ' + mensagem(origem.motivo));
  const avisoNuvem = $('s-nuvem-info');
  if (avisoNuvem) avisoNuvem.textContent = 'O backup do aplicativo publicado continua desligado. Neste site isolado, a cópia automática envia só a chave de teste depois de uma alteração salva.';
  const pode = origem.ok && !!sessao;
  ['btn-teste-enviar', 'btn-teste-recuperar'].forEach((id) => { const el = $(id); if (el) el.disabled = !pode; });
  ['btn-backup-variavel', 'btn-backup-previa', 'btn-backup-confirmar'].forEach((id) => {
    const el = $(id); if (el) el.disabled = true;
  });
  if (B.ABERTO === true && pode) {
    const conta = B.podeEnviarDaConta(localStorage, sessao.user.id);
    if (!localStorage.getItem(M.CHAVE_CONTA)) localStorage.setItem(M.CHAVE_CONTA, sessao.user.id);
    if (conta.ok) {
      $('btn-backup-variavel').disabled = false;
      $('btn-backup-previa').disabled = false;
    } else {
      texto('st-backup-variavel', mensagem('conta_anterior'));
    }
  }
  const link = $('link-acesso');
  if (link) link.href = window.location.hostname === F.HOST_TESTE ? '/acesso-teste' : 'acesso-teste.html';
}

async function iniciar() {
  await pintar();
  $('btn-previa-fixture').addEventListener('click', () => {
    const info = M.previa(localStorage, M.documentoFixture());
    const extra = info.colisoes.length ? ' Colisão de id: ' + info.colisoes.join(', ') + '.' : ' Sem colisão de conteúdo.';
    const sozinho = info.somenteLocais && info.somenteLocais.length
      ? ' Há lançamento só neste aparelho: ' + info.somenteLocais.length + '.'
      : '';
    texto('st-teste-previa', 'Prévia dos lançamentos de teste: ' + info.novos + ' itens, valor zero e sem valor, pausas e situação. Locais agora: ' + info.locais + '.' + extra + sozinho + ' Nada foi gravado.');
    $('btn-confirmar-fixture').disabled = false;
  });
  $('btn-confirmar-fixture').addEventListener('click', () => {
    const r = M.aplicarDocumento(localStorage, M.documentoFixture(), true);
    if (!r.ok) { texto('st-teste-previa', mensagem(r.motivo)); return; }
    const contaMarcada = localStorage.getItem(M.CHAVE_CONTA);
    if (contaMarcada) B.limparBase(localStorage, contaMarcada);
    try {
      sessionStorage.setItem(AVISO, 'Lançamentos de teste recolocados. A versão anterior ficou na cópia local de segurança.');
    } catch (_) {}
    window.location.reload();
  });
  let copiaPendente = null;
  function documentoLocal() {
    try { return JSON.parse(localStorage.getItem(M.CHAVE_APP)); }
    catch (_) { return null; }
  }
  function contaMarcada() { return localStorage.getItem(M.CHAVE_CONTA) || ''; }
  function mostrarFila() {
    const conta = contaMarcada();
    if (!conta) return;
    texto('st-backup-variavel', B.textoEstado(B.lerFila(localStorage, conta)));
  }
  async function enviarAutomatico(modo) {
    const origemEnvio = F.paginaPermitida(window.location);
    const supabase = cliente();
    let sessao = null;
    if (supabase) {
      const obtido = await supabase.auth.getSession();
      sessao = obtido.data && obtido.data.session;
    }
    const conta = contaMarcada();
    if (!conta) return;
    const antes = localStorage.getItem(M.CHAVE_APP);
    const copiaAntes = localStorage.getItem(M.CHAVE_COPIA);
    await B.rodarFila(supabase, localStorage, {
      conta,
      sessao,
      documento: await documentoLocal(),
      documentoAtual() { return documentoLocal(); },
      online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
      origemOk: origemEnvio.ok,
      liberado: B.ABERTO === true,
      manual: modo === true,
      retomada: modo === 'retomada'
    });
    if (localStorage.getItem(M.CHAVE_APP) !== antes) {
      if (antes == null) localStorage.removeItem(M.CHAVE_APP);
      else localStorage.setItem(M.CHAVE_APP, antes);
    }
    if (localStorage.getItem(M.CHAVE_COPIA) !== copiaAntes) {
      if (copiaAntes == null) localStorage.removeItem(M.CHAVE_COPIA);
      else localStorage.setItem(M.CHAVE_COPIA, copiaAntes);
    }
    mostrarFila();
  }
  let esperaEnvio = 0;
  window.addEventListener('folha-teste-gravou', () => {
    const conta = contaMarcada();
    if (!conta) return;
    B.anotarMudanca(localStorage, conta);
    mostrarFila();
    clearTimeout(esperaEnvio);
    esperaEnvio = setTimeout(() => { enviarAutomatico(false); }, 800);
  });
  window.addEventListener('online', () => { enviarAutomatico('retomada'); });
  if (contaMarcada()) {
    B.retomarFila(localStorage, contaMarcada());
    mostrarFila();
    enviarAutomatico('retomada');
  }
  $('btn-backup-variavel').addEventListener('click', async () => {
    if (B.ABERTO !== true) {
      texto('st-backup-variavel', mensagem('aguardando_migracao'));
      return;
    }
    await enviarAutomatico(true);
  });
  $('btn-backup-previa').addEventListener('click', async () => {
    if (B.ABERTO !== true) {
      texto('st-backup-variavel', mensagem('aguardando_migracao'));
      return;
    }
    const supabase = cliente();
    const lido = await B.lerPropria(supabase);
    if (!lido.ok) { texto('st-backup-variavel', mensagem(lido.motivo)); return; }
    if (lido.vazio) {
      copiaPendente = null;
      $('btn-backup-confirmar').disabled = true;
      texto('st-backup-variavel', 'Esta conta ainda não tem cópia variável. Nada foi gravado neste aparelho.');
      return;
    }
    copiaPendente = { documento: lido.documento, revisao: lido.revisao };
    const info = M.previa(localStorage, lido.documento);
    const extra = info.colisoes.length ? ' Colisão de id: ' + info.colisoes.join(', ') + '.' : '';
    const sozinho = info.somenteLocais && info.somenteLocais.length
      ? ' Há lançamento só neste aparelho: ' + info.somenteLocais.length + '.'
      : '';
    texto('st-backup-variavel', 'Prévia da cópia variável: ' + info.novos + ' lançamentos. Locais agora: ' + info.locais + '.' + extra + sozinho + ' Nada foi gravado.');
    $('btn-backup-confirmar').disabled = false;
  });
  $('btn-backup-confirmar').addEventListener('click', async () => {
    if (B.ABERTO !== true || !copiaPendente) {
      texto('st-backup-variavel', mensagem('aguardando_migracao'));
      return;
    }
    const supabase = cliente();
    const { data } = supabase ? await supabase.auth.getSession() : { data: null };
    const sessao = data && data.session;
    if (!sessao || !sessao.user || !Number.isInteger(copiaPendente.revisao)) {
      texto('st-backup-variavel', mensagem('sessao_ausente'));
      return;
    }
    const r = B.recuperar(localStorage, copiaPendente.documento, true);
    if (!r.ok) { texto('st-backup-variavel', mensagem(r.motivo)); return; }
    B.registrarCopiaAceita(localStorage, sessao.user.id, copiaPendente.documento, copiaPendente.revisao);
    try { sessionStorage.setItem(AVISO, B.MENSAGEM_RECOLOCADA); } catch (_) {}
    window.location.reload();
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
