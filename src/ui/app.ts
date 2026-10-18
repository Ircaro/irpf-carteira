import './estilos.css';
import { dataBr, gerarRelatorio, quantidade as qtd } from '../dominio/calculo';
import type { Apuracao, GrupoRendimento, ItemBem, MesApurado, Relatorio, StatusBem } from '../dominio/calculo';
import { calcular as calcularDesempenho } from '../dominio/desempenho';
import type { Desempenho, PontoSerie } from '../dominio/desempenho';
import { ATIVOS, anosDisponiveis, paraAno, porAno } from '../dominio/regras';
import type { Alerta, Cadastro, Estado, Movimento, TipoAtivo, TipoMovimento } from '../dominio/tipos';
import { gerarExemplo } from '../exemplo';
import { $, $$, campoForm, dadosForm, gravar, ler } from './dom';
import { MESES_CURTOS, compacto, esc, mesExtenso, moeda, pct, valorCopia } from './formato';
import { barrasH, colunas, linha } from './graficos';

const CHAVE = 'irpf-carteira-v1';
const CHAVE_ABA = 'irpf-carteira-aba';
const regras = porAno(Math.max(...anosDisponiveis()));
const ANO = regras.anoCalendario;
const TIPOS_ATIVO: readonly string[] = ['acao', 'fii', 'fiagro'];

type TipoFormulario = Exclude<TipoMovimento, 'conversao'>;
type CampoMovimento = 'quantidade' | 'preco' | 'taxas' | 'valor' | 'fator';

const CAMPOS_POR_TIPO: Record<TipoFormulario, CampoMovimento[]> = {
  compra: ['quantidade', 'preco', 'taxas'],
  venda: ['quantidade', 'preco', 'taxas'],
  dividendo: ['valor'],
  jcp: ['valor'],
  rendimento: ['valor'],
  bonificacao: ['quantidade', 'preco'],
  desdobramento: ['fator'],
  grupamento: ['fator']
};

const ROTULO_MOV: Record<TipoMovimento, [string, string]> = {
  compra: ['Compra', 'compra'],
  venda: ['Venda', 'venda'],
  dividendo: ['Dividendo', 'provento'],
  jcp: ['JCP', 'provento'],
  rendimento: ['Rendimento FII', 'provento'],
  bonificacao: ['Bonificação', 'evento'],
  desdobramento: ['Desdobramento', 'evento'],
  grupamento: ['Grupamento', 'evento'],
  conversao: ['Conversão', 'evento']
};

const ROTULO_STATUS: Record<StatusBem, string> = {
  alterado: 'Atualizar valor',
  novo: 'Incluir bem novo',
  zerado: 'Vendido no ano',
  mesmoAno: 'Comprado e vendido no ano',
  semAlteracao: 'Sem alteração'
};

const GRUPO_MOV: Partial<Record<TipoMovimento, string>> = {
  compra: 'negociacao',
  venda: 'negociacao',
  dividendo: 'provento',
  jcp: 'provento',
  rendimento: 'provento'
};

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const hoje = () => new Date().toISOString().slice(0, 10);
const corCss = (nome: string) => getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
const numero = (v: string | undefined): number | undefined => (v === '' || v == null ? undefined : Number(v));

const vazio = (): Estado => ({
  versao: 2,
  anoCalendario: ANO,
  prejuizoInicial: { acoes: 0, fii: 0 },
  cadastro: {},
  posicaoInicial: [],
  movimentos: [],
  cotacoes: {}
});

function normalizar(dados: unknown): Estado {
  if (!dados || typeof dados !== 'object') throw new Error('Arquivo inválido');
  const bruto = dados as Partial<Estado>;
  if (!Array.isArray(bruto.posicaoInicial) || !Array.isArray(bruto.movimentos)) throw new Error('Arquivo inválido');
  const cadastro: Record<string, Cadastro> = {};
  for (const [ticker, c] of Object.entries(bruto.cadastro || {})) {
    cadastro[ticker] = { ...c, tipo: TIPOS_ATIVO.includes(c.tipo) ? c.tipo : 'acao' };
  }
  return {
    ...vazio(),
    ...bruto,
    versao: 2,
    cadastro,
    posicaoInicial: bruto.posicaoInicial,
    movimentos: bruto.movimentos,
    cotacoes: bruto.cotacoes || {},
    prejuizoInicial: { acoes: 0, fii: 0, ...(bruto.prejuizoInicial || {}) }
  };
}

function carregar(): Estado | null {
  try {
    const bruto = ler(CHAVE);
    return bruto ? normalizar(JSON.parse(bruto)) : null;
  } catch {
    return null;
  }
}

let estado: Estado = carregar() || vazio();
let relatorio: Relatorio = gerarRelatorio(estado, regras, paraAno);

function salvar(): void {
  gravar(CHAVE, JSON.stringify(estado));
}

let timerToast: ReturnType<typeof setTimeout> | undefined;

function toast(msg: string): void {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('visivel');
  clearTimeout(timerToast);
  timerToast = setTimeout(() => t.classList.remove('visivel'), 1800);
}

function copiarFallback(texto: string, ok: () => void): void {
  const ta = document.createElement('textarea');
  ta.value = texto;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    ok();
  } catch {
    toast('Não foi possível copiar');
  }
  ta.remove();
}

function copiar(texto: string): void {
  const ok = () => toast('Copiado');
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(texto).then(ok, () => copiarFallback(texto, ok));
  } else {
    copiarFallback(texto, ok);
  }
}

const botaoCopiar = (texto: string) => `<button class="btn btn-sec btn-mini" type="button" data-copiar="${esc(texto)}">Copiar</button>`;

function trocarAba(nome: string): void {
  $$('.aba').forEach(a => a.classList.toggle('ativa', a.dataset.aba === nome));
  $$('.painel').forEach(p => p.classList.toggle('ativo', p.id === `aba-${nome}`));
  gravar(CHAVE_ABA, nome);
  if (nome === 'desempenho') renderDesempenho();
}

interface Coluna {
  t: string;
  num?: boolean;
}

function tabela(cabecalho: Coluna[], linhas: string[], rodape?: string): string {
  const th = cabecalho.map(c => `<th class="${c.num ? 'num-col' : ''}">${c.t}</th>`).join('');
  return `<div class="tabela-wrap"><table><thead><tr>${th}</tr></thead><tbody>${linhas.join('')}</tbody>${rodape ? `<tfoot>${rodape}</tfoot>` : ''}</table></div>`;
}

const blocoVazio = (titulo: string, texto: string) => `<div class="vazio"><strong>${titulo}</strong>${texto}</div>`;

