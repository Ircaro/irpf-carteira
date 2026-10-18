import type {
  Alerta,
  Cadastro,
  ChaveRendimento,
  EntradaCalculo,
  Movimento,
  OrigemMovimento,
  Prejuizo,
  RegraBem,
  RegraRendimento,
  RegrasAno,
  TipoAtivo,
  TipoMovimento
} from './tipos';

const EPS = 1e-9;
const ORDEM: Record<TipoMovimento, number> = {
  compra: 0,
  bonificacao: 1,
  desdobramento: 1,
  grupamento: 1,
  conversao: 1,
  venda: 2,
  dividendo: 3,
  jcp: 3,
  rendimento: 3
};
const ehFundo = (tipo: TipoAtivo) => tipo === 'fii' || tipo === 'fiagro';

export type TipoProvento = 'dividendo' | 'jcp' | 'rendimento' | 'bonificacao';

const TIPO_PROVENTO: Record<TipoProvento, ChaveRendimento> = {
  dividendo: 'dividendos',
  jcp: 'jcp',
  rendimento: 'rendimentoFii',
  bonificacao: 'bonificacao'
};

const num2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numQtd = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 6 });

export const arred = (v: number): number => Math.round(Number((v * 100).toFixed(6))) / 100;
export const reais = (v: number): string => 'R$ ' + num2.format(v);
export const quantidade = (v: number): string => numQtd.format(v);
export const dataBr = (iso: string): string => iso.split('-').reverse().join('/');
const soma = <T>(lista: T[], valor: (x: T) => number): number => lista.reduce((t, x) => t + (valor(x) || 0), 0);

export interface Posicao {
  ticker: string;
  tipo: TipoAtivo;
  quantidadeInicial: number;
  custoInicial: number;
  quantidade: number;
  custo: number;
  quantidadeComprada: number;
  movimentado: boolean;
}

export interface Venda {
  data: string;
  mes: string;
  ano: number;
  ticker: string;
  tipo: TipoAtivo;
  origem: OrigemMovimento | 'venda';
  quantidade: number;
  valorVenda: number;
  custo: number;
  lucro: number;
}

export interface Provento {
  tipo: TipoProvento;
  ticker: string;
  data: string;
  ano: number;
  valor: number;
}

export interface Processamento {
  posicoes: Posicao[];
  vendas: Venda[];
  proventos: Provento[];
  alertas: Alerta[];
}

export interface OpcoesProcessar {
  ate?: string;
  aoAplicar?: (m: Movimento, posicoes: Map<string, Posicao>) => void;
}

export interface Darf {
  competencia: string;
  codigo: string;
  valor: number;
  acumuladoAnterior: number;
  vencimento: string;
}

export interface MesApurado {
  mes: string;
  vendasAcoes: number;
  lucroAcoes: number;
  isento: boolean;
  lucroIsento: number;
  resultadoAcoes: number;
  prejuizoAnteriorAcoes: number;
  baseAcoes: number;
  prejuizoAcoes: number;
  impostoAcoes: number;
  vendasFii: number;
  lucroFii: number;
  prejuizoAnteriorFii: number;
  baseFii: number;
  prejuizoFii: number;
  impostoFii: number;
  imposto: number;
  darf: Darf | null;
}

export interface Apuracao {
  meses: MesApurado[];
  darfs: Darf[];
  pendente: number;
  prejuizoFinal: Prejuizo;
}

export interface ApuracaoDoAno extends Apuracao {
  ano: number;
  aproximado: boolean;
}

export interface ApuracaoRelatorio extends Apuracao {
  prejuizoAnterior: Prejuizo;
  anosAnteriores: ApuracaoDoAno[];
}

export type StatusBem = 'alterado' | 'novo' | 'zerado' | 'mesmoAno' | 'semAlteracao';

export interface ItemBem {
  anteriorInformado: boolean;
  anteriorCalculado: boolean;
  calculadoAnterior: { quantidade: number; custo: number };
  ticker: string;
  tipo: TipoAtivo;
  nome: string;
  cnpj: string;
  corretora: string;
  grupo: string;
  codigo: string;
  descricaoBem: string;
  status: StatusBem;
  quantidadeInicial: number;
  quantidadeFinal: number;
  quantidadeComprada: number;
  valorAnterior: number;
  valorAtual: number;
  precoMedio: number;
  discriminacao: string;
}

