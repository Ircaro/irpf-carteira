import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import * as Regras from '../src/dominio/regras';
import * as Importador from '../src/importacao/importador-b3';
import type { Ajustes, ArquivoPlanilha, Celula } from '../src/importacao/importador-b3';
import type { Movimento } from '../src/dominio/tipos';

type MovimentoSolto = Movimento & { quantidade?: number; preco?: number; valor?: number };
import { lerXlsx } from '../scripts/lib/xlsx';

const CABECALHO = ['Entrada/Saída', 'Data', 'Movimentação', 'Produto', 'Instituição', 'Quantidade', 'Preço unitário', 'Valor da Operação'];
const XP = 'XP INVESTIMENTOS CCTVM S/A';
const NU = 'NU INVEST CORRETORA DE VALORES S.A.';
const arquivo = (nome: string, linhas: Celula[][]): ArquivoPlanilha => ({ nome, data: '2026-10-17', abas: [{ nome: 'Movimentação', linhas: [CABECALHO, ...linhas] }] });

const linhas2025: Celula[][] = [
  ['Credito', '10/01/2025', 'Transferência - Liquidação', 'PETR4 - PETROLEO BRASILEIRO S.A. PETROBRAS', XP, 10, 30, 300],
  ['Credito', '12/01/2025', 'Transferência - Liquidação', 'MXRF11 - MAXI RENDA FDO INV IMOB - FII', NU, 100, 10, 1000],
  ['Credito', '15/01/2025', 'Transferência - Liquidação', 'SNAG11 - SUNO AGRO - FIAGRO-IMOBILIARIO', NU, 50, 10, 500],
  ['Credito', '15/02/2025', 'Rendimento', 'MXRF11 - MAXI RENDA FDO INV IMOB - FII', NU, 100, 0.1, 10],
  ['Credito', '20/03/2025', 'Juros Sobre Capital Próprio', 'PETR4 - PETROLEO BRASILEIRO S.A. PETROBRAS', XP, 10, 1, 8.5],
  ['Credito', '20/03/2025', 'Dividendo', 'PETR4 - PETROLEO BRASILEIRO S.A. PETROBRAS', XP, 10, 2, 20],
  ['Credito', '05/08/2025', 'Direito de Subscrição', 'MXRF12 - MAXI RENDA FDO INV IMOB - FII', NU, 20, '-', '-'],
  ['Debito', '20/08/2025', 'Solicitação de Subscrição', 'MXRF12 - MAXI RENDA FDO INV IMOB - FII', NU, 20, '-', '-'],
  ['Credito', '21/08/2025', 'Recibo de Subscrição', 'MXRF13 - MAXI RENDA FUNDO DE INVESTIMENTO IMOBILIARIO - FII', NU, 20, '-', '-'],
  ['Credito', '15/09/2025', 'Rendimento', 'MXRF11 - MAXI RENDA FDO INV IMOB - FII', NU, 100, 0.1, 10],
  ['Credito', '15/09/2025', 'Rendimento', 'MXRF13 - MAXI RENDA FUNDO DE INVESTIMENTO IMOBILIARIO - FII', NU, 20, 0.05, 1],
  ['Credito', '05/10/2025', 'Atualização', 'MXRF11 - MAXI RENDA FDO INV IMOB - FII', NU, 20, '-', '-'],
  ['Credito', '22/12/2025', 'Bonificação em Ativos', 'PETR4 - PETROLEO BRASILEIRO S.A. PETROBRAS', XP, 1.5, '-', '-'],
  ['Debito', '22/12/2025', 'APLICAÇÃO', 'CDB - BANCO ITAU UNIBANCO S.A.', 'ITAU UNIBANCO S.A.', 1, 100, 100],
  ['Credito', '23/12/2025', 'Rendimento', 'MXRF11 - MAXI RENDA FDO INV IMOB - FII', 'ITAU UNIBANCO S.A.', 5, 0.1, 0.5]
];
const linhas2026: Celula[][] = [
  ['Debito', '10/01/2026', 'Fração em Ativos', 'PETR4 - PETROLEO BRASILEIRO S.A. PETROBRAS', XP, 0.5, '-', '-'],
  ['Credito', '05/02/2026', 'Leilão de Fração', 'PETR4 - PETROLEO BRASILEIRO S.A. PETROBRAS', XP, 0.5, 40, 20],
  ['Debito', '28/02/2026', 'Transferência', 'PETR4 - PETROLEO BRASILEIRO S.A. PETROBRAS', XP, 11, '-', '-'],
  ['Credito', '28/02/2026', 'Transferência', 'PETR4 - PETROLEO BRASILEIRO S.A. PETROBRAS', NU, 11, '-', '-'],
  ['Credito', '15/03/2026', 'Rendimento', 'MXRF11 - MAXI RENDA FDO INV IMOB - FII', NU, 120, 0.1, 12]
];