function alertasHtml(alertas: Alerta[]): string {
  if (!alertas.length) return '';
  return `<div class="alertas">${alertas.map(a => `<div class="alerta alerta-${a.nivel}">${esc(a.texto)}</div>`).join('')}</div>`;
}

function renderDeclaracao(): void {
  const lista = [...estado.posicaoInicial].sort((a, b) => a.ticker.localeCompare(b.ticker));
  if (!lista.length) {
    $('#lista-bens').innerHTML = blocoVazio('Nenhum bem cadastrado', 'Adicione os bens da declaração anterior ou clique em "Carregar exemplo".');
  } else {
    const linhas = lista.map(p => {
      const c: Partial<Cadastro> = estado.cadastro[p.ticker] || {};
      return `<tr>
          <td><strong>${esc(p.ticker)}</strong><div class="muted">${esc(c.nome)}</div></td>
          <td>${esc(regras.bens[c.tipo || 'acao'].rotulo)}</td>
          <td>${esc(c.cnpj) || '<span class="muted">sem CNPJ</span>'}</td>
          <td>${esc(c.corretora)}</td>
          <td class="num-col">${qtd(p.quantidade)}</td>
          <td class="num-col">${moeda(p.custo)}</td>
          <td class="num-col"><button class="btn-icone" type="button" title="Remover" data-remover-bem="${esc(p.ticker)}">✕</button></td>
        </tr>`;
    });
    const total = lista.reduce((t, p) => t + p.custo, 0);
    $('#lista-bens').innerHTML = tabela(
      [{ t: 'Ativo' }, { t: 'Tipo' }, { t: 'CNPJ' }, { t: 'Corretora' }, { t: 'Quantidade', num: true }, { t: `31/12/${ANO - 1}`, num: true }, { t: '' }],
      linhas,
      `<tr><td colspan="5">Total declarado</td><td class="num-col">${moeda(total)}</td><td></td></tr>`
    );
  }
  const fp = $<HTMLFormElement>('#form-prejuizo');
  campoForm(fp, 'acoes').value = estado.prejuizoInicial.acoes ? String(estado.prejuizoInicial.acoes) : '';
  campoForm(fp, 'fii').value = estado.prejuizoInicial.fii ? String(estado.prejuizoInicial.fii) : '';
}

const filtroMov = { ano: String(ANO), grupo: 'todos' };

function renderFiltroMov(): void {
  const anos = [...new Set(estado.movimentos.map(m => m.data.slice(0, 4)))].sort().reverse();
  if (!anos.includes(filtroMov.ano) && filtroMov.ano !== 'todos') filtroMov.ano = anos[0] || String(ANO);
  const sel = $<HTMLSelectElement>('#filtro-mov-ano');
  sel.innerHTML = ['todos', ...anos].map(a => `<option value="${a}">${a === 'todos' ? 'Todos os anos' : a}</option>`).join('');
  sel.value = filtroMov.ano;
  $<HTMLSelectElement>('#filtro-mov-grupo').value = filtroMov.grupo;
}

function detalheMovimento(m: Movimento): string {
  if (m.origem === 'leilaoFracao' && m.tipo === 'venda') return `fração de ${qtd(m.quantidade)} vendida pela empresa`;
  switch (m.tipo) {
    case 'compra':
    case 'venda':
      return `${qtd(m.quantidade)} × ${moeda(m.preco)}${m.taxas ? ` <span class="muted">+ taxas ${moeda(m.taxas)}</span>` : ''}`;
    case 'bonificacao':
      return `${qtd(m.quantidade)} novas × ${moeda(m.preco)} (custo atribuído)`;
    case 'desdobramento':
      return m.fator ? `1 vira ${qtd(m.fator)}` : `+${qtd(m.quantidade ?? 0)} novas`;
    case 'conversao':
      return `${qtd(m.quantidade)} viraram ${qtd(m.quantidadeDestino)} ${esc(m.destino)}`;
    case 'grupamento':
      return `${qtd(m.fator)} viram 1`;
    default:
      return '';
  }
}

function totalMovimento(m: Movimento): number | null {
  switch (m.tipo) {
    case 'compra':
      return m.quantidade * m.preco + (m.taxas || 0);
    case 'venda':
      return m.quantidade * m.preco - (m.taxas || 0);
    case 'bonificacao':
      return m.quantidade * m.preco;
    case 'dividendo':
    case 'jcp':
    case 'rendimento':
      return m.valor;
    default:
      return null;
  }
}

function renderMovimentos(): void {
  renderFiltroMov();
  const lista = [...estado.movimentos]
    .filter(m => filtroMov.ano === 'todos' || m.data.startsWith(filtroMov.ano))
    .filter(m => filtroMov.grupo === 'todos' || (GRUPO_MOV[m.tipo] || 'evento') === filtroMov.grupo)
    .sort((a, b) => b.data.localeCompare(a.data));
  $('#contagem-mov').textContent = `${lista.length} de ${estado.movimentos.length} lançamentos`;
  if (!lista.length) {
    $('#lista-movimentos').innerHTML = blocoVazio(
      'Nenhum lançamento',
      estado.movimentos.length ? 'Nenhum lançamento com esse filtro.' : 'Use o formulário acima para lançar compras, vendas e proventos.'
    );
    return;
  }
  const linhas = lista.map(m => {
    const [rotulo, classe] =
      m.origem === 'leilaoFracao' ? ['Leilão de fração', 'evento'] : m.origem === 'subscricao' ? ['Subscrição', 'compra'] : ROTULO_MOV[m.tipo];
    const t = totalMovimento(m);
    return `<tr>
        <td>${dataBr(m.data)}</td>
        <td><span class="selo selo-${classe}">${rotulo}</span></td>
        <td><strong>${esc(m.ticker)}</strong></td>
        <td>${detalheMovimento(m)}</td>
        <td class="num-col">${t == null ? '' : moeda(t)}</td>
        <td class="num-col"><button class="btn-icone" type="button" title="Remover" data-remover-mov="${esc(m.id)}">✕</button></td>
      </tr>`;
  });
  $('#lista-movimentos').innerHTML = tabela(
    [{ t: 'Data' }, { t: 'Operação' }, { t: 'Ativo' }, { t: 'Detalhe' }, { t: 'Valor', num: true }, { t: '' }],
    linhas
  );
}

