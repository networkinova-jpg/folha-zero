/* Só no app de teste. Não mexe no armazenamento do aplicativo publicado e não muda os motivos que já existem. */
(function () {
  if (globalThis.FOLHA_ZERO_MODO_TESTE !== true) return;
  var ALMOCO = 'Almoço/café';

  function ehAlmoco(p) {
    return !!p && !p.outro && p.motivo === ALMOCO;
  }

  if (typeof ehOutro === 'function') {
    var originalOutro = ehOutro;
    ehOutro = function (p) { return ehAlmoco(p) ? false : originalOutro(p); };
  }

  if (typeof chaveMotivo === 'function') {
    var originalChave = chaveMotivo;
    chaveMotivo = function (p) { return ehAlmoco(p) ? ALMOCO : originalChave(p); };
  }

  if (typeof foraMin === 'function') {
    var originalFora = foraMin;
    foraMin = function (e, a0, b0) {
      var base = originalFora(e, a0, b0);
      var ag = dtMin(agoraDT());
      var extra = (e.pausas || []).filter(ehAlmoco).reduce(function (s, p) {
        var a = Math.max(dtMin(p.inicio), a0);
        var b = Math.min(p.fim ? dtMin(p.fim) : ag, b0);
        return s + Math.max(0, b - a);
      }, 0);
      return base + extra;
    };
  }

  if (typeof consolidadoPausas === 'function') {
    var originalCons = consolidadoPausas;
    consolidadoPausas = function (fin) {
      var r = originalCons(fin);
      (r.carros || []).forEach(function (c) {
        var extra = 0;
        var qtd = 0;
        (c.e.pausas || []).forEach(function (p) {
          if (!ehAlmoco(p) || !p.fim) return;
          var a = dtMin(p.inicio);
          var b = dtMin(p.fim);
          if (c.temHora) {
            a = Math.max(a, dtMin(c.e.dataInicio + 'T' + c.e.horaInicio));
            b = Math.min(b, dtMin(c.e.dataTermino + 'T' + c.e.horaTermino));
          }
          extra += Math.max(0, b - a);
          qtd += 1;
        });
        if (!extra) return;
        c.pausaMin = Math.max(0, c.pausaMin - extra);
        c.qtd = Math.max(0, c.qtd - qtd);
        c.foraMin += extra;
        c.foraQtd += qtd;
        if (c.temHora && c.totalMin != null) c.prodMin = Math.max(0, c.totalMin - c.pausaMin - c.foraMin);
        Object.keys(c.porMotivo || {}).forEach(function (k) {
          if (k === ALMOCO || (c.porMotivo[k] && c.porMotivo[k].motivo === ALMOCO)) c.porMotivo[k].fimExp = true;
        });
      });
      (r.motivos || []).forEach(function (m) { if (m.motivo === ALMOCO) m.fimExp = true; });
      var com = (r.carros || []).filter(function (c) { return c.temHora; });
      r.pausaMin = (r.carros || []).reduce(function (s, c) { return s + c.pausaMin; }, 0);
      r.qtd = (r.carros || []).reduce(function (s, c) { return s + c.qtd; }, 0);
      r.foraMin = (r.carros || []).reduce(function (s, c) { return s + c.foraMin; }, 0);
      r.foraQtd = (r.carros || []).reduce(function (s, c) { return s + c.foraQtd; }, 0);
      r.prodMin = com.reduce(function (s, c) { return s + c.prodMin; }, 0);
      return r;
    };
  }

  if (typeof pausar === 'function') {
    pausar = async function (id) {
      var e = DB.entries.find(function (x) { return x.id === id; });
      if (!e || e.dataTermino) return;
      if (pausaAberta(e)) return retomar(id);
      var txtOutro = function () { return limpaMotivo($('#pz-outro') ? $('#pz-outro').value : ''); };
      var v = await modal('Pausar carro', '<p><b>OS ' + esc(e.os) + '</b> · ' + esc(e.veiculo) + '<br>' + esc(e.empresa) + ' · ' + esc(e.setor) + '</p><p class="hint">Escolha o motivo da pausa. O tempo parado conta a partir de agora (' + agoraHM() + ').</p><div id="pz-outro-box" class="pz-outro-box hidden"><label>Digite o motivo<input type="text" id="pz-outro" maxlength="' + OUTRO_MAX + '" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="done" placeholder="Ex.: Aguardando cliente"></label><p id="pz-outro-aviso" class="pz-aviso hidden">Digite o motivo da pausa.</p><button type="button" id="pz-outro-ok" class="btn primary big">⏸ Pausar</button></div>',
        [{ label: '🌙 ' + MOTIVO_FIM, value: MOTIVO_FIM, cls: 'sit-opt sit-fimexp pz-fimexp-opt' },
          { label: '🍽 ' + ALMOCO, value: ALMOCO, cls: 'sit-opt sit-fimexp' }].concat(MOTIVOS_PAUSA.map(function (m) {
          return { label: m, value: m, cls: 'sit-opt ' + sitCls(m) };
        })).concat([
          { label: 'Outro motivo', value: '', cls: 'sit-opt sit-outro pz-outro-opt', action: function () {
            var box = $('#pz-outro-box');
            var ob = $('#m-actions .pz-outro-opt');
            ob.after(box);
            ob.classList.add('atual');
            box.classList.remove('hidden');
            $('#pz-outro').focus();
          } },
          { label: 'Pausar com outro motivo', value: '', cls: 'hidden pz-outro-enviar',
            validate: function () {
              var ok = !!txtOutro();
              $('#pz-outro-aviso').classList.toggle('hidden', ok);
              if (!ok) { toast('Digite o motivo da pausa.'); $('#pz-outro').focus(); }
              return ok;
            },
            collect: function () { return { outro: txtOutro() }; } },
          { label: 'Cancelar', value: null }]),
        function () {
          var enviar = function () { $('#m-actions .pz-outro-enviar').click(); };
          $('#pz-outro-ok').onclick = enviar;
          $('#pz-outro').onkeydown = function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); enviar(); } };
        });
      if (!v || e.dataTermino || pausaAberta(e)) return;
      if (!Array.isArray(e.pausas)) e.pausas = [];
      var pz;
      if (typeof v === 'object') {
        var digitado = String(v.outro || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
        var ofic = MOTIVOS_PAUSA.find(function (m) { return m.toLowerCase() === v.outro.toLowerCase(); });
        pz = textoFimExp(v.outro) ? { motivo: MOTIVO_FIM, inicio: agoraDT(), fim: null }
          : (digitado === 'almoco/cafe' ? { motivo: ALMOCO, inicio: agoraDT(), fim: null }
            : (ofic ? { motivo: ofic, inicio: agoraDT(), fim: null } : { motivo: v.outro, outro: true, inicio: agoraDT(), fim: null }));
      } else pz = { motivo: v, inicio: agoraDT(), fim: null };
      e.pausas.push(pz);
      if (!pz.outro && !ehFimExp(pz) && pz.motivo !== ALMOCO) e.situacao = pz.motivo;
      e.updatedAt = Date.now();
      save();
      render();
      toast(pz.motivo === ALMOCO ? 'Almoço/café: o tempo do carro para até Retomar' : (ehFimExp(pz) ? 'Fim de expediente: o tempo do carro para até Retomar' : 'Pausado: ' + pz.motivo));
    };
  }

  if (typeof retomar === 'function') {
    var originalRetomar = retomar;
    retomar = function (id, sitFinal) {
      var e = DB.entries.find(function (x) { return x.id === id; });
      var p = e && pausaAberta(e);
      var era = ehAlmoco(p);
      var situacao = e && e.situacao;
      var r = originalRetomar(id, sitFinal);
      if (era && e && !sitFinal && SITUACOES.includes(situacao)) e.situacao = situacao;
      return r;
    };
  }

  if (typeof renderPausasEditor === 'function') {
    var originalEditor = renderPausasEditor;
    renderPausasEditor = function () {
      originalEditor();
      document.querySelectorAll('#f-pausas .pz-motivo').forEach(function (sel) {
        if ([].some.call(sel.options, function (o) { return o.value === ALMOCO; })) return;
        var opt = document.createElement('option');
        opt.value = ALMOCO;
        opt.textContent = ALMOCO;
        var fim = [].find.call(sel.options, function (o) { return o.value === MOTIVO_FIM; });
        if (fim && fim.after) fim.after(opt);
        else sel.insertBefore(opt, sel.firstChild);
        var linha = sel.closest('.pz-row');
        var pausa = linha ? EDIT_PAUSAS[+linha.dataset.i] : null;
        if (pausa && pausa.motivo === ALMOCO && !pausa.outro) opt.selected = true;
      });
    };
  }
})();
