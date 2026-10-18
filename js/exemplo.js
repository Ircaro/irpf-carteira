(function (raiz) {
  function gerar() {
    let seq = 0;
    const mov = dados => ({ id: `ex-${++seq}`, taxas: 0, ...dados });

    return {
      versao: 2,
      anoCalendario: 2026,
      cotacoes: {
        PETR4: { preco: 37.2, data: '2026-10-16' },
        ITSA4: { preco: 10.9, data: '2026-10-16' },
        MXRF11: { preco: 9.62, data: '2026-10-16' },
        KNRI11: { preco: 152.3, data: '2026-10-16' },
        HGLG11: { preco: 158.9, data: '2026-10-16' },
        WEGE3: { preco: 47.8, data: '2026-10-16' }
      },
      prejuizoInicial: { acoes: 0, fii: 0 },
      cadastro: {
        PETR4: { tipo: 'acao', nome: 'Petrobras', cnpj: '33.000.167/0001-01', corretora: 'XP Investimentos' },
        ITSA4: { tipo: 'acao', nome: 'Itaúsa', cnpj: '61.532.644/0001-15', corretora: 'XP Investimentos' },
        BBAS3: { tipo: 'acao', nome: 'Banco do Brasil', cnpj: '00.000.000/0001-91', corretora: 'XP Investimentos' },
        VALE3: { tipo: 'acao', nome: 'Vale', cnpj: '33.592.510/0001-54', corretora: 'XP Investimentos' },
        WEGE3: { tipo: 'acao', nome: 'WEG', cnpj: '84.429.695/0001-11', corretora: 'XP Investimentos' },
        MXRF11: { tipo: 'fii', nome: 'Maxi Renda', cnpj: '97.521.225/0001-25', corretora: 'NuInvest' },
        KNRI11: { tipo: 'fii', nome: 'Kinea Renda Imobiliária', cnpj: '12.005.956/0001-65', corretora: 'NuInvest' },
        HGLG11: { tipo: 'fii', nome: 'Pátria Log', cnpj: '11.728.688/0001-47', corretora: 'NuInvest' }
      },
      posicaoInicial: [
        { ticker: 'PETR4', quantidade: 100, custo: 3200 },
        { ticker: 'ITSA4', quantidade: 300, custo: 2850 },
        { ticker: 'BBAS3', quantidade: 200, custo: 5400 },
        { ticker: 'MXRF11', quantidade: 1000, custo: 10150 },
        { ticker: 'KNRI11', quantidade: 20, custo: 2900 }
      ],
      movimentos: [
        mov({ data: '2026-01-15', tipo: 'compra', ticker: 'PETR4', quantidade: 100, preco: 36.5, taxas: 1.1 }),
        mov({ data: '2026-02-10', tipo: 'dividendo', ticker: 'ITSA4', valor: 45.3 }),
        mov({ data: '2026-02-12', tipo: 'compra', ticker: 'HGLG11', quantidade: 10, preco: 160, taxas: 0.5 }),
        mov({ data: '2026-02-27', tipo: 'rendimento', ticker: 'MXRF11', valor: 100 }),
        mov({ data: '2026-03-20', tipo: 'venda', ticker: 'BBAS3', quantidade: 200, preco: 28.4, taxas: 1.7 }),
        mov({ data: '2026-03-31', tipo: 'rendimento', ticker: 'MXRF11', valor: 100 }),
        mov({ data: '2026-04-06', tipo: 'compra', ticker: 'MXRF11', quantidade: 1000, preco: 9.85, taxas: 3 }),
        mov({ data: '2026-04-30', tipo: 'rendimento', ticker: 'MXRF11', valor: 200 }),
        mov({ data: '2026-05-12', tipo: 'jcp', ticker: 'PETR4', valor: 120 }),
        mov({ data: '2026-05-20', tipo: 'dividendo', ticker: 'PETR4', valor: 310 }),
        mov({ data: '2026-06-03', tipo: 'compra', ticker: 'WEGE3', quantidade: 50, preco: 52, taxas: 0.8 }),
        mov({ data: '2026-06-10', tipo: 'compra', ticker: 'VALE3', quantidade: 400, preco: 60, taxas: 7.2 }),
        mov({ data: '2026-06-30', tipo: 'rendimento', ticker: 'KNRI11', valor: 16 }),
        mov({ data: '2026-09-15', tipo: 'venda', ticker: 'VALE3', quantidade: 400, preco: 66, taxas: 7.9 }),
        mov({ data: '2026-11-10', tipo: 'venda', ticker: 'HGLG11', quantidade: 5, preco: 168, taxas: 0.4 }),
        mov({ data: '2026-12-10', tipo: 'dividendo', ticker: 'ITSA4', valor: 60 })
      ]
    };
  }

  const api = { gerar };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.Exemplo = api;
})(this);
