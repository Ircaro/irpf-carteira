import { processar } from '../dominio/calculo';
import { ATIVOS } from '../dominio/regras';
import type {
  Cadastro,
  Cotacao,
  Estado,
  Movimento,
  MovimentoBonificacao,
  MovimentoConversao,
  MovimentoDesdobramento,
  MovimentoNegociacao,
  MovimentoProvento,
  RegrasAno,
  TipoAtivo,
  ValorDeclarado
} from '../dominio/tipos';

export type Celula = string | number | boolean | null;

export interface Aba {
  nome: string;
  linhas: Celula[][];
}

export interface ArquivoPlanilha {
  nome: string;
  data?: string;
  abas: Aba[];
}

export interface Ajustes {
  ignorarInstituicoes?: string[];
  precos?: Record<string, number>;
  custoBonificacao?: Record<string, number>;
  conversoes?: { data: string; de: string; para: string; quantidadeDe: number; quantidadePara: number }[];
  ignorarLinhas?: string[];
  tipos?: Record<string, TipoClassificado>;
  cadastro?: Record<string, Partial<Cadastro>>;
  declaradoAnterior?: Record<string, ValorDeclarado>;
}

export interface OpcoesImportacao {
  ajustes?: Ajustes;
  anoCalendario?: number;
  hoje?: string;
}

export type TipoClassificado = TipoAtivo | 'etf' | 'bdr' | 'rendaFixa' | 'outro';

export interface Classificacao {
  tipo: TipoClassificado;
  certeza: boolean;
}

export interface QuantidadeInformada {
  ticker: string;
  original: string;
  data: string;
  instituicao: string;
  quantidade: number;
}

export interface ResumoImportacao {
  arquivos: { arquivo: string; aba: string; tipo: string; linhas: number }[];
  temNegociacao: boolean;
  periodos: Partial<Record<NomeLayout, { de: string; ate: string }>>;
  compras: number;
  vendas: number;
  proventos: number;
  eventos: number;
  ativos: string[];
  aConfirmar: { ticker: string; tipoAssumido: TipoClassificado; nome: string }[];
  foraDoEscopo: Record<string, string[]>;
  ignoradas: Record<string, number>;
  pendencias: string[];
  ajustesNaoUsados: string[];
  avisos: string[];
  posicaoB3: Record<string, number>;
  quantidadesInformadas: QuantidadeInformada[];
}

export interface Divergencia {
  ticker: string;
  data: string;
  informada: number;
  calculada: number;
}

type NomeLayout = 'negociacao' | 'movimentacao' | 'posicao';

interface Layout {
  descricao: string;
  assinatura: string[];
  colunas: Record<string, string[]>;
  obrigatorias: string[];
}

type Registro = Record<string, Celula | undefined>;

interface Bloco {
  arquivo: string;
  aba: string;
  layout: NomeLayout;
  dicaTipo: TipoClassificado | null;
  registros: Registro[];
  dataArquivo?: string;
}

