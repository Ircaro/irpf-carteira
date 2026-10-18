# Carteira IRPF

Site onde o investidor guarda o histórico de ações, FIIs e Fiagro, acompanha o desempenho da carteira e, na hora de declarar, recebe só a lista do que precisa mudar no programa da Receita.

Se um bem tinha R$ 1.000,00 e passou a R$ 2.000,00, o relatório mostra o bem, o valor novo e a discriminação pronta pra colar. Se ficou igual, ele não aparece.

## Como rodar

Requer Node.js 22.12 ou superior. O projeto é em TypeScript, montado com Vite e testado com Vitest.

```bash
npm install         # uma vez, baixa as ferramentas
npm run dev         # abre em http://localhost:5173
npm test            # roda os testes
npm run typecheck   # confere os tipos
npm run build       # gera o site em dist/
```

Na primeira vez, clique em **Carregar exemplo** para ver o relatório final com dados fictícios.

## Fluxo

1. **Declaração anterior**: posição de partida, só para quem não tem o histórico completo de compras.
2. **Movimentações**: histórico de todos os anos, com filtro por ano e por tipo.
3. **Carteira e apuração**: posição final, preço médio, apuração mensal e DARFs.
4. **Desempenho**: patrimônio, resultado por ativo, composição, proventos, aportes e custo investido ao longo do tempo.
5. **O que preencher**: o que mudar em cada ficha da declaração.

## Importar o histórico da B3

Baixe na Área do Investidor da B3 o **extrato de movimentação** de cada ano (Excel) e, se quiser cotações e conferência de quantidades, o arquivo de **posição**. Coloque tudo numa pasta **fora do repositório** e rode:

```bash
npm run importar -- "C:/caminho/da/pasta"
```

O script gera `carteira-irpf-importada.json` na mesma pasta. No site, use **Importar backup** com esse arquivo.

O que o importador faz:

- "Transferência - Liquidação" vira compra (o extrato não traz corretagem e emolumentos).
- Subscrição exercida vira compra do fundo principal; recibos (ex.: MXRF13) são atribuídos ao fundo principal.
- Leilão de fração vira venda da fração pelo valor recebido.
- Transferências entre corretoras, direitos de subscrição e atualizações são ignorados.
- Fiagro é reconhecido pelo nome do produto.
- Confere a posição calculada com as quantidades que a B3 informa em cada provento.

O que o extrato não traz fica num `ajustes.json` na mesma pasta:

```json
{
  "ignorarInstituicoes": ["NOME DO BANCO"],
  "precos": { "MXRF11|2023-12-12": 10.29 },
  "custoBonificacao": { "ITSA4|2024-12-04": 13.55518731 },
  "conversoes": [{ "data": "2025-12-01", "de": "AAAA11", "para": "BBBB11", "quantidadeDe": 10, "quantidadePara": 8.8 }],
  "ignorarLinhas": ["Resgate|AAAA11|2025-12-09"],
  "tipos": { "XXXX11": "fii" },
  "cadastro": { "XXXX11": { "cnpj": "00.000.000/0000-00" } }
}
```

O script lista as pendências que faltam preencher.

## O relatório final

| Ficha | O que aparece |
| --- | --- |
| Bens e Direitos | Bens para atualizar (valor antigo → novo), bens novos com todos os campos, bens vendidos e bens comprados e vendidos no ano. Os que não mudaram ficam de fora. |
| Rendimentos Isentos | Dividendos (09), rendimentos de FII e Fiagro (26), bonificações (18) e lucro isento de vendas até R$ 20 mil (20), por fonte pagadora. |
| Tributação Exclusiva | JCP (10), por fonte pagadora. |
| Renda Variável | Apenas os meses com resultado tributável ou prejuízo, separados entre ações e FII. |
| DARFs | Competência, código 6015, valor e vencimento, incluindo o saldo abaixo de R$ 10 que acumula. |

## Regras implementadas

- Preço médio com taxas incluídas no custo de compra e descontadas no valor de venda.
- Ações: isenção quando as vendas do mês somam até R$ 20 mil, 15% acima disso.
- FII e Fiagro: 20% sobre o lucro, sem isenção.
- Histórico de vários anos: a posição de 31/12 do ano anterior e o prejuízo acumulado saem do próprio histórico.
- Prejuízo compensado mês a mês, separado entre ações e fundos, inclusive entre anos.
- Conversão de cotas (incorporação de fundos) leva o custo do fundo de origem para o de destino.
- DARF abaixo de R$ 10 acumula para o próximo mês com imposto.
- Alertas de venda maior que a posição, CNPJ faltando, fração em grupamento e dividendos acima de R$ 50 mil no mês por empresa.

Os códigos das fichas e as alíquotas ficam por ano-calendário em [`src/dominio/regras.ts`](src/dominio/regras.ts). Para um ano novo, basta adicionar outra entrada.

## Estrutura

```
index.html                       página
src/dominio/tipos.ts             tipos de dados (lançamentos, cadastro, regras)
src/dominio/regras.ts            regras e códigos por ano-calendário
src/dominio/calculo.ts           motor de cálculo, sem dependência de tela
src/dominio/desempenho.ts        resultado por ativo e séries mensais
src/importacao/importador-b3.ts  leitura dos extratos da B3
src/ui/app.ts                    estado, persistência e renderização
src/ui/graficos.ts               gráficos em SVG, sem biblioteca
src/ui/estilos.css               tema escuro Noite, fonte Outfit
src/exemplo.ts                   massa de exemplo
scripts/importar-b3.ts           importador por linha de comando (Node)
scripts/lib/xlsx.ts              leitor de .xlsx sem dependências
tests/                           testes (Vitest)
```

## Publicação

O GitHub Actions ([`.github/workflows/site.yml`](.github/workflows/site.yml)) roda os testes e o build em todo push. Em push na `main`, ele também publica o site no GitHub Pages.

Para isso funcionar, em **Settings → Pages → Build and deployment → Source**, escolha **GitHub Actions** (e não "Deploy from a branch").

Os dados ficam só no `localStorage` do navegador. O backup é um JSON exportado e importado pela própria tela.

## Fora do escopo (por enquanto)

- Importar o arquivo `.DEC` ou o PDF da declaração anterior.
- Importar notas de corretagem e importar a B3 direto pela tela.
- Day trade (só gera alerta), BDR, ETF, opções, aluguel de ações, renda fixa e o IRRF de 0,005%.
- Feriados no cálculo do vencimento do DARF.

## Aviso

É um protótipo de estudo, não uma ferramenta oficial. Os códigos e regras mudam de um ano para o outro: confira tudo no programa do IRPF antes de transmitir.
