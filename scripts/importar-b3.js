const fs = require('node:fs');
const path = require('node:path');
const { lerXlsx } = require('./lib/xlsx');
const Regras = require('../js/regras');
const Calculo = require('../js/calculo');
const Importador = require('../js/importador-b3');

function argumentos(argv) {
  const opcoes = { pasta: null, ano: Math.max(...Regras.anosDisponiveis()), saida: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--ano') opcoes.ano = Number(argv[++i]);
    else if (argv[i] === '--saida') opcoes.saida = argv[++i];
    else opcoes.pasta = argv[i];
  }
  return opcoes;
}

const reais = v => Calculo.reais(v);
const qtd = v => Calculo.quantidade(v);

function main() {
  const op = argumentos(process.argv.slice(2));
  if (!op.pasta) {
    console.log('Uso: node scripts/importar-b3.js <pasta-com-os-xlsx> [--ano 2026] [--saida arquivo.json]');
    process.exit(1);
  }
  const pasta = path.resolve(op.pasta);
  const hoje = new Date().toISOString().slice(0, 10);
  const ajustesArq = path.join(pasta, 'ajustes.json');
  const ajustes = fs.existsSync(ajustesArq) ? JSON.parse(fs.readFileSync(ajustesArq, 'utf8')) : {};

  const arquivos = fs
    .readdirSync(pasta)
    .filter(f => f.toLowerCase().endsWith('.xlsx') && !f.startsWith('~$'))
    .map(nome => {
      const m = nome.match(/(\d{4})-(\d{2})-(\d{2})/);
      return { nome, data: m ? m[0] : hoje, abas: lerXlsx(fs.readFileSync(path.join(pasta, nome))) };
    });

  const { estado, resumo } = Importador.importar(arquivos, { ajustes, anoCalendario: op.ano, hoje });
  const regras = Regras.porAno(op.ano);
  const relatorio = Calculo.gerarRelatorio(estado, regras, Regras.paraAno);
  const divergencias = Importador.conferirQuantidades(estado, regras, Calculo, resumo.quantidadesInformadas);
  const atual = Calculo.processar(estado, regras, { ate: hoje }).posicoes.filter(p => p.quantidade > 0);

  const saida = path.resolve(op.saida || path.join(pasta, 'carteira-irpf-importada.json'));
  fs.writeFileSync(saida, JSON.stringify(estado, null, 2));

  const titulo = t => console.log(`\n== ${t} ==`);
  titulo('Arquivos lidos');
  resumo.arquivos.forEach(a => console.log(`- ${a.arquivo} (${a.tipo}): ${a.linhas} linhas`));
  Object.entries(resumo.periodos).forEach(([k, p]) => console.log(`  ${k}: ${Calculo.dataBr(p.de)} a ${Calculo.dataBr(p.ate)}`));
  if (!resumo.temNegociacao) console.log('  Sem extrato de negociação: compras vieram das liquidações da movimentação (sem corretagem e emolumentos).');

  titulo('Importado');
  console.log(`${resumo.compras} compras, ${resumo.vendas} vendas, ${resumo.proventos} proventos, ${resumo.eventos} eventos`);
  console.log(`Ativos: ${resumo.ativos.map(t => `${t} (${estado.cadastro[t].tipo})`).join(', ')}`);

  titulo('Ignorado');
  Object.entries(resumo.ignoradas).forEach(([k, n]) => console.log(`- ${k}: ${n}`));
  if (Object.keys(resumo.foraDoEscopo).length) console.log('Fora do escopo:', resumo.foraDoEscopo);

  titulo(`Posição em 31/12/${op.ano - 1} (calculada)`);
  relatorio.posicoes
    .filter(p => p.quantidadeInicial > 0)
    .forEach(p => console.log(`- ${p.ticker.padEnd(7)} ${qtd(p.quantidadeInicial).padStart(8)}  ${reais(p.custoInicial).padStart(14)}`));

  titulo(`Posição hoje (${Calculo.dataBr(hoje)})`);
  atual.forEach(p => console.log(`- ${p.ticker.padEnd(7)} ${qtd(p.quantidade).padStart(8)}  ${reais(p.custo).padStart(14)}  preço médio ${reais(p.custo / p.quantidade)}`));

  titulo('Conferência com as quantidades informadas pela B3 nos proventos');
  if (!divergencias.length) console.log('Todas as quantidades batem.');
  divergencias.forEach(d => console.log(`- ${d.ticker} em ${Calculo.dataBr(d.data)}: B3 informa ${qtd(d.informada)}, cálculo tem ${qtd(d.calculada)}`));

  const posB3 = Object.entries(resumo.posicaoB3);
  if (posB3.length) {
    titulo('Conferência com o arquivo de posição');
    for (const [t, q] of posB3) {
      const calc = atual.find(p => p.ticker === t);
      const c = calc ? calc.quantidade : 0;
      console.log(`- ${t.padEnd(7)} B3 ${qtd(q)} · cálculo ${qtd(c)}${Math.abs(c - q) > 1e-6 ? '  <== DIVERGE' : ''}`);
    }
  }

  titulo('Pendências');
  if (!resumo.pendencias.length) console.log('Nenhuma.');
  resumo.pendencias.forEach(p => console.log(`- ${p}`));
  if (resumo.ajustesNaoUsados.length) console.log('Ajustes não usados (confira a chave):', resumo.ajustesNaoUsados);
  if (resumo.aConfirmar.length) console.log('Tipo a confirmar:', resumo.aConfirmar);
  resumo.avisos.forEach(a => console.log(`- ${a}`));

  titulo('Alertas do relatório');
  relatorio.alertas.forEach(a => console.log(`- [${a.nivel}] ${a.texto}`));

  console.log(`\nBackup gerado: ${saida}`);
}

main();
