/* Acesso e painel do proprietário.
   Sem projeto, nada é enviado. A senha não é guardada.
   O painel mexe só em folhazero_admin_meta, nunca em folhazero_v1.
   Não há service_role, senha mestra nem convite enviado. */
(function (root) {
  const META = 'folhazero_admin_meta';
  const KEY = 'folhazero_v1';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function metaVazia() {
    return { solicitacoes: [], convites: [], licencas: [], permissoes: {}, proprietarios: [] };
  }

  function lerMeta(storage) {
    try {
      const raw = storage.getItem(META);
      if (!raw) return metaVazia();
      const m = JSON.parse(raw);
      if (!m || typeof m !== 'object') return metaVazia();
      return {
        solicitacoes: Array.isArray(m.solicitacoes) ? m.solicitacoes : [],
        convites: Array.isArray(m.convites) ? m.convites : [],
        licencas: Array.isArray(m.licencas) ? m.licencas : [],
        permissoes: m.permissoes && typeof m.permissoes === 'object' ? m.permissoes : {},
        proprietarios: Array.isArray(m.proprietarios) ? m.proprietarios : []
      };
    } catch (_) {
      return metaVazia();
    }
  }

  function gravarMeta(storage, meta) {
    const antes = storage.getItem(KEY);
    storage.setItem(META, JSON.stringify(meta));
    if (storage.getItem(KEY) !== antes) {
      try { if (antes == null) storage.removeItem(KEY); else storage.setItem(KEY, antes); } catch (__) {}
      throw new Error('admin alterou folhazero_v1');
    }
  }

  function lerConfigPublica(ambiente) {
    const c = ambiente && ambiente.FOLHA_ZERO_NUVEM;
    if (!c || typeof c !== 'object') return { ligado: false, motivo: 'sem_projeto' };
    if (Object.keys(c).some(k => /service[_-]?role|secret/i.test(k))) return { ligado: false, motivo: 'segredo_proibido' };
    const publica = c.publishableKey || c.anonKey;
    if (publica != null && /service_role/i.test(String(publica))) return { ligado: false, motivo: 'chave_suspeita' };
    if (!c.url || !publica) return { ligado: false, motivo: 'sem_projeto' };
    return { ligado: true, motivo: 'config_publica', url: String(c.url) };
  }

  function sessaoConfiavel(sessao) {
    if (!sessao || typeof sessao !== 'object') return false;
    if (sessao.verificadoNoServidor !== true || sessao.origem !== 'servidor') return false;
    if (sessao.papel !== 'proprietario' && sessao.papel !== 'gerente') return false;
    if (!sessao.uid || typeof sessao.uid !== 'string') return false;
    return true;
  }

  function sessaoDe(ambiente) {
    const s = ambiente && ambiente.FOLHA_ZERO_SESSAO;
    return sessaoConfiavel(s) ? s : null;
  }

  function ehProprietario(meta, sessao) {
    if (!sessao || sessao.papel !== 'proprietario' || !sessaoConfiavel(sessao)) return false;
    return (meta.proprietarios || []).some(p => p.userId === sessao.uid && p.ativo && p.bootstrap === 'servidor');
  }

  function bootstrapProprietario(meta, pedido) {
    if (!pedido || pedido.via !== 'sql_do_titular' || pedido.explicito !== true) return { ok: false, motivo: 'bootstrap_so_no_servidor' };
    if (pedido.porNomeOuEmail || pedido.email || pedido.nome) return { ok: false, motivo: 'nao_usar_nome_ou_email' };
    if (!pedido.uid) return { ok: false, motivo: 'uid_ausente' };
    if ((meta.proprietarios || []).some(p => p.ativo)) return { ok: false, motivo: 'ja_existe_proprietario' };
    meta.proprietarios.push({ userId: pedido.uid, ativo: true, bootstrap: 'servidor' });
    return { ok: true };
  }

  function podeVerDadoPrivado(sessao) {
    if (sessao && sessao.papel === 'proprietario') return false;
    return false;
  }

  function decidirSolicitacao(meta, sessao, id, acao) {
    if (!ehProprietario(meta, sessao)) return { ok: false, motivo: 'somente_proprietario', texto: 'Só o proprietário com sessão de servidor pode decidir.' };
    const mapa = { aprovar: 'aprovada', recusar: 'recusada', suspender: 'suspensa', revogar: 'revogada' };
    if (!mapa[acao]) return { ok: false, motivo: 'acao_invalida' };
    const item = meta.solicitacoes.find(s => s.id === id);
    if (!item) return { ok: false, motivo: 'ausente' };
    if (item.papelPedido === 'proprietario') return { ok: false, motivo: 'papel_proibido' };
    item.status = mapa[acao];
    item.decididoPor = sessao.uid;
    return { ok: true, status: item.status, texto: 'Decisão guardada só na lista local. Nenhum e-mail foi enviado e nenhum carro foi aberto.' };
  }

  function concederGestao(meta, sessao, orgId, permitir) {
    if (!ehProprietario(meta, sessao)) return { ok: false, motivo: 'somente_proprietario' };
    if (!orgId) return { ok: false, motivo: 'org_ausente' };
    meta.permissoes[orgId] = { podeGerirMembros: permitir === true };
    return { ok: true };
  }

  function gerenteGerirMembro(meta, sessao, alvo) {
    if (!sessaoConfiavel(sessao) || sessao.papel !== 'gerente') return { ok: false, motivo: 'sem_permissao' };
    if (!alvo || sessao.orgId !== alvo.orgId) return { ok: false, motivo: 'outra_empresa' };
    const perm = meta.permissoes[alvo.orgId];
    if (!perm || perm.podeGerirMembros !== true) return { ok: false, motivo: 'proprietario_nao_autorizou' };
    if (alvo.papel === 'proprietario') return { ok: false, motivo: 'escalada' };
    return { ok: true };
  }

  function registrarLicenca(meta, sessao, licenca) {
    if (!ehProprietario(meta, sessao)) return { ok: false, motivo: 'somente_proprietario' };
    if (!licenca || licenca.valor != null || licenca.preco != null || licenca.cobranca) return { ok: false, motivo: 'sem_cobranca', cobrou: false };
    if (!['degustacao', 'licenca_manual'].includes(licenca.tipo)) return { ok: false, motivo: 'tipo_invalido', cobrou: false };
    meta.licencas.push({
      id: licenca.id || ('lic-' + (meta.licencas.length + 1)),
      userId: licenca.userId,
      orgId: licenca.orgId || null,
      tipo: licenca.tipo,
      status: licenca.status || 'ativa',
      inicio: licenca.inicio || null,
      fim: licenca.fim || null,
      observacao: licenca.observacao || ''
    });
    return { ok: true, cobrou: false };
  }

  function rascunhoConvite(meta, sessao, convite) {
    if (!convite) return { ok: false, motivo: 'convite_ausente', enviouEmail: false };
    const dono = ehProprietario(meta, sessao);
    const gerente = sessao && sessao.papel === 'gerente' && gerenteGerirMembro(meta, sessao, { orgId: convite.orgId, papel: 'equipe' }).ok;
    if (!dono && !gerente) return { ok: false, motivo: 'sem_permissao', enviouEmail: false };
    if (convite && convite.enviar) return { ok: false, motivo: 'mensagem_nao_autorizada', enviouEmail: false };
    meta.convites.push({
      id: convite.id || ('conv-' + (meta.convites.length + 1)),
      orgId: convite.orgId,
      email: convite.email || '',
      papel: convite.papel || 'equipe',
      status: 'rascunho',
      enviadoEm: null
    });
    return { ok: true, enviouEmail: false };
  }

  function tentarLogin(ambiente, metodo) {
    const cfg = lerConfigPublica(ambiente);
    if (!cfg.ligado) return { ok: false, motivo: 'sem_projeto', enviou: false, guardouSenha: false };
    if (metodo === 'email') return { ok: false, motivo: 'smtp_pendente', enviou: false, guardouSenha: false };
    if (metodo === 'google') return { ok: false, motivo: 'aguardando_projeto_autorizado', enviou: false, guardouSenha: false };
    return { ok: false, motivo: 'sem_projeto', enviou: false, guardouSenha: false };
  }

  function htmlSecao(ambiente, storage) {
    const cfg = lerConfigPublica(ambiente);
    const sessao = sessaoDe(ambiente);
    const meta = lerMeta(storage);
    const aviso = cfg.ligado
      ? 'A chave pública foi encontrada, mas o Google e o e-mail ainda não foram validados. Nada é enviado e a senha não fica salva aqui.'
      : 'O login está desligado neste aplicativo. O projeto existe, mas o banco segue vazio e esta tela não está ligada a ele. Não dá para entrar com Google nem com e-mail. Seus lançamentos continuam só neste aparelho e o acesso não é obrigatório.';
    let painel;
    if (!sessao || sessao.papel !== 'proprietario' || !ehProprietario(meta, sessao)) {
      painel = '<p class="hint">O painel do proprietário não abre com o nome de quem usa o aparelho. Ele depende de uma sessão confirmada pelo servidor. O projeto existe, mas o banco segue vazio e este aplicativo não está ligado a ele.</p>';
    } else {
      const linhas = meta.solicitacoes.length ? meta.solicitacoes.map(s => `<div class="acesso-item"><b>${esc(s.nome || 'Pessoa fictícia')}</b><span>${esc(s.email || '')}${s.orgNome ? ' · ' + esc(s.orgNome) : ''} · ${esc(s.papelPedido || '')} · ${esc(s.status || 'pendente')}</span>
        <div class="actions"><button type="button" class="btn small primary" data-acesso="aprovar" data-id="${esc(s.id)}">Aprovar</button>
        <button type="button" class="btn small ghost" data-acesso="suspender" data-id="${esc(s.id)}">Suspender</button>
        <button type="button" class="btn small ghost" data-acesso="revogar" data-id="${esc(s.id)}">Revogar</button></div></div>`).join('') : '<p class="empty">Nenhuma solicitação nesta lista local.</p>';
      const lics = meta.licencas.length ? meta.licencas.map(l => `<div class="acesso-item"><b>${esc(l.tipo === 'degustacao' ? 'Degustação' : 'Licença manual')}</b><span>${esc(l.status)} · sem cobrança</span></div>`).join('') : '<p class="hint">Nenhuma licença registrada. Degustação e licença manual são só metadados: não há cobrança.</p>';
      painel = `<div class="acesso-aviso">Sessão de teste do proprietário. As decisões ficam só nesta lista local. Carros, OS e valores não aparecem aqui. Nenhum convite é enviado.</div>
        <h3>Solicitações</h3><div class="acesso-lista" id="acesso-solicitacoes">${linhas}</div>
        <h3>Degustação e licença</h3><div class="acesso-lista">${lics}</div>`;
    }
    const desab = cfg.ligado ? '' : ' disabled';
    return `<p class="acesso-aviso" id="acesso-aviso">${aviso}</p>
      <form id="acesso-form">
        <label>E-mail<input id="acesso-email" type="email" autocomplete="off"${desab}></label>
        <label>Senha<input id="acesso-senha" type="password" autocomplete="new-password"${desab}></label>
        <button type="submit" class="btn primary" data-acesso="email"${desab}>Entrar com e-mail</button>
        <button type="button" class="btn ghost" data-acesso="google"${desab}>Entrar com Google</button>
      </form>
      <p class="hint" id="acesso-msg"></p>
      ${painel}`;
  }

  function clicar(ambiente, storage, acao, id) {
    const antes = storage.getItem(KEY);
    const meta = lerMeta(storage);
    const sessao = sessaoDe(ambiente);
    let r;
    if (acao === 'email' || acao === 'google') r = Object.assign({ texto: 'O login não foi enviado. A senha não fica salva neste aparelho.' }, tentarLogin(ambiente, acao));
    else if (acao === 'aprovar' || acao === 'recusar' || acao === 'suspender' || acao === 'revogar') {
      r = decidirSolicitacao(meta, sessao, id, acao);
      if (r.ok) gravarMeta(storage, meta);
    } else r = { ok: false, motivo: 'acao_invalida', texto: '' };
    if (storage.getItem(KEY) !== antes) {
      try { if (antes == null) storage.removeItem(KEY); else storage.setItem(KEY, antes); } catch (__) {}
      return { ok: false, motivo: 'origem_alterada', texto: 'A ação foi desfeita para preservar os lançamentos.' };
    }
    return r;
  }

  const api = {
    META, KEY, lerMeta, gravarMeta, lerConfigPublica, sessaoConfiavel, ehProprietario,
    bootstrapProprietario, podeVerDadoPrivado, decidirSolicitacao, concederGestao,
    gerenteGerirMembro, registrarLicenca, rascunhoConvite, tentarLogin, htmlSecao, clicar
  };
  root.FolhaAcesso = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