function renderCarteira(): void {
  $('#alertas-carteira').innerHTML = alertasHtml(relatorio.alertas);
  const posicoes = [...relatorio.posicoes].sort((a, b) => a.ticker.localeCompare(b.ticker));
  const statusDe: Record<string, StatusBem> = {};
  (Object.entries(relatorio.bens) as [StatusBem, ItemBem[]][]).forEach(([s, l]) => l.forEach(b => (statusDe[b.ticker] = s)));

  if (!posicoes.length) {
    $('#tabela-carteira').innerHTML = blocoVazio('Carteira vazia', 'Cadastre a declaração anterior e as movimentações.');
  } else {
    const linhas = posicoes.map(p => {
      const s = statusDe[p.ticker];
      return `<tr>
          <td><strong>${esc(p.ticker)}</strong></td>
          <td>${esc(regras.bens[p.tipo].rotulo)}</td>
          <td class="num-col">${qtd(p.quantidadeInicial)}</td>
          <td class="num-col">${qtd(p.quantidade)}</td>
          <td class="num-col">${p.quantidade ? moeda(p.custo / p.quantidade) : '<span class="muted">-</span>'}</td>
          <td class="num-col">${moeda(p.custoInicial)}</td>
          <td class="num-col"><strong>${moeda(p.custo)}</strong></td>
          <td>${s ? `<span class="selo selo-${s}">${ROTULO_STATUS[s]}</span>` : ''}</td>
        </tr>`;
    });
    const soma = (campo: 'custoInicial' | 'custo') => posicoes.reduce((t, p) => t + p[campo], 0);
    $('#tabela-carteira').innerHTML = tabela(
      [
        { t: 'Ativo' },
        { t: 'Tipo' },
        { t: `Qtd ${ANO - 1}`, num: true },
        { t: `Qtd ${ANO}`, num: true },
        { t: 'Preço médio', num: true },
        { t: `Custo ${ANO - 1}`, num: true },
        { t: `Custo ${ANO}`, num: true },
        { t: 'Situação' }
      ],
      linhas,
      `<tr><td colspan="5">Total</td><td class="num-col">${moeda(soma('custoInicial'))}</td><td class="num-col">${moeda(soma('custo'))}</td><td></td></tr>`
    );
  }

  const meses = relatorio.apuracao.meses;
  if (!meses.length) {
    $('#tabela-apuracao').innerHTML = blocoVazio('Nenhuma venda no ano', 'Sem vendas, não há apuração nem DARF.');
    return;
  }
  const traco = '<span class="muted">-</span>';
  const linhas = meses.map(m => {
    const acoes = m.vendasAcoes ? `${moeda(m.lucroAcoes)}${m.isento ? ' <span class="selo selo-novo">isento</span>' : ''}` : traco;
    const fii = m.vendasFii ? moeda(m.lucroFii) : traco;
    const darf = m.darf
      ? `<strong>${moeda(m.darf.valor)}</strong><div class="muted">vence ${dataBr(m.darf.vencimento)}</div>`
      : m.imposto > 0
        ? '<span class="muted">abaixo de R$ 10, acumula</span>'
        : traco;
    return `<tr>
        <td>${mesExtenso(m.mes)}</td>
        <td class="num-col">${m.vendasAcoes ? moeda(m.vendasAcoes) : traco}</td>
        <td class="num-col">${acoes}</td>
        <td class="num-col">${m.prejuizoAcoes ? moeda(m.prejuizoAcoes) : traco}</td>
        <td class="num-col">${fii}</td>
        <td class="num-col">${m.prejuizoFii ? moeda(m.prejuizoFii) : traco}</td>
        <td class="num-col">${m.imposto ? moeda(m.imposto) : traco}</td>
        <td class="num-col">${darf}</td>
      </tr>`;
  });
  $('#tabela-apuracao').innerHTML = tabela(
    [
      { t: 'Mês' },
      { t: 'Vendas ações', num: true },
      { t: 'Resultado ações', num: true },
      { t: 'Prejuízo ações', num: true },
      { t: 'Resultado FII', num: true },
      { t: 'Prejuízo FII', num: true },
      { t: 'Imposto do mês', num: true },
      { t: 'DARF 6015', num: true }
    ],
    linhas
  );
}

function campo(rotulo: string, valorHtml: string, copia?: string, destaque?: boolean): string {
  return `<div class="campo${destaque ? ' destaque' : ''}">
      <div class="linha"><span>${rotulo}</span>${copia != null && copia !== '' ? botaoCopiar(copia) : ''}</div>
      <strong>${valorHtml}</strong>
    </div>`;
}

function cardBem(b: ItemBem): string {
  const anoAnt = ANO - 1;
  const instrucoes: Partial<Record<StatusBem, string>> = {
    alterado: `Abra o bem ${esc(b.ticker)} na ficha, troque o valor de 31/12/${ANO} e cole a nova discriminação.`,
    novo: 'Na ficha Bens e Direitos, clique em Novo e preencha os campos abaixo.',
    zerado: `Não exclua o bem: o valor de 31/12/${anoAnt} precisa continuar lá. Coloque R$ 0,00 em 31/12/${ANO} e atualize a discriminação.`,
    mesmoAno: 'Opcional, mas recomendado: inclua o bem com R$ 0,00 nas duas colunas para deixar a operação registrada.'
  };

  const campos: string[] = [];
  if (b.status === 'novo' || b.status === 'mesmoAno') {
    campos.push(campo('Grupo', `${b.grupo}`, b.grupo));
    campos.push(campo('Código', `${b.codigo}`, b.codigo));
    campos.push(campo('Localização', '105 - Brasil'));
    campos.push(campo('CNPJ', b.cnpj || '<span class="muted">não informado</span>', b.cnpj));
    campos.push(campo('Negociado em bolsa', `Sim · código ${esc(b.ticker)}`, b.ticker));
    campos.push(campo(`Situação em 31/12/${anoAnt}`, moeda(0), valorCopia(0)));
    campos.push(campo(`Situação em 31/12/${ANO}`, moeda(b.valorAtual), valorCopia(b.valorAtual), true));
  } else {
    campos.push(campo('Grupo / Código', `${b.grupo} · ${b.codigo}`));
    campos.push(campo('Quantidade', `${qtd(b.quantidadeInicial)} <span class="seta">→</span> ${qtd(b.quantidadeFinal)}`));
    campos.push(
      campo(
        `Situação em 31/12/${ANO}`,
        `<span class="diff"><s>${moeda(b.valorAnterior)}</s><span class="seta">→</span>${moeda(b.valorAtual)}</span>`,
        valorCopia(b.valorAtual),
        true
      )
    );
  }

  const avisoAnterior =
    b.anteriorCalculado && (b.status === 'alterado' || b.status === 'zerado')
      ? `<p class="nota">O valor de 31/12/${anoAnt} (${qtd(b.quantidadeInicial)} por ${moeda(b.valorAnterior)}) foi calculado pelo histórico. Se na sua declaração de ${anoAnt + 1} estiver diferente, vale o da declaração.</p>`
      : '';

  return `<article class="bem bem-${b.status}">
      <header>
        <div><strong class="ticker">${esc(b.ticker)}</strong><span class="nome">${esc(b.nome)}</span></div>
        <span class="selo selo-${b.status}">${ROTULO_STATUS[b.status]}</span>
      </header>
      <p class="instrucao">${instrucoes[b.status] ?? ''}</p>
      ${avisoAnterior}
      <div class="campos">${campos.join('')}</div>
      <div class="discriminacao">
        <div class="campo">
          <div class="linha"><span>Discriminação</span>${botaoCopiar(b.discriminacao)}</div>
          <p>${esc(b.discriminacao)}</p>
        </div>
      </div>
    </article>`;
}

