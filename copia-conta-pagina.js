import { createClient } from '@supabase/supabase-js';
import { FOLHA_ZERO_TESTE } from './acesso-teste-config.js';
import './login-google.js';
import './copia-conta.js';

const C = globalThis.FolhaCopiaConta;
const L = globalThis.FolhaLoginGoogle;
const caixa = document.getElementById('copia-conta');
if (caixa && C && L) {
  caixa.innerHTML = [
    '<p class="hint">O uso local não pede login. A cópia na conta só envia os lançamentos deste aparelho depois que você associar a conta Google. Nada é restaurado sozinho.</p>',
    '<p id="st-copia-conta" class="hint"></p>',
    '<div class="actions">',
    '<button type="button" class="btn ghost" id="btn-copia-google">Entrar com Google nesta página</button>',
    '<button type="button" class="btn primary" id="btn-copia-associar" disabled>Associar esta conta a estes lançamentos</button>',
    '<button type="button" class="btn ghost" id="btn-copia-trocar" hidden>Associar esta outra conta a estes lançamentos</button>',
    '<button type="button" class="btn ghost" id="btn-copia-previa" disabled>Ver prévia da cópia da conta</button>',
    '<button type="button" class="btn primary" id="btn-copia-confirmar" disabled>Confirmar recuperação da cópia da conta</button>',
    '</div>'
  ].join('');
  const texto = (valor) => { const el = document.getElementById('st-copia-conta'); if (el) el.textContent = valor; };
  let pendente = null;
  let espera = 0;

  function cliente() {
    const cfg = FOLHA_ZERO_TESTE || {};
    if (!cfg.url || !String(cfg.publishableKey || '').startsWith('sb_publishable_')) return null;
    return createClient(cfg.url, cfg.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' }
    });
  }

  function origemOk() {
    return L.podeIniciarGoogleProducao(window.location).ok;
  }

  async function sessao() {
    const supabase = cliente();
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    return data && data.session;
  }

  async function pintar() {
    const uid = localStorage.getItem(C.VINCULO);
    const atual = await sessao();
    const google = document.getElementById('btn-copia-google');
    const associar = document.getElementById('btn-copia-associar');
    const previa = document.getElementById('btn-copia-previa');
    const trocar = document.getElementById('btn-copia-trocar');
    const outra = !!(atual && atual.user && uid && uid !== atual.user.id);
    if (google) google.disabled = !origemOk();
    if (associar) associar.disabled = !(atual && atual.user) || outra;
    if (trocar) trocar.hidden = !outra;
    if (previa) previa.disabled = !(atual && atual.user && uid === atual.user.id);
    if (uid && atual && atual.user) texto(C.textoEstado(C.lerFila(localStorage, atual.user.id)));
    else if (!origemOk()) texto('Esta página só envia a cópia da conta no endereço publicado do aplicativo. Os lançamentos continuam neste aparelho.');
    else texto(C.textoEstado(null));
  }

  async function enviar(modo) {
    const supabase = cliente();
    const atual = await sessao();
    if (!supabase || !atual || !atual.user) return;
    const antes = localStorage.getItem(C.KEY);
    await C.rodarFila(supabase, localStorage, {
      uid: atual.user.id,
      origemOk: origemOk(),
      online: navigator.onLine !== false,
      manual: modo === true,
      retomada: modo === 'retomada'
    });
    if (localStorage.getItem(C.KEY) !== antes) {
      if (antes == null) localStorage.removeItem(C.KEY);
      else localStorage.setItem(C.KEY, antes);
    }
    await pintar();
  }

  document.getElementById('btn-copia-google').addEventListener('click', async () => {
    const supabase = cliente();
    if (!supabase) { texto('A chave pública não está disponível. Nada foi enviado.'); return; }
    const r = await L.iniciarGoogleProducao(supabase, window.location, (url) => { window.location.assign(url); });
    if (!r.ok) texto('O Google desta página ainda depende do endereço de retorno autorizado no projeto. Os lançamentos continuam neste aparelho.');
  });
  document.getElementById('btn-copia-associar').addEventListener('click', async () => {
    const atual = await sessao();
    if (!atual || !atual.user) return;
    const r = C.associar(localStorage, atual.user.id, true, false);
    texto(r.ok
      ? 'Conta associada a estes lançamentos. O envio usa a revisão que este aparelho passar a conhecer.'
      : 'Esta sessão não é a conta já associada. Nada foi enviado.');
    if (!r.ok) return;
    C.anotarMudanca(localStorage, atual.user.id);
    await pintar();
    await enviar(true);
  });
  document.getElementById('btn-copia-trocar').addEventListener('click', async () => {
    const atual = await sessao();
    if (!atual || !atual.user) return;
    const r = C.associar(localStorage, atual.user.id, true, true);
    if (!r.ok) { texto('A troca não foi feita. Os lançamentos continuam neste aparelho.'); return; }
    C.anotarMudanca(localStorage, atual.user.id);
    await pintar();
    await enviar(true);
  });
  document.getElementById('btn-copia-previa').addEventListener('click', async () => {
    const supabase = cliente();
    const { data, error } = await supabase.from(C.TABELA).select('revisao,documento').limit(1);
    if (error || !data || !data[0]) {
      pendente = null;
      document.getElementById('btn-copia-confirmar').disabled = true;
      texto('Esta conta ainda não tem cópia. Nada foi gravado neste aparelho.');
      return;
    }
    pendente = data[0];
    document.getElementById('btn-copia-confirmar').disabled = false;
    texto('Prévia da cópia da conta: ' + (pendente.documento.entries || []).length + ' lançamentos. Nada foi gravado.');
  });
  document.getElementById('btn-copia-confirmar').addEventListener('click', async () => {
    const atual = await sessao();
    if (!pendente || !atual || !atual.user) return;
    const r = C.restaurar(localStorage, pendente.documento, true);
    if (!r.ok) { texto('A recuperação não foi feita. Os lançamentos deste aparelho continuam como estavam.'); return; }
    C.registrarCopiaAceita(localStorage, atual.user.id, pendente.documento, pendente.revisao);
    window.location.reload();
  });
  window.addEventListener('folha-conta-gravou', () => {
    const marcado = localStorage.getItem(C.VINCULO);
    if (!marcado) return;
    C.anotarMudanca(localStorage, marcado);
    clearTimeout(espera);
    espera = setTimeout(() => { enviar(false); }, 800);
  });
  window.addEventListener('online', () => { enviar('retomada'); });
  const marcado = localStorage.getItem(C.VINCULO);
  if (marcado) {
    C.retomarFila(localStorage, marcado);
    enviar('retomada');
  }
  pintar();
}