export type GruposBens = Record<StatusBem, ItemBem[]>;

export interface ItemRendimento {
  ticker: string;
  nome: string;
  cnpj: string;
  valor: number;
  meses?: string[];
}

export interface GrupoRendimento extends RegraRendimento {
  chave: ChaveRendimento;
  itens: ItemRendimento[];
  total: number;
}

export interface Rendimentos {
  isentos: GrupoRendimento[];
  exclusivos: GrupoRendimento[];
}

export interface Relatorio {
  posicoes: Posicao[];
  vendas: Venda[];
  proventos: Provento[];
  apuracao: ApuracaoRelatorio;
  bens: GruposBens;
  rendimentos: Rendimentos;
  alertas: Alerta[];
}

export function ultimoDiaUtil(ano: number, mes: number): string {
  const d = new Date(Date.UTC(ano, mes, 0));
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function ordenar(movimentos: Movimento[]): Movimento[] {
  return movimentos
    .map((m, i) => ({ m, i }))
    .sort((a, b) => a.m.data.localeCompare(b.m.data) || ORDEM[a.m.tipo] - ORDEM[b.m.tipo] || a.i - b.i)
    .map(x => x.m);
}

function possiveisDayTrades(movimentos: Movimento[]): Movimento[] {
  const compras = new Set(movimentos.filter(m => m.tipo === 'compra').map(m => `${m.ticker}|${m.data}`));
  const vistos = new Set<string>();
  return movimentos
    .filter(m => m.tipo === 'venda' && compras.has(`${m.ticker}|${m.data}`))
    .filter(m => {
      const k = `${m.ticker}|${m.data}`;
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    });
}

export function processar(estado: EntradaCalculo, regras: RegrasAno, opcoes: OpcoesProcessar = {}): Processamento {
  const ano = regras.anoCalendario;
  const limite = opcoes.ate || `${ano}-12-31`;
  const inicioAno = `${ano}-01-01`;
  const posicoes = new Map<string, Posicao>();
  const vendas: Venda[] = [];
  const proventos: Provento[] = [];
  const alertas: Alerta[] = [];
  const tipoDe = (t: string): TipoAtivo => estado.cadastro[t]?.tipo || 'acao';
  let fotografado = false;

  const fotografar = () => {
    for (const pos of posicoes.values()) {
      pos.quantidadeInicial = pos.quantidade;
      pos.custoInicial = pos.custo;
      pos.quantidadeComprada = 0;
      pos.movimentado = false;
    }
    fotografado = true;
  };

  const garantir = (ticker: string): Posicao => {
    let pos = posicoes.get(ticker);
    if (!pos) {
      pos = {
        ticker,
        tipo: tipoDe(ticker),
        quantidadeInicial: 0,
        custoInicial: 0,
        quantidade: 0,
        custo: 0,
        quantidadeComprada: 0,
        movimentado: false
      };
      posicoes.set(ticker, pos);
    }
    return pos;
  };

  for (const p of estado.posicaoInicial) {
    const pos = garantir(p.ticker);
    pos.quantidadeInicial = pos.quantidade = Number(p.quantidade) || 0;
    pos.custoInicial = pos.custo = arred(Number(p.custo) || 0);
  }

  for (const m of possiveisDayTrades(estado.movimentos)) {
    alertas.push({
      nivel: 'aviso',
      texto: `Compra e venda de ${m.ticker} no mesmo dia (${dataBr(m.data)}): pode ser day trade, que tem regra própria (20%, sem isenção). O cálculo tratou como operação comum.`
    });
  }

  for (const m of ordenar(estado.movimentos)) {
    if (m.data > limite) {
      if (!opcoes.ate) alertas.push({ nivel: 'aviso', texto: `Lançamento de ${m.ticker} em ${dataBr(m.data)} é posterior a ${ano} e ficou fora deste relatório.` });
      continue;
    }
    if (!fotografado && m.data >= inicioAno) fotografar();
    const pos = garantir(m.ticker);
    const anoMov = Number(m.data.slice(0, 4));
    pos.movimentado = true;
    const taxas = m.tipo === 'compra' || m.tipo === 'venda' ? Number(m.taxas) || 0 : 0;

    switch (m.tipo) {
      case 'compra':
        pos.quantidade += m.quantidade;
        pos.quantidadeComprada += m.quantidade;
        pos.custo = arred(pos.custo + m.quantidade * m.preco + taxas);
        break;

      case 'venda': {
        if (m.quantidade > pos.quantidade + EPS) {
          alertas.push({
            nivel: 'erro',
            texto: `Venda de ${quantidade(m.quantidade)} ${m.ticker} em ${dataBr(m.data)} é maior que a posição na data (${quantidade(pos.quantidade)}). Confira os lançamentos.`
          });
        }
        const q = Math.min(m.quantidade, pos.quantidade);
        const custoVenda = pos.quantidade > EPS ? arred((pos.custo * q) / pos.quantidade) : 0;
        const valorVenda = arred(m.quantidade * m.preco);
        vendas.push({
          data: m.data,
          mes: m.data.slice(0, 7),
          ano: anoMov,
          ticker: m.ticker,
          tipo: pos.tipo,
          origem: m.origem || 'venda',
          quantidade: m.quantidade,
          valorVenda,
          custo: custoVenda,
          lucro: arred(valorVenda - taxas - custoVenda)
        });
        pos.quantidade -= q;
        pos.custo = arred(pos.custo - custoVenda);
        if (pos.quantidade <= EPS) {
          pos.quantidade = 0;
          pos.custo = 0;
        }
        break;
      }

      case 'bonificacao': {
        const valor = arred(m.quantidade * m.preco);
        pos.quantidade += m.quantidade;
        pos.custo = arred(pos.custo + valor);
        proventos.push({ tipo: 'bonificacao', ticker: m.ticker, data: m.data, ano: anoMov, valor });
        break;
      }

      case 'desdobramento':
        pos.quantidade = m.fator ? pos.quantidade * m.fator : pos.quantidade + (Number(m.quantidade) || 0);
        break;

      case 'conversao': {
        const destino = garantir(m.destino);
        destino.movimentado = true;
        const q = Math.min(m.quantidade, pos.quantidade);
        const custoMovido = pos.quantidade > EPS ? arred((pos.custo * q) / pos.quantidade) : 0;
        pos.quantidade -= q;
        pos.custo = arred(pos.custo - custoMovido);
        if (pos.quantidade <= EPS) {
          pos.quantidade = 0;
          pos.custo = 0;
        }
        destino.quantidade += m.quantidadeDestino;
        destino.custo = arred(destino.custo + custoMovido);
        break;
      }

      case 'grupamento': {
        const exata = pos.quantidade / m.fator;
        pos.quantidade = Math.floor(exata + EPS);
        if (exata - pos.quantidade > EPS) {
          alertas.push({
            nivel: 'aviso',
            texto: `O grupamento de ${m.ticker} em ${dataBr(m.data)} gerou fração. A empresa costuma leiloar as frações e pagar em dinheiro: lance esse valor como venda.`
          });
        }
        break;
      }

      case 'dividendo':
      case 'jcp':
      case 'rendimento':
        proventos.push({ tipo: m.tipo, ticker: m.ticker, data: m.data, ano: anoMov, valor: arred(Number(m.valor) || 0) });
    }
    if (opcoes.aoAplicar) opcoes.aoAplicar(m, posicoes);
  }

  if (!fotografado) fotografar();
  return { posicoes: [...posicoes.values()], vendas, proventos, alertas };
}

function compensar(resultado: number, prejuizo: number) {
  if (resultado >= 0) {
    const usado = Math.min(resultado, prejuizo);
    return { anterior: prejuizo, base: arred(resultado - usado), prejuizo: arred(prejuizo - usado) };
  }
  return { anterior: prejuizo, base: 0, prejuizo: arred(prejuizo - resultado) };
}

export function apurar(vendas: Venda[], regras: RegrasAno, prejuizoInicial?: Prejuizo, opcoes: { ano?: number; pendente?: number } = {}): Apuracao {
  const ano = opcoes.ano || regras.anoCalendario;
  const meses: MesApurado[] = [];
  const darfs: Darf[] = [];
  let prejAcoes = arred(Number(prejuizoInicial?.acoes) || 0);
  let prejFii = arred(Number(prejuizoInicial?.fii) || 0);
  let pendente = arred(Number(opcoes.pendente) || 0);

  for (let i = 1; i <= 12; i++) {
    const mes = `${ano}-${String(i).padStart(2, '0')}`;
    const doMes = vendas.filter(v => v.mes === mes);
    if (!doMes.length) continue;

    const acoes = doMes.filter(v => v.tipo === 'acao');
    const fii = doMes.filter(v => ehFundo(v.tipo));
    const vendasAcoes = arred(soma(acoes, v => v.valorVenda));
    const lucroAcoes = arred(soma(acoes, v => v.lucro));
    const vendasFii = arred(soma(fii, v => v.valorVenda));
    const lucroFii = arred(soma(fii, v => v.lucro));

    const isento = acoes.length > 0 && vendasAcoes <= regras.limiteIsencaoAcoesMes && lucroAcoes > 0;
    const resultadoAcoes = isento ? 0 : lucroAcoes;
    const comum = compensar(resultadoAcoes, prejAcoes);
    const imob = compensar(lucroFii, prejFii);
    prejAcoes = comum.prejuizo;
    prejFii = imob.prejuizo;

    const impostoAcoes = arred(comum.base * regras.aliquotaAcoes);
    const impostoFii = arred(imob.base * regras.aliquotaFii);
    const imposto = arred(impostoAcoes + impostoFii);

    let darf: Darf | null = null;
    if (imposto > 0 || pendente > 0) {
      const total = arred(pendente + imposto);
      if (total >= regras.darfMinimo) {
        darf = {
          competencia: mes,
          codigo: regras.codigoDarf,
          valor: total,
          acumuladoAnterior: pendente,
          vencimento: ultimoDiaUtil(ano, i + 1)
        };
        darfs.push(darf);
        pendente = 0;
      } else {
        pendente = total;
      }
    }

    meses.push({
      mes,
      vendasAcoes,
      lucroAcoes,
      isento,
      lucroIsento: isento ? lucroAcoes : 0,
      resultadoAcoes,
      prejuizoAnteriorAcoes: comum.anterior,
      baseAcoes: comum.base,
      prejuizoAcoes: prejAcoes,
      impostoAcoes,
      vendasFii,
      lucroFii,
      prejuizoAnteriorFii: imob.anterior,
      baseFii: imob.base,
      prejuizoFii: prejFii,
      impostoFii,
      imposto,
      darf
    });
  }

  return { meses, darfs, pendente, prejuizoFinal: { acoes: prejAcoes, fii: prejFii } };
}

function classificar(pos: Posicao): StatusBem | null {
  const ci = arred(pos.custoInicial);
  const cf = arred(pos.custo);
  if (pos.quantidadeInicial === 0 && ci === 0) {
    if (pos.quantidade > 0) return 'novo';
    return pos.quantidadeComprada > 0 ? 'mesmoAno' : null;
  }
  if (pos.quantidade === 0) return 'zerado';
  if (pos.quantidadeInicial === pos.quantidade && ci === cf) return 'semAlteracao';
  return 'alterado';
}

function discriminacao(pos: Posicao, cad: Partial<Cadastro>, bem: RegraBem, status: StatusBem, ano: number): string {
  const unidade = (q: number) => (q === 1 ? bem.unidade[0] : bem.unidade[1]);
  const nome = cad.nome ? ` (${cad.nome})` : '';
  const cnpj = cad.cnpj ? `, CNPJ ${cad.cnpj}` : '';
  const custodia = cad.corretora ? ` Custódia: ${String(cad.corretora).replace(/[.\s]+$/, '')}.` : '';
  const ativo = `${pos.ticker}${nome}${cnpj}`;

  if (status === 'zerado') {
    const u = bem.unidade[1];
    return `${u.charAt(0).toUpperCase()}${u.slice(1)}${bem.artigo} ${ativo}, posição totalmente vendida em ${ano}.${custodia}`;
  }
  if (status === 'mesmoAno') {
    const q = pos.quantidadeComprada;
    return `${quantidade(q)} ${unidade(q)}${bem.artigo} ${ativo}, compradas e vendidas em ${ano}.${custodia}`;
  }
  const q = pos.quantidade;
  const medio = q > 0 ? pos.custo / q : 0;
  return `${quantidade(q)} ${unidade(q)}${bem.artigo} ${ativo}, preço médio de ${reais(medio)} por ${bem.unidade[0]}.${custodia}`;
}

export function compararBens(proc: Processamento, estado: EntradaCalculo, regras: RegrasAno): GruposBens {
  const grupos: GruposBens = { alterado: [], novo: [], zerado: [], mesmoAno: [], semAlteracao: [] };
  const declarados = estado.declaradoAnterior || {};
  const temHistorico = estado.movimentos.some(m => m.data < `${regras.anoCalendario}-01-01`);
  for (const calculada of proc.posicoes) {
    const decl = declarados[calculada.ticker];
    const pos = decl ? { ...calculada, quantidadeInicial: Number(decl.quantidade) || 0, custoInicial: Number(decl.custo) || 0 } : calculada;
    const status = classificar(pos);
    if (!status) continue;
    const cad: Partial<Cadastro> = estado.cadastro[pos.ticker] || {};
    const bem = regras.bens[pos.tipo];
    grupos[status].push({
      anteriorInformado: !!decl,
      anteriorCalculado: temHistorico && !decl,
      calculadoAnterior: { quantidade: calculada.quantidadeInicial, custo: arred(calculada.custoInicial) },
      ticker: pos.ticker,
      tipo: pos.tipo,
      nome: cad.nome || '',
      cnpj: cad.cnpj || '',
      corretora: cad.corretora || '',
      grupo: bem.grupo,
      codigo: bem.codigo,
      descricaoBem: bem.descricao,
      status,
      quantidadeInicial: pos.quantidadeInicial,
      quantidadeFinal: pos.quantidade,
      quantidadeComprada: pos.quantidadeComprada,
      valorAnterior: arred(pos.custoInicial),
      valorAtual: arred(pos.custo),
      precoMedio: pos.quantidade > 0 ? pos.custo / pos.quantidade : 0,
      discriminacao: discriminacao(pos, cad, bem, status, regras.anoCalendario)
    });
  }
  Object.values(grupos).forEach(l => l.sort((a, b) => a.ticker.localeCompare(b.ticker)));
  return grupos;
}

export function agruparRendimentos(
  proc: Pick<Processamento, 'proventos'>,
  apuracao: Apuracao,
  estado: EntradaCalculo,
  regras: RegrasAno
): Rendimentos {
  const porChave: Partial<Record<ChaveRendimento, Record<string, ItemRendimento>>> = {};
  for (const p of proc.proventos) {
    const chave = TIPO_PROVENTO[p.tipo];
    const cad: Partial<Cadastro> = estado.cadastro[p.ticker] || {};
    const grupo = (porChave[chave] = porChave[chave] || {});
    const item = (grupo[p.ticker] = grupo[p.ticker] || { ticker: p.ticker, nome: cad.nome || '', cnpj: cad.cnpj || '', valor: 0 });
    item.valor = arred(item.valor + p.valor);
  }

  const lucroIsento = arred(soma(apuracao.meses, m => m.lucroIsento));
  if (lucroIsento > 0) {
    porChave.lucroAcoesIsento = {
      '': {
        ticker: '',
        nome: 'Lucro em meses com vendas de ações até R$ 20 mil',
        cnpj: '',
        valor: lucroIsento,
        meses: apuracao.meses.filter(m => m.isento).map(m => m.mes)
      }
    };
  }

  const montar = (chaves: ChaveRendimento[]): GrupoRendimento[] =>
    chaves.flatMap(c => {
      const grupo = porChave[c];
      if (!grupo) return [];
      const itens = Object.values(grupo).sort((a, b) => a.ticker.localeCompare(b.ticker));
      return [{ chave: c, ...regras.rendimentos[c], itens, total: arred(soma(itens, i => i.valor)) }];
    });

  return {
    isentos: montar(['dividendos', 'rendimentoFii', 'bonificacao', 'lucroAcoesIsento']),
    exclusivos: montar(['jcp'])
  };
}

function alertasExtras(proc: Pick<Processamento, 'proventos'>, bens: GruposBens, estado: EntradaCalculo, regras: RegrasAno): Alerta[] {
  const alertas: Alerta[] = [];
  const semCnpj = new Set<string>();
  for (const status of ['alterado', 'novo', 'zerado', 'mesmoAno'] as const) {
    bens[status].forEach(b => !b.cnpj && semCnpj.add(b.ticker));
  }
  proc.proventos.forEach(p => !estado.cadastro[p.ticker]?.cnpj && semCnpj.add(p.ticker));
  if (semCnpj.size) {
    alertas.push({ nivel: 'aviso', texto: `CNPJ não informado para ${[...semCnpj].sort().join(', ')}. Ele aparece no informe de rendimentos da corretora.` });
  }

  const dividendosMes: Record<string, number> = {};
  proc.proventos
    .filter(p => p.tipo === 'dividendo')
    .forEach(p => {
      const k = `${p.ticker}|${p.data.slice(0, 7)}`;
      dividendosMes[k] = (dividendosMes[k] || 0) + p.valor;
    });
  Object.entries(dividendosMes)
    .filter(([, v]) => v > regras.limiteDividendosMesPorEmpresa)
    .forEach(([k, v]) => {
      const [ticker, mes = ''] = k.split('|');
      alertas.push({
        nivel: 'aviso',
        texto: `Dividendos de ${ticker} em ${mes.split('-').reverse().join('/')} somam ${reais(v)}, acima de ${reais(regras.limiteDividendosMesPorEmpresa)}. A partir de 2026 o excedente tem retenção na fonte: confira o informe.`
      });
    });
  return alertas;
}

export function apurarHistorico(vendas: Venda[], regrasPara: (ano: number) => RegrasAno, prejuizoInicial: Prejuizo | undefined, ateAno: number) {
  const anos = [...new Set(vendas.map(v => v.ano))].filter(a => a <= ateAno).sort((a, b) => a - b);
  let prejuizo: Prejuizo = { acoes: Number(prejuizoInicial?.acoes) || 0, fii: Number(prejuizoInicial?.fii) || 0 };
  let pendente = 0;
  const porAno: ApuracaoDoAno[] = [];
  for (const a of anos) {
    const regrasAno = regrasPara(a);
    const r = apurar(vendas.filter(v => v.ano === a), regrasAno, prejuizo, { ano: a, pendente });
    porAno.push({ ano: a, aproximado: !!regrasAno.aproximado, ...r });
    prejuizo = r.prejuizoFinal;
    pendente = r.pendente;
  }
  return { porAno, prejuizoFinal: prejuizo, pendente };
}

export function gerarRelatorio(estado: EntradaCalculo, regras: RegrasAno, regrasPara: (ano: number) => RegrasAno = () => regras): Relatorio {
  const ano = regras.anoCalendario;
  const proc = processar(estado, regras);
  const anteriores = apurarHistorico(proc.vendas, regrasPara, estado.prejuizoInicial, ano - 1);
  const doAno = {
    ...proc,
    vendas: proc.vendas.filter(v => v.ano === ano),
    proventos: proc.proventos.filter(p => p.ano === ano)
  };
  const apuracaoDoAno = apurar(doAno.vendas, regras, anteriores.prejuizoFinal, { pendente: anteriores.pendente });
  const apuracao: ApuracaoRelatorio = { ...apuracaoDoAno, prejuizoAnterior: anteriores.prejuizoFinal, anosAnteriores: anteriores.porAno };
  const bens = compararBens(proc, estado, regras);
  const rendimentos = agruparRendimentos(doAno, apuracao, estado, regras);
  const alertas = [...proc.alertas, ...alertasExtras(doAno, bens, estado, regras)];
  if (anteriores.porAno.some(a => a.aproximado)) {
    alertas.push({
      nivel: 'aviso',
      texto: `Os anos anteriores foram apurados com as regras de ${ano}. Para ações e FIIs elas não mudaram nos últimos anos, mas vale conferir.`
    });
  }
  return { posicoes: proc.posicoes, vendas: doAno.vendas, proventos: doAno.proventos, apuracao, bens, rendimentos, alertas };
}
