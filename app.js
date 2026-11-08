'use strict';
/* Folha Zero v1: controle de produção (tapeçaria) */
const EMPRESAS = ['Concept Blindados', 'VRZ Blindados', 'Carbon Blindados', 'Bullet Blindados', 'Collet Blindados', 'EB Blindados', 'Marc Blindagem'];
const SETORES = ['Desmontagem', 'Manta', 'Aço', 'Overlap', 'Tampa', 'Vidro', 'Montagem', 'Tapeçaria', 'Aço de retrovisor', 'Churrasqueira', 'Steel', 'Aço Maçaneta', 'Qualidade'];
const STATUS = ['Aberta', 'Entregue', 'Assinada', 'Paga']; // status da quinzena (por empresa)
/* Situação do carro (por lançamento), diferente do status da quinzena */
const SITUACOES = ['Em processo', 'Faltando peça', 'Faltando vidro', 'Problemas elétricos', 'Problemas com vidro', 'Aguardando etapa anterior', 'Aguardando vidraceiro', 'Aguardando ajuste da produção', 'Impasse na resolução de um problema', 'Finalizado'];
const SIT_CLS = ['processo', 'alerta', 'alerta', 'alerta', 'alerta', 'etapa', 'vidraceiro', 'ajuste', 'alerta', 'fin'];
const SIT_INICIAL = 'Em processo', SIT_FIN = 'Finalizado', SIT_DESTAQUE = 'Aguardando etapa anterior';
/* v16: nomes antigos (v15) de situação viram os novos */
const SIT_MIGRAR = { 'Aguardando equipe': 'Aguardando etapa anterior', 'Pronto, aguardando outro setor': 'Aguardando etapa anterior', 'Problema elétrico': 'Problemas elétricos', 'Aguardando ajuste': 'Aguardando ajuste da produção' };
/* v17: motivos de pausa = situações da lista oficial, menos Em processo e Finalizado */
const MOTIVOS_PAUSA = SITUACOES.filter(s => s !== SIT_INICIAL && s !== SIT_FIN);
const MOTIVO_FIM = 'Fim de expediente'; // v19: motivo especial (não é situação); não conta no tempo útil do carro
const OUTRO_MAX = 60; // v18: motivo de pausa digitado ("Outro motivo")
const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const HM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DT_RE = /^\d{4}-\d\d-\d\dT([01]\d|2[0-3]):[0-5]\d$/; // data e hora local 'AAAA-MM-DDTHH:MM'
const APP_VERSAO = 20;
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const LINHAS_POR_PAGINA = 16;
const MODO_TESTE = globalThis.FOLHA_ZERO_MODO_TESTE === true;
const KEY = MODO_TESTE ? 'folhazero_teste_app' : 'folhazero_v1';
const RENOMEAR = { 'VRL Blindados': 'VRZ Blindados' }; // nomes antigos de empresas
/* Contador de usuários: URL do Web App do Google Apps Script (termina em /exec). Vazio = contador desligado. */
const CONTADOR_URL = 'https://script.google.com/macros/s/AKfycbx21D_MJeizj4ipu3w9XsjFJB2sSnwH5JQvYF81qvSkpjiigRsHIOUs6DeZXIN68v5E9w/exec';

/* ---------- dados ---------- */
function defaultData() {
  return { version: 2, entries: [], quinzenas: {}, descontos: {}, settings: { operador: '', setorOperador: 'Tapeçaria', lastBackup: null, valorPadrao: { 'Concept Blindados': 510 }, aliquota: {} } };
}
let DB = load();
if (localStorage.getItem(KEY) && /VRL Blindados/.test(localStorage.getItem(KEY))) save();
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultData();
    return normalize(JSON.parse(raw));
  } catch (e) {
    console.error(e);
    try { localStorage.setItem(KEY + '_corrompido_' + Date.now(), localStorage.getItem(KEY)); } catch (_) {}
    return defaultData();
  }
}
function normalize(d) {
  const base = defaultData();
  const out = Object.assign(base, d || {});
  out.entries = Array.isArray(out.entries) ? out.entries : [];
  out.quinzenas = out.quinzenas && typeof out.quinzenas === 'object' ? out.quinzenas : {};
  out.descontos = out.descontos && typeof out.descontos === 'object' ? out.descontos : {};
  out.entries = out.entries.filter(e => e && typeof e === 'object');
  out.entries.forEach(normEntry);
  out.settings = Object.assign(defaultData().settings, out.settings || {});
  if (!out.settings.valorPadrao || typeof out.settings.valorPadrao !== 'object') out.settings.valorPadrao = {};
  if (!out.settings.aliquota || typeof out.settings.aliquota !== 'object') out.settings.aliquota = {};
  if (out.settings.operador === 'Ricardo') out.settings.operador = 'Ricardo Ribeiro';
  if (!SETORES.includes(out.settings.setorOperador)) out.settings.setorOperador = 'Tapeçaria';
  migrarNomes(out);
  return out;
}
/* v15: hora início/término (opcionais) e situação do carro. Dados antigos não têm esses campos:
   finalizado vira 'Finalizado', em andamento vira 'Em processo'. Nada é pedido de novo ao usuário. */
function normEntry(e) {
  if (e.ajudante === undefined) e.ajudante = null;
  e.horaInicio = typeof e.horaInicio === 'string' && HM_RE.test(e.horaInicio) ? e.horaInicio : null;
  e.horaTermino = e.dataTermino && typeof e.horaTermino === 'string' && HM_RE.test(e.horaTermino) ? e.horaTermino : null;
  if (typeof e.situacao === 'string' && SIT_MIGRAR[e.situacao]) e.situacao = SIT_MIGRAR[e.situacao];
  if (e.dataTermino) e.situacao = SIT_FIN;
  else if (!SITUACOES.includes(e.situacao) || e.situacao === SIT_FIN) e.situacao = SIT_INICIAL;
  /* v17: pausas [{ motivo, inicio, fim }] (fim vazio = pausa em andamento). Dados antigos: pausas = [] */
  const ps = Array.isArray(e.pausas) ? e.pausas.filter(p => p && typeof p === 'object' && typeof p.inicio === 'string' && DT_RE.test(p.inicio)) : [];
  ps.forEach(p => {
    if (p.outro) p.outro = true; else delete p.outro; // v18: motivo digitado, fica como o usuário escreveu
    if (!p.outro && typeof p.motivo === 'string' && SIT_MIGRAR[p.motivo]) p.motivo = SIT_MIGRAR[p.motivo];
    if (typeof p.motivo !== 'string' || !p.motivo.trim()) p.motivo = 'Sem motivo';
    if (!(typeof p.fim === 'string' && DT_RE.test(p.fim))) p.fim = null; else if (p.fim < p.inicio) p.fim = p.inicio;
  });
  ps.sort((a, b) => a.inicio.localeCompare(b.inicio));
  ps.forEach((p, i) => { if (!p.fim && i < ps.length - 1) p.fim = ps[i + 1].inicio; });
  const ult = ps[ps.length - 1];
  if (ult && !ult.fim && e.dataTermino) { const f = `${e.dataTermino}T${e.horaTermino || '23:59'}`; ult.fim = f < ult.inicio ? ult.inicio : f; }
  e.pausas = ps;
  if (ult && !ult.fim && !ult.outro && e.situacao === SIT_INICIAL && SITUACOES.includes(ult.motivo)) e.situacao = ult.motivo;
  return e;
}
/* migração de nomes antigos de empresas (dados salvos e backups importados) */
function migrarNomes(d) {
  let mudou = false;
  d.entries.forEach(e => { if (RENOMEAR[e.empresa]) { e.empresa = RENOMEAR[e.empresa]; mudou = true; } });
  ['quinzenas', 'descontos'].forEach(campo => {
    const q = {};
    Object.keys(d[campo]).forEach(k => {
      const i = k.indexOf('|'); const emp = k.slice(0, i);
      const nk = RENOMEAR[emp] ? RENOMEAR[emp] + k.slice(i) : k;
      if (nk !== k) mudou = true;
      if (!(nk in q) || nk === k) q[nk] = d[campo][k];
    });
    d[campo] = q;
  });
  const vp = d.settings.valorPadrao;
  Object.keys(vp).forEach(k => { if (RENOMEAR[k]) { if (!(RENOMEAR[k] in vp)) vp[RENOMEAR[k]] = vp[k]; delete vp[k]; mudou = true; } });
  return mudou;
}
function save() {
  DB.entries.forEach(normEntry);
  localStorage.setItem(KEY, JSON.stringify(DB));
  if (MODO_TESTE) {
    try { window.dispatchEvent(new CustomEvent('folha-teste-gravou')); } catch (_) {}
  }
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

/* ---------- utilidades ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
function hojeISO() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function agoraHM() { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function fmtDataHora(iso, hm) { return fmtData(iso) + (iso && hm ? ' ' + hm : ''); }
function isoUTC(iso) { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); }
function diffDias(a, b) { return Math.round((isoUTC(b) - isoUTC(a)) / 86400000); }
const hmMin = hm => +hm.slice(0, 2) * 60 + +hm.slice(3, 5);
/* tempo na linha (como na planilha Produção: término menos início; em aberto: hoje menos início).
   Com hora início e hora término, conta em horas; sem horas, em dias. */
function duracao(e) {
  const fim = e.dataTermino || hojeISO(), dias = Math.max(0, diffDias(e.dataInicio, fim));
  if (e.dataTermino && e.horaInicio && e.horaTermino) { const m = dias * 1440 + hmMin(e.horaTermino) - hmMin(e.horaInicio); if (m >= 0) return { min: m, horas: true }; }
  return { min: dias * 1440, horas: false };
}
const plDias = n => n === 1 ? '1 dia' : `${n} dias`;
function fmtDur(d) {
  if (!d.horas) { const n = Math.round(d.min / 1440); return n === 0 ? 'mesmo dia' : plDias(n); }
  const dd = Math.floor(d.min / 1440), h = Math.floor((d.min % 1440) / 60), mi = Math.round(d.min % 60);
  if (dd) return plDias(dd) + (h ? ` ${h} h` : '');
  if (h) return `${h} h` + (mi ? ` ${mi} min` : '');
  return `${mi} min`;
}
/* v17: formato único de todos os tempos do relatório (tela e PDF): dias e horas ("2 dias e 5h");
   abaixo de 1 dia, horas e minutos ("5h 20min"). Aceita minutos (número) ou { min, horas }.
   Sem horas (só datas), conta em dias inteiros; a média sempre sai em dias e horas ("1 dia e 6h"). */
function fmtDiaHora(d) {
  if (typeof d === 'number') d = { min: d, horas: true };
  if (!d.horas) { const n = Math.round(d.min / 1440); return n === 0 ? 'mesmo dia' : plDias(n); }
  const min = Math.max(0, Math.round(d.min));
  if (min < 1440) return fmtHM(min);
  const dd = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60);
  return plDias(dd) + (h ? ` e ${h}h` : '');
}
/* v17: pausas */
function agoraDT() { return hojeISO() + 'T' + agoraHM(); }
function dtMin(dt) { return isoUTC(dt.slice(0, 10)) / 60000 + hmMin(dt.slice(11, 16)); }
function fmtHM(min) { min = Math.max(0, Math.round(min)); const h = Math.floor(min / 60), m = min % 60; return h ? (m ? `${h}h ${m}min` : `${h}h`) : `${m}min`; }
function fmtDT(dt) { return dt ? fmtData(dt.slice(0, 10)) + ' ' + dt.slice(11, 16) : ''; }
function pausaAberta(e) { if (e.dataTermino || !Array.isArray(e.pausas) || !e.pausas.length) return null; const p = e.pausas[e.pausas.length - 1]; return p.fim ? null : p; }
function pausaDesde(p) { return p.inicio.slice(0, 10) === hojeISO() ? p.inicio.slice(11, 16) : fmtDT(p.inicio); }
function pausaInfoHtml(e) { const p = pausaAberta(e); return !p ? '' : ehFimExp(p) ? `<div class="pausa-info fim-exp">⏸ Fim de expediente desde ${pausaDesde(p)}</div>` : `<div class="pausa-info">⏸ Pausado: ${esc(p.motivo)} desde ${pausaDesde(p)}</div>`; }
function pausasTotalMin(e) { return (e.pausas || []).reduce((s, p) => s + (p.fim ? Math.max(0, dtMin(p.fim) - dtMin(p.inicio)) : 0), 0); }
/* v18: motivo digitado. Fora da lista oficial conta como "outro" (agrupado pelo texto, sem diferenciar maiúsculas e espaços) */
function ehFimExp(p) { return !!p && !p.outro && p.motivo === MOTIVO_FIM; }
function ehOutro(p) { return !!p.outro || (!MOTIVOS_PAUSA.includes(p.motivo) && p.motivo !== MOTIVO_FIM); }
const normMotivo = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
function textoFimExp(t) { return ['fim de expediente', 'fim do expediente', 'fim de turno', 'fim do turno'].includes(normMotivo(t)); }
/* minutos de fim de expediente dentro da janela [a0, b0] (pausa aberta conta até agora) */
function foraMin(e, a0, b0) {
  const ag = dtMin(agoraDT());
  return (e.pausas || []).filter(ehFimExp).reduce((s, p) => { const a = Math.max(dtMin(p.inicio), a0), b = Math.min(p.fim ? dtMin(p.fim) : ag, b0); return s + Math.max(0, b - a); }, 0);
}
/* v19: tempo útil = término menos início sem o fora do expediente (só com hora início e hora término) */
function duracaoUtil(e) {
  const d = duracao(e);
  if (!d.horas) return d;
  const a0 = dtMin(`${e.dataInicio}T${e.horaInicio}`), f = foraMin(e, a0, a0 + d.min);
  return f > 0 ? { min: Math.max(0, d.min - f), horas: true, util: true, fora: f, bruto: d.min } : d;
}
function limpaMotivo(t) { return String(t || '').replace(/\s+/g, ' ').trim().slice(0, OUTRO_MAX); }
function chaveMotivo(p) { return ehFimExp(p) ? MOTIVO_FIM : ehOutro(p) ? 'outro:' + String(p.motivo || '').replace(/\s+/g, ' ').trim().toLowerCase() : p.motivo; }
function motivoChip(m, outro, fimExp) { return fimExp ? `<span class="chip sit sit-fimexp">${esc(m)}</span>` : outro ? `<span class="chip sit sit-outro">${esc(m)}</span>` : sitChip(m); }
function botaoPausa(e) { return pausaAberta(e) ? '<button type="button" class="btn small act-pausa retomar">▶ Retomar</button>' : '<button type="button" class="btn small act-pausa pausar">⏸ Pausar</button>'; }
function fmtDiasDec(min) { const n = min / 1440; return `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${Math.round(n * 10) === 10 ? 'dia' : 'dias'}`; }
function sitCls(s) { const i = SITUACOES.indexOf(s); return 'sit sit-' + (SIT_CLS[i] || 'processo'); }
function sitChip(s) { return `<span class="chip ${sitCls(s)}">${esc(s)}</span>`; }
function fmtData(iso) { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; }
function fmtValor(v) { return (v == null || isNaN(v)) ? 'sem valor' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function valorInput(v) { return v == null ? '' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function parseValor(s) {
  s = String(s || '').replace(/R\$/gi, '').replace(/\s/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
  else if (/^\d+\.\d{3}$/.test(s)) s = s.replace('.', '');
  const n = Number(s);
  return isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function ultimoDia(ano, mes) { return new Date(ano, mes, 0).getDate(); } // mes 1..12
function periodo(ano, mes, q) {
  const ini = q == 1 ? 1 : 16, fim = q == 1 ? 15 : ultimoDia(ano, mes);
  return { ini: `${ano}-${pad(mes)}-${pad(ini)}`, fim: `${ano}-${pad(mes)}-${pad(fim)}` };
}
function dataPagamento(ano, mes, q) {
  if (q == 1) return `${ano}-${pad(mes)}-${pad(Math.min(30, ultimoDia(ano, mes)))}`;
  let a = ano, m = mes + 1; if (m > 12) { m = 1; a++; }
  return `${a}-${pad(m)}-15`;
}
function qKey(emp, ano, mes, q) { return `${emp}|${ano}-${pad(mes)}|${q}`; }
function getStatus(emp, ano, mes, q) { return DB.quinzenas[qKey(emp, ano, mes, q)] || 'Aberta'; }
function setorFolha(emp, setor) { return setor; } // Tapeçaria sai como Tapeçaria em todas as empresas ("Forro" descontinuado)
/* REGRAS DIFERENTES (v19):
   1) Folha quinzenal de pagamento (modelo Concept), status da folha, cartões das empresas e valores:
      quinzena pela data de TÉRMINO (entradasQuinzena abaixo). Não mudar.
   2) Resumo e lista "Em andamento" da tela Início: cada carro aparece só na quinzena da data de INÍCIO
      (sem data de início, usa a data de término). Ver dataQuinzenaInicio e carrosInicioQuinzena. */
function entradasQuinzena(emp, ano, mes, q) {
  const p = periodo(ano, mes, q);
  return DB.entries.filter(e => e.empresa === emp && e.dataTermino && e.dataTermino >= p.ini && e.dataTermino <= p.fim)
    .sort((a, b) => (a.dataTermino + a.dataInicio + a.os).localeCompare(b.dataTermino + b.dataInicio + b.os));
}
function soma(list) { return list.reduce((s, e) => s + (e.valor || 0), 0); }
function somaAj(list) { return list.reduce((s, e) => s + (e.ajudante || 0), 0); }
const r2 = n => Math.round(n * 100) / 100;
function setDesconto(emp, ano, mes, q, txt) {
  const v = parseValor(txt);
  if (Number.isNaN(v) || (v != null && v < 0)) { toast('Valor de outros descontos inválido'); return false; }
  const k = qKey(emp, ano, mes, q);
  if (v) DB.descontos[k] = v; else delete DB.descontos[k];
  save(); toast(v ? `Outros descontos salvos: ${fmtValor(v)}` : 'Outros descontos removidos'); return true;
}
function getDesconto(emp, ano, mes, q) { return DB.descontos[qKey(emp, ano, mes, q)] || 0; }
/* modo degustação: só para quem começou pela tela de boas-vindas (trialInicio salvo). Sem trialInicio = sem limite. */
const TRIAL_DIAS = 20, DONO_APP = 'Ricardo Ribeiro';
function trialInfo() {
  const ini = DB.settings.trialInicio; if (!ini || DB.settings.liberado) return null;
  const usados = Math.floor((Date.now() - new Date(ini).getTime()) / 86400000);
  const restantes = Math.max(0, TRIAL_DIAS - usados);
  return { usados, restantes, expirado: restantes <= 0 };
}
function bloqueadoNovo() {
  const t = trialInfo(); if (!t || !t.expirado) return false;
  modal('Período de teste encerrado', `<p>Seu teste grátis de ${TRIAL_DIAS} dias do Folha Zero terminou, por isso não dá para lançar carros novos.</p><p>Para continuar usando, fale com <b>${DONO_APP}</b>.</p><p class="hint">Seus lançamentos, folhas e backup continuam disponíveis.</p>`, [{ label: 'OK', value: 1, cls: 'primary' }]);
  return true;
}
function getAliquota(emp) { const a = (DB.settings.aliquota || {})[emp]; return typeof a === 'number' && a > 0 ? a : 0; }
const dataQuinzenaInicio = e => e.dataInicio || e.dataTermino || hojeISO();
function carrosInicioQuinzena(ano, mes, q) {
  const p = periodo(ano, mes, q);
  return DB.entries.filter(e => { const d = dataQuinzenaInicio(e); return d >= p.ini && d <= p.fim; });
}
function totaisQ(emp, ano, mes, q) {
  const list = entradasQuinzena(emp, ano, mes, q);
  const bruto = r2(soma(list)), ajudante = r2(somaAj(list)), aliquota = getAliquota(emp);
  const imposto = r2(bruto * aliquota / 100), outros = r2(getDesconto(emp, ano, mes, q)), desconto = r2(imposto + outros);
  return { list, carros: list.length, bruto, ajudante, aliquota, imposto, outros, desconto, liquido: r2(bruto - ajudante - desconto) };
}
function totaisHtml(t) {
  return `<div class="money"><div><span>Bruto</span><b>${fmtValor(t.bruto)}</b></div><div><span>Ajudante</span><b>${fmtValor(t.ajudante)}</b></div><div><span>Desconto${t.aliquota ? ` (imposto ${String(t.aliquota).replace('.', ',')}%)` : ''}</span><b>${fmtValor(t.desconto)}</b>${t.outros && t.imposto ? `<small class="hint">imposto ${fmtValor(t.imposto)} + outros ${fmtValor(t.outros)}</small>` : ''}</div><div class="liq"><span>Líquido</span><b>${fmtValor(t.liquido)}</b></div></div>`;
}
function diasDesde(iso) { if (!iso) return Infinity; return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000); }

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('hidden'), 2600); }

/* modal genérico: retorna Promise com o valor do botão */
function modal(title, bodyHtml, buttons, onOpen) {
  return new Promise(resolve => {
    $('#m-title').textContent = title;
    $('#m-body').innerHTML = bodyHtml;
    const act = $('#m-actions'); act.innerHTML = '';
    buttons.forEach(b => {
      const el = document.createElement('button');
      el.type = 'button'; el.className = 'btn big ' + (b.cls || 'ghost'); el.textContent = b.label;
      el.dataset.val = b.value;
      el.onclick = () => {
        if (b.action) { b.action(); return; }
        if (b.validate && !b.validate()) return;
        const v = b.collect ? b.collect() : b.value;
        $('#modal').classList.add('hidden'); resolve(v);
      };
      act.appendChild(el);
    });
    $('#modal').classList.remove('hidden');
    if (onOpen) onOpen();
  });
}
const confirmar = (title, html, okLabel = 'Confirmar', okCls = 'primary') =>
  modal(title, html, [{ label: okLabel, value: true, cls: okCls }, { label: 'Cancelar', value: false }]);

/* ---------- navegação ---------- */
function show(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + view));
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  window.scrollTo(0, 0);
  render(view);
}
document.querySelectorAll('.tabbar button').forEach(b => b.onclick = () => { if (b.dataset.view === 'lancar' && !$('#f-id').value && bloqueadoNovo()) return; show(b.dataset.view); });
function currentView() { const v = document.querySelector('.view.active'); return v ? v.id.replace('view-', '') : 'painel'; }
function renderBrand() { const b = document.getElementById('brand-sub'); if (b) b.textContent = DB.settings.operador ? `${DB.settings.operador} · ${DB.settings.setorOperador || 'Tapeçaria'}` : 'Cadastre seu nome na aba Empresas'; }
function render(view = currentView()) {
  DB.entries.forEach(normEntry);
  renderBrand();
  if (view === 'painel') renderPainel();
  if (view === 'lista') renderLista();
  if (view === 'folha') renderFolha();
  if (view === 'ajustes') renderAjustes();
  if (view === 'lancar') atualizaValorPadraoBtn();
  if (view === 'relatorios') { if (RSUB === 'mes') renderRelMes(); else renderRelatorios(); }
}

