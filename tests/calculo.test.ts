import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import * as Regras from '../src/dominio/regras';
import * as Calculo from '../src/dominio/calculo';
import { gerarExemplo } from '../src/exemplo';
import type { Cadastro, EntradaCalculo, Movimento, PosicaoInicial, Prejuizo } from '../src/dominio/tipos';

const regras = Regras.porAno(2026);

const estadoCom = (
  posicaoInicial: PosicaoInicial[],
  movimentos: Movimento[],
  cadastro: Record<string, Cadastro> = {},
  prejuizoInicial?: Prejuizo
): EntradaCalculo => ({
  cadastro: {
    PETR4: { tipo: 'acao', nome: 'Petrobras', cnpj: '33.000.167/0001-01' },
    VALE3: { tipo: 'acao', nome: 'Vale', cnpj: '33.592.510/0001-54' },
    MXRF11: { tipo: 'fii', nome: 'Maxi Renda', cnpj: '97.521.225/0001-25' },
    ...cadastro
  },
  posicaoInicial,
  movimentos,
  prejuizoInicial
});

const bem = (relatorio: Calculo.Relatorio, ticker: string) =>
  Object.values(relatorio.bens)
    .flat()
    .find(b => b.ticker === ticker);

describe('comparação de bens com a declaração anterior', () => {
  const r = Calculo.gerarRelatorio(gerarExemplo(), regras);

  test('bem com mesma quantidade e mesmo valor fica sem alteração', () => {
    assert.deepEqual(r.bens.semAlteracao.map(b => b.ticker), ['ITSA4', 'KNRI11']);
  });

  test('bem que recebeu compras aparece para atualizar com o novo valor', () => {
    assert.deepEqual(r.bens.alterado.map(b => b.ticker), ['MXRF11', 'PETR4']);
    const petr = bem(r, 'PETR4');
    assert.equal(petr.valorAnterior, 3200);
    assert.equal(petr.valorAtual, 6851.1);
    assert.equal(petr.quantidadeFinal, 200);
    assert.equal(bem(r, 'MXRF11').valorAtual, 20003);
  });

  test('ativo comprado no ano aparece como novo com custo proporcional após venda parcial', () => {
    assert.deepEqual(r.bens.novo.map(b => b.ticker), ['HGLG11', 'WEGE3']);
    assert.equal(bem(r, 'HGLG11').valorAtual, 800.25);
    assert.equal(bem(r, 'HGLG11').quantidadeFinal, 5);
  });

  test('bem vendido por completo fica zerado e ativo comprado e vendido no ano é identificado', () => {
    assert.deepEqual(r.bens.zerado.map(b => b.ticker), ['BBAS3']);
    assert.deepEqual(r.bens.mesmoAno.map(b => b.ticker), ['VALE3']);
    assert.equal(bem(r, 'BBAS3').valorAtual, 0);
  });

  test('discriminação traz quantidade, CNPJ, preço médio e custódia', () => {
    assert.equal(
      bem(r, 'PETR4').discriminacao,
      '200 ações PETR4 (Petrobras), CNPJ 33.000.167/0001-01, preço médio de R$ 34,26 por ação. Custódia: XP Investimentos.'
    );
    assert.match(bem(r, 'MXRF11').discriminacao, /^2\.000 cotas do FII MXRF11/);
  });
});