function grupoRendimentoHtml(g: GrupoRendimento): string {
  const linhas = g.itens.map(
    i => `<tr>
        <td>${i.ticker ? `<strong>${esc(i.ticker)}</strong> <span class="muted">${esc(i.nome)}</span>` : esc(i.nome)}${i.meses ? `<div class="muted">${i.meses.map(mesExtenso).join(', ')}</div>` : ''}</td>
        <td>${i.cnpj ? `${esc(i.cnpj)} ${botaoCopiar(i.cnpj)}` : i.ticker ? '<span class="muted">sem CNPJ</span>' : '<span class="muted">não se aplica</span>'}</td>
        <td class="num-col">${moeda(i.valor)} ${botaoCopiar(valorCopia(i.valor))}</td>
      </tr>`
  );
  return `<div class="cartao">
      <h3>Código ${g.codigo} · ${esc(g.descricao)}</h3>
      ${tabela([{ t: 'Fonte pagadora' }, { t: 'CNPJ' }, { t: 'Valor', num: true }], linhas, g.itens.length > 1 ? `<tr><td colspan="2">Total</td><td class="num-col">${moeda(g.total)}</td></tr>` : '')}
    </div>`;
}

interface LinhaRendaVariavel {
  mes: string;
  resultado: number;
  prejuizoAnterior: number;
  base: number;
  imposto: number;
}

function rendaVariavelHtml(apuracao: Apuracao): string {
  const comuns = apuracao.meses.filter(m => m.resultadoAcoes !== 0);
  const fii = apuracao.meses.filter(m => m.vendasFii > 0);
  if (!comuns.length && !fii.length) return '<p class="ok">Nenhum mês com resultado tributável ou prejuízo. Nada a preencher nesta ficha.</p>';

  const deAcoes = (m: MesApurado): LinhaRendaVariavel => ({
    mes: m.mes,
    resultado: m.resultadoAcoes,
    prejuizoAnterior: m.prejuizoAnteriorAcoes,
    base: m.baseAcoes,
    imposto: m.impostoAcoes
  });
  const deFii = (m: MesApurado): LinhaRendaVariavel => ({
    mes: m.mes,
    resultado: m.lucroFii,
    prejuizoAnterior: m.prejuizoAnteriorFii,
    base: m.baseFii,
    imposto: m.impostoFii
  });

  const tabelaMeses = (lista: LinhaRendaVariavel[]) =>
    tabela(
      [
        { t: 'Mês' },
        { t: 'Resultado líquido', num: true },
        { t: 'Prejuízo a compensar', num: true },
        { t: 'Base de cálculo', num: true },
        { t: 'Imposto devido', num: true }
      ],
      lista.map(
        m => `<tr>
            <td>${mesExtenso(m.mes)}</td>
            <td class="num-col">${moeda(m.resultado)} ${botaoCopiar(valorCopia(m.resultado))}</td>
            <td class="num-col">${moeda(m.prejuizoAnterior)}</td>
            <td class="num-col">${moeda(m.base)}</td>
            <td class="num-col">${moeda(m.imposto)}</td>
          </tr>`
      )
    );

  let html = '<p class="nota">Preencha só os meses listados, na coluna do mês correspondente. O programa calcula o restante; confira se o imposto devido bate.</p>';
  const doAno = relatorio.vendas;
  if (doAno.length && doAno.every(v => v.origem === 'leilaoFracao')) {
    html += `<div class="alerta alerta-aviso">Estes meses vêm só de leilões de frações: quando uma bonificação ou incorporação deixa fração de ação ou cota, a empresa vende a fração e deposita o valor. Não foi venda sua, mas a Receita trata como alienação, então entra na ficha.</div>`;
  }
  if (comuns.length) html += `<div class="cartao"><h3>Operações comuns · Mercado à vista (ações)</h3>${tabelaMeses(comuns.map(deAcoes))}</div>`;
  if (fii.length) html += `<div class="cartao"><h3>Fundos de Investimento Imobiliário</h3>${tabelaMeses(fii.map(deFii))}</div>`;
  return html;
}

function darfsHtml(apuracao: Apuracao): string {
  const pendente =
    apuracao.pendente > 0
      ? `<div class="alerta alerta-aviso">Sobrou ${moeda(apuracao.pendente)} de imposto abaixo do mínimo de R$ 10. Ele não vira DARF sozinho: soma com o próximo imposto que você tiver em renda variável.</div>`
      : '';
  if (!apuracao.darfs.length) return `<p class="ok">Nenhum DARF a pagar no ano.</p>${pendente}`;
  const linhas = apuracao.darfs.map(
    d => `<tr>
        <td>${mesExtenso(d.competencia)}</td>
        <td>${d.codigo}</td>
        <td class="num-col"><strong>${moeda(d.valor)}</strong>${d.acumuladoAnterior ? `<div class="muted">inclui ${moeda(d.acumuladoAnterior)} acumulado</div>` : ''}</td>
        <td class="num-col">${dataBr(d.vencimento)}</td>
      </tr>`
  );
  return `${tabela([{ t: 'Competência' }, { t: 'Código' }, { t: 'Valor', num: true }, { t: 'Vencimento', num: true }], linhas)}
      <p class="nota">Pague pelo Sicalc ou pelo app da Receita. Vencimento no último dia útil do mês seguinte, sem considerar feriados. DARF pago com atraso tem multa e juros.</p>${pendente}`;
}

