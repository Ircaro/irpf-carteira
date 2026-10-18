# Backlog

Ideias e melhorias para decidir depois. Nada aqui está priorizado ainda.

## Persistência e sincronização

Hoje os dados ficam no `localStorage` de cada navegador. Trocar de navegador, de computador ou limpar os dados de navegação faz os dados sumirem, a não ser que exista um backup JSON.

- [ ] **Google Drive (preferido)**: login com Google e gravação na pasta oculta do app no Drive (`appDataFolder`).
  - Funciona em qualquer navegador, inclusive no celular.
  - Precisa de um projeto no Google Cloud com OAuth configurado para o domínio do GitHub Pages.
  - O escopo `drive.appdata` dá acesso só aos arquivos do próprio app, não ao Drive inteiro.
  - Definir o que acontece em caso de conflito entre dois dispositivos (ex.: última gravação vence, com aviso).
- [ ] **Arquivo local sincronizado**: o usuário escolhe um arquivo uma vez (ex.: dentro do OneDrive) e o site grava nele a cada alteração (File System Access API).
  - Simples e sem servidor.
  - Só funciona no Chrome e no Edge do computador.
- [ ] **Backend com login**: servidor e banco próprios.
  - Sincroniza tudo.
  - Tem custo e traz responsabilidade de guardar dados financeiros (LGPD, criptografia, vazamento).
- [ ] Lembrete de backup: avisar quando o último backup exportado tiver mais de N dias.

## Novas classes de ativos

- [ ] ETF (sem isenção de R$ 20 mil, 15% sobre o lucro).
- [ ] BDR.
- [ ] Day trade (compra e venda no mesmo dia, 20%, apuração separada).
- [ ] Renda fixa: CDB, Tesouro Direto, LCI/LCA, CRI/CRA, debêntures.
- [ ] Criptoativos (isenção de vendas até R$ 35 mil no mês, códigos próprios em Bens e Direitos).
- [ ] Investimentos no exterior: ações, ETFs, contas e variação cambial (regras da lei de 2023, apuração anual).
- [ ] Opções, termo e aluguel de ações.
- [ ] Previdência privada (PGBL/VGBL).

## Importação de dados

- [ ] Importar o arquivo `.DEC` da declaração anterior.
- [ ] Importar o PDF da declaração anterior.
- [x] Importar o extrato de movimentação da B3 por script (`scripts/importar-b3.js`).
- [ ] Importar os extratos da B3 direto pela tela, sem rodar script.
- [ ] Validar o importador com o extrato de negociação e o arquivo de posição reais.
- [ ] Descobrir se direitos de subscrição cedidos ("Cessão de Direitos") foram vendidos por dinheiro.
- [ ] Importar notas de corretagem em PDF (padrão SINACOR).
- [ ] Importar informes de rendimentos das corretoras e bancos.

## Cálculo e regras

- [ ] Feriados nacionais no cálculo do vencimento do DARF.
- [ ] IRRF de 0,005% ("dedo-duro") abatendo do imposto devido.
- [ ] Regras por ano-calendário para 2027 em diante em `js/regras.js`.
- [ ] Confirmar no programa do IRPF os códigos usados (rendimento de FII/Fiagro no código 26 e Fiagro em Bens e Direitos 07.02: as fontes divergem).
- [ ] Tratar a tributação de dividendos acima de R$ 50 mil por mês por empresa, além do alerta atual.

## Produto e interface

- [ ] Editar lançamentos e bens (hoje só é possível remover e cadastrar de novo).
- [ ] Gerar DARF ou link para o Sicalc a partir da apuração.
- [ ] Exportar o relatório final em PDF com layout próprio.
- [ ] Busca automática de nome e CNPJ do ativo (dados abertos da CVM).
- [x] Aba de desempenho com cotação digitada à mão.
- [ ] Buscar cotações automaticamente (precisa de uma API com CORS liberado).
- [ ] Gráfico do valor de mercado ao longo do tempo (precisa de cotações históricas, ex.: COTAHIST da B3).
- [ ] Permitir sobrescrever o valor declarado em 31/12 quando ele divergir do calculado.
- [ ] Versão instalável no celular (PWA).