export const normalizar = (s: unknown): string =>
  String(s == null ? '' : s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export const LAYOUTS: Record<NomeLayout, Layout> = {
  negociacao: {
    descricao: 'Extrato de negociação',
    assinatura: ['data do negocio', 'codigo de negociacao'],
    colunas: {
      data: ['data do negocio'],
      tipo: ['tipo de movimentacao'],
      mercado: ['mercado'],
      instituicao: ['instituicao'],
      ticker: ['codigo de negociacao'],
      quantidade: ['quantidade'],
      preco: ['preco'],
      valor: ['valor']
    },
    obrigatorias: ['data', 'tipo', 'ticker', 'quantidade', 'preco']
  },
  movimentacao: {
    descricao: 'Extrato de movimentação',
    assinatura: ['entrada saida', 'movimentacao', 'produto'],
    colunas: {
      sentido: ['entrada saida'],
      data: ['data'],
      movimentacao: ['movimentacao'],
      produto: ['produto'],
      instituicao: ['instituicao'],
      quantidade: ['quantidade'],
      preco: ['preco unitario'],
      valor: ['valor da operacao']
    },
    obrigatorias: ['sentido', 'data', 'movimentacao', 'produto', 'quantidade', 'valor']
  },
  posicao: {
    descricao: 'Posição',
    assinatura: ['codigo de negociacao', 'quantidade'],
    colunas: {
      produto: ['produto'],
      instituicao: ['instituicao'],
      ticker: ['codigo de negociacao'],
      cnpj: ['cnpj da empresa', 'cnpj do fundo', 'cnpj'],
      quantidade: ['quantidade'],
      preco: ['preco de fechamento'],
      valor: ['valor atualizado']
    },
    obrigatorias: ['ticker', 'quantidade']
  }
};

const PROVENTOS: Record<string, MovimentoProvento['tipo']> = {
  dividendo: 'dividendo',
  'juros sobre capital proprio': 'jcp',
  rendimento: 'rendimento'
};

const SEM_EFEITO = [
  'transferencia',
  'atualizacao',
  'fracao em ativos',
  'direito de subscricao',
  'direitos de subscricao nao exercido',
  'direitos de subscricao exercido',
  'recibo de subscricao',
  'cessao de direitos',
  'cessao de direitos solicitada',
  'juros sobre capital proprio transferido',
  'emprestimo'
];

const dataBr = (iso: string) => iso.split('-').reverse().join('/');

const APELIDOS: [RegExp, string][] = [
  [/^nu invest/, 'Nu Invest'],
  [/^xp invest/, 'XP Investimentos'],
  [/^rico invest/, 'Rico Investimentos'],
  [/^btg pactual/, 'BTG Pactual'],
  [/^clear corretora/, 'Clear Corretora'],
  [/^inter (dtvm|distribuidora)/, 'Inter Invest']
];

const SUPORTADOS: readonly string[] = ['acao', 'fii', 'fiagro'];
const ehSuportado = (tipo: TipoClassificado): tipo is TipoAtivo => SUPORTADOS.includes(tipo);

export function identificarLayout(cabecalho: Celula[]): NomeLayout | null {
  const presentes = new Set(cabecalho.map(normalizar));
  for (const nome of Object.keys(LAYOUTS) as NomeLayout[]) {
    if (!LAYOUTS[nome].assinatura.every(c => presentes.has(c))) continue;
    if (nome === 'posicao' && (presentes.has('data do negocio') || presentes.has('movimentacao'))) continue;
    return nome;
  }
  return null;
}

function mapearColunas(cabecalho: Celula[], layout: Layout): Record<string, number> {
  const norm = cabecalho.map(normalizar);
  const indices: Record<string, number> = {};
  for (const [campo, aliases] of Object.entries(layout.colunas)) {
    const i = norm.findIndex(h => aliases.includes(h));
    if (i >= 0) indices[campo] = i;
  }
  const faltando = layout.obrigatorias.filter(c => indices[c] === undefined);
  if (faltando.length) {
    throw new Error(`${layout.descricao}: não encontrei as colunas ${faltando.join(', ')}. Colunas no arquivo: ${cabecalho.filter(Boolean).join(' | ')}`);
  }
  return indices;
}

function localizarTabela(linhas: Celula[][]): { layout: NomeLayout; inicio: number } | null {
  for (let i = 0; i < Math.min(linhas.length, 15); i++) {
    const layout = identificarLayout(linhas[i] || []);
    if (layout) return { layout, inicio: i };
  }
  return null;
}

export function numero(v: Celula | undefined): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  const s = String(v).replace(/R\$|\s/g, '');
  if (!s || s === '-') return null;
  const n = s.includes(',') ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s);
  return Number.isFinite(n) ? n : null;
}

export function data(v: Celula | undefined): string | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000).toISOString().slice(0, 10);
  const s = String(v).trim();
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? iso[0] : null;
}

export function limparTicker(t: unknown): string {
  const s = String(t || '').trim().toUpperCase();
  return /^[A-Z]{4}\d{1,2}F$/.test(s) ? s.slice(0, -1) : s;
}

export const tickerBase = (t: string): string => (/^[A-Z]{4}1[2-5]$/.test(t) ? `${t.slice(0, 4)}11` : t);