function renderRelatorio(): void {
  const el = $('#relatorio');
  const contador = $('#contador-pendencias');
  if (!estado.posicaoInicial.length && !estado.movimentos.length) {
    el.innerHTML = `<div class="cartao">${blocoVazio('Nada para mostrar ainda', 'Cadastre a declaração anterior e as movimentações, ou clique em "Carregar exemplo".')}</div>`;
    contador.hidden = true;
    return;
  }

  const b = relatorio.bens;
  const aMexer = [...b.alterado, ...b.novo, ...b.zerado, ...b.mesmoAno];
  const { isentos, exclusivos } = relatorio.rendimentos;
  const darfs = relatorio.apuracao.darfs;
  const pendencias = aMexer.length + isentos.length + exclusivos.length + darfs.length;
  contador.textContent = String(pendencias);
  contador.hidden = pendencias === 0;

  const card = (n: number, texto: string, cor: string) =>
    `<div class="resumo-card${n ? '' : ' zero'}" style="--cor: var(${cor})"><strong>${n}</strong><span>${texto}</span></div>`;

  const semAlteracao = b.semAlteracao.length
    ? `<details class="sem-alteracao"><summary>${b.semAlteracao.length} ${b.semAlteracao.length === 1 ? 'bem continua igual' : 'bens continuam iguais'}, nada a fazer</summary><ul>${b.semAlteracao
        .map(x => `<li>${esc(x.ticker)}: ${qtd(x.quantidadeFinal)} ${x.tipo === 'acao' ? 'ações' : 'cotas'}, ${moeda(x.valorAtual)}</li>`)
        .join('')}</ul></details>`
    : '';

  el.innerHTML = `
      <div class="resumo">
        ${card(b.alterado.length, 'bens para atualizar', '--info')}
        ${card(b.novo.length, 'bens novos para incluir', '--pri')}
        ${card(b.zerado.length + b.mesmoAno.length, 'bens vendidos', '--aviso')}
        ${card(darfs.length, darfs.length === 1 ? 'DARF a pagar' : 'DARFs a pagar', '--perigo')}
      </div>

      ${alertasHtml(relatorio.alertas)}

      <section class="bloco">
        <h2>Bens e Direitos</h2>
        <p class="nota">A coluna "Situação em 31/12/${ANO - 1}" já vem preenchida quando você importa a declaração anterior. Mexa só no que aparece aqui.</p>
        <div class="bens">${aMexer.length ? aMexer.map(cardBem).join('') : '<p class="ok">Nenhum bem mudou. Nada a fazer nesta ficha.</p>'}</div>
        ${semAlteracao}
      </section>

      <section class="bloco">
        <h2>Rendimentos Isentos e Não Tributáveis</h2>
        <div class="bens">${isentos.length ? isentos.map(grupoRendimentoHtml).join('') : '<p class="ok">Nenhum rendimento isento no ano.</p>'}</div>
      </section>

      <section class="bloco">
        <h2>Rendimentos Sujeitos à Tributação Exclusiva</h2>
        <div class="bens">${exclusivos.length ? exclusivos.map(grupoRendimentoHtml).join('') : '<p class="ok">Nenhum JCP no ano.</p>'}</div>
      </section>

      <section class="bloco">
        <h2>Renda Variável</h2>
        <div class="bens">${rendaVariavelHtml(relatorio.apuracao)}</div>
      </section>

      <section class="bloco">
        <h2>DARFs do ano</h2>
        <div class="cartao">${darfsHtml(relatorio.apuracao)}</div>
      </section>

      <p class="nota">Protótipo. Códigos e regras configurados para o ano-calendário ${ANO} em <code>src/dominio/regras.ts</code>: confira no programa do IRPF do ano antes de transmitir. Fora do escopo por enquanto: day trade, BDR, ETF, opções, aluguel de ações e IRRF de 0,005%.</p>
    `;
}

const delta = (v: number | null, extra = ''): string => {
  if (v == null) return '<span class="muted">sem cotação</span>';
  const pos = v >= 0;
  return `<span class="delta ${pos ? 'pos' : 'neg'}">${pos ? '▲' : '▼'} ${moeda(Math.abs(v))}${extra}</span>`;
};

const deltaPct = (v: number, texto: string): string => {
  const pos = v >= 0;
  return `<span class="delta ${pos ? 'pos' : 'neg'}">${pos ? '▲' : '▼'} ${pct(Math.abs(v))} ${texto}</span>`;
};

let filtroPeriodo = '12m';

function serieDoPeriodo(serie: PontoSerie[]): PontoSerie[] {
  if (filtroPeriodo === 'tudo') return serie;
  if (filtroPeriodo === '12m') return serie.slice(-12);
  return serie.filter(s => s.mes.startsWith(filtroPeriodo));
}

function rotuloEixoMes(serie: PontoSerie[]): (mes: string, i: number) => string {
  const curto = serie.length <= 14;
  return (mes, i) => {
    const [a = '', m = ''] = mes.split('-');
    const nomeMes = MESES_CURTOS[Number(m) - 1] ?? '';
    if (curto) return i === 0 || m === '01' ? `${nomeMes}/${a.slice(2)}` : nomeMes;
    return m === '01' || i === 0 ? a : '';
  };
}

function tabelaSerie(serie: PontoSerie[], cols: { t: string; valor: (s: PontoSerie) => number }[]): string {
  const linhas = [...serie].reverse().map(s => `<tr><td>${mesExtenso(s.mes)}</td>${cols.map(c => `<td class="num-col">${moeda(c.valor(s))}</td>`).join('')}</tr>`);
  return `<details class="ver-tabela"><summary>Ver dados em tabela</summary>${tabela([{ t: 'Mês' }, ...cols.map(c => ({ t: c.t, num: true }))], linhas)}</details>`;
}