/* ---------- selects ---------- */
function fillSelect(sel, items, placeholder) {
  sel.innerHTML = (placeholder != null ? `<option value="">${esc(placeholder)}</option>` : '') + items.map(i => `<option value="${esc(i)}">${esc(i)}</option>`).join('');
}
function fillMesAno(mesSel, anoSel, qSel) {
  mesSel.innerHTML = MESES.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('');
  const y = new Date().getFullYear();
  let anos = []; for (let a = y - 2; a <= y + 1; a++) anos.push(a);
  anoSel.innerHTML = anos.map(a => `<option value="${a}">${a}</option>`).join('');
  const d = new Date();
  mesSel.value = d.getMonth() + 1; anoSel.value = y; qSel.value = d.getDate() <= 15 ? 1 : 2;
}
fillSelect($('#f-empresa'), EMPRESAS, 'Selecione a empresa');
fillSelect($('#f-setor'), SETORES, 'Selecione o setor');
fillSelect($('#l-empresa'), EMPRESAS, 'Todas');
fillSelect($('#fo-empresa'), EMPRESAS);
fillSelect($('#r-empresa'), EMPRESAS, 'Todas as empresas');
fillSelect($('#fo-status'), STATUS);
$('#l-status').insertAdjacentHTML('beforeend', `<optgroup label="Situação do carro">${SITUACOES.map(s => `<option value="sit:${esc(s)}">${esc(s)}</option>`).join('')}</optgroup>`);
fillSelect($('#rm-empresa'), EMPRESAS, 'Todas as empresas');
(() => { const d = new Date(), y = d.getFullYear(); $('#rm-mes').innerHTML = MESES.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('');
  let a = ''; for (let x = y - 2; x <= y + 1; x++) a += `<option value="${x}">${x}</option>`; $('#rm-ano').innerHTML = a; $('#rm-mes').value = d.getMonth() + 1; $('#rm-ano').value = y; })();
