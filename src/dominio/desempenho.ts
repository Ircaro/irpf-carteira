import { arred, processar } from './calculo';
import type { EntradaCalculo, RegrasAno, TipoAtivo } from './tipos';

type ProventoEmDinheiro = 'dividendo' | 'jcp' | 'rendimento';
const PROVENTOS_EM_DINHEIRO: readonly string[] = ['dividendo', 'jcp', 'rendimento'];

export interface DesempenhoAtivo {
  ticker: string;
  tipo: TipoAtivo;
  quantidade: number;
  custo: number;
  precoMedio: number;
  preco: number | null;
  dataPreco?: string;
  valorAtual: number | null;
  naoRealizado: number | null;
  naoRealizadoPct: number | null;
  realizado: number;
  proventos: number;
  resultado: number;
  aportado: number;
}

export interface PontoSerie {
  mes: string;
  aportes: number;
  proventos: Record<ProventoEmDinheiro, number>;
  custo: number;
  realizado: number;
}

export interface Totais {
  custo: number;
  patrimonio: number;
  naoRealizado: number;
  naoRealizadoPct: number;
  realizado: number;
  proventos: number;
  aportado: number;
  resultado: number;
  resultadoPct: number;
}

export interface Desempenho {
  hoje: string;
  ativos: DesempenhoAtivo[];
  semCotacao: string[];
  totais: Totais;
  somenteLeiloes: boolean;
  serie: PontoSerie[];
  anos: number[];
}

export function mesesEntre(inicio: string, fim: string): string[] {
  const meses: string[] = [];
  let [a = 0, m = 0] = inicio.split('-').map(Number);
  const [af = 0, mf = 0] = fim.split('-').map(Number);
  while (a < af || (a === af && m <= mf)) {
    meses.push(`${a}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      a += 1;
    }
  }
  return meses;
}

const somar = (mapa: Record<string, number>, chave: string, valor: number) => (mapa[chave] = arred((mapa[chave] || 0) + valor));

export function calcular(estado: EntradaCalculo, regras: RegrasAno, hoje: string): Desempenho {
  const custoNoMes: Record<string, number> = {};
  const proc = processar(estado, regras, {
    ate: hoje,
    aoAplicar: (m, posicoes) => {
      let total = 0;
      for (const p of posicoes.values()) total += p.custo;
      custoNoMes[m.data.slice(0, 7)] = arred(total);
    }
  });

  const aportadoPorAtivo: Record<string, number> = {};
  const aportesPorMes: Record<string, number> = {};
  for (const p of estado.posicaoInicial) somar(aportadoPorAtivo, p.ticker, Number(p.custo) || 0);
  for (const m of estado.movimentos) {
    if (m.tipo !== 'compra' || m.data > hoje) continue;
    const valor = m.quantidade * m.preco + (Number(m.taxas) || 0);
    somar(aportadoPorAtivo, m.ticker, valor);
    somar(aportesPorMes, m.data.slice(0, 7), valor);
  }

  const proventosPorAtivo: Record<string, number> = {};
  const proventosPorMes: Record<string, Record<string, number>> = {};
  for (const p of proc.proventos) {
    if (!PROVENTOS_EM_DINHEIRO.includes(p.tipo)) continue;
    somar(proventosPorAtivo, p.ticker, p.valor);
    const chaveMes = p.data.slice(0, 7);
    const mes = (proventosPorMes[chaveMes] = proventosPorMes[chaveMes] || {});
    somar(mes, p.tipo, p.valor);
  }

  const realizadoPorAtivo: Record<string, number> = {};
  const realizadoPorMes: Record<string, number> = {};
  for (const v of proc.vendas) {
    somar(realizadoPorAtivo, v.ticker, v.lucro);
    somar(realizadoPorMes, v.mes, v.lucro);
  }

  const cotacoes = estado.cotacoes || {};
  const ativos: DesempenhoAtivo[] = proc.posicoes
    .map(p => {
      const cot = cotacoes[p.ticker];
      const preco = cot && Number(cot.preco) > 0 ? Number(cot.preco) : null;
      const valorAtual = p.quantidade > 0 && preco != null ? arred(p.quantidade * preco) : p.quantidade > 0 ? null : 0;
      const naoRealizado = valorAtual != null ? arred(valorAtual - p.custo) : null;
      const realizado = realizadoPorAtivo[p.ticker] || 0;
      const proventos = proventosPorAtivo[p.ticker] || 0;
      return {
        ticker: p.ticker,
        tipo: p.tipo,
        quantidade: p.quantidade,
        custo: arred(p.custo),
        precoMedio: p.quantidade > 0 ? p.custo / p.quantidade : 0,
        preco,
        dataPreco: cot?.data,
        valorAtual,
        naoRealizado,
        naoRealizadoPct: naoRealizado != null && p.custo > 0 ? naoRealizado / p.custo : null,
        realizado,
        proventos,
        resultado: arred((naoRealizado || 0) + realizado + proventos),
        aportado: aportadoPorAtivo[p.ticker] || 0
      };
    })
    .filter(a => a.quantidade > 0 || a.realizado || a.proventos)
    .sort((a, b) => a.ticker.localeCompare(b.ticker));

  const emCarteira = ativos.filter(a => a.quantidade > 0);
  const semCotacao = emCarteira.filter(a => a.preco == null).map(a => a.ticker);
  const soma = (lista: DesempenhoAtivo[], valor: (a: DesempenhoAtivo) => number | null) =>
    arred(lista.reduce((t, a) => t + (valor(a) || 0), 0));
  const custo = soma(emCarteira, a => a.custo);
  const patrimonio = arred(emCarteira.reduce((t, a) => t + (a.valorAtual != null ? a.valorAtual : a.custo), 0));
  const naoRealizado = soma(emCarteira, a => a.naoRealizado);
  const realizado = soma(ativos, a => a.realizado);
  const proventos = soma(ativos, a => a.proventos);
  const aportado = soma(ativos, a => a.aportado);
  const resultado = arred(naoRealizado + realizado + proventos);

  const mesesComDado = [
    ...Object.keys(custoNoMes),
    ...Object.keys(aportesPorMes),
    ...Object.keys(proventosPorMes),
    ...Object.keys(realizadoPorMes)
  ].sort();
  let serie: PontoSerie[] = [];
  const primeiroMes = mesesComDado[0];
  if (primeiroMes) {
    let custoCorrente = estado.posicaoInicial.reduce((t, p) => t + (Number(p.custo) || 0), 0);
    serie = mesesEntre(primeiroMes, hoje.slice(0, 7)).map(mes => {
      const custoMes = custoNoMes[mes];
      if (custoMes != null) custoCorrente = custoMes;
      const pm = proventosPorMes[mes] || {};
      return {
        mes,
        aportes: aportesPorMes[mes] || 0,
        proventos: { dividendo: pm.dividendo || 0, jcp: pm.jcp || 0, rendimento: pm.rendimento || 0 },
        custo: arred(custoCorrente),
        realizado: realizadoPorMes[mes] || 0
      };
    });
  }

  return {
    hoje,
    ativos,
    semCotacao,
    totais: {
      custo,
      patrimonio,
      naoRealizado,
      naoRealizadoPct: custo > 0 ? naoRealizado / custo : 0,
      realizado,
      proventos,
      aportado,
      resultado,
      resultadoPct: aportado > 0 ? resultado / aportado : 0
    },
    somenteLeiloes: proc.vendas.length > 0 && proc.vendas.every(v => v.origem === 'leilaoFracao'),
    serie,
    anos: [...new Set(serie.map(s => Number(s.mes.slice(0, 4))))]
  };
}