export function separarProduto(produto: unknown): { ticker: string; nome: string } {
  const s = String(produto || '').trim();
  const m = s.match(/^([A-Z]{4}\d{1,2}F?)\s*-\s*(.+)$/i);
  if (m && m[1] && m[2]) return { ticker: limparTicker(m[1]), nome: m[2].trim() };
  return { ticker: '', nome: s };
}

function tipoPelaAba(nomeAba: string): TipoClassificado | null {
  const n = normalizar(nomeAba);
  if (n.includes('acoes') || n.includes('acao')) return 'acao';
  if (n.includes('fiagro')) return 'fiagro';
  if (n.includes('imobiliario') || /\bfii\b/.test(n) || n.includes('fundo')) return 'fii';
  if (n.includes('etf')) return 'etf';
  if (n.includes('bdr')) return 'bdr';
  if (n.includes('tesouro') || n.includes('renda fixa')) return 'rendaFixa';
  return null;
}

export function classificar(ticker: string, nome: string | undefined, dica: TipoClassificado | null | undefined): Classificacao {
  const n = normalizar(nome);
  if (n.includes('fiagro')) return { tipo: 'fiagro', certeza: true };
  if (dica) return { tipo: dica, certeza: true };
  const conhecido = ATIVOS[ticker];
  if (conhecido) return { tipo: conhecido.tipo, certeza: true };
  if (/^[A-Z]{4}(3|4|5|6|7|8)$/.test(ticker)) return { tipo: 'acao', certeza: true };
  if (/^[A-Z]{4}(32|33|34|35|39)$/.test(ticker)) return { tipo: 'bdr', certeza: true };
  if (/^[A-Z]{4}11$/.test(ticker)) {
    if (n.includes('imobiliari') || /\bfii\b/.test(n) || /\bfdo inv imob\b/.test(n) || n.includes('fundo de fundos')) return { tipo: 'fii', certeza: true };
    if (n.includes('indice') || /\betf\b/.test(n)) return { tipo: 'etf', certeza: true };
    if (/\b(s a|sa|unt|unit)\b/.test(n)) return { tipo: 'acao', certeza: true };
    return { tipo: 'fii', certeza: false };
  }
  return { tipo: 'outro', certeza: false };
}

function lerArquivos(arquivos: ArquivoPlanilha[]): { blocos: Bloco[]; avisos: string[] } {
  const blocos: Bloco[] = [];
  const avisos: string[] = [];
  for (const arq of arquivos) {
    let reconhecido = false;
    for (const aba of arq.abas) {
      const local = localizarTabela(aba.linhas);
      if (!local) continue;
      reconhecido = true;
      const layout = LAYOUTS[local.layout];
      const idx = mapearColunas(aba.linhas[local.inicio] || [], layout);
      const registros: Registro[] = [];
      for (const linha of aba.linhas.slice(local.inicio + 1)) {
        if (!linha || linha.every(c => c == null || c === '')) continue;
        const reg: Registro = {};
        for (const [campo, i] of Object.entries(idx)) reg[campo] = linha[i];
        registros.push(reg);
      }
      blocos.push({ arquivo: arq.nome, aba: aba.nome, layout: local.layout, dicaTipo: tipoPelaAba(aba.nome), registros, dataArquivo: arq.data });
    }
    if (!reconhecido) avisos.push(`${arq.nome}: não reconheci como extrato da B3 (negociação, movimentação ou posição).`);
  }
  return { blocos, avisos };
}

function deduplicar<T>(itens: { arquivo: string; chave: string; item: T }[]): T[] {
  const maxima = new Map<string, { n: number; item: T }>();
  const contagem = new Map<string, number>();
  for (const { arquivo, chave, item } of itens) {
    const k = `${arquivo}|${chave}`;
    const n = (contagem.get(k) || 0) + 1;
    contagem.set(k, n);
    const atual = maxima.get(chave);
    if (!atual || n > atual.n) maxima.set(chave, { n, item: atual ? atual.item : item });
  }
  const saida: T[] = [];
  for (const { n, item } of maxima.values()) for (let i = 0; i < n; i++) saida.push(item);
  return saida;
}