describe('apuração mensal', () => {
  const r = Calculo.gerarRelatorio(gerarExemplo(), regras);
  const mes = (m: string) => r.apuracao.meses.find(x => x.mes === m);

  test('venda de ações até R$ 20 mil no mês com lucro é isenta', () => {
    assert.equal(mes('2026-03').isento, true);
    assert.equal(mes('2026-03').lucroIsento, 278.3);
    assert.equal(mes('2026-03').imposto, 0);
  });

  test('venda de ações acima de R$ 20 mil com lucro gera DARF de 15% vencendo no último dia útil do mês seguinte', () => {
    assert.equal(mes('2026-09').isento, false);
    assert.equal(mes('2026-09').lucroAcoes, 2384.9);
    assert.equal(mes('2026-09').impostoAcoes, 357.74);
    assert.deepEqual(r.apuracao.darfs.map(d => [d.competencia, d.valor, d.vencimento]), [['2026-09', 357.74, '2026-10-30']]);
  });

  test('imposto de FII abaixo de R$ 10 não gera DARF e fica acumulado', () => {
    assert.equal(mes('2026-11').impostoFii, 7.87);
    assert.equal(mes('2026-11').darf, null);
    assert.equal(r.apuracao.pendente, 7.87);
  });

  test('saldo acumulado abaixo do mínimo é somado ao DARF do mês em que o total passa de R$ 10', () => {
    const e = estadoCom(
      [{ ticker: 'MXRF11', quantidade: 100, custo: 1000 }],
      [
        { data: '2026-02-10', tipo: 'venda', ticker: 'MXRF11', quantidade: 20, preco: 12 },
        { data: '2026-05-10', tipo: 'venda', ticker: 'MXRF11', quantidade: 20, preco: 12 }
      ]
    );
    const a = Calculo.gerarRelatorio(e, regras).apuracao;
    assert.equal(a.meses[0].darf, null);
    assert.equal(a.darfs.length, 1);
    assert.equal(a.darfs[0].competencia, '2026-05');
    assert.equal(a.darfs[0].valor, 16);
    assert.equal(a.darfs[0].acumuladoAnterior, 8);
  });

  test('prejuízo em ações é compensado no lucro tributável dos meses seguintes', () => {
    const e = estadoCom(
      [
        { ticker: 'PETR4', quantidade: 1000, custo: 30000 },
        { ticker: 'VALE3', quantidade: 1000, custo: 60000 }
      ],
      [
        { data: '2026-01-10', tipo: 'venda', ticker: 'PETR4', quantidade: 1000, preco: 28 },
        { data: '2026-02-10', tipo: 'venda', ticker: 'VALE3', quantidade: 1000, preco: 65 }
      ]
    );
    const [jan, fev] = Calculo.gerarRelatorio(e, regras).apuracao.meses;
    assert.equal(jan.prejuizoAcoes, 2000);
    assert.equal(fev.prejuizoAnteriorAcoes, 2000);
    assert.equal(fev.baseAcoes, 3000);
    assert.equal(fev.impostoAcoes, 450);
    assert.equal(fev.prejuizoAcoes, 0);
  });

  test('prejuízo em mês de vendas abaixo de R$ 20 mil também vai para compensação', () => {
    const e = estadoCom([{ ticker: 'PETR4', quantidade: 100, custo: 4000 }], [
      { data: '2026-03-10', tipo: 'venda', ticker: 'PETR4', quantidade: 100, preco: 35 }
    ]);
    const [mar] = Calculo.gerarRelatorio(e, regras).apuracao.meses;
    assert.equal(mar.isento, false);
    assert.equal(mar.prejuizoAcoes, 500);
  });

  test('prejuízo informado da declaração anterior entra na primeira compensação', () => {
    const e = estadoCom(
      [{ ticker: 'MXRF11', quantidade: 100, custo: 1000 }],
      [{ data: '2026-04-10', tipo: 'venda', ticker: 'MXRF11', quantidade: 100, preco: 12 }],
      {},
      { acoes: 0, fii: 150 }
    );
    const [abr] = Calculo.gerarRelatorio(e, regras).apuracao.meses;
    assert.equal(abr.baseFii, 50);
    assert.equal(abr.impostoFii, 10);
  });
});

