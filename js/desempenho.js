(function (raiz) {
  const Calculo = typeof module !== 'undefined' && module.exports ? require('./calculo') : raiz.Calculo;
  const PROVENTOS_EM_DINHEIRO = ['dividendo', 'jcp', 'rendimento'];
  const arred = Calculo.arred;

  function mesesEntre(inicio, fim) {
    const meses = [];
    let [a, m] = inicio.split('-').map(Number);
    const [af, mf] = fim.split('-').map(Number);
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

  const somar = (mapa, chave, valor) => (mapa[chave] = arred((mapa[chave] || 0) + valor));

  function calcular(estado, regras, hoje) {
    const custoNoMes = {};
    const proc = Calculo.processar(estado, regras, {
      ate: hoje,
      aoAplicar: (m, posicoes) => {
        let total = 0;
        for (const p of posicoes.values()) total += p.custo;
        custoNoMes[m.data.slice(0, 7)] = arred(total);
      }
    });

    const aportadoPorAtivo = {};
    const aportesPorMes = {};
    for (const p of estado.posicaoInicial) somar(aportadoPorAtivo, p.ticker, Number(p.custo) || 0);
    for (const m of estado.movimentos) {
      if (m.tipo !== 'compra' || m.data > hoje) continue;
      const valor = m.quantidade * m.preco + (Number(m.taxas) || 0);
      somar(aportadoPorAtivo, m.ticker, valor);
      somar(aportesPorMes, m.data.slice(0, 7), valor);
    }

    const proventosPorAtivo = {};
    const proventosPorMes = {};
    for (const p of proc.proventos) {
      if (!PROVENTOS_EM_DINHEIRO.includes(p.tipo)) continue;
      somar(proventosPorAtivo, p.ticker, p.valor);
      const mes = (proventosPorMes[p.data.slice(0, 7)] = proventosPorMes[p.data.slice(0, 7)] || {});
      somar(mes, p.tipo, p.valor);
    }

    const realizadoPorAtivo = {};
    const realizadoPorMes = {};
    for (const v of proc.vendas) {
      somar(realizadoPorAtivo, v.ticker, v.lucro);
      somar(realizadoPorMes, v.mes, v.lucro);
    }

    const cotacoes = estado.cotacoes || {};
    const ativos = proc.posicoes
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
          dataPreco: cot && cot.data,
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
    const soma = (lista, campo) => arred(lista.reduce((t, a) => t + (a[campo] || 0), 0));
    const custo = soma(emCarteira, 'custo');
    const patrimonio = arred(emCarteira.reduce((t, a) => t + (a.valorAtual != null ? a.valorAtual : a.custo), 0));
    const naoRealizado = soma(emCarteira, 'naoRealizado');
    const realizado = soma(ativos, 'realizado');
    const proventos = soma(ativos, 'proventos');
    const aportado = soma(ativos, 'aportado');
    const resultado = arred(naoRealizado + realizado + proventos);

    const mesesComDado = [
      ...Object.keys(custoNoMes),
      ...Object.keys(aportesPorMes),
      ...Object.keys(proventosPorMes),
      ...Object.keys(realizadoPorMes)
    ].sort();
    let serie = [];
    if (mesesComDado.length) {
      let custoCorrente = estado.posicaoInicial.reduce((t, p) => t + (Number(p.custo) || 0), 0);
      serie = mesesEntre(mesesComDado[0], hoje.slice(0, 7)).map(mes => {
        if (custoNoMes[mes] != null) custoCorrente = custoNoMes[mes];
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

  const api = { calcular, mesesEntre };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.Desempenho = api;
})(this);