fillMesAno($('#fo-mes'), $('#fo-ano'), $('#fo-q'));
const _d0 = new Date();
let VER_TODAS = false;
let PQ = { ano: _d0.getFullYear(), mes: _d0.getMonth() + 1, q: _d0.getDate() <= 15 ? 1 : 2 };
function qShift(o, delta) { let idx = (o.ano * 12 + o.mes - 1) * 2 + (o.q - 1) + delta; const mi = Math.floor(idx / 2); return { ano: Math.floor(mi / 12), mes: (mi % 12) + 1, q: (idx % 2) + 1 }; }
function qAtual() { const d = new Date(); return { ano: d.getFullYear(), mes: d.getMonth() + 1, q: d.getDate() <= 15 ? 1 : 2 }; }
function qNome(o) { const p = periodo(o.ano, o.mes, o.q); return `${o.q == 1 ? '1' : '16'} a ${p.fim.slice(8)} de ${MESES[o.mes - 1].toLowerCase()} de ${o.ano}`; }
$('#p-prev').onclick = () => { PQ = qShift(PQ, -1); renderPainel(); };
$('#p-next').onclick = () => { PQ = qShift(PQ, 1); renderPainel(); };
$('#p-atual').onclick = () => { PQ = qAtual(); renderPainel(); };
$('#p-lancar').onclick = () => { if (bloqueadoNovo()) return; resetForm(); show('lancar'); };
['#r-grp', '#r-empresa'].forEach(s => $(s).onchange = renderRelatorios);
['#rm-mes', '#rm-ano', '#rm-empresa'].forEach(s => $(s).onchange = renderRelMes);
let RSUB = 'valores';
function relSub(sub) {
  RSUB = sub;
  $('#r-sec-valores').classList.toggle('hidden', sub !== 'valores'); $('#r-sec-mes').classList.toggle('hidden', sub !== 'mes');
  $('#r-tab-valores').classList.toggle('active', sub === 'valores'); $('#r-tab-mes').classList.toggle('active', sub === 'mes');
  $('#r-tab-valores').setAttribute('aria-selected', sub === 'valores'); $('#r-tab-mes').setAttribute('aria-selected', sub === 'mes');
  if (sub === 'mes') renderRelMes(); else renderRelatorios();
}
$('#r-tab-valores').onclick = () => relSub('valores');
$('#r-tab-mes').onclick = () => relSub('mes');
$('#p-relmes').onclick = () => { show('relatorios'); relSub('mes'); };
$('#fo-status').onchange = () => { DB.quinzenas[qKey($('#fo-empresa').value, +$('#fo-ano').value, +$('#fo-mes').value, +$('#fo-q').value)] = $('#fo-status').value; save(); renderFolha(); toast('Status alterado para ' + $('#fo-status').value); };
['#fo-empresa', '#fo-mes', '#fo-ano', '#fo-q'].forEach(s => $(s).onchange = renderFolha);
['#l-empresa', '#l-status', '#l-de', '#l-ate'].forEach(s => $(s).onchange = renderLista);
$('#l-limpar').onclick = () => { ['#l-busca', '#l-empresa', '#l-status', '#l-de', '#l-ate'].forEach(s => $(s).value = ''); renderLista(); };
/* v16: pesquisa na lista, só pelo número da OS (parte do número já encontra) */
const semAcento = t => String(t == null ? '' : t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
$('#l-busca').addEventListener('input', () => renderLista());
$('#l-busca').addEventListener('search', () => renderLista());

/* ---------- painel ---------- */
function renderPainel() {
  DB.entries.forEach(normEntry);
  const { ano, mes, q } = PQ;
  const at = qAtual();
  $('#p-titulo').textContent = qNome(PQ);
  $('#p-pagamento').innerHTML = `Pagamento previsto: <b>${fmtData(dataPagamento(ano, mes, q))}</b>`;
  $('#p-atual').classList.toggle('hidden', at.ano === ano && at.mes === mes && at.q === q);
  $('#exemplo-alert').classList.toggle('hidden', !DB.entries.some(e => e.exemplo));
  const ti = trialInfo(), ta = $('#trial-alert');
  ta.classList.toggle('hidden', !ti);
  if (ti) { ta.className = 'alert ' + (ti.expirado ? 'warn' : 'info'); ta.innerHTML = ti.expirado ? `<b>Teste grátis encerrado.</b> Para continuar lançando carros, fale com ${DONO_APP}.` : `<b>Teste grátis:</b> ${ti.restantes === 1 ? 'falta 1 dia' : `faltam ${ti.restantes} dias`} de ${TRIAL_DIAS}.`; }
  // Início: resumo e Em andamento pela data de INÍCIO; cartões das empresas e valores (folha) pela data de TÉRMINO.
  const doInicio = carrosInicioQuinzena(ano, mes, q);
  const finInicio = doInicio.filter(e => e.dataTermino).length;
  const and = doInicio.filter(e => !e.dataTermino).sort((a, b) => a.dataInicio.localeCompare(b.dataInicio));
  let totFin = 0, html = '', ocultas = 0;
  const tot = { bruto: 0, ajudante: 0, desconto: 0, liquido: 0 };
  EMPRESAS.forEach(emp => {
    const t = totaisQ(emp, ano, mes, q), list = t.list;
    totFin += list.length; ['bruto', 'ajudante', 'desconto', 'liquido'].forEach(k => tot[k] = r2(tot[k] + t[k]));
    // Cartão da empresa = folha: quinzena pela data de TÉRMINO (regra da folha, diferente do resumo).
    if (!list.length && !VER_TODAS) { ocultas++; return; }
    const st = getStatus(emp, ano, mes, q);
    const semValor = list.filter(e => e.valor == null).length;
    html += `<div class="card emp-card st-c-${st}" data-emp="${esc(emp)}" role="button" tabindex="0" aria-label="Abrir folha da ${esc(emp)}">
      <div class="emp-head"><h2>${esc(emp)}</h2><span class="chip st-${st}">${st}</span></div>
      <div class="emp-line"><span><b>${list.length}</b> ${list.length === 1 ? 'carro' : 'carros'}</span><span>bruto <b>${fmtValor(t.bruto)}</b></span>${semValor ? `<span class="chip and">${semValor} sem valor</span>` : ''}</div>
      ${totaisHtml(t)}
      <div class="row2 stop">
        <label>Status<select class="st-sel" data-emp="${esc(emp)}" aria-label="Status da quinzena">${STATUS.map(s => `<option ${s === st ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
        <label>Outros descontos (R$)<input type="text" class="desc-in" data-emp="${esc(emp)}" inputmode="decimal" autocomplete="off" spellcheck="false" value="${t.outros ? valorInput(t.outros) : ''}" placeholder="0,00"></label>
      </div>
      <p class="hint">Toque no cartão para abrir a folha. O imposto é calculado pela alíquota da empresa (aba Empresas). Ajudante e descontos não saem na folha.</p>
    </div>`;
  });
  $('#p-fin').textContent = finInicio; $('#p-and').textContent = and.length; $('#p-money').innerHTML = totaisHtml(tot);
  const algum = EMPRESAS.some(emp => entradasQuinzena(emp, ano, mes, q).length);
  if (!algum && !VER_TODAS) html = '<p class="empty card">Nenhuma empresa com carros nesta quinzena.</p>';
  const mostrarToggle = VER_TODAS || ocultas > 0;
  html += mostrarToggle ? `<button type="button" class="btn ghost small toggle-emp" id="p-ver-todas" aria-expanded="${VER_TODAS}">${VER_TODAS ? 'Ocultar empresas sem carros' : `Ver todas as empresas (${ocultas} sem carros)`}</button>` : '';
  $('#p-cards').innerHTML = html;
  if ($('#p-ver-todas')) $('#p-ver-todas').onclick = () => { VER_TODAS = !VER_TODAS; renderPainel(); };
  document.querySelectorAll('#p-cards .stop').forEach(el => el.onclick = ev => ev.stopPropagation());
  document.querySelectorAll('#p-cards .desc-in').forEach(i => i.onchange = () => {
    if (setDesconto(i.dataset.emp, ano, mes, q, i.value)) renderPainel(); else i.value = '';
  });
  document.querySelectorAll('.st-sel').forEach(s => {
    s.onclick = ev => ev.stopPropagation();
    s.onchange = () => { DB.quinzenas[qKey(s.dataset.emp, ano, mes, q)] = s.value; save(); renderPainel(); toast(`Status alterado para ${s.value}`); };
  });
  document.querySelectorAll('.emp-card').forEach(c => c.onclick = () => {
    $('#fo-empresa').value = c.dataset.emp; $('#fo-mes').value = mes; $('#fo-ano').value = ano; $('#fo-q').value = q; show('folha');
  });
  $('#p-and-count').textContent = and.length;
  $('#p-andamento').innerHTML = and.length ? and.map(e => { const d = diffDias(e.dataInicio, hojeISO()); return `<div class="mini${e.situacao === SIT_DESTAQUE ? ' is-etapa' : ''}${pausaAberta(e) ? ' is-pausado' + (ehFimExp(pausaAberta(e)) ? ' is-fimexp' : '') : ''}" data-id="${e.id}"><div><div class="t">OS ${esc(e.os)} · ${esc(e.veiculo)}</div><div class="s">${esc(e.empresa)} · ${esc(e.setor)} · início ${fmtDataHora(e.dataInicio, e.horaInicio)} · ${d <= 0 ? 'desde hoje' : `há ${plDias(d)}`}</div>
    <button type="button" class="chip-btn act-sit" aria-label="Mudar situação do carro OS ${esc(e.os)}">${sitChip(e.situacao)}<span class="chev">▾</span></button>${pausaInfoHtml(e)}</div><div class="mini-acts">${botaoPausa(e)}<button type="button" class="btn ok small act-fin">Finalizar</button></div></div>`; }).join('') : '<p class="empty">Nenhum carro em andamento.</p>';
  $('#p-andamento').querySelectorAll('.mini').forEach(m => { m.querySelector('.act-fin').onclick = () => finalizar(m.dataset.id); m.querySelector('.act-sit').onclick = () => mudarSituacao(m.dataset.id); m.querySelector('.act-pausa').onclick = () => alternarPausa(m.dataset.id); });
  renderAlertas();
  const ult = DB.entries.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 5);
  $('#p-ultimos').innerHTML = ult.length ? ult.map(e => `<div class="mini"><div><div class="t">OS ${esc(e.os)} · ${esc(e.veiculo)}</div><div class="s">${esc(e.empresa)} · ${esc(e.setor)} · ${e.dataTermino ? 'término ' + fmtData(e.dataTermino) : 'em andamento'}</div></div><div class="s">${fmtValor(e.valor)}${e.ajudante ? `<br>aj. ${fmtValor(e.ajudante)}` : ''}</div></div>`).join('') : '<p class="empty">Nenhum lançamento ainda. Toque em "Lançar carro".</p>';
}
function duplicadas() {
  const m = {};
  DB.entries.forEach(e => { const k = e.os.replace(/\s+/g, '').toUpperCase(); (m[k] = m[k] || []).push(e); });
  return Object.values(m).filter(g => g.length > 1);
}
function renderAlertas() {
  const out = [];
  const sv = DB.entries.filter(e => e.valor == null);
  if (sv.length) out.push(`<div class="alert warn"><b>${sv.length} ${sv.length === 1 ? 'carro sem valor' : 'carros sem valor'}.</b> Complete em Editar.<br><button type="button" class="btn primary small" id="al-semvalor">Ver carros sem valor</button></div>`);
  const dup = duplicadas();
  if (dup.length) out.push(`<div class="alert warn"><b>OS repetida:</b> ${dup.map(g => `OS ${esc(g[0].os)} (${g.length}x: ${g.map(e => esc(e.empresa.replace(' Blindados', '')) + ' ' + esc(e.setor)).join(', ')})`).join('; ')}.</div>`);
  const lb = DB.settings.lastBackup, d = diasDesde(lb);
  if (DB.entries.length && d > 7) out.push(`<div class="alert warn">${lb ? `Último backup há ${d} dias (${fmtData(lb.slice(0, 10))}).` : 'Você ainda não fez nenhum backup.'} Faça um backup para não perder seus lançamentos.<br><button type="button" class="btn primary small" id="al-backup">Exportar backup agora</button></div>`);
  $('#p-alertas').innerHTML = out.length ? `<h2 class="sec">Alertas</h2>${out.join('')}` : '';
  if ($('#al-backup')) $('#al-backup').onclick = exportarBackup;
  if ($('#al-semvalor')) $('#al-semvalor').onclick = () => { ['#l-empresa', '#l-de', '#l-ate'].forEach(s => $(s).value = ''); $('#l-status').value = 'semvalor'; show('lista'); };
}

/* ---------- lista ---------- */
function entryHtml(e) {
  const fin = !!e.dataTermino;
  const npz = (e.pausas || []).filter(p => p.fim).length;
  return `<div class="entry${e.situacao === SIT_DESTAQUE ? ' is-etapa' : ''}${pausaAberta(e) ? ' is-pausado' + (ehFimExp(pausaAberta(e)) ? ' is-fimexp' : '') : ''}" data-id="${e.id}">
    <div class="top"><div><div class="os">OS ${esc(e.os)}</div><div>${esc(e.veiculo)}</div></div>
      ${sitChip(e.situacao)}</div>
    <div class="meta">${esc(e.empresa)} · ${esc(e.setor)}<br>
      Início: ${fmtDataHora(e.dataInicio, e.horaInicio)}${fin ? ` · Término: ${fmtDataHora(e.dataTermino, e.horaTermino)}` : ''}<br>
      ${fin ? (du => du.util ? `Tempo útil: ${fmtDur(du)} (sem fora do expediente)` : `Tempo: ${fmtDur(du)}`)(duracaoUtil(e)) : `Aberto há ${plDias(Math.max(0, diffDias(e.dataInicio, hojeISO())))}`}<br>
      ${npz ? `Pausas: ${npz} (${fmtHM(pausasTotalMin(e))})<br>` : ''}Valor: <b>${fmtValor(e.valor)}</b>${e.ajudante ? ` · Ajudante: ${fmtValor(e.ajudante)}` : ''}${e.obs ? `<br>Obs.: ${esc(e.obs)}` : ''}</div>
    ${pausaInfoHtml(e)}
    ${fin ? '' : `<label class="sit-lbl">Situação do carro<select class="sit-sel" aria-label="Situação do carro OS ${esc(e.os)}">${SITUACOES.map(s => `<option value="${esc(s)}" ${s === e.situacao ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>`}
    <div class="btns">
      ${fin ? '' : botaoPausa(e) + '<button type="button" class="btn ok small act-fin">Finalizar</button>'}
      <button type="button" class="btn ghost small act-edit">Editar</button>
      <button type="button" class="btn ghost small act-del" style="color:var(--err)">Excluir</button>
    </div></div>`;
}
function bindEntryButtons(root) {
  root.querySelectorAll('.entry').forEach(card => {
    const id = card.dataset.id;
    const f = card.querySelector('.act-fin'); if (f) f.onclick = () => finalizar(id);
    const pz = card.querySelector('.act-pausa'); if (pz) pz.onclick = () => alternarPausa(id);
    const ss = card.querySelector('.sit-sel'); if (ss) ss.onchange = () => setSituacao(id, ss.value);
    card.querySelector('.act-edit').onclick = () => editar(id);
    card.querySelector('.act-del').onclick = () => excluir(id);
  });
}
function renderLista() {
  const emp = $('#l-empresa').value, st = $('#l-status').value, de = $('#l-de').value, ate = $('#l-ate').value;
  const busca = semAcento($('#l-busca').value.trim());
  let list = DB.entries.filter(e => {
    if (busca && !semAcento(e.os).includes(busca)) return false;
    if (emp && e.empresa !== emp) return false;
    if (st === 'andamento' && e.dataTermino) return false;
    if (st === 'finalizado' && !e.dataTermino) return false;
    if (st === 'semvalor' && e.valor != null) return false;
    if (st === 'pausado' && !pausaAberta(e)) return false;
    if (st.startsWith('sit:') && e.situacao !== st.slice(4)) return false;
    const ref = e.dataTermino || e.dataInicio;
    if (de && ref < de) return false;
    if (ate && ref > ate) return false;
    return true;
  }).sort((a, b) => (b.dataTermino || b.dataInicio).localeCompare(a.dataTermino || a.dataInicio) || b.createdAt - a.createdAt);
  $('#l-resumo').textContent = `${list.length} lançamento(s) · bruto ${fmtValor(soma(list))} · ajudante ${fmtValor(somaAj(list))}`;
  $('#l-lista').innerHTML = list.length ? list.map(entryHtml).join('') : '<p class="empty">Nenhum lançamento encontrado.</p>';
  bindEntryButtons($('#l-lista'));
}

async function finalizar(id) {
  const e = DB.entries.find(x => x.id === id); if (!e) return;
  const val = await modal('Finalizar serviço',
    `<p><b>OS ${esc(e.os)}</b> · ${esc(e.veiculo)}<br>${esc(e.empresa)} · ${esc(e.setor)}</p>
     <p class="hint">Início: ${fmtDataHora(e.dataInicio, e.horaInicio)}</p>
     <div class="dt-row"><label>Data término<input type="date" id="m-termino" autocomplete="off" value="${hojeISO()}"></label>
       <label>Hora término<input type="time" id="m-hora-termino" autocomplete="off" value="${agoraHM()}"></label>
       <button type="button" class="btn ghost small agora" id="m-agora">Agora</button></div>
     <p class="hint">A folha quinzenal usa a data término. A hora é opcional (pode apagar).</p>`,
    [{ label: 'Finalizar', cls: 'ok', value: 'ok', validate: () => {
        const v = $('#m-termino').value, h = $('#m-hora-termino').value; if (!v) { toast('Informe a data término'); return false; }
        if (v < e.dataInicio) { toast('A data término não pode ser antes da data início'); return false; }
        if (v === e.dataInicio && h && e.horaInicio && h < e.horaInicio) { toast('A hora término não pode ser antes da hora início'); return false; } return true; },
       collect: () => ({ data: $('#m-termino').value, hora: $('#m-hora-termino').value || null }) },
     { label: 'Cancelar', value: null }], () => { $('#m-agora').onclick = () => { $('#m-termino').value = hojeISO(); $('#m-hora-termino').value = agoraHM(); }; });
  if (!val) return false;
  const pz = pausaAberta(e);
  if (pz) { const f = `${val.data}T${HM_RE.test(val.hora || '') ? val.hora : (val.data === hojeISO() ? agoraHM() : '23:59')}`; pz.fim = f < pz.inicio ? pz.inicio : f; }
  e.dataTermino = val.data; e.horaTermino = HM_RE.test(val.hora || '') ? val.hora : null; e.situacao = SIT_FIN; e.updatedAt = Date.now(); save(); render(); toast('Serviço finalizado');
  return true;
}
/* troca rápida da situação do carro (não mexe no status da quinzena) */
async function setSituacao(id, sit) {
  const e = DB.entries.find(x => x.id === id); if (!e || !SITUACOES.includes(sit)) return;
  if (sit === SIT_FIN) { if (!e.dataTermino) { await finalizar(id); render(); } return; }
  if (e.dataTermino) return; // finalizado: para reabrir, use Editar e apague a data término
  const pz = pausaAberta(e);
  if (pz && sit === SIT_INICIAL) return retomar(id, SIT_INICIAL); // pausado e voltou para Em processo = retomar
  if (pz && sit !== pz.motivo && MOTIVOS_PAUSA.includes(sit)) { // pausado e trocou o motivo: fecha a pausa e abre outra com o novo motivo
    const ag = agoraDT(); pz.fim = ag < pz.inicio ? pz.inicio : ag; e.pausas.push({ motivo: sit, inicio: pz.fim, fim: null });
  }
  e.situacao = sit; e.updatedAt = Date.now(); save(); render(); toast('Situação: ' + sit);
}
async function mudarSituacao(id) {
  const e = DB.entries.find(x => x.id === id); if (!e) return;
  const v = await modal('Situação do carro', `<p><b>OS ${esc(e.os)}</b> · ${esc(e.veiculo)}<br>${esc(e.empresa)} · ${esc(e.setor)}</p><p class="hint">Escolha a situação atual. "Finalizado" pede a data término.</p>`,
    SITUACOES.map(s => ({ label: s, value: s, cls: 'sit-opt ' + sitCls(s) + (s === e.situacao ? ' atual' : '') })).concat([{ label: 'Cancelar', value: null }]));
  if (v) setSituacao(id, v);
}
/* v17: pausar (escolhe o motivo) e retomar */
async function pausar(id) {
  const e = DB.entries.find(x => x.id === id); if (!e || e.dataTermino) return;
  if (pausaAberta(e)) return retomar(id);
  const txtOutro = () => limpaMotivo($('#pz-outro') ? $('#pz-outro').value : '');
  const v = await modal('Pausar carro', `<p><b>OS ${esc(e.os)}</b> · ${esc(e.veiculo)}<br>${esc(e.empresa)} · ${esc(e.setor)}</p><p class="hint">Escolha o motivo da pausa. O tempo parado conta a partir de agora (${agoraHM()}).</p>
    <div id="pz-outro-box" class="pz-outro-box hidden"><label>Digite o motivo<input type="text" id="pz-outro" maxlength="${OUTRO_MAX}" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="done" placeholder="Ex.: Aguardando cliente"></label>
    <p id="pz-outro-aviso" class="pz-aviso hidden">Digite o motivo da pausa.</p><button type="button" id="pz-outro-ok" class="btn primary big">⏸ Pausar</button></div>`,
    [{ label: '🌙 ' + MOTIVO_FIM, value: MOTIVO_FIM, cls: 'sit-opt sit-fimexp pz-fimexp-opt' }].concat(MOTIVOS_PAUSA.map(m => ({ label: m, value: m, cls: 'sit-opt ' + sitCls(m) }))).concat([
      { label: 'Outro motivo', value: '', cls: 'sit-opt sit-outro pz-outro-opt', action: () => {
        const box = $('#pz-outro-box'), ob = $('#m-actions .pz-outro-opt'); ob.after(box); ob.classList.add('atual');
        box.classList.remove('hidden'); $('#pz-outro').focus(); box.scrollIntoView({ block: 'nearest' }); } },
      { label: 'Pausar com outro motivo', value: '', cls: 'hidden pz-outro-enviar',
        validate: () => { const ok = !!txtOutro(); $('#pz-outro-aviso').classList.toggle('hidden', ok); if (!ok) { toast('Digite o motivo da pausa.'); $('#pz-outro').focus(); } return ok; },
        collect: () => ({ outro: txtOutro() }) },
      { label: 'Cancelar', value: null }]),
    () => {
      const enviar = () => $('#m-actions .pz-outro-enviar').click();
      $('#pz-outro-ok').onclick = enviar;
      $('#pz-outro').onkeydown = ev => { if (ev.key === 'Enter') { ev.preventDefault(); enviar(); } };
      $('#pz-outro').oninput = () => { if ($('#pz-outro').value.trim()) $('#pz-outro-aviso').classList.add('hidden'); };
    });
  if (!v || e.dataTermino || pausaAberta(e)) return;
  if (!Array.isArray(e.pausas)) e.pausas = [];
  let pz;
  if (typeof v === 'object') {
    const ofic = MOTIVOS_PAUSA.find(m => m.toLowerCase() === v.outro.toLowerCase()); // digitou um motivo da lista: usa o da lista
    pz = textoFimExp(v.outro) ? { motivo: MOTIVO_FIM, inicio: agoraDT(), fim: null } // "fim de expediente" ou "fim de turno" digitado: motivo especial
      : ofic ? { motivo: ofic, inicio: agoraDT(), fim: null } : { motivo: v.outro, outro: true, inicio: agoraDT(), fim: null };
  } else pz = { motivo: v, inicio: agoraDT(), fim: null };
  e.pausas.push(pz); if (!pz.outro && !ehFimExp(pz)) e.situacao = pz.motivo; // fim de expediente não é situação // motivo digitado não vira situação (fica a situação da lista que já estava)
  e.updatedAt = Date.now();
  save(); render(); toast(ehFimExp(pz) ? 'Fim de expediente: o tempo do carro para até Retomar' : 'Pausado: ' + pz.motivo);
}
function retomar(id, sitFinal) {
  const e = DB.entries.find(x => x.id === id); if (!e) return;
  const p = pausaAberta(e); if (!p) return;
  const ag = agoraDT(); p.fim = ag < p.inicio ? p.inicio : ag;
  if (sitFinal || !(p.outro || ehFimExp(p)) || !SITUACOES.includes(e.situacao)) e.situacao = sitFinal || SIT_INICIAL; // motivo digitado: mantém a situação que já estava
  e.updatedAt = Date.now();
  save(); render(); toast(`Produção retomada (pausa de ${fmtHM(dtMin(p.fim) - dtMin(p.inicio))})`);
}
function alternarPausa(id) { const e = DB.entries.find(x => x.id === id); if (!e) return; return pausaAberta(e) ? retomar(id) : pausar(id); }
async function excluir(id) {
  const e = DB.entries.find(x => x.id === id); if (!e) return;
  const ok = await confirmar('Excluir lançamento?', `<p>OS <b>${esc(e.os)}</b> · ${esc(e.veiculo)} (${esc(e.empresa)}).</p><p>Esta ação não pode ser desfeita.</p>`, 'Excluir', 'danger');
  if (!ok) return;
  DB.entries = DB.entries.filter(x => x.id !== id); save(); render(); toast('Lançamento excluído');
}

/* ---------- formulário ---------- */
const form = $('#form-lanc');
$('#btn-hoje').onclick = () => { $('#f-inicio').value = hojeISO(); };
$('#btn-agora-ini').onclick = () => { $('#f-inicio').value = hojeISO(); $('#f-hora-inicio').value = agoraHM(); };
$('#btn-agora-fim').onclick = () => { $('#f-termino').value = hojeISO(); $('#f-hora-termino').value = agoraHM(); };
$('#f-empresa').onchange = atualizaValorPadraoBtn;
function atualizaValorPadraoBtn() {
  const emp = $('#f-empresa').value; const vp = DB.settings.valorPadrao[emp];
  const b = $('#btn-valor-padrao');
  b.disabled = !(emp && vp != null);
  $('#f-valor-hint').textContent = (emp && vp != null) ? `Valor padrão da ${emp}: ${fmtValor(vp)}` : '';
}
$('#btn-valor-padrao').onclick = () => {
  const vp = DB.settings.valorPadrao[$('#f-empresa').value];
  if (vp != null) $('#f-valor').value = valorInput(vp);
};
/* v17: pausas no editor do carro (corrigir início e fim, trocar motivo ou excluir) */
let EDIT_PAUSAS = [];
function renderPausasEditor() {
  const box = $('#f-pausas');
  box.innerHTML = EDIT_PAUSAS.length ? EDIT_PAUSAS.map((p, i) => `<div class="pz-row" data-i="${i}">
      <div class="pz-head"><b>Pausa ${i + 1}</b><button type="button" class="btn ghost small pz-del" style="color:var(--err)">Excluir pausa</button></div>
      <label>Motivo<select class="pz-motivo"><option value="${MOTIVO_FIM}" ${ehFimExp(p) ? 'selected' : ''}>🌙 ${MOTIVO_FIM}</option>${MOTIVOS_PAUSA.map(m => `<option value="${esc(m)}" ${!ehOutro(p) && m === p.motivo ? 'selected' : ''}>${esc(m)}</option>`).join('')}<option value="__outro__" ${ehOutro(p) ? 'selected' : ''}>Outro motivo</option></select></label>
      <label class="pz-outro-lbl${ehOutro(p) ? '' : ' hidden'}">Motivo digitado<input type="text" class="pz-outro-txt" maxlength="${OUTRO_MAX}" autocomplete="off" autocorrect="off" spellcheck="false" value="${ehOutro(p) ? esc(p.motivo || '') : ''}"></label>
      <div class="row2"><label>Início<input type="datetime-local" class="pz-ini" autocomplete="off" value="${esc(p.inicio || '')}"></label><label>Fim<input type="datetime-local" class="pz-fim" autocomplete="off" value="${esc(p.fim || '')}"></label></div>
    </div>`).join('') : '<p class="hint">Nenhuma pausa registrada.</p>';
  box.querySelectorAll('.pz-row').forEach(r => {
    const p = EDIT_PAUSAS[+r.dataset.i];
    const txt = r.querySelector('.pz-outro-txt'), lbl = r.querySelector('.pz-outro-lbl');
    r.querySelector('.pz-motivo').onchange = ev => {
      if (ev.target.value === '__outro__') { p.outro = true; p.motivo = txt.value; lbl.classList.remove('hidden'); txt.focus(); }
      else { delete p.outro; p.motivo = ev.target.value; lbl.classList.add('hidden'); }
    };
    txt.oninput = () => { p.outro = true; p.motivo = txt.value; };
    r.querySelector('.pz-ini').onchange = ev => { p.inicio = (ev.target.value || '').slice(0, 16); };
    r.querySelector('.pz-fim').onchange = ev => { p.fim = (ev.target.value || '').slice(0, 16) || null; };
    r.querySelector('.pz-del').onclick = () => { EDIT_PAUSAS.splice(+r.dataset.i, 1); renderPausasEditor(); toast('Pausa removida. Toque em Salvar alterações para confirmar.'); };
  });
}
function validaPausas(ps) {
  const s = ps.slice().sort((a, b) => (a.inicio || '').localeCompare(b.inicio || ''));
  for (let i = 0; i < s.length; i++) {
    const p = s[i];
    if (!DT_RE.test(p.inicio || '')) return 'Informe a data e a hora de início de cada pausa.';
    if (p.outro && !limpaMotivo(p.motivo)) return 'Digite o motivo de cada pausa com Outro motivo.';
    if (p.fim && !DT_RE.test(p.fim)) return 'A data e hora de fim de uma pausa está incompleta.';
    if (p.fim && p.fim < p.inicio) return 'O fim de uma pausa não pode ser antes do início.';
    if (!p.fim && i < s.length - 1) return 'Só a última pausa pode ficar sem fim (pausa em andamento).';
    if (i > 0 && s[i - 1].fim > p.inicio) return 'Uma pausa não pode começar antes da anterior terminar.';
  }
  return '';
}
function resetForm() {
  EDIT_PAUSAS = []; $('#f-pausas-box').classList.add('hidden'); $('#f-pausas').innerHTML = '';
  form.reset(); $('#f-id').value = ''; $('#form-title').textContent = 'Novo lançamento';
  $('#btn-salvar').textContent = 'Salvar lançamento';
  $('#lbl-termino').classList.add('hidden'); $('#btn-cancelar-edicao').classList.add('hidden'); $('#btn-reabrir').classList.add('hidden');
  atualizaValorPadraoBtn();
}
$('#btn-cancelar-edicao').onclick = () => { resetForm(); show('lista'); };
/* v18: reabrir carro finalizado por engano (apaga término, volta para Em processo e sai da folha enquanto estiver aberto) */
async function reabrir(id) {
  const e = DB.entries.find(x => x.id === id); if (!e || !e.dataTermino) return false;
  const [ano, mes, dia] = e.dataTermino.split('-').map(Number), q = dia <= 15 ? 1 : 2, st = getStatus(e.empresa, ano, mes, q);
  const info = `<p><b>OS ${esc(e.os)}</b> · ${esc(e.veiculo)}<br>${esc(e.empresa)} · ${esc(e.setor)} · término ${fmtDataHora(e.dataTermino, e.horaTermino)}</p>`;
  const resto = '<p>A data e a hora de término serão apagadas e o carro volta para Em processo, em andamento no Início e na Lista. OS, veículo, valor, observação, início e pausas ficam como estão. Alterações não salvas neste formulário serão descartadas.</p>';
  const ok = st !== 'Aberta'
    ? await confirmar('Folha já ' + st.toLowerCase(), info + `<p class="alert warn">A folha da ${esc(e.empresa)} de ${qNome({ ano, mes, q })} está <b>${esc(st)}</b>. Ao reabrir, este carro sai dessa folha (${fmtValor(e.valor)}) até ser finalizado de novo.</p>` + resto, 'Reabrir mesmo assim', 'danger')
    : await confirmar('Reabrir carro?', info + resto, 'Reabrir carro');
  if (!ok || !e.dataTermino) return false;
  e.dataTermino = null; e.horaTermino = null; e.situacao = SIT_INICIAL; e.updatedAt = Date.now(); normEntry(e);
  save(); return true;
}
$('#btn-reabrir').onclick = async () => { const id = $('#f-id').value; if (await reabrir(id)) { resetForm(); render(); show('lista'); toast('Carro reaberto: em andamento'); } };
function editar(id) {
  const e = DB.entries.find(x => x.id === id); if (!e) return;
  show('lancar');
  $('#f-id').value = e.id; $('#f-empresa').value = e.empresa; $('#f-setor').value = e.setor;
  $('#f-inicio').value = e.dataInicio; $('#f-os').value = e.os; $('#f-veiculo').value = e.veiculo;
  $('#f-valor').value = valorInput(e.valor); $('#f-ajudante').value = valorInput(e.ajudante); $('#f-termino').value = e.dataTermino || ''; $('#f-obs').value = e.obs || '';
  $('#f-hora-inicio').value = e.horaInicio || ''; $('#f-hora-termino').value = e.horaTermino || '';
  $('#form-title').textContent = 'Editar lançamento'; $('#btn-salvar').textContent = 'Salvar alterações';
  $('#lbl-termino').classList.remove('hidden'); $('#btn-cancelar-edicao').classList.remove('hidden'); $('#btn-reabrir').classList.toggle('hidden', !e.dataTermino);
  EDIT_PAUSAS = (e.pausas || []).map(p => Object.assign({}, p)); $('#f-pausas-box').classList.remove('hidden'); renderPausasEditor();
  atualizaValorPadraoBtn();
}
form.onsubmit = async ev => {
  ev.preventDefault();
  const id = $('#f-id').value;
  if (!id && bloqueadoNovo()) return;
  const d = {
    empresa: $('#f-empresa').value, setor: $('#f-setor').value, dataInicio: $('#f-inicio').value,
    os: $('#f-os').value.trim(), veiculo: $('#f-veiculo').value.trim(), obs: $('#f-obs').value.trim(),
    valor: parseValor($('#f-valor').value), ajudante: parseValor($('#f-ajudante').value), dataTermino: id ? ($('#f-termino').value || null) : undefined,
    horaInicio: HM_RE.test($('#f-hora-inicio').value) ? $('#f-hora-inicio').value : null
  };
  if (id) d.horaTermino = d.dataTermino && HM_RE.test($('#f-hora-termino').value) ? $('#f-hora-termino').value : null;
  const falta = [];
  if (!d.empresa) falta.push('empresa'); if (!d.setor) falta.push('setor'); if (!d.dataInicio) falta.push('data início');
  if (!d.os) falta.push('OS'); if (!d.veiculo) falta.push('veículo');
  if (falta.length) { await modal('Campos obrigatórios', `<p>Preencha: <b>${falta.join(', ')}</b>.</p>`, [{ label: 'OK', value: true, cls: 'primary' }]); return; }
  if (Number.isNaN(d.ajudante) || (d.ajudante != null && d.ajudante < 0)) { await modal('Ajudante inválido', '<p>Digite o valor do ajudante só com números, por exemplo 100 ou 100,00. Deixe vazio se não teve ajudante.</p>', [{ label: 'OK', value: true, cls: 'primary' }]); return; }
  if (d.valor != null && d.ajudante != null && d.ajudante > d.valor) {
    const ok = await confirmar('Ajudante maior que o valor?', `<p>O ajudante (${fmtValor(d.ajudante)}) está maior que o valor do carro (${fmtValor(d.valor)}).</p>`, 'Salvar mesmo assim');
    if (!ok) return;
  }
  if (Number.isNaN(d.valor)) { await modal('Valor inválido', '<p>Digite o valor só com números, por exemplo 510 ou 510,00.</p>', [{ label: 'OK', value: true, cls: 'primary' }]); return; }
  if (d.dataTermino && d.dataTermino < d.dataInicio) { await modal('Datas inválidas', '<p>A data término não pode ser antes da data início.</p>', [{ label: 'OK', value: true, cls: 'primary' }]); return; }
  if (d.dataTermino && d.dataTermino === d.dataInicio && d.horaInicio && d.horaTermino && d.horaTermino < d.horaInicio) { await modal('Horas inválidas', '<p>No mesmo dia, a hora término não pode ser antes da hora início.</p>', [{ label: 'OK', value: true, cls: 'primary' }]); return; }
  if (id) { const err = validaPausas(EDIT_PAUSAS); if (err) { await modal('Pausas inválidas', `<p>${esc(err)}</p>`, [{ label: 'OK', value: true, cls: 'primary' }]); return; } }
  const norm = s => s.replace(/\s+/g, '').toUpperCase();
  const dups = DB.entries.filter(e => e.id !== id && norm(e.os) === norm(d.os));
  if (dups.length) {
    const ok = await confirmar('OS repetida', `<p>A OS <b>${esc(d.os)}</b> já está lançada:</p>` +
      dups.map(e => `<p class="alert warn">${esc(e.empresa)} · ${esc(e.setor)} · ${esc(e.veiculo)}<br>Início ${fmtData(e.dataInicio)}${e.dataTermino ? ` · Término ${fmtData(e.dataTermino)}` : ' · Em andamento'} · ${fmtValor(e.valor)}</p>`).join('') +
      '<p>Deseja salvar mesmo assim?</p>', 'Salvar mesmo assim');
    if (!ok) return;
  }
  if (d.valor == null) {
    const ok = await confirmar('Salvar sem valor?', '<p>O campo <b>Valor</b> está vazio. Você pode completar depois em Editar.</p>', 'Salvar sem valor');
    if (!ok) return;
  }
  if (id) {
    const e = DB.entries.find(x => x.id === id);
    const tinhaPausa = !!pausaAberta(e);
    Object.assign(e, d, { updatedAt: Date.now() }); e.pausas = EDIT_PAUSAS.map(p => { const q = Object.assign({}, p); if (q.outro) { q.motivo = limpaMotivo(q.motivo); const of = textoFimExp(q.motivo) ? MOTIVO_FIM : MOTIVOS_PAUSA.find(m => m.toLowerCase() === q.motivo.toLowerCase()); if (of) { q.motivo = of; delete q.outro; } } return q; }); normEntry(e);
    if (tinhaPausa && !pausaAberta(e) && !e.dataTermino && MOTIVOS_PAUSA.includes(e.situacao)) e.situacao = SIT_INICIAL;
    save(); resetForm(); toast('Alterações salvas'); show('lista');
  } else {
    DB.entries.push(Object.assign(d, { id: uid(), dataTermino: null, horaTermino: null, situacao: SIT_INICIAL, createdAt: Date.now(), updatedAt: Date.now() }));
    save(); resetForm(); toast('Lançamento salvo');
    window.scrollTo(0, 0);
  }
};

/* ---------- leitor de QR da OS ----------
   A ficha do veículo traz um QR code só com o número da OS (ex.: 260728).
   Usa o BarcodeDetector do aparelho quando existe (Chrome no Android); senão, o jsQR
   local (vendor/jsQR.js, carregado só quando precisa). Nada sai do aparelho. */
let QR = null;
function osDoQR(txt) {
  const t = String(txt == null ? '' : txt).trim(), runs = t.match(/\d+/g);
  if (!runs) return t.slice(0, 40);
  return runs.reduce((a, b) => b.length > a.length ? b : a);
}
function carregarJsQR() {
  if (window.jsQR) return Promise.resolve(window.jsQR);
  if (carregarJsQR._p) return carregarJsQR._p;
  carregarJsQR._p = new Promise((res, rej) => {
    const sc = document.createElement('script'); sc.src = 'vendor/jsQR.js';
    sc.onload = () => window.jsQR ? res(window.jsQR) : rej(new Error('jsQR indisponível'));
    sc.onerror = () => { carregarJsQR._p = null; rej(new Error('jsQR indisponível')); };
    document.head.appendChild(sc);
  });
  return carregarJsQR._p;
}
async function criarDetector() {
  try {
    if ('BarcodeDetector' in window) {
      const f = window.BarcodeDetector.getSupportedFormats ? await window.BarcodeDetector.getSupportedFormats() : ['qr_code'];
      if (f.includes('qr_code')) return new window.BarcodeDetector({ formats: ['qr_code'] });
    }
  } catch (_) {}
  return null;
}
/* lê o QR de uma imagem, vídeo ou canvas; devolve o texto ou null */
async function decodificarQR(fonte, opts = {}) {
  const det = opts.detector !== undefined ? opts.detector : (opts.forcarJsQR ? null : await criarDetector());
  if (det) { try { const r = await det.detect(fonte); if (r && r.length && r[0].rawValue) return r[0].rawValue; } catch (_) {} if (!opts.forcarJsQR && opts.soDetector) return null; }
  const jsQR = await carregarJsQR();
  const w0 = fonte.videoWidth || fonte.naturalWidth || fonte.width, h0 = fonte.videoHeight || fonte.naturalHeight || fonte.height;
  if (!w0 || !h0) return null;
  const k = Math.min(1, (opts.max || 1000) / Math.max(w0, h0)), w = Math.round(w0 * k), h = Math.round(h0 * k);
  const cv = opts.canvas || document.createElement('canvas'); cv.width = w; cv.height = h;
  const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(fonte, 0, 0, w, h);
  const code = jsQR(cx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: opts.inversao || 'attemptBoth' });
  return code && code.data ? code.data : null;
}
function qrMsg(txt, erro) { $('#qr-msg').textContent = txt; $('#qr-modal').classList.toggle('erro', !!erro); $('#qr-digitar').classList.toggle('hidden', !erro); }
function fecharQR() {
  if (!QR) { $('#qr-modal').classList.add('hidden'); return; }
  QR.ativo = false; clearTimeout(QR.t);
  if (QR.stream) QR.stream.getTracks().forEach(t => { try { t.stop(); } catch (_) {} });
  const v = $('#qr-video'); try { v.pause(); } catch (_) {} v.srcObject = null;
  QR = null; $('#qr-modal').classList.add('hidden');
}
function qrLido(txt) {
  const os = osDoQR(txt); if (!os) return false;
  fecharQR();
  $('#f-os').value = os;
  try { if (navigator.vibrate) navigator.vibrate(80); } catch (_) {}
  $('#f-veiculo').focus();
  toast('OS lida: ' + os);
  return true;
}
function qrErroCamera(e) {
  const n = e && e.name;
  if (n === 'NotAllowedError' || n === 'SecurityError') return 'Sem permissão para usar a câmera. Libere a câmera nas configurações do navegador ou digite a OS.';
  if (n === 'NotFoundError' || n === 'OverconstrainedError' || n === 'DevicesNotFoundError') return 'Nenhuma câmera encontrada neste aparelho. Digite a OS.';
  if (n === 'NotReadableError' || n === 'AbortError') return 'A câmera está sendo usada por outro app. Feche o outro app e tente de novo, ou digite a OS.';
  return 'Não foi possível abrir a câmera. Digite a OS.';
}
async function abrirQR() {
  fecharQR();
  QR = { ativo: true };
  const sessao = QR;
  $('#qr-modal').classList.remove('hidden'); qrMsg('Abrindo a câmera...');
  if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    qrMsg(window.isSecureContext === false ? 'A câmera só funciona com o app aberto pelo endereço seguro (https). Digite a OS.' : 'Este navegador não permite usar a câmera. Digite a OS.', true); return;
  }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }); }
  catch (e) { if (QR === sessao) qrMsg(qrErroCamera(e), true); return; }
  if (QR !== sessao || !sessao.ativo) { stream.getTracks().forEach(t => t.stop()); return; }
  sessao.stream = stream;
  const v = $('#qr-video'); v.srcObject = stream;
  try { await v.play(); } catch (_) {}
  sessao.detector = await criarDetector();
  if (!sessao.detector) { try { await carregarJsQR(); } catch (e) { if (QR === sessao) qrMsg('Leitor de QR indisponível. Digite a OS.', true); return; } }
  if (QR !== sessao) return;
  qrMsg('Aponte a câmera para o QR code da ficha do veículo.');
  sessao.canvas = document.createElement('canvas');
  const passo = async () => {
    if (QR !== sessao || !sessao.ativo) return;
    let txt = null;
    if (v.readyState >= 2) { try { txt = await decodificarQR(v, { detector: sessao.detector, canvas: sessao.canvas, max: 640, inversao: 'dontInvert', soDetector: !!sessao.detector }); } catch (_) {} }
    if (QR !== sessao || !sessao.ativo) return;
    if (txt && qrLido(txt)) return;
    sessao.t = setTimeout(passo, 150);
  };
  passo();
}
$('#btn-ler-qr').onclick = abrirQR;
$('#qr-cancelar').onclick = fecharQR;
$('#qr-digitar').onclick = () => { fecharQR(); $('#f-os').focus(); };
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && QR) fecharQR(); });

