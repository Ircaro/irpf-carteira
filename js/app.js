(function () {
  const CHAVE = 'irpf-carteira-v1';
  const CHAVE_ABA = 'irpf-carteira-aba';
  const regras = Regras.porAno(Regras.anosDisponiveis().slice(-1)[0]);
  const ANO = regras.anoCalendario;

  const CAMPOS_POR_TIPO = {
    compra: ['quantidade', 'preco', 'taxas'],
    venda: ['quantidade', 'preco', 'taxas'],
    dividendo: ['valor'],
    jcp: ['valor'],
    rendimento: ['valor'],
    bonificacao: ['quantidade', 'preco'],
    desdobramento: ['fator'],
    grupamento: ['fator']
  };

  const ROTULO_MOV = {
    compra: ['Compra', 'compra'],
    venda: ['Venda', 'venda'],
    dividendo: ['Dividendo', 'provento'],
    jcp: ['JCP', 'provento'],
    rendimento: ['Rendimento FII', 'provento'],
    bonificacao: ['Bonificação', 'evento'],
    desdobramento: ['Desdobramento', 'evento'],
    grupamento: ['Grupamento', 'evento']
  };

  const ROTULO_STATUS = {
    alterado: 'Atualizar valor',
    novo: 'Incluir bem novo',
    zerado: 'Vendido no ano',
    mesmoAno: 'Comprado e vendido no ano',
    semAlteracao: 'Sem alteração'
  };

  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  const $ = sel => document.querySelector(sel);
  const $$ = sel => [...document.querySelectorAll(sel)];
  const fmtMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmtValor = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const moeda = v => fmtMoeda.format(v || 0).replace(/ /g, ' ');
  const valorCopia = v => fmtValor.format(v || 0);
  const qtd = Calculo.quantidade;
  const dataBr = Calculo.dataBr;
  const mesExtenso = ym => {
    const [a, m] = ym.split('-');
    return `${MESES[Number(m) - 1]}/${a}`;
  };
  const esc = s =>
    String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  const vazio = () => ({ versao: 1, anoCalendario: ANO, prejuizoInicial: { acoes: 0, fii: 0 }, cadastro: {}, posicaoInicial: [], movimentos: [] });

  function ler(chave) {
    try {
      return localStorage.getItem(chave);
    } catch (e) {
      return null;
    }
  }

  function gravar(chave, valor) {
    try {
      localStorage.setItem(chave, valor);
    } catch (e) {}
  }

  function carregar() {
    try {
      const bruto = ler(CHAVE);
      return bruto ? normalizar(JSON.parse(bruto)) : null;
    } catch (e) {
      return null;
    }
  }

  function normalizar(dados) {
    if (!dados || !Array.isArray(dados.posicaoInicial) || !Array.isArray(dados.movimentos)) throw new Error('Arquivo inválido');
    return { ...vazio(), ...dados, cadastro: dados.cadastro || {}, prejuizoInicial: { acoes: 0, fii: 0, ...(dados.prejuizoInicial || {}) } };
  }

  let estado = carregar() || vazio();
  let relatorio = null;

  function salvar() {
    gravar(CHAVE, JSON.stringify(estado));
  }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('visivel');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('visivel'), 1800);
  }

  function copiar(texto) {
    const ok = () => toast('Copiado');
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(texto).then(ok, () => copiarFallback(texto, ok));
    } else {
      copiarFallback(texto, ok);
    }
  }

  function copiarFallback(texto, ok) {
    const ta = document.createElement('textarea');
    ta.value = texto;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      ok();
    } catch (e) {
      toast('Não foi possível copiar');
    }
    ta.remove();
  }

  const botaoCopiar = texto => `<button class="btn btn-sec btn-mini" type="button" data-copiar="${esc(texto)}">Copiar</button>`;

  function trocarAba(nome) {
    $$('.aba').forEach(a => a.classList.toggle('ativa', a.dataset.aba === nome));
    $$('.painel').forEach(p => p.classList.toggle('ativo', p.id === `aba-${nome}`));
    gravar(CHAVE_ABA, nome);
  }

  function tabela(cabecalho, linhas, rodape) {
    const th = cabecalho.map(c => `<th class="${c.num ? 'num-col' : ''}">${c.t}</th>`).join('');
    return `<div class="tabela-wrap"><table><thead><tr>${th}</tr></thead><tbody>${linhas.join('')}</tbody>${rodape ? `<tfoot>${rodape}</tfoot>` : ''}</table></div>`;
  }

  const blocoVazio = (titulo, texto) => `<div class="vazio"><strong>${titulo}</strong>${texto}</div>`;

  function alertasHtml(alertas) {
    if (!alertas.length) return '';
    return `<div class="alertas">${alertas.map(a => `<div class="alerta alerta-${a.nivel}">${esc(a.texto)}</div>`).join('')}</div>`;
  }

  function renderDeclaracao() {
    const lista = [...estado.posicaoInicial].sort((a, b) => a.ticker.localeCompare(b.ticker));
    if (!lista.length) {
      $('#lista-bens').innerHTML = blocoVazio('Nenhum bem cadastrado', 'Adicione os bens da declaração anterior ou clique em "Carregar exemplo".');
    } else {
      const linhas = lista.map(p => {
        const c = estado.cadastro[p.ticker] || {};
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
        [{ t: 'Ativo' }, { t: 'Tipo' }, { t: 'CNPJ' }, { t: 'Corretora' }, { t: 'Quantidade', num: 1 }, { t: `31/12/${ANO - 1}`, num: 1 }, { t: '' }],
        linhas,
        `<tr><td colspan="5">Total declarado</td><td class="num-col">${moeda(total)}</td><td></td></tr>`
      );
    }
    const fp = $('#form-prejuizo');
    fp.acoes.value = estado.prejuizoInicial.acoes || '';
    fp.fii.value = estado.prejuizoInicial.fii || '';
  }

  function renderMovimentos() {
    const lista = [...estado.movimentos].sort((a, b) => b.data.localeCompare(a.data));
    if (!lista.length) {
      $('#lista-movimentos').innerHTML = blocoVazio('Nenhum lançamento', 'Use o formulário acima para lançar compras, vendas e proventos do ano.');
      return;
    }
    const detalhe = m => {
      if (m.tipo === 'compra' || m.tipo === 'venda') return `${qtd(m.quantidade)} × ${moeda(m.preco)}${m.taxas ? ` <span class="muted">+ taxas ${moeda(m.taxas)}</span>` : ''}`;
      if (m.tipo === 'bonificacao') return `${qtd(m.quantidade)} novas × ${moeda(m.preco)} (custo atribuído)`;
      if (m.tipo === 'desdobramento') return `1 vira ${qtd(m.fator)}`;
      if (m.tipo === 'grupamento') return `${qtd(m.fator)} viram 1`;
      return '';
    };
    const total = m => {
      if (m.tipo === 'compra') return m.quantidade * m.preco + (m.taxas || 0);
      if (m.tipo === 'venda') return m.quantidade * m.preco - (m.taxas || 0);
      if (m.tipo === 'bonificacao') return m.quantidade * m.preco;
      if (m.valor != null) return m.valor;
      return null;
    };
    const linhas = lista.map(m => {
      const [rotulo, classe] = ROTULO_MOV[m.tipo];
      const t = total(m);
      return `<tr>
        <td>${dataBr(m.data)}</td>
        <td><span class="selo selo-${classe}">${rotulo}</span></td>
        <td><strong>${esc(m.ticker)}</strong></td>
        <td>${detalhe(m)}</td>
        <td class="num-col">${t == null ? '' : moeda(t)}</td>
        <td class="num-col"><button class="btn-icone" type="button" title="Remover" data-remover-mov="${esc(m.id)}">✕</button></td>
      </tr>`;
    });
    $('#lista-movimentos').innerHTML = tabela(
      [{ t: 'Data' }, { t: 'Operação' }, { t: 'Ativo' }, { t: 'Detalhe' }, { t: 'Valor', num: 1 }, { t: '' }],
      linhas
    );
  }

  function renderCarteira() {
    $('#alertas-carteira').innerHTML = alertasHtml(relatorio.alertas);
    const posicoes = [...relatorio.posicoes].sort((a, b) => a.ticker.localeCompare(b.ticker));
    const statusDe = {};
    Object.entries(relatorio.bens).forEach(([s, l]) => l.forEach(b => (statusDe[b.ticker] = s)));

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
      const soma = campo => posicoes.reduce((t, p) => t + p[campo], 0);
      $('#tabela-carteira').innerHTML = tabela(
        [
          { t: 'Ativo' },
          { t: 'Tipo' },
          { t: `Qtd ${ANO - 1}`, num: 1 },
          { t: `Qtd ${ANO}`, num: 1 },
          { t: 'Preço médio', num: 1 },
          { t: `Custo ${ANO - 1}`, num: 1 },
          { t: `Custo ${ANO}`, num: 1 },
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
    const linhas = meses.map(m => {
      const acoes = m.vendasAcoes
        ? `${moeda(m.lucroAcoes)}${m.isento ? ' <span class="selo selo-novo">isento</span>' : ''}`
        : '<span class="muted">-</span>';
      const fii = m.vendasFii ? moeda(m.lucroFii) : '<span class="muted">-</span>';
      const darf = m.darf ? `<strong>${moeda(m.darf.valor)}</strong><div class="muted">vence ${dataBr(m.darf.vencimento)}</div>` : m.imposto > 0 ? '<span class="muted">abaixo de R$ 10, acumula</span>' : '<span class="muted">-</span>';
      return `<tr>
        <td>${mesExtenso(m.mes)}</td>
        <td class="num-col">${m.vendasAcoes ? moeda(m.vendasAcoes) : '<span class="muted">-</span>'}</td>
        <td class="num-col">${acoes}</td>
        <td class="num-col">${m.prejuizoAcoes ? moeda(m.prejuizoAcoes) : '<span class="muted">-</span>'}</td>
        <td class="num-col">${fii}</td>
        <td class="num-col">${m.prejuizoFii ? moeda(m.prejuizoFii) : '<span class="muted">-</span>'}</td>
        <td class="num-col">${m.imposto ? moeda(m.imposto) : '<span class="muted">-</span>'}</td>
        <td class="num-col">${darf}</td>
      </tr>`;
    });
    $('#tabela-apuracao').innerHTML = tabela(
      [
        { t: 'Mês' },
        { t: 'Vendas ações', num: 1 },
        { t: 'Resultado ações', num: 1 },
        { t: 'Prejuízo ações', num: 1 },
        { t: 'Resultado FII', num: 1 },
        { t: 'Prejuízo FII', num: 1 },
        { t: 'Imposto do mês', num: 1 },
        { t: 'DARF 6015', num: 1 }
      ],
      linhas
    );
  }

  function cardBem(b) {
    const anoAnt = ANO - 1;
    const instrucoes = {
      alterado: `Abra o bem ${esc(b.ticker)} na ficha, troque o valor de 31/12/${ANO} e cole a nova discriminação.`,
      novo: 'Na ficha Bens e Direitos, clique em Novo e preencha os campos abaixo.',
      zerado: `Não exclua o bem: o valor de 31/12/${anoAnt} precisa continuar lá. Coloque R$ 0,00 em 31/12/${ANO} e atualize a discriminação.`,
      mesmoAno: 'Opcional, mas recomendado: inclua o bem com R$ 0,00 nas duas colunas para deixar a operação registrada.'
    };

    const campos = [];
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

    return `<article class="bem bem-${b.status}">
      <header>
        <div><strong class="ticker">${esc(b.ticker)}</strong><span class="nome">${esc(b.nome)}</span></div>
        <span class="selo selo-${b.status}">${ROTULO_STATUS[b.status]}</span>
      </header>
      <p class="instrucao">${instrucoes[b.status]}</p>
      <div class="campos">${campos.join('')}</div>
      <div class="discriminacao">
        <div class="campo">
          <div class="linha"><span>Discriminação</span>${botaoCopiar(b.discriminacao)}</div>
          <p>${esc(b.discriminacao)}</p>
        </div>
      </div>
    </article>`;
  }

  function campo(rotulo, valorHtml, copia, destaque) {
    return `<div class="campo${destaque ? ' destaque' : ''}">
      <div class="linha"><span>${rotulo}</span>${copia != null && copia !== '' ? botaoCopiar(copia) : ''}</div>
      <strong>${valorHtml}</strong>
    </div>`;
  }

  function grupoRendimentoHtml(g) {
    const linhas = g.itens.map(
      i => `<tr>
        <td>${i.ticker ? `<strong>${esc(i.ticker)}</strong> <span class="muted">${esc(i.nome)}</span>` : esc(i.nome)}${i.meses ? `<div class="muted">${i.meses.map(mesExtenso).join(', ')}</div>` : ''}</td>
        <td>${i.cnpj ? `${esc(i.cnpj)} ${botaoCopiar(i.cnpj)}` : i.ticker ? '<span class="muted">sem CNPJ</span>' : '<span class="muted">não se aplica</span>'}</td>
        <td class="num-col">${moeda(i.valor)} ${botaoCopiar(valorCopia(i.valor))}</td>
      </tr>`
    );
    return `<div class="cartao">
      <h3>Código ${g.codigo} · ${esc(g.descricao)}</h3>
      ${tabela([{ t: 'Fonte pagadora' }, { t: 'CNPJ' }, { t: 'Valor', num: 1 }], linhas, g.itens.length > 1 ? `<tr><td colspan="2">Total</td><td class="num-col">${moeda(g.total)}</td></tr>` : '')}
    </div>`;
  }

  function rendaVariavelHtml(apuracao) {
    const comuns = apuracao.meses.filter(m => m.resultadoAcoes !== 0);
    const fii = apuracao.meses.filter(m => m.vendasFii > 0);
    if (!comuns.length && !fii.length) return '<p class="ok">Nenhum mês com resultado tributável ou prejuízo. Nada a preencher nesta ficha.</p>';

    const tabelaMeses = (lista, pre) =>
      tabela(
        [
          { t: 'Mês' },
          { t: 'Resultado líquido', num: 1 },
          { t: 'Prejuízo a compensar', num: 1 },
          { t: 'Base de cálculo', num: 1 },
          { t: 'Imposto devido', num: 1 }
        ],
        lista.map(
          m => `<tr>
            <td>${mesExtenso(m.mes)}</td>
            <td class="num-col">${moeda(m[`resultado${pre}`] ?? m[`lucro${pre}`])} ${botaoCopiar(valorCopia(m[`resultado${pre}`] ?? m[`lucro${pre}`]))}</td>
            <td class="num-col">${moeda(m[`prejuizoAnterior${pre}`])}</td>
            <td class="num-col">${moeda(m[`base${pre}`])}</td>
            <td class="num-col">${moeda(m[`imposto${pre}`])}</td>
          </tr>`
        )
      );

    let html = '<p class="nota">Preencha só os meses listados, na coluna do mês correspondente. O programa calcula o restante; confira se o imposto devido bate.</p>';
    if (comuns.length) html += `<div class="cartao"><h3>Operações comuns · Mercado à vista (ações)</h3>${tabelaMeses(comuns, 'Acoes')}</div>`;
    if (fii.length) html += `<div class="cartao"><h3>Fundos de Investimento Imobiliário</h3>${tabelaMeses(fii, 'Fii')}</div>`;
    return html;
  }

  function darfsHtml(apuracao) {
    const pendente = apuracao.pendente > 0
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
    return `${tabela([{ t: 'Competência' }, { t: 'Código' }, { t: 'Valor', num: 1 }, { t: 'Vencimento', num: 1 }], linhas)}
      <p class="nota">Pague pelo Sicalc ou pelo app da Receita. Vencimento no último dia útil do mês seguinte, sem considerar feriados. DARF pago com atraso tem multa e juros.</p>${pendente}`;
  }

  function renderRelatorio() {
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
    contador.textContent = pendencias;
    contador.hidden = pendencias === 0;

    const card = (n, texto, cor) => `<div class="resumo-card${n ? '' : ' zero'}" style="--cor: var(${cor})"><strong>${n}</strong><span>${texto}</span></div>`;

    const semAlteracao = b.semAlteracao.length
      ? `<details class="sem-alteracao"><summary>${b.semAlteracao.length} ${b.semAlteracao.length === 1 ? 'bem continua igual' : 'bens continuam iguais'}, nada a fazer</summary><ul>${b.semAlteracao
          .map(x => `<li>${esc(x.ticker)}: ${qtd(x.quantidadeFinal)} ${x.tipo === 'fii' ? 'cotas' : 'ações'}, ${moeda(x.valorAtual)}</li>`)
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

      <p class="nota">Protótipo. Códigos e regras configurados para o ano-calendário ${ANO} em <code>js/regras.js</code>: confira no programa do IRPF do ano antes de transmitir. Fora do escopo por enquanto: day trade, BDR, ETF, opções, aluguel de ações e IRRF de 0,005%.</p>
    `;
  }

  function render() {
    relatorio = Calculo.gerarRelatorio(estado, regras);
    renderDeclaracao();
    renderMovimentos();
    renderCarteira();
    renderRelatorio();
  }

  function preencherCadastro(form, prefixo, ticker) {
    const nome = n => form[prefixo ? `${prefixo}${n.charAt(0).toUpperCase()}${n.slice(1)}` : n];
    const fonte = estado.cadastro[ticker] || Regras.ATIVOS[ticker];
    if (!fonte) return;
    nome('tipo').value = fonte.tipo;
    if (!nome('nome').value) nome('nome').value = fonte.nome || '';
    if (!nome('cnpj').value) nome('cnpj').value = fonte.cnpj || '';
    if (!nome('corretora').value && fonte.corretora) nome('corretora').value = fonte.corretora;
  }

  function ajustarFormMov() {
    const f = $('#form-mov');
    const tipo = f.tipo.value;
    const visiveis = CAMPOS_POR_TIPO[tipo];
    f.querySelectorAll('[data-campo]').forEach(l => {
      const ativo = visiveis.includes(l.dataset.campo);
      l.hidden = !ativo;
      const input = l.querySelector('input');
      input.required = ativo && l.dataset.campo !== 'taxas';
      input.disabled = !ativo;
    });
    $('[data-rotulo-preco]').textContent = tipo === 'bonificacao' ? 'Custo unitário atribuído (R$)' : 'Preço unitário (R$)';
    $('[data-rotulo-fator]').textContent = tipo === 'desdobramento' ? 'Cada 1 vira quantas' : 'Quantas viram 1';
    ajustarNovoAtivo();
  }

  function ajustarNovoAtivo() {
    const f = $('#form-mov');
    const fs = $('#novo-ativo');
    const ticker = f.ticker.value.trim().toUpperCase();
    const conhecido = !ticker || !!estado.cadastro[ticker];
    fs.hidden = conhecido;
    fs.disabled = conhecido;
    if (!conhecido && fs.dataset.ticker !== ticker) {
      ['novoNome', 'novoCnpj'].forEach(n => (f[n].value = ''));
      preencherCadastro(f, 'novo', ticker);
      fs.dataset.ticker = ticker;
    }
  }

  const numero = v => (v === '' || v == null ? undefined : Number(v));

  function ligarEventos() {
    $$('.aba').forEach(a => a.addEventListener('click', () => trocarAba(a.dataset.aba)));

    document.addEventListener('click', e => {
      const alvo = e.target.closest('[data-copiar],[data-remover-bem],[data-remover-mov]');
      if (!alvo) return;
      if (alvo.dataset.copiar != null) return copiar(alvo.dataset.copiar);
      if (alvo.dataset.removerBem) {
        estado.posicaoInicial = estado.posicaoInicial.filter(p => p.ticker !== alvo.dataset.removerBem);
      } else {
        estado.movimentos = estado.movimentos.filter(m => m.id !== alvo.dataset.removerMov);
      }
      salvar();
      render();
    });

    const fb = $('#form-bem');
    fb.ticker.addEventListener('input', () => {
      fb.ticker.value = fb.ticker.value.toUpperCase();
      preencherCadastro(fb, '', fb.ticker.value.trim());
    });
    fb.addEventListener('submit', e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(fb));
      const ticker = d.ticker.trim().toUpperCase();
      estado.cadastro[ticker] = { tipo: d.tipo, nome: d.nome.trim(), cnpj: d.cnpj.trim(), corretora: d.corretora.trim() };
      estado.posicaoInicial = estado.posicaoInicial.filter(p => p.ticker !== ticker);
      estado.posicaoInicial.push({ ticker, quantidade: Number(d.quantidade), custo: Number(d.custo) });
      salvar();
      render();
      fb.reset();
      fb.ticker.focus();
      toast(`${ticker} salvo`);
    });

    const fp = $('#form-prejuizo');
    fp.addEventListener('submit', e => {
      e.preventDefault();
      estado.prejuizoInicial = { acoes: Number(fp.acoes.value) || 0, fii: Number(fp.fii.value) || 0 };
      salvar();
      render();
      toast('Prejuízo salvo');
    });

    const fm = $('#form-mov');
    fm.data.min = `${ANO}-01-01`;
    fm.data.max = `${ANO}-12-31`;
    fm.tipo.addEventListener('change', ajustarFormMov);
    fm.ticker.addEventListener('input', () => {
      fm.ticker.value = fm.ticker.value.toUpperCase();
      ajustarNovoAtivo();
    });
    fm.addEventListener('submit', e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(fm));
      const ticker = d.ticker.trim().toUpperCase();
      if (!estado.cadastro[ticker]) {
        estado.cadastro[ticker] = { tipo: d.novoTipo, nome: (d.novoNome || '').trim(), cnpj: (d.novoCnpj || '').trim(), corretora: (d.novoCorretora || '').trim() };
      }
      const mov = { id: uid(), data: d.data, tipo: d.tipo, ticker };
      ['quantidade', 'preco', 'taxas', 'valor', 'fator'].forEach(c => {
        const v = numero(d[c]);
        if (v !== undefined) mov[c] = v;
      });
      estado.movimentos.push(mov);
      salvar();
      render();
      const { data, tipo } = d;
      fm.reset();
      fm.data.value = data;
      fm.tipo.value = tipo;
      ajustarFormMov();
      fm.ticker.focus();
      toast('Lançamento adicionado');
    });

    $('#btn-exemplo').addEventListener('click', () => {
      if ((estado.posicaoInicial.length || estado.movimentos.length) && !confirm('Substituir os dados atuais pelo exemplo?')) return;
      estado = Exemplo.gerar();
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

    $('#input-importar').addEventListener('change', e => {
      const arquivo = e.target.files[0];
      if (!arquivo) return;
      const leitor = new FileReader();
      leitor.onload = () => {
        try {
          estado = normalizar(JSON.parse(leitor.result));
          salvar();
          render();
          toast('Backup importado');
        } catch (err) {
          toast('Arquivo de backup inválido');
        }
        e.target.value = '';
      };
      leitor.readAsText(arquivo);
    });

    $('#btn-imprimir').addEventListener('click', () => window.print());
  }

  function iniciar() {
    $$('[data-ano]').forEach(e => (e.textContent = ANO));
    $$('[data-ano-ant]').forEach(e => (e.textContent = ANO - 1));
    $$('[data-ano-decl]').forEach(e => (e.textContent = regras.anoDeclaracao));
    $$('[data-ano-decl-ant]').forEach(e => (e.textContent = regras.anoDeclaracao - 1));
    ligarEventos();
    ajustarFormMov();
    render();
    const salva = ler(CHAVE_ABA);
    trocarAba(salva && $(`#aba-${salva}`) ? salva : 'declaracao');
  }

  iniciar();
})();