describe('eventos e proventos', () => {
  test('desdobramento multiplica a quantidade e mantém o custo total', () => {
    const e = estadoCom([{ ticker: 'PETR4', quantidade: 100, custo: 3000 }], [
      { data: '2026-05-02', tipo: 'desdobramento', ticker: 'PETR4', fator: 2 }
    ]);
    const b = bem(Calculo.gerarRelatorio(e, regras), 'PETR4');
    assert.equal(b.status, 'alterado');
    assert.equal(b.quantidadeFinal, 200);
    assert.equal(b.valorAtual, 3000);
  });

  test('bonificação soma ao custo e vira rendimento isento código 18', () => {
    const e = estadoCom([{ ticker: 'PETR4', quantidade: 100, custo: 3000 }], [
      { data: '2026-05-02', tipo: 'bonificacao', ticker: 'PETR4', quantidade: 10, preco: 5 }
    ]);
    const r = Calculo.gerarRelatorio(e, regras);
    assert.equal(bem(r, 'PETR4').valorAtual, 3050);
    const bonif = r.rendimentos.isentos.find(g => g.codigo === '18');
    assert.equal(bonif.total, 50);
  });

  test('grupamento com fração gera alerta', () => {
    const e = estadoCom([{ ticker: 'PETR4', quantidade: 105, custo: 3000 }], [
      { data: '2026-05-02', tipo: 'grupamento', ticker: 'PETR4', fator: 10 }
    ]);
    const r = Calculo.gerarRelatorio(e, regras);
    assert.equal(bem(r, 'PETR4').quantidadeFinal, 10);
    assert.ok(r.alertas.some(a => a.texto.includes('fração')));
  });

  test('proventos são agrupados por código e fonte pagadora', () => {
    const r = Calculo.gerarRelatorio(gerarExemplo(), regras);
    const porCodigo = Object.fromEntries(r.rendimentos.isentos.map(g => [g.codigo, g]));
    assert.deepEqual(porCodigo['09'].itens.map(i => [i.ticker, i.valor]), [['ITSA4', 105.3], ['PETR4', 310]]);
    assert.deepEqual(porCodigo['26'].itens.map(i => [i.ticker, i.valor]), [['KNRI11', 16], ['MXRF11', 400]]);
    assert.equal(porCodigo['20'].total, 278.3);
    assert.equal(r.rendimentos.exclusivos[0].codigo, '10');
    assert.equal(r.rendimentos.exclusivos[0].total, 120);
  });
});

describe('validações', () => {
  test('venda maior que a posição gera alerta de erro', () => {
    const e = estadoCom([{ ticker: 'PETR4', quantidade: 100, custo: 3000 }], [
      { data: '2026-05-02', tipo: 'venda', ticker: 'PETR4', quantidade: 150, preco: 35 }
    ]);
    const r = Calculo.gerarRelatorio(e, regras);
    assert.ok(r.alertas.some(a => a.nivel === 'erro' && a.texto.includes('maior que a posição')));
  });

  test('lançamento posterior ao ano-calendário fica fora do relatório com alerta', () => {
    const e = estadoCom([{ ticker: 'PETR4', quantidade: 100, custo: 3000 }], [
      { data: '2027-01-05', tipo: 'compra', ticker: 'PETR4', quantidade: 10, preco: 35 }
    ]);
    const r = Calculo.gerarRelatorio(e, regras);
    assert.equal(bem(r, 'PETR4').status, 'semAlteracao');
    assert.ok(r.alertas.some(a => a.texto.includes('posterior a 2026')));
  });

  test('compra e venda do mesmo ativo no mesmo dia gera alerta de possível day trade', () => {
    const e = estadoCom([{ ticker: 'PETR4', quantidade: 100, custo: 3000 }], [
      { data: '2026-05-02', tipo: 'compra', ticker: 'PETR4', quantidade: 10, preco: 35 },
      { data: '2026-05-02', tipo: 'venda', ticker: 'PETR4', quantidade: 10, preco: 36 }
    ]);
    const r = Calculo.gerarRelatorio(e, regras);
    assert.ok(r.alertas.some(a => a.texto.includes('day trade')));
  });

  test('ativo sem CNPJ gera alerta', () => {
    const e = estadoCom([], [{ data: '2026-05-02', tipo: 'compra', ticker: 'XPTO3', quantidade: 10, preco: 5 }], {
      XPTO3: { tipo: 'acao', nome: 'Xpto', cnpj: '' }
    });
    const r = Calculo.gerarRelatorio(e, regras);
    assert.ok(r.alertas.some(a => a.texto.includes('CNPJ não informado para XPTO3')));
  });

  test('último dia útil pula fim de semana e vira o ano', () => {
    assert.equal(Calculo.ultimoDiaUtil(2026, 10), '2026-10-30');
    assert.equal(Calculo.ultimoDiaUtil(2026, 13), '2027-01-29');
  });
});