/* ---------- folha ---------- */
function folhaDados() {
  const emp = $('#fo-empresa').value, ano = +$('#fo-ano').value, mes = +$('#fo-mes').value, q = +$('#fo-q').value;
  const list = entradasQuinzena(emp, ano, mes, q);
  return { emp, ano, mes, q, p: periodo(ano, mes, q), list, paginas: numPaginas(list) };
}
const numPaginas = list => Math.max(1, Math.ceil(list.length / LINHAS_POR_PAGINA));
function renderFolha() {
  const { emp, ano, mes, q, p, list, paginas } = folhaDados();
  const andamento = DB.entries.filter(e => e.empresa === emp && !e.dataTermino).length;
  const semValor = list.filter(e => e.valor == null).length;
  const t = totaisQ(emp, ano, mes, q);
  $('#fo-status').value = getStatus(emp, ano, mes, q);
  $('#fo-desconto').value = t.outros ? valorInput(t.outros) : '';
  $('#fo-money').innerHTML = totaisHtml(t);
  $('#fo-info').innerHTML = `Período ${fmtData(p.ini)} a ${fmtData(p.fim)}: <b>${list.length}</b> ${list.length === 1 ? 'carro' : 'carros'}, ${paginas} ${paginas === 1 ? 'página' : 'páginas'} A4. Valores, ajudante e desconto aparecem só no app, nunca na folha. Pagamento previsto: <b>${fmtData(dataPagamento(ano, mes, q))}</b>.` +
    (semValor ? ` ${semValor} sem valor.` : '') +
    (andamento ? ` ${andamento} ${andamento === 1 ? 'carro' : 'carros'} desta empresa ainda em andamento ${andamento === 1 ? 'fica' : 'ficam'} fora.` : '');
  $('#folha').innerHTML = sheetsHtml(emp, ano, mes, q);
  ajustaZoom();
}
$('#fo-desconto').onchange = () => { if (setDesconto($('#fo-empresa').value, +$('#fo-ano').value, +$('#fo-mes').value, +$('#fo-q').value, $('#fo-desconto').value)) renderFolha(); };

