(function (raiz) {
  const ISENTOS = 'Rendimentos Isentos e Não Tributáveis';
  const EXCLUSIVOS = 'Rendimentos Sujeitos à Tributação Exclusiva/Definitiva';

  const REGRAS = {
    2026: {
      anoCalendario: 2026,
      anoDeclaracao: 2027,
      limiteIsencaoAcoesMes: 20000,
      aliquotaAcoes: 0.15,
      aliquotaFii: 0.2,
      darfMinimo: 10,
      codigoDarf: '6015',
      limiteDividendosMesPorEmpresa: 50000,
      bens: {
        acao: {
          rotulo: 'Ação',
          grupo: '03',
          codigo: '01',
          descricao: 'Participações societárias · Ações (inclusive as listadas em bolsa)',
          unidade: ['ação', 'ações'],
          artigo: ''
        },
        fii: {
          rotulo: 'FII',
          grupo: '07',
          codigo: '03',
          descricao: 'Fundos · Fundos de Investimento Imobiliário (FII)',
          unidade: ['cota', 'cotas'],
          artigo: ' do FII'
        },
        fiagro: {
          rotulo: 'Fiagro',
          grupo: '07',
          codigo: '02',
          descricao: 'Fundos · Fiagro (cadeias produtivas agroindustriais)',
          unidade: ['cota', 'cotas'],
          artigo: ' do Fiagro'
        }
      },
      rendimentos: {
        dividendos: { ficha: ISENTOS, codigo: '09', descricao: 'Lucros e dividendos recebidos' },
        rendimentoFii: { ficha: ISENTOS, codigo: '26', descricao: 'Outros (descrever como "Rendimentos de FII/Fiagro")' },
        bonificacao: { ficha: ISENTOS, codigo: '18', descricao: 'Incorporação de reservas ao capital / Bonificações em ações' },
        lucroAcoesIsento: { ficha: ISENTOS, codigo: '20', descricao: 'Ganhos líquidos em ações com vendas de até R$ 20.000,00 no mês' },
        jcp: { ficha: EXCLUSIVOS, codigo: '10', descricao: 'Juros sobre capital próprio' }
      }
    }
  };

  const ATIVOS = {
    PETR4: { tipo: 'acao', nome: 'Petrobras', cnpj: '33.000.167/0001-01' },
    VALE3: { tipo: 'acao', nome: 'Vale', cnpj: '33.592.510/0001-54' },
    ITSA4: { tipo: 'acao', nome: 'Itaúsa', cnpj: '61.532.644/0001-15' },
    BBAS3: { tipo: 'acao', nome: 'Banco do Brasil', cnpj: '00.000.000/0001-91' },
    WEGE3: { tipo: 'acao', nome: 'WEG', cnpj: '84.429.695/0001-11' },
    TAEE11: { tipo: 'acao', nome: 'Taesa', cnpj: '07.859.971/0001-30' },
    MXRF11: { tipo: 'fii', nome: 'Maxi Renda', cnpj: '97.521.225/0001-25' },
    HGLG11: { tipo: 'fii', nome: 'Pátria Log', cnpj: '11.728.688/0001-47' },
    KNRI11: { tipo: 'fii', nome: 'Kinea Renda Imobiliária', cnpj: '12.005.956/0001-65' }
  };

  function paraAno(ano) {
    if (REGRAS[ano]) return REGRAS[ano];
    const anos = Object.keys(REGRAS).map(Number);
    const proximo = anos.reduce((a, b) => (Math.abs(b - ano) < Math.abs(a - ano) ? b : a));
    return { ...REGRAS[proximo], anoCalendario: ano, anoDeclaracao: ano + 1, aproximado: true, baseadoEm: proximo };
  }

  const api = {
    porAno: ano => REGRAS[ano],
    paraAno,
    anosDisponiveis: () => Object.keys(REGRAS).map(Number),
    ATIVOS
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.Regras = api;
})(this);
