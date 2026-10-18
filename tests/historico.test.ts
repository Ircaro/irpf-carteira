import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import * as Regras from '../src/dominio/regras';
import * as Calculo from '../src/dominio/calculo';
import type { Cadastro, Movimento, PosicaoInicial } from '../src/dominio/tipos';

const regras = Regras.porAno(2026);
const cadastro: Record<string, Cadastro> = {
  PETR4: { tipo: 'acao', nome: 'Petrobras', cnpj: '33.000.167/0001-01' },
  VALE3: { tipo: 'acao', nome: 'Vale', cnpj: '33.592.510/0001-54' },
  BBAS3: { tipo: 'acao', nome: 'Banco do Brasil', cnpj: '00.000.000/0001-91' },
  MXRF11: { tipo: 'fii', nome: 'Maxi Renda', cnpj: '97.521.225/0001-25' }
};
const historico = (movimentos: Movimento[]) => ({ cadastro, posicaoInicial: [] as PosicaoInicial[], movimentos });
const relatorio = (movimentos: Movimento[]) => Calculo.gerarRelatorio(historico(movimentos), regras, Regras.paraAno);
const bem = (r: Calculo.Relatorio, ticker: string) =>
  Object.values(r.bens)
    .flat()
    .find(b => b.ticker === ticker);