/* Layout da folha, baseado no formulário em papel da Concept:
   cabeçalho (empresa à esquerda, título à direita), numeração "1-" fora da tabela,
   colunas DATA DE INÍCIO | ORDEM DE SERVIÇO | VEÍCULO | SETOR | DATA DE TÉRMINO,
   uma linha OBSERVAÇÃO abaixo de cada carro, 16 carros por página e quadro APROVAÇÕES. */
const FOLHA_COLS = [{ t: 'DATA DE INÍCIO', w: 18 }, { t: 'ORDEM DE SERVIÇO', w: 20 }, { t: 'VEÍCULO', w: 24 }, { t: 'SETOR', w: 18 }, { t: 'DATA DE TÉRMINO', w: 20 }];
function sheetsHtml(emp, ano, mes, q) {
  const p = periodo(ano, mes, q), list = entradasQuinzena(emp, ano, mes, q), paginas = numPaginas(list);
  let html = '';
  for (let pg = 0; pg < paginas; pg++) {
    const rows = list.slice(pg * LINHAS_POR_PAGINA, (pg + 1) * LINHAS_POR_PAGINA);
    let trs = '';
    for (let i = 0; i < LINHAS_POR_PAGINA; i++) {
      const e = rows[i], n = pg * LINHAS_POR_PAGINA + i + 1;
      trs += `<tr class="r1"><td class="n" rowspan="2">${n}-</td>` + (e
        ? `<td class="c">${fmtData(e.dataInicio)}</td><td class="c">${esc(e.os)}</td><td>${esc(e.veiculo)}</td><td class="c">${esc(setorFolha(emp, e.setor))}</td><td class="c">${fmtData(e.dataTermino)}</td>`
        : '<td></td><td></td><td></td><td></td><td></td>') + '</tr>' +
        `<tr class="r2"><td colspan="5" class="obs"><b>OBSERVAÇÃO:</b> ${e ? esc(e.obs || '') : ''}</td></tr>`;
    }
    html += `<div class="sheet">
      <div class="sh-top"><div class="sh-emp">${esc(emp)}</div><div class="sh-title">FORMULÁRIO DE PAGAMENTO DE MÃO DE OBRA</div></div>
      <div class="sh-info"><span><b>Operador:</b> ${esc(DB.settings.operador)}</span><span><b>Período:</b> ${fmtData(p.ini)} a ${fmtData(p.fim)}</span></div>
      <table class="sh-table">
        <colgroup><col class="cn">${FOLHA_COLS.map(c => `<col style="width:${c.w}%">`).join('')}</colgroup>
        <thead><tr><th class="n"></th>${FOLHA_COLS.map(c => `<th>${c.t}</th>`).join('')}</tr></thead>
        <tbody>${trs}</tbody>
      </table>
      <div class="sh-foot"><div class="ttl">APROVAÇÕES</div><div class="sigs">
        ${['Operador', 'Coordenador', 'Lançamento'].map(r => `<div class="sig">${r === 'Operador' && DB.settings.operador ? `<span class="sig-nome">${esc(DB.settings.operador)}</span>` : ''}<span>${r}</span></div>`).join('')}
      </div></div>
      <div class="sh-page"><span>${q}ª quinzena de ${MESES[mes - 1].toLowerCase()} de ${ano}</span><span>Folha ${pg + 1} de ${paginas}</span></div>
    </div>`;
  }
  return html;
}