function renderDesempenho(): void {
  const el = $('#desempenho');
  if (!estado.movimentos.length && !estado.posicaoInicial.length) {
    el.innerHTML = `<div class="cartao">${blocoVazio('Nada para mostrar ainda', 'Importe seu histórico da B3 ou clique em "Carregar exemplo".')}</div>`;
    return;
  }
  const d = calcularDesempenho(estado, regras, hoje());
  const t = d.totais;
  const emCarteira = d.ativos.filter(a => a.quantidade > 0);
  const semCorretagem = estado.movimentos.some(m => String(m.id).startsWith('b3-'));
  if (filtroPeriodo !== 'tudo' && filtroPeriodo !== '12m' && !d.anos.includes(Number(filtroPeriodo))) filtroPeriodo = '12m';
  const serie = serieDoPeriodo(d.serie);
  const somaSerie = (f: (s: PontoSerie) => number) => serie.reduce((s, x) => s + f(x), 0);
  const totalProventosPeriodo = somaSerie(s => s.proventos.dividendo + s.proventos.jcp + s.proventos.rendimento);
  const totalAportesPeriodo = somaSerie(s => s.aportes);
  const rotuloPeriodo = filtroPeriodo === 'tudo' ? 'desde o início' : filtroPeriodo === '12m' ? 'nos últimos 12 meses' : `em ${filtroPeriodo}`;
  const todosSemCotacao = d.semCotacao.length === emCarteira.length;
  const traco = '<span class="muted">-</span>';

  const linhasAtivos = d.ativos.map(
    a => `<tr>
        <td><strong>${esc(a.ticker)}</strong><div class="muted">${esc(regras.bens[a.tipo]?.rotulo ?? a.tipo)}</div></td>
        <td class="num-col">${qtd(a.quantidade)}</td>
        <td class="num-col">${a.quantidade ? moeda(a.precoMedio) : traco}</td>
        <td class="num-col">${a.quantidade ? `<input class="input-cotacao${a.preco == null ? ' vazio' : ''}" type="number" min="0" step="0.01" inputmode="decimal" data-cotacao="${esc(a.ticker)}" value="${a.preco ?? ''}" placeholder="0,00" aria-label="Cotação de ${esc(a.ticker)}">` : '<span class="muted">vendido</span>'}</td>
        <td class="num-col">${moeda(a.custo)}</td>
        <td class="num-col">${a.valorAtual != null ? moeda(a.valorAtual) : traco}</td>
        <td class="num-col">${a.quantidade ? delta(a.naoRealizado, a.naoRealizadoPct != null ? ` (${pct(Math.abs(a.naoRealizadoPct))})` : '') : traco}</td>
        <td class="num-col">${moeda(a.proventos)}</td>
        <td class="num-col">${a.realizado ? moeda(a.realizado) : traco}</td>
        <td class="num-col"><strong>${moeda(a.resultado)}</strong></td>
      </tr>`
  );

  el.innerHTML = `
      <div class="cartao hero">
        <span class="rotulo">Patrimônio em ${dataBr(d.hoje)}${d.semCotacao.length ? (todosSemCotacao ? ' (pelo custo, sem cotações)' : ' (parte pelo custo)') : ''}</span>
        <strong class="hero-valor">${moeda(t.patrimonio)}</strong>
        <p class="sub">Custo de ${moeda(t.custo)} · valorização ${todosSemCotacao ? delta(null) : delta(t.naoRealizado, ` (${pct(Math.abs(t.naoRealizadoPct))})`)}</p>
      </div>

      <div class="resumo">
        <div class="resumo-card" style="--cor: var(--serie-1)"><strong>${moeda(t.aportado)}</strong><span>Total aportado</span></div>
        <div class="resumo-card" style="--cor: var(--serie-3)"><strong>${moeda(t.proventos)}</strong><span>Proventos recebidos</span></div>
        <div class="resumo-card" style="--cor: var(--serie-2)"><strong>${moeda(t.realizado)}</strong><span>${d.somenteLeiloes ? 'Leilões de frações' : 'Resultado das vendas'}</span></div>
        <div class="resumo-card" style="--cor: var(--pri)"><strong>${moeda(t.resultado)}</strong><span>Resultado total</span>${deltaPct(t.resultadoPct, 'sobre o aportado')}</div>
      </div>

      ${d.semCotacao.length ? `<div class="alerta alerta-aviso">Sem cotação para ${d.semCotacao.join(', ')}. Esses ativos entram no patrimônio pelo custo e sem valorização. Preencha a cotação na tabela do fim da página ou importe o arquivo de Posição da B3.</div>` : ''}

      <div class="grid-2">
        <div class="cartao cartao-grafico">
          <h3>Resultado por ativo</h3>
          <p class="nota">Valorização + proventos${d.somenteLeiloes ? ' + leilões de frações' : ' + vendas'}, desde a primeira compra.</p>
          <div id="g-resultado"></div>
        </div>
        <div class="cartao cartao-grafico">
          <h3>Composição da carteira</h3>
          <p class="nota">Pelo valor de mercado${d.semCotacao.length ? ' (ou pelo custo, quando falta cotação)' : ''}.</p>
          <div id="g-composicao"></div>
        </div>
      </div>

      <div class="filtros">
        <label>Período dos gráficos mensais
          <select id="filtro-periodo">
            <option value="12m">Últimos 12 meses</option>
            <option value="tudo">Desde o início</option>
            ${[...d.anos].reverse().map(a => `<option value="${a}">${a}</option>`).join('')}
          </select>
        </label>
      </div>

      <div class="cartao cartao-grafico">
        <h3>Proventos por mês</h3>
        <p class="nota">${moeda(totalProventosPeriodo)} ${rotuloPeriodo}.</p>
        <div class="legenda">
          <span><i style="background: var(--serie-1)"></i>Dividendos</span>
          <span><i style="background: var(--serie-2)"></i>JCP (líquido)</span>
          <span><i style="background: var(--serie-3)"></i>Rendimentos de FII e Fiagro</span>
        </div>
        <div id="g-proventos"></div>
        ${tabelaSerie(serie, [
          { t: 'Dividendos', valor: s => s.proventos.dividendo },
          { t: 'JCP', valor: s => s.proventos.jcp },
          { t: 'Rendimentos', valor: s => s.proventos.rendimento }
        ])}
      </div>

      <div class="grid-2">
        <div class="cartao cartao-grafico">
          <h3>Aportes por mês</h3>
          <p class="nota">${moeda(totalAportesPeriodo)} ${rotuloPeriodo}.</p>
          <div id="g-aportes"></div>
          ${tabelaSerie(serie, [{ t: 'Aportes', valor: s => s.aportes }])}
        </div>
        <div class="cartao cartao-grafico">
          <h3>Custo investido</h3>
          <p class="nota">Quanto do seu dinheiro estava aplicado no fim de cada mês.</p>
          <div id="g-custo"></div>
          ${tabelaSerie(serie, [{ t: 'Custo', valor: s => s.custo }])}
        </div>
      </div>

      <div class="cartao">
        <h3>Desempenho por ativo</h3>
        <p class="nota">Digite a cotação atual para ver a valorização. Ela fica salva neste navegador.${semCorretagem ? ' O preço médio vem do extrato da B3, que não traz corretagem e emolumentos.' : ''}</p>
        ${tabela(
          [
            { t: 'Ativo' },
            { t: 'Qtd', num: true },
            { t: 'Preço médio', num: true },
            { t: 'Cotação', num: true },
            { t: 'Custo', num: true },
            { t: 'Valor atual', num: true },
            { t: 'Valorização', num: true },
            { t: 'Proventos', num: true },
            { t: d.somenteLeiloes ? 'Frações' : 'Vendas', num: true },
            { t: 'Resultado', num: true }
          ],
          linhasAtivos
        )}
      </div>
    `;

  $<HTMLSelectElement>('#filtro-periodo').value = filtroPeriodo;
  desenharGraficos(d, serie);
}