const ajustes: Ajustes = {
  ignorarInstituicoes: ['ITAU UNIBANCO'],
  precos: { 'MXRF11|2025-08-20': 10.28 },
  custoBonificacao: { 'PETR4|2025-12-22': 20 }
};

describe('importação do extrato de movimentação da B3', () => {
  const { estado, resumo } = Importador.importar(
    [arquivo('mov-2025.xlsx', linhas2025), arquivo('mov-2026.xlsx', linhas2026), arquivo('mov-repetido.xlsx', linhas2026.slice(4))],
    { ajustes, anoCalendario: 2026 }
  );
  const movs = (ticker: string, tipo?: string) => estado.movimentos.filter(m => m.ticker === ticker && (!tipo || m.tipo === tipo)) as MovimentoSolto[];

  test('liquidação vira compra com o preço do extrato', () => {
    assert.deepEqual(movs('PETR4', 'compra').map(m => [m.data, m.quantidade, m.preco]), [['2025-01-10', 10, 30]]);
  });

  test('subscrição exercida vira compra do ticker principal com o preço do arquivo de ajustes', () => {
    const sub = movs('MXRF11', 'compra').find(m => m.origem === 'subscricao');
    assert.deepEqual([sub.data, sub.quantidade, sub.preco], ['2025-08-20', 20, 10.28]);
    assert.ok(!estado.movimentos.some(m => m.ticker === 'MXRF12' || m.ticker === 'MXRF13'));
  });

  test('rendimento do recibo de subscrição é atribuído ao fundo principal', () => {
    assert.ok(movs('MXRF11', 'rendimento').some(m => m.data === '2025-09-15' && m.valor === 1));
  });

  test('leilão de fração vira venda da fração pelo valor recebido', () => {
    assert.deepEqual(movs('PETR4', 'venda').map(m => [m.quantidade, m.preco, m.origem]), [[0.5, 40, 'leilaoFracao']]);
  });

  test('bonificação usa o custo atribuído do arquivo de ajustes', () => {
    assert.deepEqual(movs('PETR4', 'bonificacao').map(m => [m.quantidade, m.preco]), [[1.5, 20]]);
  });

  test('Fiagro é reconhecido pelo nome', () => {
    assert.equal(estado.cadastro.SNAG11.tipo, 'fiagro');
    assert.equal(estado.cadastro.MXRF11.tipo, 'fii');
    assert.equal(estado.cadastro.PETR4.tipo, 'acao');
  });

  test('instituição ignorada e renda fixa ficam de fora', () => {
    assert.ok(!movs('MXRF11', 'rendimento').some(m => m.valor === 0.5));
    assert.equal(resumo.ignoradas['Instituição ignorada (ITAU UNIBANCO S.A.)'], 2);
  });

  test('transferência de custódia entre corretoras não vira compra nem venda', () => {
    assert.equal(movs('PETR4', 'compra').length, 1);
    assert.equal(resumo.ignoradas['Transferência'], 2);
  });

  test('linha repetida em dois arquivos entra uma vez só', () => {
    assert.equal(movs('MXRF11', 'rendimento').filter(m => m.data === '2026-03-15').length, 1);
  });

  test('sem pendências quando os ajustes cobrem preço de subscrição e custo de bonificação', () => {
    assert.deepEqual(resumo.pendencias, []);
    assert.deepEqual(resumo.ajustesNaoUsados, []);
  });

  test('quantidades informadas nos proventos batem com a posição calculada', () => {
    const div = Importador.conferirQuantidades(estado, Regras.porAno(2026), resumo.quantidadesInformadas);
    assert.deepEqual(div, []);
  });

  test('subscrição sem preço vira pendência', () => {
    const { resumo: r } = Importador.importar([arquivo('mov.xlsx', linhas2025)], { ajustes: {}, anoCalendario: 2026 });
    assert.ok(r.pendencias.some(p => p.includes('MXRF11|2025-08-20')));
    assert.ok(r.pendencias.some(p => p.includes('PETR4|2025-12-22')));
  });

  test('cabeçalho diferente do esperado gera erro listando as colunas encontradas', () => {
    const ruim: ArquivoPlanilha = { nome: 'x.xlsx', abas: [{ nome: 'A', linhas: [['Entrada/Saída', 'Data', 'Movimentação', 'Produto', 'Qtd']] }] };
    assert.throws(() => Importador.importar([ruim], {}), /Colunas no arquivo: Entrada\/Saída \| Data/);
  });
});

