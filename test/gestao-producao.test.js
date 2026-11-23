const test = require('node:test');
const assert = require('node:assert/strict');
const g = require('../gestao-producao-logica.js');

const AGORA = '2026-11-23T18:00';

function carro(extra) {
  return Object.assign({
    os: 'OS-1', veiculo: 'Carro A', setor: 'Tapeçaria', situacao: 'Finalizado',
    dataInicio: '2026-11-02', horaInicio: '08:00', dataTermino: '2026-11-02', horaTermino: '18:00',
    pausas: [], prestadorEmail: 'pessoa@example.invalid', prestadorNome: 'Pessoa', equipeId: 'equipe-a'
  }, extra);
}

test('a ficha compartilhada não leva valor nem a cópia da conta', () => {
  const ficha = g.fichaPermitida(carro({ valor: 100, ajudante: 20, desconto: 5, quinzena: '1', observacao: 'particular', documento: { os: 'segredo' } }));
  g.PROIBIDOS.forEach((chave) => assert.equal(Object.prototype.hasOwnProperty.call(ficha, chave), false, chave));
  assert.equal(ficha.os, 'OS-1');
  assert.equal(ficha.pausas.length, 0);
  assert.equal(JSON.stringify(ficha).includes('segredo'), false);
});

test('consentimento exige confirmação explícita e a revogação não apaga o local', () => {
  assert.equal(g.consentir({ confirma: false, texto: 'Concordo com Oficina Norte', empresa: 'Oficina Norte' }).motivo, 'sem_confirmacao');
  assert.equal(g.consentir({ confirma: true, texto: '', empresa: 'Oficina Norte' }).motivo, 'texto_ausente');
  assert.equal(g.consentir({ confirma: true, texto: 'Concordo', empresa: 'Oficina Norte' }).motivo, 'empresa_ausente_no_texto');
  const ok = g.consentir({ confirma: true, texto: 'Concordo em compartilhar com Oficina Norte', empresa: 'Oficina Norte' });
  assert.equal(ok.ok, true);
  assert.equal(ok.compartilhou, false);
  assert.equal(ok.escopo.includes('valor'), false);
  const fim = g.revogar();
  assert.equal(fim.apagaLocal, false);
  assert.equal(fim.encerraFichas, true);
  assert.equal(fim.enviaNovo, false);
});

test('só um celular fica ativo e a troca pede confirmação', () => {
  assert.equal(g.decidirDispositivo({ novoId: 'curto' }).motivo, 'dispositivo_invalido');
  assert.equal(g.decidirDispositivo({ novoId: 'aparelho-1' }).acao, 'ativar');
  assert.equal(g.decidirDispositivo({ novoId: 'aparelho-1', ativo: { id: 'aparelho-1' } }).acao, 'mesmo');
  const pendente = g.decidirDispositivo({ novoId: 'aparelho-2', ativo: { id: 'aparelho-1' }, confirma: false });
  assert.equal(pendente.motivo, 'troca_pendente');
  assert.equal(pendente.ativoId, 'aparelho-1');
  const troca = g.decidirDispositivo({ novoId: 'aparelho-2', ativo: { id: 'aparelho-1' }, confirma: true });
  assert.equal(troca.acao, 'trocar');
  assert.equal(troca.apagaLocal, false);
  assert.equal(troca.anterior, 'aparelho-1');
});

test('tempo útil tira pausa e fim de expediente, e setores extras vão para Outros', () => {
  assert.equal(g.agruparSetor('Tapeçaria'), 'Tapeçaria');
  assert.equal(g.agruparSetor('Steel'), 'Outros');
  assert.equal(g.agruparSetor('Aço Maçaneta'), 'Outros');
  assert.equal(g.agruparSetor('Qualidade'), 'Outros');
  const util = g.tempoUtil(carro({
    pausas: [
      { motivo: 'Faltando peça', outro: false, inicio: '2026-11-02T10:00', fim: '2026-11-02T10:30' },
      { motivo: 'Fim de expediente', outro: false, inicio: '2026-11-02T12:00', fim: '2026-11-02T13:00' }
    ]
  }), AGORA);
  assert.equal(util.pausa, 30);
  assert.equal(util.fora, 60);
  assert.equal(util.minutos, 510);
});

test('indicadores separam os 10 setores, as causas e o SLA', () => {
  const resultado = g.indicadores({
    inicio: '2026-11-01',
    fim: '2026-11-30',
    agora: AGORA,
    sla: [{ setor: 'Tapeçaria', prazoHoras: 8 }, { setor: 'Vidro', prazoHoras: 8 }],
    carros: [
      carro({
        situacao: 'Aguardando etapa anterior',
        dataTermino: '',
        horaTermino: '',
        pausas: [{ motivo: 'Aguardando etapa anterior', outro: false, inicio: '2026-11-02T16:00', fim: null }]
      }),
      carro({
        os: 'OS-2', setor: 'Vidro', dataInicio: '2026-11-03', dataTermino: '2026-11-03', horaInicio: '08:00', horaTermino: '12:00',
        prestadorEmail: 'outra@example.invalid', prestadorNome: 'Outra', equipeId: 'equipe-b',
        pausas: [{ motivo: 'texto livre', outro: true, inicio: '2026-11-03T09:00', fim: '2026-11-03T09:20' }]
      }),
      carro({ os: 'OS-3', setor: 'Steel', dataTermino: '2026-11-04', prestadorEmail: 'pessoa@example.invalid' }),
      carro({ os: 'OS-4', valor: 999, dataTermino: '2026-10-01' })
    ]
  });
  assert.equal(resultado.inicio.andamento, 1);
  assert.equal(resultado.inicio.finalizados, 2);
  assert.equal(resultado.inicio.pausasAbertas, 1);
  assert.equal(resultado.inicio.setorMaisParado, 'Tapeçaria');
  assert.equal(resultado.porSetor.length, 11);
  assert.deepEqual(resultado.porSetor.map((item) => item.setor).slice(0, 10), g.SETORES);
  assert.equal(resultado.porSetor[10].setor, 'Outros');
  assert.equal(resultado.porSetor[10].finalizados, 1);
  const tape = resultado.porSetor.find((item) => item.setor === 'Tapeçaria');
  assert.equal(tape.etapaAnterior, 1);
  assert.equal(tape.atrasado, 1);
  const causas = resultado.pausas.map((item) => item.motivo);
  assert.equal(causas[0], g.MOTIVOS[0]);
  assert.equal(causas[causas.length - 1], g.FIM);
  assert.equal(causas.indexOf('texto livre') > causas.indexOf('Impasse na resolução de um problema'), true);
  assert.equal(causas.indexOf('texto livre') < causas.indexOf(g.FIM), true);
  assert.equal(resultado.gargalos.etapaAnterior, 'Tapeçaria');
  assert.equal(resultado.sla.length, 10);
  assert.equal(resultado.sla[0].prazoHoras, 8);
  assert.equal(resultado.sla.find((item) => item.setor === 'Tapeçaria').atrasado, 1);
  const pessoa = resultado.porPrestador.find((item) => item.email === 'pessoa@example.invalid');
  assert.equal(pessoa.pausaAberta, true);
  assert.equal(JSON.stringify(resultado).includes('999'), false);
  assert.equal(JSON.stringify(resultado).includes('\u2014'), false);
});
