const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const Regras = require('../js/regras');
const Desempenho = require('../js/desempenho');

const regras = Regras.porAno(2026);
const estado = {
  cadastro: {
    PETR4: { tipo: 'acao' },
    BBAS3: { tipo: 'acao' },
    MXRF11: { tipo: 'fii' }
  },
  posicaoInicial: [],
  cotacoes: {
    PETR4: { preco: 40, data: '2026-10-16' }
  },
  movimentos: [
    { data: '2025-01-10', tipo: 'compra', ticker: 'PETR4', quantidade: 100, preco: 30, taxas: 0 },
    { data: '2025-03-15', tipo: 'compra', ticker: 'BBAS3', quantidade: 100, preco: 20, taxas: 0 },
    { data: '2025-05-20', tipo: 'dividendo', ticker: 'PETR4', valor: 150 },
    { data: '2025-08-10', tipo: 'venda', ticker: 'BBAS3', quantidade: 100, preco: 18, taxas: 0 },
    { data: '2026-02-05', tipo: 'compra', ticker: 'MXRF11', quantidade: 100, preco: 10, taxas: 0 },
    { data: '2026-03-31', tipo: 'rendimento', ticker: 'MXRF11', valor: 10 },
    { data: '2026-04-15', tipo: 'jcp', ticker: 'PETR4', valor: 40 }
  ]
};

describe('desempenho da carteira', () => {
  const d = Desempenho.calcular(estado, regras, '2026-10-17');
  const ativo = t => d.ativos.find(a => a.ticker === t);

  test('resultado não realizado usa a cotação informada', () => {
    assert.equal(ativo('PETR4').valorAtual, 4000);
    assert.equal(ativo('PETR4').naoRealizado, 1000);
    assert.equal(ativo('PETR4').resultado, 1190);
  });

  test('ativo vendido continua com o resultado realizado no histórico', () => {
    assert.equal(ativo('BBAS3').quantidade, 0);
    assert.equal(ativo('BBAS3').realizado, -200);
  });

  test('ativo sem cotação entra no patrimônio pelo custo e é sinalizado', () => {
    assert.deepEqual(d.semCotacao, ['MXRF11']);
    assert.equal(ativo('MXRF11').valorAtual, null);
    assert.equal(d.totais.patrimonio, 5000);
  });

  test('totais somam aportes, proventos e resultados de todos os anos', () => {
    assert.equal(d.totais.aportado, 6000);
    assert.equal(d.totais.proventos, 200);
    assert.equal(d.totais.realizado, -200);
    assert.equal(d.totais.naoRealizado, 1000);
    assert.equal(d.totais.resultado, 1000);
    assert.equal(d.totais.resultadoPct, 1000 / 6000);
  });

  test('série mensal vai do primeiro movimento até o mês atual, com custo acumulado', () => {
    assert.equal(d.serie[0].mes, '2025-01');
    assert.equal(d.serie[d.serie.length - 1].mes, '2026-10');
    assert.equal(d.serie.length, 22);
    const mes = m => d.serie.find(s => s.mes === m);
    assert.equal(mes('2025-03').custo, 5000);
    assert.equal(mes('2025-06').custo, 5000);
    assert.equal(mes('2025-08').custo, 3000);
    assert.equal(mes('2026-02').aportes, 1000);
    assert.equal(mes('2026-02').custo, 4000);
    assert.deepEqual(mes('2026-04').proventos, { dividendo: 0, jcp: 40, rendimento: 0 });
    assert.deepEqual(d.anos, [2025, 2026]);
  });
});