/* PDF gerado no app (jsPDF local, sem internet); mesma geometria da impressão */
function novoDoc() { const { jsPDF } = window.jspdf; return new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' }); }
function drawFolha(doc, emp, ano, mes, q, primeira) {
  const p = periodo(ano, mes, q), list = entradasQuinzena(emp, ano, mes, q), paginas = numPaginas(list);
  const G = 9, L = 10 + G, W = 190 - G; // G = margem para a numeração "1-"
  const cols = FOLHA_COLS.map(c => c.w * W / 100);
  const fit = (t, w, size) => { doc.setFontSize(size); let s = String(t || ''); while (s && doc.getTextWidth(s) > w - 2) s = s.slice(0, -1); return s; };
  for (let pg = 0; pg < paginas; pg++) {
    if (!(primeira && pg === 0)) doc.addPage();
    doc.setTextColor(0); doc.setDrawColor(0);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
    doc.text(fit(emp.toUpperCase(), 80, 15), 10, 18);
    doc.setFontSize(10); doc.setTextColor(70); doc.text('FORMULÁRIO DE PAGAMENTO DE MÃO DE OBRA', 200, 18, { align: 'right' });
    doc.setTextColor(0); doc.setFontSize(9);
    doc.setFont('helvetica', 'bold'); doc.text('Operador:', 10, 25); doc.text('Período:', 120, 25);
    doc.setFont('helvetica', 'normal'); doc.text(fit(DB.settings.operador, 90, 9), 26, 25); doc.text(`${fmtData(p.ini)} a ${fmtData(p.fim)}`, 134, 25);
    let y = 29;
    const hh = 6, r1 = 7.6, r2h = 5.1;
    doc.setLineWidth(0.3);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
    let x = L; FOLHA_COLS.forEach((c, i) => { doc.rect(x, y, cols[i], hh); doc.text(c.t, x + cols[i] / 2, y + hh / 2 + 1, { align: 'center' }); x += cols[i]; });
    y += hh;
    const rows = list.slice(pg * LINHAS_POR_PAGINA, (pg + 1) * LINHAS_POR_PAGINA);
    for (let i = 0; i < LINHAS_POR_PAGINA; i++) {
      const e = rows[i];
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      doc.text(`${pg * LINHAS_POR_PAGINA + i + 1}-`, L - 1.2, y + r1 / 2 + 1.2, { align: 'right' });
      const vals = e ? [fmtData(e.dataInicio), e.os, e.veiculo, setorFolha(emp, e.setor), fmtData(e.dataTermino)] : ['', '', '', '', ''];
      x = L;
      vals.forEach((v, c) => {
        doc.rect(x, y, cols[c], r1);
        const t = fit(v, cols[c], 10);
        if (c === 2) doc.text(t, x + 1.5, y + r1 / 2 + 1.3); else doc.text(t, x + cols[c] / 2, y + r1 / 2 + 1.3, { align: 'center' });
        x += cols[c];
      });
      y += r1;
      doc.rect(L, y, W, r2h);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.text('OBSERVAÇÃO:', L + 1.2, y + r2h / 2 + 1);
      if (e && e.obs) { const ox = L + 1.2 + doc.getTextWidth('OBSERVAÇÃO:') + 1.5; doc.setFont('helvetica', 'normal'); doc.text(fit(e.obs, L + W - ox - 1, 8), ox, y + r2h / 2 + 1); }
      y += r2h;
    }
    // aprovações
    const fy = 252, fh = 26;
    doc.setLineWidth(0.4); doc.rect(10, fy, 190, fh); doc.line(10, fy + 6, 200, fy + 6);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text('APROVAÇÕES', 105, fy + 4.2, { align: 'center' });
    ['Operador', 'Coordenador', 'Lançamento'].forEach((r, i) => {
      const cx = 10 + i * 190 / 3;
      if (i) doc.line(cx, fy + 6, cx, fy + fh);
      doc.text(r, cx + 190 / 6, fy + fh - 2, { align: 'center' });
      if (i === 0 && DB.settings.operador) {
        doc.setFont('helvetica', 'bolditalic'); doc.setFontSize(12);
        doc.text(fit(DB.settings.operador, 58, 12), cx + 190 / 6, fy + fh - 9, { align: 'center' });
        doc.setLineWidth(0.2); doc.line(cx + 8, fy + fh - 7, cx + 190 / 3 - 8, fy + fh - 7);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setLineWidth(0.4);
      }
    });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.text(`${q}ª quinzena de ${MESES[mes - 1].toLowerCase()} de ${ano}`, 10, 287);
    doc.text(`Folha ${pg + 1} de ${paginas}`, 200, 287, { align: 'right' });
  }
}
function gerarPdf() {
  const { emp, ano, mes, q } = folhaDados();
  const doc = novoDoc(); drawFolha(doc, emp, ano, mes, q, true);
  return { doc, nome: `Folha-${emp.replace(/\s+/g, '-')}-${ano}-${pad(mes)}-Q${q}.pdf` };
}
function baixarDoc(doc, nome) {
  const url = URL.createObjectURL(doc.output('blob'));
  const a = document.createElement('a'); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  toast('PDF gerado: ' + nome);
}
$('#btn-pdf').onclick = () => {
  try { const { doc, nome } = gerarPdf(); baixarDoc(doc, nome); } catch (e) { console.error(e); toast('Não foi possível gerar o PDF'); }
};
function ajustaZoom() {
  const wrap = $('#folha-wrap'), f = $('#folha');
  const sheetW = 210 * 96 / 25.4; // px
  const z = Math.min(1, (wrap.clientWidth || window.innerWidth - 24) / sheetW);
  f.style.zoom = z;
}
window.addEventListener('resize', () => { if (currentView() === 'folha') ajustaZoom(); });
$('#btn-imprimir').onclick = () => { document.body.classList.remove('print-all'); renderFolha(); window.print(); };

/* ---------- fechar quinzena (todas as empresas) ---------- */
function empresasComCarros(ano, mes, q) { return EMPRESAS.filter(emp => entradasQuinzena(emp, ano, mes, q).length); }
function pdfTodas(ano, mes, q) {
  const doc = novoDoc();
  empresasComCarros(ano, mes, q).forEach((emp, i) => drawFolha(doc, emp, ano, mes, q, i === 0));
  return { doc, nome: `Folhas-${ano}-${pad(mes)}-Q${q}.pdf` };
}
function imprimirTodas(ano, mes, q) {
  $('#print-all').innerHTML = empresasComCarros(ano, mes, q).map(emp => sheetsHtml(emp, ano, mes, q)).join('');
  document.body.classList.add('print-all');
  window.print();
}
window.addEventListener('afterprint', () => document.body.classList.remove('print-all'));
async function fecharQuinzena(ano, mes, q) {
  const p = periodo(ano, mes, q), nomeQ = `${q === 1 ? '1' : '16'} a ${p.fim.slice(8)} de ${MESES[mes - 1].toLowerCase()} de ${ano}`;
  const emps = empresasComCarros(ano, mes, q);
  if (!emps.length) { await modal('Nada para fechar', `<p>Nenhum carro finalizado na quinzena ${nomeQ}.</p>`, [{ label: 'OK', value: 1, cls: 'primary' }]); return; }
  const semValor = emps.flatMap(emp => entradasQuinzena(emp, ano, mes, q)).filter(e => e.valor == null);
  const andamento = DB.entries.filter(e => !e.dataTermino && e.dataInicio <= p.fim);
  if (semValor.length || andamento.length) {
    const li = e => `<li>OS ${esc(e.os)} · ${esc(e.veiculo)} · ${esc(e.empresa)}</li>`;
    const ok = await modal('Pendências na quinzena',
      (semValor.length ? `<p><b>${semValor.length} ${semValor.length === 1 ? 'carro sem valor' : 'carros sem valor'}:</b></p><ul class="plist">${semValor.map(li).join('')}</ul>` : '') +
      (andamento.length ? `<p><b>${andamento.length} ${andamento.length === 1 ? 'carro em andamento' : 'carros em andamento'}</b> (não ${andamento.length === 1 ? 'entra' : 'entram'} na folha):</p><ul class="plist">${andamento.map(li).join('')}</ul>` : ''),
      [{ label: 'Voltar e corrigir', value: false, cls: 'primary' }, { label: 'Fechar mesmo assim', value: true }]);
    if (!ok) return;
  }
  const resumo = emps.map(emp => { const t = totaisQ(emp, ano, mes, q); return `<li><b>${esc(emp)}</b>: ${t.carros} ${t.carros === 1 ? 'carro' : 'carros'}, ${numPaginas(t.list)} ${numPaginas(t.list) === 1 ? 'página' : 'páginas'} · líquido ${fmtValor(t.liquido)} · ${getStatus(emp, ano, mes, q)}</li>`; }).join('');
  const acao = await modal(`Fechar quinzena ${nomeQ}`,
    `<p>Folhas de <b>${emps.length} ${emps.length === 1 ? 'empresa' : 'empresas'}</b>, cada uma começando em página nova:</p><ul class="plist">${resumo}</ul><p class="hint">Pagamento previsto: ${fmtData(dataPagamento(ano, mes, q))}. Valores só aparecem aqui, nunca na folha.</p>`,
    [{ label: 'Baixar folhas em PDF', cls: 'primary', action: () => { try { const r = pdfTodas(ano, mes, q); baixarDoc(r.doc, r.nome); } catch (e) { console.error(e); toast('Não foi possível gerar o PDF'); } } },
     { label: 'Imprimir tudo', action: () => imprimirTodas(ano, mes, q) },
     { label: 'Marcar como Entregue', value: 'entregue', cls: 'ok' },
     { label: 'Sair sem marcar', value: null }]);
  if (acao !== 'entregue') return;
  const mudar = emps.filter(emp => getStatus(emp, ano, mes, q) === 'Aberta'), manter = emps.filter(emp => !mudar.includes(emp));
  const ok = await confirmar('Marcar como Entregue?',
    (mudar.length ? `<p>Passam de Aberta para <b>Entregue</b>:</p><ul class="plist">${mudar.map(e => `<li>${esc(e)}</li>`).join('')}</ul>` : '<p>Nenhuma empresa está com status Aberta.</p>') +
    (manter.length ? `<p>Ficam como estão:</p><ul class="plist">${manter.map(e => `<li>${esc(e)} (${getStatus(e, ano, mes, q)})</li>`).join('')}</ul>` : ''),
    'Confirmar');
  if (!ok) return;
  mudar.forEach(emp => DB.quinzenas[qKey(emp, ano, mes, q)] = 'Entregue');
  save(); render(); toast(mudar.length ? `Quinzena fechada: ${mudar.length} marcada(s) como Entregue` : 'Nenhum status alterado');
}
$('#p-fechar').onclick = () => fecharQuinzena(PQ.ano, PQ.mes, PQ.q);
$('#fo-fechar').onclick = () => fecharQuinzena(+$('#fo-ano').value, +$('#fo-mes').value, +$('#fo-q').value);

/* ---------- ajustes e backup ---------- */
function renderAcesso() {
  const box = $('#acesso-corpo');
  if (!box || !window.FolhaAcesso) return;
  const antes = MODO_TESTE ? null : localStorage.getItem('folhazero_v1');
  box.innerHTML = FolhaAcesso.htmlSecao(window, localStorage);
  if (!MODO_TESTE && localStorage.getItem('folhazero_v1') !== antes) console.error('acesso alterou folhazero_v1');
}
function copiaOnlineLigada() {
  try { return !!(window.FolhaPersistencia && FolhaPersistencia.configHabilitada(window)); }
  catch (_) { return false; }
}
function renderAjustes() {
  $('#s-operador').value = DB.settings.operador || '';
  $('#s-contador-hint').classList.toggle('hidden', !CONTADOR_URL);
  const aviso = $('#s-nuvem-info');
  if (aviso) aviso.textContent = MODO_TESTE
    ? 'O backup do aplicativo publicado continua desligado. Neste site isolado, a cópia automática envia só a chave de teste depois de uma alteração salva.'
    : copiaOnlineLigada()
    ? 'Há uma configuração de cópia online neste aparelho. Ela só conta como concluída depois de conferida. Uma conta vazia não substitui os lançamentos daqui.'
    : 'A cópia online ainda não está ligada. Os lançamentos continuam somente neste aparelho. Uma falha de rede não apaga o que já está salvo.';
  renderAcesso();
  fillSelect($('#s-setor-op'), SETORES); $('#s-setor-op').value = DB.settings.setorOperador || 'Tapeçaria';
  $('#s-valores').innerHTML = EMPRESAS.map(e => `<div class="valrow"><span>${esc(e)}</span><input type="text" inputmode="decimal" autocomplete="off" data-emp="${esc(e)}" value="${valorInput(DB.settings.valorPadrao[e])}" placeholder="sem padrão"></div>`).join('');
  $('#s-aliquotas').innerHTML = EMPRESAS.map(e => `<div class="valrow"><span>${esc(e)}</span><input type="text" inputmode="decimal" autocomplete="off" data-emp="${esc(e)}" value="${getAliquota(e) ? String(getAliquota(e)).replace('.', ',') : ''}" placeholder="0 %"></div>`).join('');
  $('#s-dados-info').textContent = `${DB.entries.length} lançamento(s) salvos neste aparelho.` + (DB.entries.some(e => e.exemplo) ? ' Há dados de exemplo.' : '');
  const lb = DB.settings.lastBackup;
  $('#s-backup-info').innerHTML = lb ? `Último backup: <b>${new Date(lb).toLocaleString('pt-BR')}</b> (há ${diasDesde(lb)} dia(s)).` : 'Nenhum backup feito ainda.';
  if (diasDesde(lb) > 7) $('#s-backup-info').innerHTML += ' <b style="color:var(--warn)">Recomendado fazer um backup agora.</b>';
}
$('#btn-salvar-op').onclick = () => { const v = $('#s-operador').value.trim(); if (!v) return toast('Digite o nome do operador'); DB.settings.operador = v; DB.settings.setorOperador = $('#s-setor-op').value || 'Tapeçaria'; save(); renderBrand(); toast('Operador salvo'); contadorAbertura(); };
$('#acesso-card').addEventListener('click', ev => {
  const btn = ev.target.closest('[data-acesso]');
  if (!btn || !window.FolhaAcesso) return;
  const antes = MODO_TESTE ? null : localStorage.getItem('folhazero_v1');
  const r = FolhaAcesso.clicar(window, localStorage, btn.getAttribute('data-acesso'), btn.getAttribute('data-id') || '');
  if (!MODO_TESTE && localStorage.getItem('folhazero_v1') !== antes) localStorage.setItem('folhazero_v1', antes);
  const msg = $('#acesso-msg');
  if (msg && r && r.texto) msg.textContent = r.texto;
  renderAcesso();
});
$('#acesso-card').addEventListener('submit', ev => {
  ev.preventDefault();
  const senha = $('#acesso-senha');
  if (senha) senha.value = '';
  const msg = $('#acesso-msg');
  if (msg) msg.textContent = 'O login não foi enviado. A senha não fica salva neste aparelho e o projeto ainda não está ligado.';
});
$('#btn-salvar-aliq').onclick = () => {
  const al = {}; let erro = false;
  document.querySelectorAll('#s-aliquotas input').forEach(i => { const v = parseValor(i.value.replace('%', '')); if (Number.isNaN(v) || (v != null && (v < 0 || v >= 100))) erro = true; else if (v) al[i.dataset.emp] = v; });
  if (erro) return toast('Alguma alíquota está inválida (use de 0 a 99)');
  DB.settings.aliquota = al; save(); renderAjustes(); toast('Alíquotas salvas');
};
$('#btn-salvar-valores').onclick = () => {
  const vp = {}; let erro = false;
  document.querySelectorAll('#s-valores input').forEach(i => { const v = parseValor(i.value); if (Number.isNaN(v)) erro = true; else if (v != null) vp[i.dataset.emp] = v; });
  if (erro) return toast('Algum valor está inválido');
  DB.settings.valorPadrao = vp; save(); renderAjustes(); toast('Valores padrão salvos');
};
/* resumo por empresa e quinzena, para o bot de finanças */
function resumoQuinzenas() {
  const keys = new Set();
  DB.entries.forEach(e => { if (e.dataTermino) { const d = +e.dataTermino.slice(8); keys.add(`${e.empresa}|${e.dataTermino.slice(0, 7)}|${d <= 15 ? 1 : 2}`); } });
  Object.keys(DB.quinzenas).concat(Object.keys(DB.descontos)).forEach(k => keys.add(k));
  return [...keys].map(k => {
    const [empresa, ym, qq] = k.split('|'); const ano = +ym.slice(0, 4), mes = +ym.slice(5, 7), quinzena = +qq;
    const t = totaisQ(empresa, ano, mes, quinzena);
    const datas = t.list.map(e => e.dataTermino).sort();
    return { empresa, ano, mes, quinzena, carros: t.carros, bruto: t.bruto, ajudante: t.ajudante, desconto: t.desconto, liquido: t.liquido,
      dataMin: datas[0] || null, dataMax: datas[datas.length - 1] || null, status: getStatus(empresa, ano, mes, quinzena), pagamentoPrevisto: dataPagamento(ano, mes, quinzena) };
  }).sort((a, b) => (a.ano - b.ano) || (a.mes - b.mes) || (a.quinzena - b.quinzena) || (EMPRESAS.indexOf(a.empresa) - EMPRESAS.indexOf(b.empresa)));
}
const BACKUP_NOME = 'folha-zero-backup.json';
function montarBackup() {
  return { app: 'folha-zero', versao: 2, geradoEm: new Date().toISOString(), resumoQuinzenas: resumoQuinzenas(), data: DB };
}
async function exportarBackup() {
  const payload = montarBackup();
  const json = JSON.stringify(payload, null, 2);
  const marcar = () => { DB.settings.lastBackup = payload.geradoEm; save(); render(); toast('Backup exportado. Salve em OneDrive > Documentos > Folha Zero'); };
  try {
    const file = new File([json], BACKUP_NOME, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Backup Folha Zero', text: 'Salve em OneDrive > Documentos > Folha Zero' });
      return marcar();
    }
  } catch (e) {
    if (e && e.name === 'AbortError') { toast('Compartilhamento cancelado'); return; }
    console.warn('share falhou, usando download', e);
  }
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = BACKUP_NOME; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  marcar();
}
$('#btn-exportar').onclick = exportarBackup;
$('#btn-importar').onclick = () => { $('#file-import').value = ''; $('#file-import').click(); };
$('#file-import').onchange = async ev => {
  const f = ev.target.files[0]; if (!f) return;
  let obj;
  try { obj = JSON.parse(await f.text()); } catch (e) { return modal('Arquivo inválido', '<p>Não foi possível ler este arquivo de backup.</p>', [{ label: 'OK', value: 1, cls: 'primary' }]); }
  const data = obj && obj.app === 'folha-zero' && obj.data ? obj.data : null;
  if (!data || !Array.isArray(data.entries)) return modal('Arquivo inválido', '<p>Este arquivo não é um backup do Folha Zero.</p>', [{ label: 'OK', value: 1, cls: 'primary' }]);
  const ok = await confirmar('Substituir dados?', `<p>O backup de <b>${(obj.geradoEm || obj.exportedAt) ? new Date(obj.geradoEm || obj.exportedAt).toLocaleString('pt-BR') : 'data desconhecida'}</b> tem <b>${data.entries.length}</b> lançamento(s).</p><p>Os <b>${DB.entries.length}</b> lançamento(s) atuais deste aparelho serão <b>substituídos</b>.</p>`, 'Substituir', 'danger');
  if (!ok) return;
  DB = normalize(data); // o backup leva junto a data de início do teste grátis (se houver)
  save(); render(); toast('Backup restaurado');
};

/* ---------- relatórios ---------- */
function renderRelatorios() {
  const grp = $('#r-grp').value, emp = $('#r-empresa').value;
  const list = DB.entries.filter(e => e.dataTermino && (!emp || e.empresa === emp));
  const m = {};
  const qLabel = (ym, qq) => `${qq}ª ${ym.slice(5, 7)}/${ym.slice(0, 4)}`;
  const grupo = (empresa, ym, qq, setor) => {
    if (grp === 'quinzena') return [`${ym}-${qq}`, qLabel(ym, qq)];
    if (grp === 'mes') return [ym, `${MESES[+ym.slice(5) - 1]} ${ym.slice(0, 4)}`];
    if (grp === 'empresa') return [empresa, empresa];
    return [setor, setor];
  };
  let impTotal = 0;
  const get = (k, label) => (m[k] = m[k] || { label, n: 0, bruto: 0, ajudante: 0, desconto: 0, sv: 0 });
  list.forEach(e => {
    const d = +e.dataTermino.slice(8);
    const [k, label] = grupo(e.empresa, e.dataTermino.slice(0, 7), d <= 15 ? 1 : 2, e.setor);
    const g = get(k, label); g.n++; g.bruto += e.valor || 0; g.ajudante += e.ajudante || 0; if (e.valor == null) g.sv++;
    const imp = (e.valor || 0) * getAliquota(e.empresa) / 100; g.desconto += imp; impTotal += imp;
  });
  let descTotal = impTotal;
  Object.entries(DB.descontos).forEach(([key, v]) => {
    const [empresa, ym, qq] = key.split('|');
    if (emp && empresa !== emp) return;
    descTotal += v;
    if (grp === 'setor') return; // desconto é por empresa e quinzena, não por setor
    const [k, label] = grupo(empresa, ym, +qq, '');
    get(k, label).desconto += v;
  });
  let keys = Object.keys(m);
  if (grp === 'quinzena' || grp === 'mes') keys.sort().reverse();
  else if (grp === 'setor') keys = SETORES.filter(s => m[s]);
  else keys = EMPRESAS.filter(s => m[s]);
  const liq = g => r2(g.bruto - g.ajudante - g.desconto);
  const max = Math.max(1, ...keys.map(k => m[k].bruto));
  const tb = soma(list), ta = somaAj(list);
  $('#r-resumo').innerHTML = `${list.length} ${list.length === 1 ? 'carro finalizado' : 'carros finalizados'}` + totaisHtml({ bruto: r2(tb), ajudante: r2(ta), desconto: r2(descTotal), liquido: r2(tb - ta - descTotal) });
  $('#r-out').innerHTML = keys.length ? `<div class="card">${keys.map(k => { const g = m[k]; return `<div class="rel-row"><div class="h"><span>${esc(g.label)}</span><span>${fmtValor(liq(g))}</span></div>
    <div class="s">${g.n} ${g.n === 1 ? 'carro' : 'carros'} · bruto ${fmtValor(g.bruto)} · ajudante ${fmtValor(g.ajudante)} · desconto ${fmtValor(g.desconto)}${g.sv ? ` · ${g.sv} sem valor` : ''}</div>
    <div class="bar"><i style="width:${Math.round(g.bruto / max * 100)}%"></i></div></div>`; }).join('')}</div>` +
    (grp === 'setor' ? '<p class="hint">Por setor, o desconto mostrado é só o imposto. Outros descontos são por empresa e quinzena e entram só no total acima.</p>' : '<p class="hint">Valor da direita: líquido (bruto menos ajudante menos imposto e outros descontos).</p>')
    : '<p class="empty">Ainda não há carros finalizados. Use Lançar ou Carregar exemplo em Empresas.</p>';
}

/* ---------- relatório do mês (produtividade) ----------
   Como a planilha Produção: carros finalizados no mês pela data término, tempo na linha
   (término menos início), média, maior e menor tempo, dia mais forte e carros parados. */
function relatorioMes(ano, mes, emp) {
  DB.entries.forEach(normEntry);
  const ym = `${ano}-${pad(mes)}`, hoje = hojeISO();
  const fin = DB.entries.filter(e => e.dataTermino && e.dataTermino.slice(0, 7) === ym && (!emp || e.empresa === emp))
    .sort((a, b) => (a.dataTermino + (a.horaTermino || '') + a.os).localeCompare(b.dataTermino + (b.horaTermino || '') + b.os))
    .map(e => ({ e, d: duracaoUtil(e) }));
  const n = fin.length, totalMin = fin.reduce((s, x) => s + x.d.min, 0);
  const todasComHoras = n > 0 && fin.every(x => x.d.horas);
  const media = n ? { min: totalMin / n, horas: todasComHoras } : null;
  let rapido = null, lento = null;
  fin.forEach(x => { if (!rapido || x.d.min < rapido.d.min) rapido = x; if (!lento || x.d.min > lento.d.min) lento = x; });
  const semana = [0, 0, 0, 0, 0, 0, 0], porData = {};
  fin.forEach(x => { semana[new Date(isoUTC(x.e.dataTermino)).getUTCDay()]++; porData[x.e.dataTermino] = (porData[x.e.dataTermino] || 0) + 1; });
  const maxSem = Math.max(0, ...semana), diasSemanaTop = maxSem ? DIAS_SEMANA.filter((_, i) => semana[i] === maxSem) : [];
  let melhorData = null; Object.keys(porData).sort().forEach(k => { if (!melhorData || porData[k] > melhorData.n) melhorData = { data: k, n: porData[k] }; });
  const parados = DB.entries.filter(e => !e.dataTermino && (!emp || e.empresa === emp) && e.dataInicio <= `${ym}-${pad(ultimoDia(ano, mes))}`)
    .map(e => { const dias = Math.max(0, diffDias(e.dataInicio, hoje)); if (!e.horaInicio) return { e, dias, d: { min: dias * 1440, horas: false } };
      const a0 = dtMin(`${e.dataInicio}T${e.horaInicio}`), b0 = dtMin(agoraDT()), f = foraMin(e, a0, b0); // v19: parado até agora sem o fora do expediente
      return { e, dias, d: { min: Math.max(0, b0 - a0 - f), horas: true, util: f > 0, fora: f } }; })
    .sort((a, b) => b.dias - a.dias || b.d.min - a.d.min || a.e.os.localeCompare(b.e.os));
  const porSituacao = {}; SITUACOES.forEach(s => porSituacao[s] = 0);
  porSituacao[SIT_FIN] = n; parados.forEach(x => porSituacao[x.e.situacao]++);
  const pausas = consolidadoPausas(fin), temFora = fin.some(x => x.d.util);
  return { ano, mes, emp: emp || '', temFora, fin, n, media, rapido, lento, semana, diasSemanaTop, maxSem, melhorData, parados, porSituacao, pausas,
    bruto: r2(soma(fin.map(x => x.e))), semValor: fin.filter(x => x.e.valor == null).length, comHoras: fin.filter(x => x.d.horas).length };
}
/* v17: consolidado de produção e pausas dos carros finalizados no mês.
   Produção = (término menos início) menos as pausas, só para carros com hora início e hora término.
   As pausas têm data e hora próprias, então entram no total de pausas mesmo em carros sem hora. */
function consolidadoPausas(fin) {
  const carros = fin.map(x => {
    const e = x.e, temHora = !!(e.horaInicio && e.horaTermino && x.d.horas);
    const a0 = temHora ? dtMin(`${e.dataInicio}T${e.horaInicio}`) : null, b0 = temHora ? dtMin(`${e.dataTermino}T${e.horaTermino}`) : null;
    const porMotivo = {}; let pausaMin = 0, qtd = 0, foraMin = 0, foraQtd = 0; // por chave do motivo (digitados agrupados pelo texto); fim de expediente separado
    (e.pausas || []).forEach(p => {
      if (!p.fim) return;
      let a = dtMin(p.inicio), b = dtMin(p.fim);
      if (temHora) { a = Math.max(a, a0); b = Math.min(b, b0); }
      const m = Math.max(0, b - a); if (ehFimExp(p)) { foraMin += m; foraQtd++; } else { pausaMin += m; qtd++; }
      const k = chaveMotivo(p); const pm = porMotivo[k] = porMotivo[k] || { min: 0, qtd: 0 }; pm.min += m; pm.qtd++;
    });
    const totalMin = temHora ? (x.d.bruto != null ? x.d.bruto : x.d.min) : null; // término menos início (bruto)
    return { e, temHora, totalMin, prodMin: temHora ? Math.max(0, totalMin - pausaMin - foraMin) : null, pausaMin, qtd, foraMin, foraQtd, porMotivo };
  });
  /* v18: motivos digitados aparecem com o texto da primeira vez (pela data da pausa), depois dos motivos da lista */
  const rotulo = {}; carros.flatMap(c => (c.e.pausas || []).filter(p => p.fim)).sort((a, b) => a.inicio.localeCompare(b.inicio))
    .forEach(p => { const k = chaveMotivo(p); if (!(k in rotulo)) rotulo[k] = ehOutro(p) ? String(p.motivo).replace(/\s+/g, ' ').trim() : p.motivo; });
  carros.forEach(c => Object.keys(c.porMotivo).forEach(k => { c.porMotivo[k].motivo = rotulo[k] || k; c.porMotivo[k].outro = k.startsWith('outro:'); c.porMotivo[k].fimExp = k === MOTIVO_FIM; }));
  const ordem = MOTIVOS_PAUSA.slice(); Object.keys(rotulo).forEach(k => { if (!ordem.includes(k) && k !== MOTIVO_FIM) ordem.push(k); }); ordem.push(MOTIVO_FIM); // fim de expediente por último
  const motivos = ordem.map(k => ({ motivo: rotulo[k] || k, outro: k.startsWith('outro:'), fimExp: k === MOTIVO_FIM, min: carros.reduce((s, c) => s + (c.porMotivo[k] ? c.porMotivo[k].min : 0), 0), qtd: carros.reduce((s, c) => s + (c.porMotivo[k] ? c.porMotivo[k].qtd : 0), 0) })).filter(m => m.qtd);
  const com = carros.filter(c => c.temHora);
  return { carros, motivos, prodMin: com.reduce((s, c) => s + c.prodMin, 0), totalMin: com.reduce((s, c) => s + c.totalMin, 0),
    pausaMin: carros.reduce((s, c) => s + c.pausaMin, 0), qtd: carros.reduce((s, c) => s + c.qtd, 0), foraMin: carros.reduce((s, c) => s + c.foraMin, 0), foraQtd: carros.reduce((s, c) => s + c.foraQtd, 0), comHora: com.length, semHora: carros.length - com.length };
}
const motivosTxt = (c, semFim) => Object.values(c.porMotivo).filter(m => !(semFim && m.fimExp)).sort((a, b) => (a.fimExp ? 1 : 0) - (b.fimExp ? 1 : 0)).map(m => `${m.motivo} ${fmtDiaHora(m.min)}${m.qtd > 1 ? ` (${m.qtd}x)` : ''}`).join('; ');
const fmtMedia = m => !m ? 'sem dados' : fmtDiaHora(Math.round(m.min));
const carroTxt = x => `OS ${x.e.os} · ${x.e.veiculo}`;
function diaSemanaNome(iso) { return DIAS_SEMANA[new Date(isoUTC(iso)).getUTCDay()].toLowerCase(); }
/* v20: Semana (segunda a domingo, recortada no mês), Quinzena (1ª e 2ª) e Mês.
   O seletor muda só o gráfico por dia e a situação dos carros. O restante e o PDF seguem o mês.
   O estado fica na memória: não entra em folhazero_v1. */
let RPER = { modo: 'mes', idx: 0 };
function isoDia(ano, mes, dia) { return `${ano}-${pad(mes)}-${pad(dia)}`; }
function fmtDiaMes(iso) { const p = iso.split('-'); return `${p[2]}/${p[1]}`; }
function fatiasDoMes(ano, mes) {
  const ultimo = ultimoDia(ano, mes);
  const semanas = [];
  let d = 1;
  while (d <= ultimo) {
    const dow = new Date(Date.UTC(ano, mes - 1, d)).getUTCDay();
    const fim = Math.min(ultimo, d + (dow === 0 ? 0 : 7 - dow));
    semanas.push({ ini: isoDia(ano, mes, d), fim: isoDia(ano, mes, fim) });
    d = fim + 1;
  }
  return {
    semanas,
    quinzenas: [
      { ini: isoDia(ano, mes, 1), fim: isoDia(ano, mes, Math.min(15, ultimo)), qual: '1ª' },
      { ini: isoDia(ano, mes, Math.min(16, ultimo)), fim: isoDia(ano, mes, ultimo), qual: '2ª' }
    ],
    mes: [{ ini: isoDia(ano, mes, 1), fim: isoDia(ano, mes, ultimo) }]
  };
}
function listaDoModo(fatias, modo) {
  if (modo === 'semana') return fatias.semanas;
  if (modo === 'quinzena') return fatias.quinzenas;
  return fatias.mes;
}
function idxPadrao(ano, mes, modo) {
  const lista = listaDoModo(fatiasDoMes(ano, mes), modo);
  const hoje = hojeISO();
  const i = lista.findIndex(f => hoje >= f.ini && hoje <= f.fim);
  return i >= 0 ? i : 0;
}
function textoPeriodo(fatia, modo) {
  const intervalo = `${fmtDiaMes(fatia.ini)} a ${fmtDiaMes(fatia.fim)}`;
  if (modo === 'quinzena') return `${fatia.qual} quinzena: ${intervalo}`;
  return `Período: ${intervalo}`;
}
function statsNoIntervalo(R, ini, fim) {
  const semana = [0, 0, 0, 0, 0, 0, 0], porData = {};
  let nFin = 0;
  R.fin.forEach(x => {
    const dt = x.e.dataTermino;
    if (dt < ini || dt > fim) return;
    nFin++;
    semana[new Date(isoUTC(dt)).getUTCDay()]++;
    porData[dt] = (porData[dt] || 0) + 1;
  });
  const maxSem = Math.max(0, ...semana);
  const diasSemanaTop = maxSem ? DIAS_SEMANA.filter((_, i) => semana[i] === maxSem) : [];
  let melhorData = null;
  Object.keys(porData).sort().forEach(k => { if (!melhorData || porData[k] > melhorData.n) melhorData = { data: k, n: porData[k] }; });
  const porSituacao = {};
  SITUACOES.forEach(s => porSituacao[s] = 0);
  porSituacao[SIT_FIN] = nFin;
  R.parados.forEach(x => { if (x.e.dataInicio <= fim) porSituacao[x.e.situacao]++; });
  return { ini, fim, semana, maxSem, diasSemanaTop, melhorData, porSituacao, nFin };
}
function renderRelMes() {
  const R = relatorioMes(+$('#rm-ano').value, +$('#rm-mes').value, $('#rm-empresa').value);
  const titulo = `${MESES[R.mes - 1]} de ${R.ano}${R.emp ? ' · ' + R.emp : ''}`;
  let h = `<div class="card"><h2>${esc(titulo)}</h2><div class="nums three">
    <div class="num"><b id="rm-n">${R.n}</b><span>${R.n === 1 ? 'carro finalizado' : 'carros finalizados'}</span></div>
    <div class="num"><b id="rm-media">${esc(fmtMedia(R.media))}</b><span>${R.temFora ? 'tempo médio útil por carro' : 'tempo médio por carro'}</span></div>
    <div class="num"><b id="rm-abertos">${R.parados.length}</b><span>${R.parados.length === 1 ? 'carro em aberto' : 'carros em aberto'}</span></div></div>
    <p class="hint">Bruto dos finalizados no mês: <b>${fmtValor(R.bruto)}</b>${R.semValor ? ` (${R.semValor} sem valor)` : ''}. Tempo = data término menos data início; com hora início e hora término o tempo sai em horas (${R.comHoras} de ${R.n}).</p></div>`;
  const P = R.pausas;
  h += `<div class="card" id="rm-consolidado"><h2>Produção e pausas</h2><div class="nums three">
    <div class="num"><b id="rm-prod">${R.n ? fmtDiaHora(P.prodMin) : '0min'}</b><span>tempo de produção</span></div>
    <div class="num"><b id="rm-pausa">${fmtDiaHora(P.pausaMin)}</b><span>tempo de pausa</span></div>
    <div class="num"><b id="rm-npausas">${P.qtd}</b><span>${P.qtd === 1 ? 'pausa' : 'pausas'}</span></div></div>
    <div class="nums fora-exp"><div class="num"><b id="rm-fora">${fmtDiaHora(P.foraMin)}</b><span>fora do expediente</span></div><div class="num"><b id="rm-nfora">${P.foraQtd}</b><span>${P.foraQtd === 1 ? 'fim de expediente' : 'fins de expediente'}</span></div></div>
    <h3 class="sub">Pausa por motivo</h3><div id="rm-motivos">${P.motivos.length ? P.motivos.map(m => `<div class="pz-mot${m.fimExp ? ' pz-mot-fim' : ''}">${motivoChip(m.motivo, m.outro, m.fimExp)}<span>${m.qtd} ${m.fimExp ? (m.qtd === 1 ? 'vez' : 'vezes') : m.qtd === 1 ? 'pausa' : 'pausas'}</span><b>${fmtDiaHora(m.min)}</b></div>`).join('') : '<p class="empty">Nenhuma pausa nos carros finalizados neste mês.</p>'}</div>
    <h3 class="sub">Por carro</h3><div id="rm-pausas-carros">${R.n ? P.carros.map(c => `<div class="mini"><div><div class="t">OS ${esc(c.e.os)} · ${esc(c.e.veiculo)}</div><div class="s">${c.temHora ? `Produção <b>${fmtDiaHora(c.prodMin)}</b> · ` : 'Produção: sem hora · '}Pausa <b>${fmtDiaHora(c.pausaMin)}</b> (${c.qtd} ${c.qtd === 1 ? 'pausa' : 'pausas'})${c.foraQtd ? ` · Fora do expediente <b>${fmtDiaHora(c.foraMin)}</b> (${c.foraQtd}x)` : ''}${c.qtd || c.foraQtd ? '<br>' + esc(motivosTxt(c)) : ''}</div></div></div>`).join('') : '<p class="empty">Nenhum carro finalizado neste mês.</p>'}</div>
    <p class="hint">Produção = término menos início, descontando as pausas e o fora do expediente. Tempo de pausa conta só os problemas e outros motivos; fim de expediente fica em Fora do expediente. Só entram na produção os carros com hora início e hora término (${P.comHora} de ${R.n})${P.semHora ? `; ${P.semHora} sem hora mostram só as pausas` : ''}.</p></div>`;
  if (R.n) {
    h += `<div class="card"><h2>Maior e menor tempo</h2>
      <div class="rel-row" id="rm-rapido"><div class="h"><span>Mais rápido</span><span>${esc(fmtDiaHora(R.rapido.d))}${R.rapido.d.util ? ' (tempo útil)' : ''}</span></div><div class="s">${esc(carroTxt(R.rapido))} · ${esc(R.rapido.e.empresa)} · término ${fmtData(R.rapido.e.dataTermino)}</div></div>
      <div class="rel-row" id="rm-lento"><div class="h"><span>Mais demorado</span><span>${esc(fmtDiaHora(R.lento.d))}${R.lento.d.util ? ' (tempo útil)' : ''}</span></div><div class="s">${esc(carroTxt(R.lento))} · ${esc(R.lento.e.empresa)} · término ${fmtData(R.lento.e.dataTermino)}</div></div></div>`;
  }
  const fatias = fatiasDoMes(R.ano, R.mes);
  const listaPer = listaDoModo(fatias, RPER.modo);
  if (RPER.idx > listaPer.length - 1) RPER.idx = listaPer.length - 1;
  if (RPER.idx < 0) RPER.idx = 0;
  const fatia = listaPer[RPER.idx];
  const S = statsNoIntervalo(R, fatia.ini, fatia.fim);
  const hintDias = S.nFin
    ? `Dia da semana mais forte: <b>${esc(S.diasSemanaTop.join(', '))}</b> (${S.maxSem} ${S.maxSem === 1 ? 'carro' : 'carros'}). Melhor dia: <b>${fmtData(S.melhorData.data)}</b> (${diaSemanaNome(S.melhorData.data)}), ${S.melhorData.n} ${S.melhorData.n === 1 ? 'carro' : 'carros'}.`
    : 'Nenhum carro finalizado neste período.';
  h += `<div class="card" id="rm-periodo-card"><div class="rm-per-head"><h2>Por dia da semana</h2><div class="seg compact" id="rm-per-seg" role="tablist" aria-label="Período do gráfico">${['semana', 'quinzena', 'mes'].map(modo => {
    const rotulo = modo === 'semana' ? 'Semana' : modo === 'quinzena' ? 'Quinzena' : 'Mês';
    const on = RPER.modo === modo;
    return `<button type="button" data-modo="${modo}" role="tab" aria-selected="${on ? 'true' : 'false'}" class="${on ? 'active' : ''}">${rotulo}</button>`;
  }).join('')}</div></div>
    <div class="rm-per-nav"><button type="button" class="btn ghost small rm-per-seta" id="rm-per-prev" aria-label="Período anterior"${RPER.idx <= 0 ? ' disabled' : ''}>‹</button><div class="rm-per-intervalo" id="rm-per-intervalo">${esc(textoPeriodo(fatia, RPER.modo))}</div><button type="button" class="btn ghost small rm-per-seta" id="rm-per-next" aria-label="Próximo período"${RPER.idx >= listaPer.length - 1 ? ' disabled' : ''}>›</button></div>
    <div id="rm-semana">${[1, 2, 3, 4, 5, 6, 0].map(i => `<div class="wk-row${S.semana[i] && S.semana[i] === S.maxSem ? ' top' : ''}"><span>${DIAS_SEMANA[i]}</span><div class="bar"><i style="width:${S.maxSem ? Math.round(S.semana[i] / S.maxSem * 100) : 0}%"></i></div><b>${S.semana[i]}</b></div>`).join('')}</div>
    <p class="hint" id="rm-melhor">${hintDias}</p></div>`;
  const hintSit = RPER.modo === 'mes'
    ? 'Finalizado conta os carros finalizados no mês. As outras situações contam os carros ainda em aberto.'
    : 'Finalizado conta os carros com término neste período. As outras situações contam os carros ainda em aberto que já tinham começado até o fim do período.';
  h += `<div class="card"><h2>Situação dos carros</h2><div class="sit-grid" id="rm-situacoes">${SITUACOES.map(s => `<div class="sit-cnt">${sitChip(s)}<b>${S.porSituacao[s]}</b></div>`).join('')}</div>
    <p class="hint" id="rm-sit-hint">${hintSit}</p></div>`;
  h += `<div class="card"><h2>Carros parados <span class="badge">${R.parados.length}</span></h2><div id="rm-parados">${R.parados.length ? R.parados.map(x => `<div class="mini${x.e.situacao === SIT_DESTAQUE ? ' is-etapa' : ''}"><div><div class="t">${esc(carroTxt(x))}</div><div class="s">${esc(x.e.empresa)} · ${esc(x.e.setor)} · início ${fmtDataHora(x.e.dataInicio, x.e.horaInicio)}</div>${sitChip(x.e.situacao)}</div><div class="s parado-tempo"><b>${esc(fmtDiaHora(x.d))}</b><br>${x.d.util ? 'parado (tempo útil)' : 'parado'}</div></div>`).join('') : '<p class="empty">Nenhum carro parado.</p>'}</div></div>`;
  h += `<div class="card"><h2>Tempo por carro</h2>${R.temFora ? '<p class="hint" id="rm-util-hint">Tempo útil: término menos início sem o fora do expediente (fim de expediente).</p>' : ''}<div id="rm-lista">${R.n ? R.fin.map(x => `<div class="mini"><div><div class="t">${esc(carroTxt(x))}</div><div class="s">${esc(x.e.empresa)} · ${esc(x.e.setor)} · ${fmtDataHora(x.e.dataInicio, x.e.horaInicio)} até ${fmtDataHora(x.e.dataTermino, x.e.horaTermino)}</div></div><div class="s parado-tempo"><b>${esc(fmtDiaHora(x.d))}</b>${x.d.util ? '<br>tempo útil' : ''}</div></div>`).join('') : '<p class="empty">Nenhum carro finalizado neste mês.</p>'}</div></div>`;
  $('#rm-out').innerHTML = h;
}
function gerarPdfRelatorio() {
  const R = relatorioMes(+$('#rm-ano').value, +$('#rm-mes').value, $('#rm-empresa').value);
  const doc = novoDoc();
  const fit = (t, w) => { let s = String(t == null ? '' : t); while (s && doc.getTextWidth(s) > w - 2) s = s.slice(0, -1); return s; };
  let y = 0, pg = 1;
  const cab = () => {
    doc.setTextColor(0); doc.setDrawColor(0);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text('RELATÓRIO DO MÊS', 10, 18);
    doc.setFontSize(10); doc.setTextColor(70); doc.text(`${MESES[R.mes - 1].toUpperCase()} DE ${R.ano}`, 200, 18, { align: 'right' });
    doc.setTextColor(0); doc.setFontSize(9);
    doc.setFont('helvetica', 'bold'); doc.text('Operador:', 10, 25); doc.text('Empresa:', 120, 25);
    doc.setFont('helvetica', 'normal'); doc.text(fit(DB.settings.operador, 90), 26, 25); doc.text(fit(R.emp || 'Todas', 64), 135, 25);
    doc.setLineWidth(0.4); doc.line(10, 28, 200, 28); y = 35;
  };
  const rod = () => { doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(70); doc.text(`Folha Zero · gerado em ${fmtData(hojeISO())} ${agoraHM()}`, 10, 287); doc.text(`Página ${pg}`, 200, 287, { align: 'right' }); doc.setTextColor(0); };
  const precisa = h => { if (y + h > 278) { rod(); doc.addPage(); pg++; cab(); } };
  const secao = t => { precisa(14); doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text(t, 10, y); y += 2; doc.setLineWidth(0.2); doc.line(10, y, 200, y); y += 5; };
  const tabela = (cols, rows) => {
    const rh = 6.4;
    const linha = (vals, bold) => { precisa(rh); let x = 10; doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(bold ? 8 : 9);
      vals.forEach((v, i) => { doc.setLineWidth(0.3); doc.rect(x, y, cols[i].w, rh); const t = fit(v, cols[i].w); if (cols[i].c) doc.text(t, x + cols[i].w / 2, y + rh / 2 + 1.2, { align: 'center' }); else doc.text(t, x + 1.5, y + rh / 2 + 1.2); x += cols[i].w; }); y += rh; };
    linha(cols.map(c => c.t), true); rows.forEach(r => linha(r, false)); y += 4;
  };
  cab();
  secao('Resumo');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  [[`Carros finalizados no mês: ${R.n}`, `${R.temFora ? 'Tempo médio útil por carro' : 'Tempo médio por carro'}: ${fmtMedia(R.media)}`], [`Carros em aberto: ${R.parados.length}`, `Bruto dos finalizados: ${fmtValor(R.bruto)}${R.semValor ? ` (${R.semValor} sem valor)` : ''}`]]
    .forEach(([a, b]) => { doc.text(a, 10, y); doc.text(b, 105, y); y += 6; });
  if (R.n) {
    doc.text(`Mais rápido: ${fmtDiaHora(R.rapido.d)}${R.rapido.d.util ? ' (tempo útil)' : ''} · ${carroTxt(R.rapido)} · ${R.rapido.e.empresa}`, 10, y); y += 6;
    doc.text(`Mais demorado: ${fmtDiaHora(R.lento.d)}${R.lento.d.util ? ' (tempo útil)' : ''} · ${carroTxt(R.lento)} · ${R.lento.e.empresa}`, 10, y); y += 6;
    doc.text(`Dia da semana mais forte: ${R.diasSemanaTop.join(', ')} (${R.maxSem} ${R.maxSem === 1 ? 'carro' : 'carros'}) · Melhor dia: ${fmtData(R.melhorData.data)} (${R.melhorData.n} ${R.melhorData.n === 1 ? 'carro' : 'carros'})`, 10, y); y += 8;
    secao('Carros finalizados por dia da semana');
    tabela([1, 2, 3, 4, 5, 6, 0].map(i => ({ t: DIAS_SEMANA[i].toUpperCase(), w: 190 / 7, c: true })), [[1, 2, 3, 4, 5, 6, 0].map(i => String(R.semana[i]))]);
  }
  const P = R.pausas;
  secao('Produção e pausas');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text(`Tempo total de produção: ${fmtDiaHora(P.prodMin)}`, 10, y); doc.text(`Tempo total de pausa: ${fmtDiaHora(P.pausaMin)} (${P.qtd} ${P.qtd === 1 ? 'pausa' : 'pausas'})`, 105, y); y += 6;
  doc.text(`Fora do expediente: ${fmtDiaHora(P.foraMin)} (${P.foraQtd} ${P.foraQtd === 1 ? 'fim de expediente' : 'fins de expediente'})`, 10, y); y += 6;
  doc.setFontSize(8); doc.setTextColor(70);
  doc.text(fit(`Produção = término menos início, sem pausas e fora do expediente. Carros com hora início e término: ${P.comHora} de ${R.n}.${P.semHora ? ` Sem hora (só pausas): ${P.semHora}.` : ''}`, 190), 10, y); doc.setTextColor(0); y += 6;
  if (P.motivos.length) tabela([{ t: 'MOTIVO DA PAUSA', w: 110 }, { t: 'PAUSAS', w: 30, c: true }, { t: 'TEMPO', w: 50, c: true }], P.motivos.map(m => [m.fimExp ? 'Fim de expediente (fora do expediente)' : m.motivo, String(m.qtd), fmtDiaHora(m.min)]));
  else { doc.setFontSize(10); doc.text('Nenhuma pausa nos carros finalizados neste mês.', 10, y); y += 8; }
  if (R.n) tabela([{ t: 'OS', w: 17, c: true }, { t: 'VEÍCULO', w: 28 }, { t: 'PRODUÇÃO', w: 21, c: true }, { t: 'PAUSA', w: 18, c: true }, { t: 'PAUSAS', w: 14, c: true }, { t: 'FORA EXP.', w: 20, c: true }, { t: 'MOTIVOS', w: 72 }],
    P.carros.map(c => [c.e.os, c.e.veiculo, c.temHora ? fmtDiaHora(c.prodMin) : 'sem hora', fmtDiaHora(c.pausaMin), String(c.qtd), c.foraQtd ? fmtDiaHora(c.foraMin) : '0min', motivosTxt(c, true)]));
  secao('Situação dos carros');
  tabela([{ t: 'SITUAÇÃO', w: 120 }, { t: 'CARROS', w: 30, c: true }], SITUACOES.map(s => [s, String(R.porSituacao[s])]));
  secao('Carros parados (não finalizados)');
  if (R.parados.length) tabela([{ t: 'OS', w: 20, c: true }, { t: 'VEÍCULO', w: 38 }, { t: 'EMPRESA', w: 32 }, { t: 'INÍCIO', w: 24, c: true }, { t: 'SITUAÇÃO', w: 46 }, { t: R.parados.some(x => x.d.util) ? 'PARADO (ÚTIL)' : 'TEMPO PARADO', w: 30, c: true }],
    R.parados.map(x => [x.e.os, x.e.veiculo, x.e.empresa, fmtDataHora(x.e.dataInicio, x.e.horaInicio), x.e.situacao, fmtDiaHora(x.d)]));
  else { doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.text('Nenhum carro parado.', 10, y); y += 8; }
  secao('Tempo por carro');
  if (R.n) tabela([{ t: 'OS', w: 22, c: true }, { t: 'VEÍCULO', w: 44 }, { t: 'EMPRESA', w: 38 }, { t: 'INÍCIO', w: 29, c: true }, { t: 'TÉRMINO', w: 29, c: true }, { t: R.temFora ? 'TEMPO ÚTIL' : 'TEMPO', w: 28, c: true }],
    R.fin.map(x => [x.e.os, x.e.veiculo, x.e.empresa, fmtDataHora(x.e.dataInicio, x.e.horaInicio), fmtDataHora(x.e.dataTermino, x.e.horaTermino), fmtDiaHora(x.d)]));
  else { doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.text('Nenhum carro finalizado neste mês.', 10, y); y += 8; }
  rod();
  return { doc, nome: `Relatorio-${R.ano}-${pad(R.mes)}${R.emp ? '-' + R.emp.replace(/\s+/g, '-') : ''}.pdf` };
}
$('#rm-pdf').onclick = () => { try { const { doc, nome } = gerarPdfRelatorio(); baixarDoc(doc, nome); } catch (e) { console.error(e); toast('Não foi possível gerar o PDF'); } };
$('#rm-out').addEventListener('click', ev => {
  const modoBtn = ev.target.closest('#rm-per-seg [data-modo]');
  if (modoBtn) {
    const modo = modoBtn.getAttribute('data-modo');
    if (modo !== RPER.modo) {
      RPER.modo = modo;
      RPER.idx = idxPadrao(+$('#rm-ano').value, +$('#rm-mes').value, modo);
    }
    renderRelMes();
    return;
  }
  if (ev.target.closest('#rm-per-prev')) { RPER.idx -= 1; renderRelMes(); return; }
  if (ev.target.closest('#rm-per-next')) { RPER.idx += 1; renderRelMes(); }
});

/* ---------- exemplo e limpar ---------- */
function addDias(iso, n) { const [y, m, d] = iso.split('-').map(Number); const t = new Date(y, m - 1, d + n); return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`; }
function dadosExemplo() {
  const veic = ['Toyota Hilux SW4', 'Jeep Compass', 'BMW X5', 'Range Rover Evoque', 'Corolla Cross', 'Mercedes GLC', 'Audi Q5', 'Jeep Commander', 'Toyota SW4', 'Porsche Macan', 'BMW X3', 'Volvo XC60'];
  const entries = [], quinzenas = {};
  const at = qAtual(), qs = [qShift(at, -2), qShift(at, -1), at];
  let os = 900100, seq = 0;
  qs.forEach((o, qi) => {
    const p = periodo(o.ano, o.mes, o.q);
    const fim = qi === 2 ? (hojeISO() < p.fim ? hojeISO() : p.fim) : p.fim;
    const span = Math.max(1, +fim.slice(8) - +p.ini.slice(8) + 1);
    EMPRESAS.forEach((emp, ei) => {
      const n = qi === 1 && ei === 0 ? 19 : qi === 2 ? (ei < 3 ? 2 : 1) : 2 + ((ei + qi) % 3);
      for (let i = 0; i < n; i++) {
        seq++;
        const termino = addDias(p.ini, (i + ei) % span);
        const inicio = addDias(termino, -(1 + seq % 3));
        const aberto = qi === 2 && i === 0;
        entries.push({ id: uid(), empresa: emp, setor: ei === 0 ? 'Tapeçaria' : SETORES[(seq * 3 + ei) % SETORES.length], dataInicio: inicio, dataTermino: aberto ? null : termino,
          os: String(os++), veiculo: veic[seq % veic.length], valor: seq % 11 === 0 ? null : (ei === 0 ? 510 : 300 + (seq % 5) * 40), ajudante: seq % 4 === 0 ? 80 : null, obs: seq % 6 === 0 ? 'dados de exemplo' : '', exemplo: true, createdAt: Date.now() - (200 - seq) * 60000, updatedAt: Date.now(),
          horaInicio: seq % 2 ? `${pad(7 + seq % 3)}:${seq % 4 ? '00' : '30'}` : null, horaTermino: !aberto && seq % 2 ? `${pad(13 + seq % 5)}:00` : null,
          situacao: aberto ? SITUACOES[ei % (SITUACOES.length - 1)] : SIT_FIN });
        const ult = entries[entries.length - 1];
        ult.pausas = aberto && MOTIVOS_PAUSA.includes(ult.situacao) ? [{ motivo: ult.situacao, inicio: `${inicio}T10:00`, fim: null }]
          : !aberto && ult.horaInicio && seq % 3 === 0 ? [{ motivo: MOTIVOS_PAUSA[seq % MOTIVOS_PAUSA.length], inicio: `${inicio}T11:00`, fim: `${inicio}T12:30` }] : [];
      }
      quinzenas[qKey(emp, qs[0].ano, qs[0].mes, qs[0].q)] = 'Paga';
      quinzenas[qKey(emp, qs[1].ano, qs[1].mes, qs[1].q)] = ['Entregue', 'Assinada', 'Aberta', 'Aberta', 'Entregue'][ei];
    });
  });
  const descontos = { [qKey(EMPRESAS[0], qs[1].ano, qs[1].mes, qs[1].q)]: 150 };
  return { entries, quinzenas, descontos };
}
$('#btn-exemplo').onclick = async () => {
  if (DB.entries.length) {
    const ok = await confirmar('Carregar exemplo?', `<p>Os dados de exemplo <b>substituem</b> os ${DB.entries.length} lançamento(s) e status atuais. Faça um backup antes se precisar deles.</p>`, 'Sim, carregar exemplo', 'danger');
    if (!ok) return;
  }
  const ex = dadosExemplo();
  DB.entries = ex.entries; DB.quinzenas = ex.quinzenas; DB.descontos = ex.descontos; save(); render(); toast('Dados de exemplo carregados');
};
$('#btn-limpar').onclick = async () => {
  const ok = await confirmar('Apagar todos os dados?', `<p>Isso apaga <b>todos</b> os ${DB.entries.length} lançamento(s), status e descontos das quinzenas deste aparelho. Não dá para desfazer.</p><p>Nome do operador e valores padrão são mantidos.</p>`, 'Sim, apagar tudo', 'danger');
  if (!ok) return;
  DB.entries = []; DB.quinzenas = {}; DB.descontos = {}; save(); render(); toast('Dados apagados');
};

/* ---------- início ---------- */
resetForm();
renderPainel();
renderBrand();
/* primeira abertura neste aparelho: pede nome e setor do operador */
async function boasVindas() {
  if (DB.settings.operador) return;
  const opts = SETORES.map(s => `<option value="${esc(s)}" ${s === 'Tapeçaria' ? 'selected' : ''}>${esc(s)}</option>`).join('');
  const r = await modal('Bem-vindo ao Folha Zero', `<p>Antes de começar, digite seu nome. Ele sai no cabeçalho e na assinatura do Operador da folha.</p>
    <label>Seu nome<input type="text" id="bv-nome" autocomplete="off" spellcheck="false" placeholder="Nome e sobrenome"></label>
    <label>Seu setor<select id="bv-setor">${opts}</select></label>
    <p class="hint">Dá para mudar depois na aba Empresas, no quadro Operador.</p>`,
    [{ label: 'Começar', cls: 'primary', validate: () => { if (!$('#bv-nome').value.trim()) { toast('Digite seu nome'); return false; } return true; }, collect: () => ({ nome: $('#bv-nome').value.trim(), setor: $('#bv-setor').value }) }]);
  if (r && r.nome) { DB.settings.operador = r.nome; DB.settings.setorOperador = r.setor || 'Tapeçaria'; if (!DB.settings.trialInicio) DB.settings.trialInicio = new Date().toISOString(); save(); render(); toast('Tudo pronto, ' + r.nome.split(' ')[0]); }
}
/* ---------- contador de usuários ----------
   Envia só: id aleatório do aparelho, nome e setor do operador, datas e status da degustação.
   Nunca envia lançamentos, OS, veículos, valores, empresas ou status de quinzena.
   Estado guardado fora do folhazero_v1 (não vai no backup, não muda ao importar backup). */
const CKEY = 'folhazero_contador';
function contadorEstado() { try { const s = JSON.parse(localStorage.getItem(CKEY)); return s && typeof s === 'object' ? s : {}; } catch (_) { return {}; } }
function contadorSalvar(s) { try { localStorage.setItem(CKEY, JSON.stringify(s)); } catch (_) {} }
function contadorId(s) {
  if (!s.id || !/^fz-[0-9a-f]{24}$/.test(s.id)) {
    const a = new Uint8Array(12); crypto.getRandomValues(a);
    s.id = 'fz-' + Array.from(a, b => b.toString(16).padStart(2, '0')).join(''); contadorSalvar(s);
  }
  return s.id;
}
function contadorPayload(tipo, id) {
  const t = trialInfo(), ini = DB.settings.trialInicio;
  return { tipo, id, nome: String(DB.settings.operador || '').slice(0, 80), setor: String(DB.settings.setorOperador || '').slice(0, 40),
    data: hojeISO(), quando: new Date().toISOString(), degustacao: !!t, degustacaoExpirada: !!(t && t.expirado),
    inicioDegustacao: ini ? String(ini).slice(0, 10) : null };
}
async function contadorPost(body) {
  if (MODO_TESTE) return false;
  const opts = { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body, cache: 'no-store', credentials: 'omit', redirect: 'follow' };
  const comPrazo = (o, ms) => { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); return fetch(CONTADOR_URL, Object.assign({}, o, { signal: c.signal })).finally(() => clearTimeout(t)); };
  try { const r = await comPrazo(opts, 15000); return r.ok; }
  catch (e) {
    if (navigator.onLine === false) return false;
    // resposta sem CORS legível: tenta de novo sem ler a resposta
    try { await comPrazo(Object.assign({}, opts, { mode: 'no-cors' }), 15000); return true; } catch (_) { return false; }
  }
}
let contadorOcupado = false;
async function contadorAbertura() {
  if (MODO_TESTE || !CONTADOR_URL || contadorOcupado || !DB.settings.operador) return;
  contadorOcupado = true;
  try {
    const s = contadorEstado(), id = contadorId(s), hoje = hojeISO();
    const assinatura = DB.settings.operador + '|' + DB.settings.setorOperador;
    const tipo = !s.cadastro ? 'cadastro' : (s.uso !== hoje || s.enviado !== assinatura) ? 'uso' : null;
    if (!tipo) return;
    if (await contadorPost(JSON.stringify(contadorPayload(tipo, id)))) {
      const n = contadorEstado(); n.id = id; if (tipo === 'cadastro') n.cadastro = new Date().toISOString();
      n.uso = hoje; n.enviado = assinatura; contadorSalvar(n);
    }
  } catch (e) { console.warn('contador', e); }
  finally { contadorOcupado = false; }
}
boasVindas().then(contadorAbertura).catch(() => {});
/* ---------- atualização automática ----------
   O sw.js novo instala sozinho (skipWaiting + clients.claim). Quando ele assume a página
   ('controllerchange'), recarrega uma vez para já abrir a versão nova. Se a pessoa estiver
   digitando ou com uma janela aberta, mostra um aviso para tocar e atualizar. */
const RELOAD_KEY = 'folhazero_reload_em';
let ATUALIZACAO_PENDENTE = false, RECARREGANDO = false;
function formSujo() {
  if ($('#f-id').value) return true;
  return ['#f-inicio', '#f-hora-inicio', '#f-os', '#f-veiculo', '#f-valor', '#f-ajudante', '#f-obs'].some(s => $(s).value.trim());
}
function usuarioOcupado() {
  if (!$('#modal').classList.contains('hidden') || !$('#qr-modal').classList.contains('hidden')) return true;
  if (currentView() === 'lancar' && formSujo()) return true;
  const a = document.activeElement;
  return !!(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== 'file');
}
function mostrarAvisoAtualizacao() { ATUALIZACAO_PENDENTE = true; $('#upd-banner').classList.remove('hidden'); }
function aplicarAtualizacao(forcar) {
  if (RECARREGANDO) return false;
  let ultimo = 0; try { ultimo = +sessionStorage.getItem(RELOAD_KEY) || 0; } catch (_) {}
  if (!forcar && Date.now() - ultimo < 15000) { mostrarAvisoAtualizacao(); return false; } // trava contra recarregar em loop
  try { sessionStorage.setItem(RELOAD_KEY, String(Date.now())); } catch (_) {}
  RECARREGANDO = true; location.reload(); return true;
}
function aoTrocarControlador() {
  if (!TINHA_CONTROLE || RECARREGANDO) return; // primeira instalação: a página já é a versão atual
  if (usuarioOcupado()) mostrarAvisoAtualizacao(); else aplicarAtualizacao(false);
}
$('#upd-banner').onclick = () => aplicarAtualizacao(true);
let TINHA_CONTROLE = false;
if (!MODO_TESTE && 'serviceWorker' in navigator && location.protocol !== 'file:') {
  TINHA_CONTROLE = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', aoTrocarControlador);
  navigator.serviceWorker.register('sw.js').then(reg => {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(e => console.warn(e));
}