type RegistroMovimentacao = Registro & { data: string };

export function importar(arquivos: ArquivoPlanilha[], opcoes: OpcoesImportacao = {}): { estado: Estado; resumo: ResumoImportacao } {
  const ajustes = opcoes.ajustes || {};
  const precos = ajustes.precos || {};
  const custoBonificacao = ajustes.custoBonificacao || {};
  const ignorarInstituicoes = (ajustes.ignorarInstituicoes || []).map(normalizar);
  const ignorarLinhas = new Set((ajustes.ignorarLinhas || []).map(normalizar));
  const usados = new Set<string>();

  const { blocos, avisos } = lerArquivos(arquivos);
  const temNegociacao = blocos.some(b => b.layout === 'negociacao');
  const dicas: Record<string, TipoClassificado> = {};
  const nomes: Record<string, string> = {};
  const cnpjs: Record<string, string> = {};
  const instituicoes: Record<string, Record<string, { nome: string; ultima: string }>> = {};
  const cotacoes: Record<string, Cotacao> = {};
  const posicaoB3: Record<string, number> = {};
  const negocios: MovimentoNegociacao[] = [];
  const proventos: MovimentoProvento[] = [];
  const eventos: (MovimentoBonificacao | MovimentoDesdobramento | MovimentoConversao)[] = [];
  const pendencias: string[] = [];
  const ignoradas: Record<string, number> = {};
  const foraDoEscopo: Record<string, Set<string>> = {};
  const periodos: Partial<Record<NomeLayout, { de: string; ate: string }>> = {};
  const quantidadesInformadas: QuantidadeInformada[] = [];

  const contarIgnorada = (motivo: string) => (ignoradas[motivo] = (ignoradas[motivo] || 0) + 1);
  const instituicaoIgnorada = (inst: unknown) => ignorarInstituicoes.some(i => normalizar(inst).includes(i));
  const anotarInstituicao = (t: string, inst: unknown, quando = '9999-12-31') => {
    if (!inst) return;
    const bruto = String(inst).trim().replace(/\s+/g, ' ').replace(/[.\s]+$/, '');
    const apelido = APELIDOS.find(([re]) => re.test(normalizar(bruto)));
    const nomeLimpo = apelido ? apelido[1] : bruto;
    const chave = normalizar(nomeLimpo);
    const mapa = (instituicoes[t] = instituicoes[t] || {});
    const atual = mapa[chave];
    if (!atual || quando > atual.ultima) mapa[chave] = { nome: nomeLimpo, ultima: quando };
  };
  const custodiaAtual = (t: string) => {
    const lista = Object.values(instituicoes[t] || {});
    if (!lista.length) return '';
    const ultima = lista.reduce((m, i) => (i.ultima > m ? i.ultima : m), '');
    const corte = ultima === '9999-12-31' ? ultima : new Date(Date.parse(ultima) - 365 * 86400000).toISOString().slice(0, 10);
    return lista
      .filter(i => i.ultima >= corte)
      .map(i => i.nome)
      .sort()
      .join(', ');
  };
  const anotarPeriodo = (layout: NomeLayout, d: string) => {
    const p = (periodos[layout] = periodos[layout] || { de: d, ate: d });
    if (d < p.de) p.de = d;
    if (d > p.ate) p.ate = d;
  };
  const ajuste = (mapa: Record<string, number>, t: string, d: string): number | null => {
    const k = `${t}|${d}`;
    if (mapa[k] == null) return null;
    usados.add(k);
    return Number(mapa[k]);
  };
  const adicionarForaDoEscopo = (t: string, motivo: string) => (foraDoEscopo[t] = foraDoEscopo[t] || new Set()).add(motivo);

  for (const bloco of blocos.filter(b => b.layout === 'posicao')) {
    for (const r of bloco.registros) {
      const t = limparTicker(r.ticker);
      if (!t || instituicaoIgnorada(r.instituicao)) continue;
      if (bloco.dicaTipo) dicas[t] = bloco.dicaTipo;
      if (r.produto) nomes[t] = nomes[t] || separarProduto(r.produto).nome || String(r.produto).trim();
      if (r.cnpj) cnpjs[t] = String(r.cnpj).trim();
      anotarInstituicao(t, r.instituicao);
      posicaoB3[t] = (posicaoB3[t] || 0) + (numero(r.quantidade) || 0);
      const preco = numero(r.preco);
      if (preco) cotacoes[t] = { preco, data: bloco.dataArquivo || opcoes.hoje || '' };
    }
  }

  const itensNegocio: { arquivo: string; chave: string; item: MovimentoNegociacao }[] = [];
  for (const bloco of blocos.filter(b => b.layout === 'negociacao')) {
    for (const r of bloco.registros) {
      const d = data(r.data);
      const t = limparTicker(r.ticker);
      const tipo = normalizar(r.tipo);
      if (!d || !t || (tipo !== 'compra' && tipo !== 'venda') || instituicaoIgnorada(r.instituicao)) continue;
      const mercado = normalizar(r.mercado);
      if (mercado && !mercado.includes('vista') && !mercado.includes('fracionario')) {
        adicionarForaDoEscopo(t, String(r.mercado));
        continue;
      }
      anotarInstituicao(t, r.instituicao, d);
      anotarPeriodo('negociacao', d);
      const item: MovimentoNegociacao = { data: d, tipo, ticker: t, quantidade: numero(r.quantidade) ?? 0, preco: numero(r.preco) ?? 0, taxas: 0 };
      itensNegocio.push({ arquivo: bloco.arquivo, chave: JSON.stringify({ ...item, i: String(r.instituicao || '') }), item });
    }
  }
  negocios.push(...deduplicar(itensNegocio));

  const itensMov: { arquivo: string; chave: string; item: RegistroMovimentacao }[] = [];
  for (const bloco of blocos.filter(b => b.layout === 'movimentacao')) {
    for (const r of bloco.registros) {
      const d = data(r.data);
      if (!d) continue;
      anotarPeriodo('movimentacao', d);
      itensMov.push({
        arquivo: bloco.arquivo,
        chave: JSON.stringify([d, r.produto, r.movimentacao, r.sentido, r.quantidade, r.valor, r.instituicao]),
        item: { ...r, data: d }
      });
    }
  }

  for (const r of deduplicar(itensMov)) {
    const { ticker: original, nome } = separarProduto(r.produto);
    const t = tickerBase(original);
    const mov = normalizar(r.movimentacao);
    const credito = normalizar(r.sentido).startsWith('credito');
    const qtd = numero(r.quantidade);
    const preco = numero(r.preco);
    const valor = numero(r.valor);
    const descricao = `${r.movimentacao} de ${original || nome} em ${dataBr(r.data)}`;

    if (instituicaoIgnorada(r.instituicao)) {
      contarIgnorada(`Instituição ignorada (${String(r.instituicao).trim()})`);
      continue;
    }
    if (!original) {
      contarIgnorada('Sem código de negociação (renda fixa e afins)');
      continue;
    }
    if (ignorarLinhas.has(normalizar(`${r.movimentacao}|${original}|${r.data}`))) {
      usados.add(`${r.movimentacao}|${original}|${r.data}`);
      contarIgnorada('Linha ignorada pelo arquivo de ajustes');
      continue;
    }
    if (nome) nomes[t] = nomes[t] || nome;
    anotarInstituicao(t, r.instituicao, r.data);

    const tipoProvento = PROVENTOS[mov];
    if (tipoProvento) {
      if (!credito || !valor) continue;
      proventos.push({ data: r.data, tipo: tipoProvento, ticker: t, valor });
      if (qtd) quantidadesInformadas.push({ ticker: t, original, data: r.data, instituicao: normalizar(r.instituicao), quantidade: qtd });
    } else if (mov === 'transferencia liquidacao') {
      if (temNegociacao) {
        contarIgnorada('Liquidação (coberta pelo extrato de negociação)');
        continue;
      }
      const p = preco || (valor && qtd ? valor / qtd : null) || ajuste(precos, t, r.data);
      if (!p) pendencias.push(`${descricao}: sem preço. Informe em "precos" no ajustes.json.`);
      negocios.push({ data: r.data, tipo: credito ? 'compra' : 'venda', ticker: t, quantidade: qtd ?? 0, preco: p || 0, taxas: 0 });
    } else if (mov === 'solicitacao de subscricao') {
      const p = preco || ajuste(precos, t, r.data);
      if (!p) pendencias.push(`${descricao}: subscrição de ${qtd} cotas de ${t} sem preço. Informe em "precos" no ajustes.json como "${t}|${r.data}".`);
      negocios.push({ data: r.data, tipo: 'compra', ticker: t, quantidade: qtd ?? 0, preco: p || 0, taxas: 0, origem: 'subscricao' });
    } else if (mov === 'leilao de fracao') {
      if (!credito || !qtd || !valor) continue;
      negocios.push({ data: r.data, tipo: 'venda', ticker: t, quantidade: qtd, preco: valor / qtd, taxas: 0, origem: 'leilaoFracao' });
    } else if (mov.startsWith('bonificacao em ativos')) {
      if (!credito) continue;
      const p = preco || ajuste(custoBonificacao, t, r.data);
      if (!p) pendencias.push(`${descricao}: ${qtd} ações sem custo atribuído. Informe em "custoBonificacao" no ajustes.json como "${t}|${r.data}".`);
      eventos.push({ data: r.data, tipo: 'bonificacao', ticker: t, quantidade: qtd ?? 0, preco: p || 0 });
    } else if (mov === 'desdobro') {
      if (!credito) continue;
      eventos.push({ data: r.data, tipo: 'desdobramento', ticker: t, quantidade: qtd ?? 0 });
    } else if (SEM_EFEITO.includes(mov)) {
      contarIgnorada(String(r.movimentacao));
    } else {
      pendencias.push(`${descricao} (${credito ? 'crédito' : 'débito'}, quantidade ${qtd ?? '-'}, valor ${valor ?? '-'}): ainda não sei tratar.`);
    }
  }

  for (const c of ajustes.conversoes || []) {
    eventos.push({ data: c.data, tipo: 'conversao', ticker: c.de, destino: c.para, quantidade: c.quantidadeDe, quantidadeDestino: c.quantidadePara });
    usados.add(`conversao|${c.de}|${c.para}`);
  }

  const todos: Movimento[] = [...negocios, ...eventos, ...proventos];
  const tickers = new Set<string>();
  [...negocios, ...proventos, ...eventos].forEach(x => {
    tickers.add(x.ticker);
    if (x.tipo === 'conversao') tickers.add(x.destino);
  });
  Object.keys(posicaoB3).forEach(t => tickers.add(t));

  const cadastro: Record<string, Cadastro> = {};
  const classificacao: Record<string, Classificacao> = {};
  for (const t of tickers) {
    const manual = ajustes.tipos?.[t];
    const c: Classificacao = manual ? { tipo: manual, certeza: true } : classificar(t, nomes[t], dicas[t]);
    classificacao[t] = c;
    if (!ehSuportado(c.tipo)) continue;
    const conhecido: Partial<Cadastro> = ATIVOS[t] || {};
    const extra = ajustes.cadastro?.[t] || {};
    cadastro[t] = {
      tipo: c.tipo,
      nome: extra.nome || conhecido.nome || nomes[t] || '',
      cnpj: extra.cnpj || cnpjs[t] || conhecido.cnpj || '',
      corretora: extra.corretora || custodiaAtual(t)
    };
  }

  const suportado = (x: Movimento) => !!cadastro[x.ticker];
  for (const x of todos) {
    if (suportado(x)) continue;
    adicionarForaDoEscopo(x.ticker, classificacao[x.ticker] ? classificacao[x.ticker]!.tipo : 'sem código');
  }

  let seq = 0;
  const movimentos: Movimento[] = todos
    .filter(suportado)
    .sort((a, b) => a.data.localeCompare(b.data))
    .map(x => ({ id: `b3-${++seq}`, ...x }));

  const ajustesNaoUsados = [...Object.keys(precos), ...Object.keys(custoBonificacao), ...(ajustes.ignorarLinhas || [])].filter(k => !usados.has(k));

  return {
    estado: {
      versao: 2,
      anoCalendario: opcoes.anoCalendario ?? new Date().getFullYear(),
      prejuizoInicial: { acoes: 0, fii: 0 },
      cadastro,
      posicaoInicial: [],
      movimentos,
      declaradoAnterior: ajustes.declaradoAnterior || {},
      cotacoes: Object.fromEntries(Object.entries(cotacoes).filter(([t]) => cadastro[t]))
    },
    resumo: {
      arquivos: blocos.map(b => ({ arquivo: b.arquivo, aba: b.aba, tipo: LAYOUTS[b.layout].descricao, linhas: b.registros.length })),
      temNegociacao,
      periodos,
      compras: movimentos.filter(m => m.tipo === 'compra').length,
      vendas: movimentos.filter(m => m.tipo === 'venda').length,
      proventos: movimentos.filter(m => m.tipo === 'dividendo' || m.tipo === 'jcp' || m.tipo === 'rendimento').length,
      eventos: movimentos.filter(m => m.tipo === 'bonificacao' || m.tipo === 'desdobramento' || m.tipo === 'conversao').length,
      ativos: Object.keys(cadastro).sort(),
      aConfirmar: Object.entries(classificacao)
        .filter(([, c]) => !c.certeza)
        .map(([t, c]) => ({ ticker: t, tipoAssumido: c.tipo, nome: nomes[t] || '' })),
      foraDoEscopo: Object.fromEntries(Object.entries(foraDoEscopo).map(([t, s]) => [t, [...s]])),
      ignoradas,
      pendencias,
      ajustesNaoUsados,
      avisos,
      posicaoB3,
      quantidadesInformadas
    }
  };
}