describe('histórico de vários anos', () => {
  test('posição de 31/12 do ano anterior é calculada a partir das compras de anos passados', () => {
    const r = relatorio([
      { data: '2023-03-10', tipo: 'compra', ticker: 'PETR4', quantidade: 100, preco: 25 },
      { data: '2024-08-01', tipo: 'compra', ticker: 'PETR4', quantidade: 100, preco: 35 },
      { data: '2026-02-01', tipo: 'compra', ticker: 'PETR4', quantidade: 50, preco: 40 }
    ]);
    const petr = bem(r, 'PETR4');
    assert.equal(petr.status, 'alterado');
    assert.equal(petr.quantidadeInicial, 200);
    assert.equal(petr.valorAnterior, 6000);
    assert.equal(petr.valorAtual, 8000);
  });

  test('ativo sem movimento no ano fica sem alteração e não pede nada', () => {
    const r = relatorio([{ data: '2024-08-01', tipo: 'compra', ticker: 'MXRF11', quantidade: 300, preco: 10 }]);
    assert.equal(bem(r, 'MXRF11').status, 'semAlteracao');
    assert.equal(bem(r, 'MXRF11').valorAnterior, 3000);
  });

  test('ativo vendido por completo em ano anterior não aparece no relatório do ano', () => {
    const r = relatorio([
      { data: '2023-03-10', tipo: 'compra', ticker: 'BBAS3', quantidade: 100, preco: 20 },
      { data: '2024-06-10', tipo: 'venda', ticker: 'BBAS3', quantidade: 100, preco: 25 }
    ]);
    assert.equal(bem(r, 'BBAS3'), undefined);
  });

  test('proventos e vendas de anos anteriores não entram nas fichas do ano', () => {
    const r = relatorio([
      { data: '2025-01-10', tipo: 'compra', ticker: 'PETR4', quantidade: 100, preco: 30 },
      { data: '2025-05-10', tipo: 'dividendo', ticker: 'PETR4', valor: 500 },
      { data: '2025-07-10', tipo: 'venda', ticker: 'PETR4', quantidade: 10, preco: 40 },
      { data: '2026-05-10', tipo: 'dividendo', ticker: 'PETR4', valor: 80 }
    ]);
    const dividendos = r.rendimentos.isentos.find(g => g.codigo === '09');
    assert.equal(dividendos.total, 80);
    assert.equal(r.apuracao.meses.length, 0);
    assert.ok(!r.rendimentos.isentos.some(g => g.codigo === '20'));
  });

  test('prejuízo de ano anterior é compensado no lucro do ano', () => {
    const r = relatorio([
      { data: '2024-02-10', tipo: 'compra', ticker: 'PETR4', quantidade: 1000, preco: 40 },
      { data: '2025-03-10', tipo: 'venda', ticker: 'PETR4', quantidade: 1000, preco: 38 },
      { data: '2025-04-10', tipo: 'compra', ticker: 'VALE3', quantidade: 500, preco: 60 },
      { data: '2026-06-10', tipo: 'venda', ticker: 'VALE3', quantidade: 500, preco: 70 }
    ]);
    assert.equal(r.apuracao.prejuizoAnterior.acoes, 2000);
    const jun = r.apuracao.meses.find(m => m.mes === '2026-06');
    assert.equal(jun.prejuizoAnteriorAcoes, 2000);
    assert.equal(jun.baseAcoes, 3000);
    assert.equal(jun.impostoAcoes, 450);
  });

  test('imposto abaixo de R$ 10 em ano anterior soma no primeiro DARF do ano', () => {
    const r = relatorio([
      { data: '2025-01-10', tipo: 'compra', ticker: 'MXRF11', quantidade: 100, preco: 10 },
      { data: '2025-05-10', tipo: 'venda', ticker: 'MXRF11', quantidade: 20, preco: 12 },
      { data: '2026-05-10', tipo: 'venda', ticker: 'MXRF11', quantidade: 20, preco: 12 }
    ]);
    assert.equal(r.apuracao.darfs.length, 1);
    assert.equal(r.apuracao.darfs[0].valor, 16);
    assert.equal(r.apuracao.darfs[0].acumuladoAnterior, 8);
  });

  test('desdobramento em ano anterior vale para a posição inicial e para o preço médio', () => {
    const r = relatorio([
      { data: '2024-01-10', tipo: 'compra', ticker: 'PETR4', quantidade: 100, preco: 30 },
      { data: '2025-04-10', tipo: 'desdobramento', ticker: 'PETR4', quantidade: 100 },
      { data: '2026-04-10', tipo: 'venda', ticker: 'PETR4', quantidade: 100, preco: 20 }
    ]);
    const petr = bem(r, 'PETR4');
    assert.equal(petr.quantidadeInicial, 200);
    assert.equal(petr.valorAnterior, 3000);
    assert.equal(petr.valorAtual, 1500);
    const abr = r.apuracao.meses.find(m => m.mes === '2026-04');
    assert.equal(abr.lucroAcoes, 500);
  });

  test('bonificação em ano anterior entra no custo da posição inicial', () => {
    const r = relatorio([
      { data: '2024-01-10', tipo: 'compra', ticker: 'PETR4', quantidade: 100, preco: 30 },
      { data: '2025-04-10', tipo: 'bonificacao', ticker: 'PETR4', quantidade: 10, preco: 12 }
    ]);
    const petr = bem(r, 'PETR4');
    assert.equal(petr.quantidadeInicial, 110);
    assert.equal(petr.valorAnterior, 3120);
    assert.ok(!r.rendimentos.isentos.some(g => g.codigo === '18'));
  });

  test('anos sem regra própria usam a regra mais próxima e geram aviso', () => {
    const r = relatorio([
      { data: '2021-01-10', tipo: 'compra', ticker: 'PETR4', quantidade: 1000, preco: 30 },
      { data: '2021-03-10', tipo: 'venda', ticker: 'PETR4', quantidade: 1000, preco: 25 }
    ]);
    assert.equal(r.apuracao.prejuizoAnterior.acoes, 5000);
    assert.ok(r.alertas.some(a => a.texto.includes('regras de 2026')));
  });
});

