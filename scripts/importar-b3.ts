import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { lerXlsx } from './lib/xlsx';
import { anosDisponiveis, paraAno, porAno } from '../src/dominio/regras';
import { dataBr, gerarRelatorio, processar, quantidade, reais } from '../src/dominio/calculo';
import { conferirQuantidades, importar, type Ajustes } from '../src/importacao/importador-b3';

function argumentos(argv: string[]) {
  const opcoes: { pasta: string | null; ano: number; saida: string | null } = { pasta: null, ano: Math.max(...anosDisponiveis()), saida: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--ano') opcoes.ano = Number(argv[++i]);
    else if (arg === '--saida') opcoes.saida = argv[++i] ?? null;
    else if (arg) opcoes.pasta = arg;
  }
  return opcoes;
}

function main() {
  const op = argumentos(process.argv.slice(2));
  if (!op.pasta) {
    console.log('Uso: npm run importar -- <pasta-com-os-xlsx> [--ano 2026] [--saida arquivo.json]');
    process.exit(1);
  }
  const pasta = resolve(op.pasta);
  const hoje = new Date().toISOString().slice(0, 10);
  const ajustesArq = join(pasta, 'ajustes.json');
  const ajustes: Ajustes = existsSync(ajustesArq) ? JSON.parse(readFileSync(ajustesArq, 'utf8')) : {};

  const arquivos = readdirSync(pasta)
    .filter(f => f.toLowerCase().endsWith('.xlsx') && !f.startsWith('~$'))
    .map(nome => {
      const m = nome.match(/(\d{4})-(\d{2})-(\d{2})/);
      return { nome, data: m ? m[0] : hoje, abas: lerXlsx(readFileSync(join(pasta, nome))) };
    });

  const { estado, resumo } = importar(arquivos, { ajustes, anoCalendario: op.ano, hoje });
  const regras = porAno(op.ano);
  const relatorio = gerarRelatorio(estado, regras, paraAno);
  const divergencias = conferirQuantidades(estado, regras, resumo.quantidadesInformadas);
  const atual = processar(estado, regras, { ate: hoje }).posicoes.filter(p => p.quantidade > 0);

  const saida = resolve(op.saida || join(pasta, 'carteira-irpf-importada.json'));
  writeFileSync(saida, JSON.stringify(estado, null, 2));

  const titulo = (t: string) => console.log(`\n== ${t} ==`);
  titulo('Arquivos lidos');
  resumo.arquivos.forEach(a => console.log(`- ${a.arquivo} (${a.tipo}): ${a.linhas} linhas`));
  Object.entries(resumo.periodos).forEach(([k, p]) => console.log(`  ${k}: ${dataBr(p.de)} a ${dataBr(p.ate)}`));
  if (!resumo.temNegociacao) console.log('  Sem extrato de negociação: compras vieram das liquidações da movimentação (sem corretagem e emolumentos).');

  titulo('Importado');
  console.log(`${resumo.compras} compras, ${resumo.vendas} vendas, ${resumo.proventos} proventos, ${resumo.eventos} eventos`);
  console.log(`Ativos: ${resumo.ativos.map(t => `${t} (${estado.cadastro[t]?.tipo})`).join(', ')}`);

  titulo('Ignorado');
  Object.entries(resumo.ignoradas).forEach(([k, n]) => console.log(`- ${k}: ${n}`));
  if (Object.keys(resumo.foraDoEscopo).length) console.log('Fora do escopo:', resumo.foraDoEscopo);

  titulo(`Posição em 31/12/${op.ano - 1} (calculada)`);
  relatorio.posicoes
    .filter(p => p.quantidadeInicial > 0)
    .forEach(p => console.log(`- ${p.ticker.padEnd(7)} ${quantidade(p.quantidadeInicial).padStart(8)}  ${reais(p.custoInicial).padStart(14)}`));

  titulo(`Posição hoje (${dataBr(hoje)})`);
  atual.forEach(p => console.log(`- ${p.ticker.padEnd(7)} ${quantidade(p.quantidade).padStart(8)}  ${reais(p.custo).padStart(14)}  preço médio ${reais(p.custo / p.quantidade)}`));

  titulo('Conferência com as quantidades informadas pela B3 nos proventos');
  if (!divergencias.length) console.log('Todas as quantidades batem.');
  divergencias.forEach(d => console.log(`- ${d.ticker} em ${dataBr(d.data)}: B3 informa ${quantidade(d.informada)}, cálculo tem ${quantidade(d.calculada)}`));

  const posB3 = Object.entries(resumo.posicaoB3);
  if (posB3.length) {
    titulo('Conferência com o arquivo de posição');
    for (const [t, q] of posB3) {
      const calc = atual.find(p => p.ticker === t);
      const c = calc ? calc.quantidade : 0;
      console.log(`- ${t.padEnd(7)} B3 ${quantidade(q)} · cálculo ${quantidade(c)}${Math.abs(c - q) > 1e-6 ? '  <== DIVERGE' : ''}`);
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