function desenharGraficos(d: Desempenho, serie: PontoSerie[]): void {
  const emCarteira = d.ativos.filter(a => a.quantidade > 0);
  const patrimonio = d.totais.patrimonio || 1;
  barrasH($('#g-resultado'), {
    titulo: 'Resultado por ativo',
    formato: moeda,
    corPositiva: corCss('--ganho'),
    corNegativa: corCss('--perda'),
    itens: [...d.ativos]
      .sort((a, b) => b.resultado - a.resultado)
      .map(a => ({
        rotulo: a.ticker,
        valor: a.resultado,
        detalhe: [
          { valor: a.naoRealizado != null ? moeda(a.naoRealizado) : a.quantidade ? 'sem cotação' : moeda(0), nome: 'valorização' },
          { valor: moeda(a.proventos), nome: 'proventos' },
          { valor: moeda(a.realizado), nome: d.somenteLeiloes ? 'leilão de frações' : 'vendas' },
          { valor: moeda(a.resultado), nome: 'total' }
        ]
      }))
  });
  barrasH($('#g-composicao'), {
    titulo: 'Composição da carteira',
    formato: moeda,
    corPositiva: corCss('--serie-1'),
    itens: emCarteira
      .map(a => ({ a, v: a.valorAtual != null ? a.valorAtual : a.custo }))
      .sort((x, y) => y.v - x.v)
      .map(({ a, v }) => ({
        rotulo: a.ticker,
        valor: v,
        rotuloValor: pct(v / patrimonio),
        detalhe: [
          { valor: moeda(v), nome: a.valorAtual != null ? 'valor atual' : 'custo' },
          { valor: pct(v / patrimonio), nome: 'da carteira' }
        ]
      }))
  });
  if (!serie.length) return;
  const comum = {
    categorias: serie.map(s => s.mes),
    formato: moeda,
    formatoEixo: compacto,
    rotuloCategoria: mesExtenso,
    rotuloEixoX: rotuloEixoMes(serie)
  };
  colunas($('#g-proventos'), {
    ...comum,
    titulo: 'Proventos por mês',
    series: [
      { nome: 'dividendos', cor: corCss('--serie-1'), valores: serie.map(s => s.proventos.dividendo) },
      { nome: 'JCP', cor: corCss('--serie-2'), valores: serie.map(s => s.proventos.jcp) },
      { nome: 'rendimentos', cor: corCss('--serie-3'), valores: serie.map(s => s.proventos.rendimento) }
    ]
  });
  if (serie.some(s => s.aportes > 0)) {
    colunas($('#g-aportes'), {
      ...comum,
      titulo: 'Aportes por mês',
      series: [{ nome: 'aportes', cor: corCss('--serie-1'), valores: serie.map(s => s.aportes) }]
    });
  } else {
    $('#g-aportes').innerHTML = blocoVazio('Nenhum aporte neste período', 'Troque o período para "Desde o início" para ver todas as compras.');
  }
  linha($('#g-custo'), { ...comum, titulo: 'Custo investido', cor: corCss('--serie-1'), valores: serie.map(s => s.custo) });
}

const abaAtiva = (): string | undefined => document.querySelector<HTMLElement>('.aba.ativa')?.dataset.aba;

function render(): void {
  relatorio = gerarRelatorio(estado, regras, paraAno);
  renderDeclaracao();
  renderMovimentos();
  renderCarteira();
  renderRelatorio();
  if (abaAtiva() === 'desempenho') renderDesempenho();
}

function preencherCadastro(form: HTMLFormElement, prefixo: string, ticker: string): void {
  const nome = (n: string) => campoForm(form, prefixo ? `${prefixo}${n.charAt(0).toUpperCase()}${n.slice(1)}` : n);
  const fonte: Partial<Cadastro> | undefined = estado.cadastro[ticker] || ATIVOS[ticker];
  if (!fonte || !fonte.tipo) return;
  nome('tipo').value = fonte.tipo;
  if (!nome('nome').value) nome('nome').value = fonte.nome || '';
  if (!nome('cnpj').value) nome('cnpj').value = fonte.cnpj || '';
  if (!nome('corretora').value && fonte.corretora) nome('corretora').value = fonte.corretora;
}

const tipoDoFormulario = (valor: string): TipoFormulario => (valor in CAMPOS_POR_TIPO ? (valor as TipoFormulario) : 'compra');

function ajustarNovoAtivo(): void {
  const f = $<HTMLFormElement>('#form-mov');
  const fs = $<HTMLFieldSetElement>('#novo-ativo');
  const ticker = campoForm(f, 'ticker').value.trim().toUpperCase();
  const conhecido = !ticker || !!estado.cadastro[ticker];
  fs.hidden = conhecido;
  fs.disabled = conhecido;
  if (!conhecido && fs.dataset.ticker !== ticker) {
    ['novoNome', 'novoCnpj'].forEach(n => (campoForm(f, n).value = ''));
    preencherCadastro(f, 'novo', ticker);
    fs.dataset.ticker = ticker;
  }
}

function ajustarFormMov(): void {
  const f = $<HTMLFormElement>('#form-mov');
  const tipo = tipoDoFormulario(campoForm(f, 'tipo').value);
  const visiveis = CAMPOS_POR_TIPO[tipo];
  f.querySelectorAll<HTMLLabelElement>('[data-campo]').forEach(l => {
    const nomeCampo = l.dataset.campo as CampoMovimento;
    const ativo = visiveis.includes(nomeCampo);
    l.hidden = !ativo;
    const input = l.querySelector('input');
    if (!input) return;
    input.required = ativo && nomeCampo !== 'taxas';
    input.disabled = !ativo;
  });
  $('[data-rotulo-preco]').textContent = tipo === 'bonificacao' ? 'Custo unitário atribuído (R$)' : 'Preço unitário (R$)';
  $('[data-rotulo-fator]').textContent = tipo === 'desdobramento' ? 'Cada 1 vira quantas' : 'Quantas viram 1';
  ajustarNovoAtivo();
}

function montarMovimento(d: Record<string, string>, ticker: string): Movimento {
  const base = { id: uid(), data: d.data ?? '', ticker };
  const n = (c: CampoMovimento) => numero(d[c]);
  const tipo = tipoDoFormulario(d.tipo ?? '');
  switch (tipo) {
    case 'compra':
    case 'venda': {
      const taxas = n('taxas');
      return { ...base, tipo, quantidade: n('quantidade') ?? 0, preco: n('preco') ?? 0, ...(taxas !== undefined ? { taxas } : {}) };
    }
    case 'dividendo':
    case 'jcp':
    case 'rendimento':
      return { ...base, tipo, valor: n('valor') ?? 0 };
    case 'bonificacao':
      return { ...base, tipo, quantidade: n('quantidade') ?? 0, preco: n('preco') ?? 0 };
    case 'desdobramento':
      return { ...base, tipo, fator: n('fator') ?? 1 };
    case 'grupamento':
      return { ...base, tipo, fator: n('fator') ?? 1 };
  }
}