describe('conversão de fundos e Fiagro', () => {
  const comCadastro = (movimentos: Movimento[], extra: Record<string, Cadastro> = {}) =>
    Calculo.gerarRelatorio(
      {
        cadastro: {
          ...cadastro,
          IRDM11: { tipo: 'fii', nome: 'Iridium Recebíveis', cnpj: '1' },
          IRIM11: { tipo: 'fii', nome: 'Iridium', cnpj: '2' },
          SNAG11: { tipo: 'fiagro', nome: 'Suno Agro', cnpj: '3' },
          ...extra
        },
        posicaoInicial: [],
        movimentos
      },
      regras,
      Regras.paraAno
    );

  test('conversão leva o custo do fundo de origem para o de destino', () => {
    const r = comCadastro([
      { data: '2022-05-23', tipo: 'compra', ticker: 'IRDM11', quantidade: 6, preco: 102.2 },
      { data: '2025-12-01', tipo: 'conversao', ticker: 'IRDM11', destino: 'IRIM11', quantidade: 6, quantidadeDestino: 5.3 },
      { data: '2026-01-14', tipo: 'venda', ticker: 'IRIM11', quantidade: 1.3, preco: 88.9 / 1.3 }
    ]);
    const irim = bem(r, 'IRIM11');
    assert.equal(irim.quantidadeInicial, 5.3);
    assert.equal(irim.valorAnterior, 613.2);
    assert.equal(irim.quantidadeFinal, 4);
    assert.equal(irim.valorAtual, 462.79);
    assert.equal(bem(r, 'IRDM11'), undefined);
    const jan = r.apuracao.meses.find(m => m.mes === '2026-01');
    assert.equal(jan.lucroFii, -61.51);
    assert.equal(jan.prejuizoFii, 61.51);
  });

  test('Fiagro usa grupo 07 código 02 e segue a tributação de FII', () => {
    const r = comCadastro([
      { data: '2025-10-20', tipo: 'compra', ticker: 'SNAG11', quantidade: 100, preco: 10 },
      { data: '2026-03-10', tipo: 'venda', ticker: 'SNAG11', quantidade: 50, preco: 11 },
      { data: '2026-03-31', tipo: 'rendimento', ticker: 'SNAG11', valor: 12 }
    ]);
    const snag = bem(r, 'SNAG11');
    assert.equal(snag.grupo, '07');
    assert.equal(snag.codigo, '02');
    assert.match(snag.discriminacao, /^50 cotas do Fiagro SNAG11/);
    const mar = r.apuracao.meses.find(m => m.mes === '2026-03');
    assert.equal(mar.isento, false);
    assert.equal(mar.impostoFii, 10);
    assert.equal(r.rendimentos.isentos.find(g => g.chave === 'rendimentoFii').codigo, '26');
  });
});

describe('valor declarado no ano anterior', () => {
  const movimentos: Movimento[] = [
    { data: '2024-01-10', tipo: 'compra', ticker: 'PETR4', quantidade: 100, preco: 30 },
    { data: '2025-12-20', tipo: 'bonificacao', ticker: 'PETR4', quantidade: 0.5, preco: 10 },
    { data: '2026-02-10', tipo: 'venda', ticker: 'PETR4', quantidade: 0.5, preco: 12 }
  ];

  test('sem valor informado, o cartão usa o calculado e sinaliza', () => {
    const r = Calculo.gerarRelatorio({ cadastro, posicaoInicial: [], movimentos }, regras, Regras.paraAno);
    const petr = bem(r, 'PETR4');
    assert.equal(petr.status, 'alterado');
    assert.equal(petr.valorAnterior, 3005);
    assert.equal(petr.anteriorCalculado, true);
  });

  test('valor informado da declaração anterior prevalece sobre o calculado', () => {
    const r = Calculo.gerarRelatorio(
      { cadastro, posicaoInicial: [], movimentos, declaradoAnterior: { PETR4: { quantidade: 100, custo: 3000 } } },
      regras,
      Regras.paraAno
    );
    const petr = bem(r, 'PETR4');
    assert.equal(petr.quantidadeInicial, 100);
    assert.equal(petr.valorAnterior, 3000);
    assert.equal(petr.anteriorInformado, true);
    assert.equal(petr.calculadoAnterior.custo, 3005);
    assert.equal(petr.status, 'alterado');
    assert.equal(petr.valorAtual, 2990.05);
  });
});
