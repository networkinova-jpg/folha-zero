/* Modelo de conferência das regras do schema.sql.
   Não substitui o Postgres. Serve para os testes desta etapa, sem banco. */

function membro(estado, orgId, uid) {
  return (estado.membros || []).find(m => m.orgId === orgId && m.userId === uid && m.status === 'ativo') || null;
}

function podeLerValor(estado, ator, valor) {
  if (!ator || !ator.uid || !valor) return false;
  return valor.ownerId === ator.uid;
}

function podeLerLancamento(estado, ator, linha) {
  if (!ator || !ator.uid || !linha) return false;
  if (linha.ownerId === ator.uid) return true;
  if (!linha.orgId) return false;
  const eu = membro(estado, linha.orgId, ator.uid);
  if (!eu) return false;
  if (eu.papel === 'gerente') return true;
  if (eu.papel !== 'equipe') return false;
  if (eu.setor && eu.setor === linha.setor) return true;
  return (estado.atribuicoes || []).some(a => a.lancamentoId === linha.id && a.userId === ator.uid);
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

const PoliticaModelo = { podeLerValor, podeLerLancamento, podeDefinirPapel, podeRevogarConvite };
if (typeof module !== 'undefined') module.exports = PoliticaModelo;
