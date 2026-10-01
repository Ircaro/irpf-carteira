# Carteira IRPF

Protótipo de um site onde o investidor parte da declaração do ano anterior, lança as movimentações de ações e FIIs ao longo do ano e, na hora de declarar, recebe só a lista do que precisa mudar no programa da Receita.

Se um bem tinha R$ 1.000,00 e passou a R$ 2.000,00, o relatório mostra o bem, o valor novo e a discriminação pronta pra colar. Se ficou igual, ele não aparece.

## Como rodar

Requer Node.js 20 ou superior. Não há dependências para instalar.

```bash
npm start      # abre em http://localhost:5173
npm test       # roda os testes do motor de cálculo
```

Também funciona abrindo o `index.html` direto no navegador.

Na primeira vez, clique em **Carregar exemplo** para ver o relatório final com dados fictícios.

## Fluxo

1. **Declaração anterior**: bens e direitos em 31/12 do ano passado (quantidade e valor declarado) e prejuízo a compensar.
2. **Movimentações**: compras, vendas, dividendos, JCP, rendimentos de FII, bonificações, desdobramentos e grupamentos.
3. **Carteira e apuração**: posição final, preço médio, apuração mensal e DARFs.
4. **O que preencher**: o que mudar em cada ficha da declaração.

## O relatório final

| Ficha | O que aparece |
| --- | --- |
| Bens e Direitos | Bens para atualizar (valor antigo → novo), bens novos com todos os campos, bens vendidos e bens comprados e vendidos no ano. Os que não mudaram ficam de fora. |
| Rendimentos Isentos | Dividendos (09), rendimentos de FII (99), bonificações (18) e lucro isento de vendas até R$ 20 mil (20), por fonte pagadora. |
| Tributação Exclusiva | JCP (10), por fonte pagadora. |
| Renda Variável | Apenas os meses com resultado tributável ou prejuízo, separados entre ações e FII. |
| DARFs | Competência, código 6015, valor e vencimento, incluindo o saldo abaixo de R$ 10 que acumula. |

## Regras implementadas

- Preço médio com taxas incluídas no custo de compra e descontadas no valor de venda.
- Ações: isenção quando as vendas do mês somam até R$ 20 mil, 15% acima disso.
- FII: 20% sobre o lucro, sem isenção.
- Prejuízo compensado mês a mês, separado entre ações e FII, inclusive o que veio da declaração anterior.
- DARF abaixo de R$ 10 acumula para o próximo mês com imposto.
- Alertas de venda maior que a posição, CNPJ faltando, fração em grupamento e dividendos acima de R$ 50 mil no mês por empresa.

Os códigos das fichas e as alíquotas ficam por ano-calendário em [`js/regras.js`](js/regras.js). Para um ano novo, basta adicionar outra entrada.

## Estrutura

```
index.html          interface
css/styles.css      estilos (tema claro e escuro)
js/regras.js        regras e códigos por ano-calendário
js/calculo.js       motor de cálculo, sem dependência de DOM
js/exemplo.js       massa de exemplo
js/app.js           estado, persistência e renderização
tests/              testes do motor (node:test)
scripts/servidor.js servidor estático local
```

Os dados ficam só no `localStorage` do navegador. O backup é um JSON exportado e importado pela própria tela.

## Fora do escopo (por enquanto)

- Importar o arquivo `.DEC` ou o PDF da declaração anterior.
- Importar as planilhas da Área do Investidor da B3 e as notas de corretagem.
- Day trade, BDR, ETF, opções, aluguel de ações, renda fixa e o IRRF de 0,005%.
- Feriados no cálculo do vencimento do DARF.

## Aviso

É um protótipo de estudo, não uma ferramenta oficial. Os códigos e regras mudam de um ano para o outro: confira tudo no programa do IRPF antes de transmitir.
