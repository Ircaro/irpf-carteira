export type TipoAtivo = 'acao' | 'fii' | 'fiagro';

export type OrigemMovimento = 'subscricao' | 'leilaoFracao';

interface MovimentoBase {
  id?: string;
  data: string;
  ticker: string;
  origem?: OrigemMovimento;
}

export interface MovimentoNegociacao extends MovimentoBase {
  tipo: 'compra' | 'venda';
  quantidade: number;
  preco: number;
  taxas?: number;
}

export interface MovimentoProvento extends MovimentoBase {
  tipo: 'dividendo' | 'jcp' | 'rendimento';
  valor: number;
}

export interface MovimentoBonificacao extends MovimentoBase {
  tipo: 'bonificacao';
  quantidade: number;
  preco: number;
}

export interface MovimentoDesdobramento extends MovimentoBase {
  tipo: 'desdobramento';
  fator?: number;
  quantidade?: number;
}

export interface MovimentoGrupamento extends MovimentoBase {
  tipo: 'grupamento';
  fator: number;
}

export interface MovimentoConversao extends MovimentoBase {
  tipo: 'conversao';
  quantidade: number;
  destino: string;
  quantidadeDestino: number;
}

export type Movimento =
  | MovimentoNegociacao
  | MovimentoProvento
  | MovimentoBonificacao
  | MovimentoDesdobramento
  | MovimentoGrupamento
  | MovimentoConversao;

export type TipoMovimento = Movimento['tipo'];

export interface Cadastro {
  tipo: TipoAtivo;
  nome?: string;
  cnpj?: string;
  corretora?: string;
}

export interface PosicaoInicial {
  ticker: string;
  quantidade: number;
  custo: number;
}

export interface Prejuizo {
  acoes: number;
  fii: number;
}

export interface Cotacao {
  preco: number;
  data: string;
}

export interface ValorDeclarado {
  quantidade: number;
  custo: number;
}

export interface EntradaCalculo {
  cadastro: Record<string, Cadastro>;
  posicaoInicial: PosicaoInicial[];
  movimentos: Movimento[];
  prejuizoInicial?: Prejuizo;
  declaradoAnterior?: Record<string, ValorDeclarado>;
  cotacoes?: Record<string, Cotacao>;
}

export interface Estado extends EntradaCalculo {
  versao: number;
  anoCalendario: number;
  prejuizoInicial: Prejuizo;
  cotacoes: Record<string, Cotacao>;
}

export interface RegraBem {
  rotulo: string;
  grupo: string;
  codigo: string;
  descricao: string;
  unidade: [string, string];
  artigo: string;
}

export type ChaveRendimento = 'dividendos' | 'rendimentoFii' | 'bonificacao' | 'lucroAcoesIsento' | 'jcp';

export interface RegraRendimento {
  ficha: string;
  codigo: string;
  descricao: string;
}

export interface RegrasAno {
  anoCalendario: number;
  anoDeclaracao: number;
  limiteIsencaoAcoesMes: number;
  aliquotaAcoes: number;
  aliquotaFii: number;
  darfMinimo: number;
  codigoDarf: string;
  limiteDividendosMesPorEmpresa: number;
  bens: Record<TipoAtivo, RegraBem>;
  rendimentos: Record<ChaveRendimento, RegraRendimento>;
  aproximado?: boolean;
  baseadoEm?: number;
}

export interface Alerta {
  nivel: 'aviso' | 'erro';
  texto: string;
}