function montarXlsx(arquivos: [string, string, boolean][]): Buffer {
  const partes: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [nome, conteudo, comprimir] of arquivos) {
    const bruto = Buffer.from(conteudo, 'utf8');
    const dados = comprimir ? deflateRawSync(bruto) : bruto;
    const nomeBuf = Buffer.from(nome, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(comprimir ? 8 : 0, 8);
    local.writeUInt32LE(dados.length, 18);
    local.writeUInt32LE(bruto.length, 22);
    local.writeUInt16LE(nomeBuf.length, 26);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(comprimir ? 8 : 0, 10);
    cd.writeUInt32LE(dados.length, 20);
    cd.writeUInt32LE(bruto.length, 24);
    cd.writeUInt16LE(nomeBuf.length, 28);
    cd.writeUInt32LE(offset, 42);
    partes.push(local, nomeBuf, dados);
    central.push(cd, nomeBuf);
    offset += local.length + nomeBuf.length + dados.length;
  }
  const cdBuf = Buffer.concat(central);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(arquivos.length, 8);
  fim.writeUInt16LE(arquivos.length, 10);
  fim.writeUInt32LE(cdBuf.length, 12);
  fim.writeUInt32LE(offset, 16);
  return Buffer.concat([...partes, cdBuf, fim]);
}

describe('leitor de .xlsx', () => {
  test('lê textos compartilhados, números, células vazias e entidades XML', () => {
    const buf = montarXlsx([
      ['xl/workbook.xml', '<workbook><sheets><sheet name="Movimentação" sheetId="1" r:id="rId1"/></sheets></workbook>', false],
      ['xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>', false],
      ['xl/sharedStrings.xml', '<sst><si><t>Produto</t></si><si><r><t>MXRF11 - MAXI </t></r><r><t>RENDA &amp; CIA</t></r></si></sst>', true],
      [
        'xl/worksheets/sheet1.xml',
        '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="inlineStr"><is><t>Qtd</t></is></c></row><row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"/><c r="C2"><v>12.5</v></c></row></sheetData></worksheet>',
        true
      ]
    ]);
    const [aba] = lerXlsx(buf);
    assert.equal(aba.nome, 'Movimentação');
    assert.deepEqual(aba.linhas, [
      ['Produto', null, 'Qtd'],
      ['MXRF11 - MAXI RENDA & CIA', null, 12.5]
    ]);
  });
});