export function conferirQuantidades(
  estado: Estado,
  regras: RegrasAno,
  quantidadesInformadas: QuantidadeInformada[],
  janelaDias = 60
): Divergencia[] {
  const linhaDoTempo: Record<string, { data: string; quantidade: number }[]> = {};
  processar(estado, regras, {
    ate: '9999-12-31',
    aoAplicar: (m, posicoes) => {
      const envolvidos = m.tipo === 'conversao' ? [m.ticker, m.destino] : [m.ticker];
      for (const t of envolvidos.filter(Boolean)) {
        const p = posicoes.get(t);
        (linhaDoTempo[t] = linhaDoTempo[t] || []).push({ data: m.data, quantidade: p ? p.quantidade : 0 });
      }
    }
  });
  const quantidadeEm = (t: string, d: string) => {
    let q = 0;
    for (const ponto of linhaDoTempo[t] || []) if (ponto.data <= d) q = ponto.quantidade;
    return q;
  };
  const maiorPorOrigem: Record<string, number> = {};
  for (const i of quantidadesInformadas) {
    const k = `${i.ticker}|${i.data}|${i.instituicao}|${i.original}`;
    maiorPorOrigem[k] = Math.max(maiorPorOrigem[k] || 0, i.quantidade);
  }
  const somaPorData: Record<string, number> = {};
  for (const [k, q] of Object.entries(maiorPorOrigem)) {
    const [t, d] = k.split('|');
    somaPorData[`${t}|${d}`] = (somaPorData[`${t}|${d}`] || 0) + q;
  }
  const divergencias: Divergencia[] = [];
  for (const [k, informada] of Object.entries(somaPorData)) {
    const [t = '', d = ''] = k.split('|');
    const inicio = new Date(Date.parse(d) - janelaDias * 86400000).toISOString().slice(0, 10);
    const candidatos = new Set([quantidadeEm(t, d), quantidadeEm(t, inicio)]);
    for (const ponto of linhaDoTempo[t] || []) if (ponto.data > inicio && ponto.data <= d) candidatos.add(ponto.quantidade);
    const bate = [...candidatos].some(q => Math.abs(Math.floor(q + 1e-9) - informada) < 1e-6 || Math.abs(q - informada) < 1e-6);
    if (!bate) divergencias.push({ ticker: t, data: d, informada, calculada: quantidadeEm(t, d) });
  }
  return divergencias.sort((a, b) => a.data.localeCompare(b.data));
}
