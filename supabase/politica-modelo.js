/* Modelo de conferência das regras do schema.sql.
   Não substitui o Postgres. Serve para os testes desta etapa, sem banco. */

function membro(estado, orgId, uid) {
  return (estado.membros || []).find(m => m.orgId === orgId && m.userId === uid && m.status === 'ativo') || null;
}

function podeLerValor(estado, ator, valor) {
  if (!ator || !ator.uid || !valor) return false;
  return valor.ownerId === ator.uid;
}

function compartilhamentoVisivel(estado, lancamentoId) {
  return (estado.compartilhamentos || []).find(c => c.lancamentoId === lancamentoId && (c.encerradoEm == null || c.retido)) || null;
}

function equipeAlcanc(estado, eu, linha) {
  if (eu.setor && eu.setor === linha.setor) return true;
  if ((estado.atribuicoes || []).some(a => a.lancamentoId === linha.id && a.userId === eu.userId)) return true;
  return (estado.equipeMembros || []).some(m => m.userId === eu.userId && ((m.setor && m.setor === linha.setor) || (m.prestadorId && m.prestadorId === linha.ownerId)));
}

function podeLerLancamento(estado, ator, linha) {
  if (!ator || !ator.uid || !linha) return false;
  if (linha.ownerId === ator.uid) return true;
  const share = compartilhamentoVisivel(estado, linha.id);
  if (!share) return false;
  const eu = membro(estado, share.orgId, ator.uid);
  if (!eu) return false;
  if (eu.papel === 'gerente') return true;
  if (eu.papel !== 'equipe') return false;
  return equipeAlcanc(estado, eu, linha);
}

function assumirGerencia(membros, uid, orgId) {
  const outra = (membros || []).find(m => m.userId === uid && m.papel === 'gerente' && m.status === 'ativo' && m.orgId !== orgId);
  if (outra) return { ok: false, motivo: 'gerente_ja_tem_empresa' };
  return { ok: true };
}

function criarEquipe(nome) {
  const pedido = String(nome || '').trim();
  if (/concept/i.test(pedido)) return { ok: false, motivo: 'nome_de_marca_fixo' };
  return { ok: true, nome: pedido || 'Equipe de Produção' };
}

function registrarConsentimento(entrada) {
  if (!entrada || entrada.confirma !== true) return { ok: false, motivo: 'sem_consentimento' };
  if (!entrada.userId || !entrada.orgId || !entrada.finalidade || !entrada.versaoTexto || !entrada.escopo) {
    return { ok: false, motivo: 'consentimento_incompleto' };
  }
  return {
    ok: true,
    registro: {
      id: entrada.id || 'consentimento-local',
      userId: entrada.userId,
      orgId: entrada.orgId,
      finalidade: entrada.finalidade,
      versaoTexto: entrada.versaoTexto,
      escopo: entrada.escopo,
      aceitoEm: entrada.aceitoEm || '2026-11-07T17:35:00.000Z',
      revogadoEm: null
    }
  };
}

function podeCompartilhar(estado, pedido) {
  if (!pedido || pedido.incluiValor) return { ok: false, motivo: 'valor_privado' };
  const c = (estado.consentimentos || []).find(x => x.userId === pedido.ownerId && x.orgId === pedido.orgId && !x.revogadoEm);
  if (!c) return { ok: false, motivo: 'sem_consentimento' };
  const empresas = c.escopo && c.escopo.empresas || [];
  const setores = c.escopo && c.escopo.setores || [];
  if (empresas.length && !empresas.includes(pedido.empresa)) return { ok: false, motivo: 'fora_do_escopo' };
  if (setores.length && !setores.includes(pedido.setor)) return { ok: false, motivo: 'fora_do_escopo' };
  return { ok: true, consentimentoId: c.id };
}

function revogarConsentimento(consentimento, compartilhamentos) {
  const registro = Object.assign({}, consentimento, { revogadoEm: consentimento.revogadoEm || '2026-11-07T18:00:00.000Z' });
  const lista = (compartilhamentos || []).map(c => c.consentimentoId === registro.id
    ? Object.assign({}, c, { encerradoEm: registro.revogadoEm, retido: true })
    : c);
  return { consentimento: registro, compartilhamentos: lista, apagouProducaoRetida: false, apagouLocal: false, promessaApagarTudo: false };
}

function ativarAparelho(aparelhos, uid, aparelhoId, confirmar) {
  const lista = aparelhos || [];
  const ativo = lista.find(a => a.userId === uid && a.status === 'ativo');
  const base = { imposicaoLocal: false, apagouLocal: false, limite: 'revogacao_offline_nao_e_imediata' };
  if (ativo && ativo.aparelhoId === aparelhoId) return Object.assign({ ok: true, repetido: true }, base);
  if (ativo && confirmar !== true) return Object.assign({ ok: false, motivo: 'confirma_revogacao_anterior' }, base);
  const proxima = lista.map(a => a.userId === uid && a.status === 'ativo' ? Object.assign({}, a, { status: 'revogado' }) : a);
  proxima.push({ userId: uid, aparelhoId, status: 'ativo' });
  return Object.assign({ ok: true, aparelhos: proxima, revogados: ativo ? [ativo.aparelhoId] : [] }, base);
}

function podeDefinirPapel(estado, ator, alvo) {
  if (!ator || !ator.uid || !alvo) return { ok: false, motivo: 'sem_ator' };
  if (alvo.userId === ator.uid) return { ok: false, motivo: 'proprio_papel' };
  if (!['prestador', 'equipe', 'gerente'].includes(alvo.papelNovo)) return { ok: false, motivo: 'papel_invalido' };
  const eu = membro(estado, alvo.orgId, ator.uid);
  if (!eu || eu.papel !== 'gerente') return { ok: false, motivo: 'nao_e_gerente' };
  const dest = (estado.membros || []).find(m => m.orgId === alvo.orgId && m.userId === alvo.userId && m.status === 'ativo');
  if (!dest) return { ok: false, motivo: 'membro_ausente' };
  return { ok: true };
}

function podeRevogarConvite(estado, ator, convite) {
  if (!ator || !convite) return false;
  const eu = membro(estado, convite.orgId, ator.uid);
  return !!(eu && eu.papel === 'gerente');
}

const PoliticaModelo = {
  podeLerValor, podeLerLancamento, podeDefinirPapel, podeRevogarConvite,
  assumirGerencia, criarEquipe, registrarConsentimento, podeCompartilhar, revogarConsentimento, ativarAparelho
};
if (typeof module !== 'undefined') module.exports = PoliticaModelo;