function ligarEventos(): void {
  $$('.aba').forEach(a => a.addEventListener('click', () => trocarAba(a.dataset.aba ?? 'declaracao')));

  document.addEventListener('click', e => {
    const alvo = (e.target as Element | null)?.closest<HTMLElement>('[data-copiar],[data-remover-bem],[data-remover-mov]');
    if (!alvo) return;
    if (alvo.dataset.copiar != null) {
      copiar(alvo.dataset.copiar);
      return;
    }
    if (alvo.dataset.removerBem) {
      estado.posicaoInicial = estado.posicaoInicial.filter(p => p.ticker !== alvo.dataset.removerBem);
    } else {
      estado.movimentos = estado.movimentos.filter(m => m.id !== alvo.dataset.removerMov);
    }
    salvar();
    render();
  });

  const fb = $<HTMLFormElement>('#form-bem');
  const tickerBem = campoForm(fb, 'ticker');
  tickerBem.addEventListener('input', () => {
    tickerBem.value = tickerBem.value.toUpperCase();
    preencherCadastro(fb, '', tickerBem.value.trim());
  });
  fb.addEventListener('submit', e => {
    e.preventDefault();
    const d = dadosForm(fb);
    const ticker = (d.ticker ?? '').trim().toUpperCase();
    const tipo = TIPOS_ATIVO.includes(d.tipo ?? '') ? (d.tipo as TipoAtivo) : 'acao';
    estado.cadastro[ticker] = { tipo, nome: (d.nome ?? '').trim(), cnpj: (d.cnpj ?? '').trim(), corretora: (d.corretora ?? '').trim() };
    estado.posicaoInicial = estado.posicaoInicial.filter(p => p.ticker !== ticker);
    estado.posicaoInicial.push({ ticker, quantidade: Number(d.quantidade), custo: Number(d.custo) });
    salvar();
    render();
    fb.reset();
    tickerBem.focus();
    toast(`${ticker} salvo`);
  });

  const fp = $<HTMLFormElement>('#form-prejuizo');
  fp.addEventListener('submit', e => {
    e.preventDefault();
    estado.prejuizoInicial = { acoes: Number(campoForm(fp, 'acoes').value) || 0, fii: Number(campoForm(fp, 'fii').value) || 0 };
    salvar();
    render();
    toast('Prejuízo salvo');
  });

  const fm = $<HTMLFormElement>('#form-mov');
  const dataMov = campoForm(fm, 'data') as HTMLInputElement;
  const tipoMov = campoForm(fm, 'tipo');
  const tickerMov = campoForm(fm, 'ticker');
  dataMov.max = `${ANO}-12-31`;
  tipoMov.addEventListener('change', ajustarFormMov);
  $<HTMLSelectElement>('#filtro-mov-ano').addEventListener('change', e => {
    filtroMov.ano = (e.target as HTMLSelectElement).value;
    renderMovimentos();
  });
  $<HTMLSelectElement>('#filtro-mov-grupo').addEventListener('change', e => {
    filtroMov.grupo = (e.target as HTMLSelectElement).value;
    renderMovimentos();
  });
  tickerMov.addEventListener('input', () => {
    tickerMov.value = tickerMov.value.toUpperCase();
    ajustarNovoAtivo();
  });
  fm.addEventListener('submit', e => {
    e.preventDefault();
    const d = dadosForm(fm);
    const ticker = (d.ticker ?? '').trim().toUpperCase();
    if (!estado.cadastro[ticker]) {
      const tipo = TIPOS_ATIVO.includes(d.novoTipo ?? '') ? (d.novoTipo as TipoAtivo) : 'acao';
      estado.cadastro[ticker] = { tipo, nome: (d.novoNome || '').trim(), cnpj: (d.novoCnpj || '').trim(), corretora: (d.novoCorretora || '').trim() };
    }
    estado.movimentos.push(montarMovimento(d, ticker));
    salvar();
    render();
    fm.reset();
    dataMov.value = d.data ?? '';
    tipoMov.value = d.tipo ?? 'compra';
    ajustarFormMov();
    tickerMov.focus();
    toast('Lançamento adicionado');
  });

  $('#btn-exemplo').addEventListener('click', () => {
    if ((estado.posicaoInicial.length || estado.movimentos.length) && !confirm('Substituir os dados atuais pelo exemplo?')) return;
    estado = gerarExemplo();
    salvar();
    render();
    ajustarNovoAtivo();
    trocarAba('relatorio');
    toast('Exemplo carregado');
  });

  $('#btn-limpar').addEventListener('click', () => {
    if (!confirm('Apagar todos os dados deste navegador?')) return;
    estado = vazio();
    salvar();
    render();
    trocarAba('declaracao');
  });

  $('#btn-exportar').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(estado, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `carteira-irpf-${ANO}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  const entradaImportar = $<HTMLInputElement>('#input-importar');
  entradaImportar.addEventListener('change', () => {
    const arquivo = entradaImportar.files?.[0];
    if (!arquivo) return;
    const leitor = new FileReader();
    leitor.onload = () => {
      try {
        estado = normalizar(JSON.parse(String(leitor.result)));
        salvar();
        render();
        toast('Backup importado');
      } catch {
        toast('Arquivo de backup inválido');
      }
      entradaImportar.value = '';
    };
    leitor.readAsText(arquivo);
  });

  $('#btn-imprimir').addEventListener('click', () => window.print());

  $('#desempenho').addEventListener('change', e => {
    const alvo = e.target as HTMLInputElement | HTMLSelectElement;
    if (alvo.id === 'filtro-periodo') {
      filtroPeriodo = alvo.value;
      renderDesempenho();
      return;
    }
    const ticker = alvo.dataset.cotacao;
    if (!ticker) return;
    const preco = Number(alvo.value);
    if (preco > 0) estado.cotacoes[ticker] = { preco, data: hoje() };
    else delete estado.cotacoes[ticker];
    salvar();
    renderDesempenho();
    const proximo = $$<HTMLInputElement>('.input-cotacao').find(i => (i.dataset.cotacao ?? '') > ticker);
    if (proximo) proximo.focus();
  });

  let espera: ReturnType<typeof setTimeout> | undefined;
  window.addEventListener('resize', () => {
    clearTimeout(espera);
    espera = setTimeout(() => {
      if (abaAtiva() === 'desempenho') renderDesempenho();
    }, 150);
  });
}

function iniciar(): void {
  $$('[data-ano]').forEach(e => (e.textContent = String(ANO)));
  $$('[data-ano-ant]').forEach(e => (e.textContent = String(ANO - 1)));
  $$('[data-ano-decl]').forEach(e => (e.textContent = String(regras.anoDeclaracao)));
  $$('[data-ano-decl-ant]').forEach(e => (e.textContent = String(regras.anoDeclaracao - 1)));
  ligarEventos();
  ajustarFormMov();
  render();
  const salva = ler(CHAVE_ABA);
  trocarAba(salva && document.querySelector(`#aba-${salva}`) ? salva : 'declaracao');
}

iniciar();
