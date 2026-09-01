# Changelog — Ferramentas & Estoque

Todas as mudanças relevantes do sistema. Formato inspirado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).

## [2.7.5] — 2026-09-01

### Correções

- **Quantidade do empréstimo não era salva (sempre exibia "1")** — bug corrigido na raiz.
  O formulário de Novo Empréstimo enviava `quantidade` e `setor`, mas a tabela `emprestimos`
  em `api/_lib/schema.js` **não declarava essas colunas**. Como o `store` filtra o payload
  por `colunasDa(aba)` (proteção contra SQL injection), os campos eram **descartados
  silenciosamente** antes do INSERT: a API respondia `success:true` e o dado se perdia.
  Na listagem, o fallback `e.quantidade || '1'` mascarava a perda mostrando sempre **1**.
  Colunas adicionadas: `setor`, `quantidade` e `updatedAt`.
- **Mesma falha em outras duas abas** (encontrada pelo novo teste de paridade):
  - `ferramentas` perdia o campo **`responsavel`** ("Responsável atual" do cadastro);
  - `usuarios` perdia **`nome`** (nome completo), além de `id`/`createdAt`/`updatedAt`.
- `data/emprestimos.csv` teve o cabeçalho alinhado ao novo schema (o arquivo só tem cabeçalho,
  sem registros). Os CSVs de `ferramentas`/`usuarios` seguem sem as colunas novas — o seed
  preenche `''` por padrão, então a carga inicial continua idêntica (172 registros).

### Migração

- A correção é aplicada ao banco ao vivo por `GET /api/setup?migrate=1`, que roda
  `ADD COLUMN IF NOT EXISTS` nas tabelas existentes. **Nenhum registro é alterado ou
  removido** (o seed usa `ON CONFLICT DO NOTHING`; a migração reporta `inseridos: 0`
  quando as tabelas já têm dados). Empréstimos já gravados passam a aceitar quantidade;
  os antigos permanecem com o valor padrão vazio (exibido como `1`).

### Testes (196)

- `tests/run-contract.js`: novo teste de **paridade de colunas** entre `HEADERS_PADRAO`
  (Apps Script) e `schema.js` — impede que um campo enviado pelo frontend volte a ser
  descartado sem erro; + teste explícito de `quantidade`/`setor`/`updatedAt` em `emprestimos`.
- `tests/run-neon.js`: regressão ponta a ponta — o empréstimo persiste `quantidade: '7'`
  e `setor`, e a **devolução preserva a quantidade**. Asserções de contagem de colunas
  agora derivam do schema, em vez de números fixos.

## [2.7.4] — 2026-09-01

### Novidades
- **Painel institucional do login em teal vivo**: gradiente `#0f766e → #134e4a` com brilhos
  turquesa/esmeralda e grade sutil clara, no lugar da ardósia escura — cor mais vibrante para
  a tela. Textos do painel com **sombra suave** para manter a legibilidade sobre o brasão em
  marca d'água.

### Correções/Refinamentos
- **Bloco do título centralizado**: "GESTÃO DE ESTOQUE E CONTROLE DE FERRAMENTAS" e a linha
  "Complexo Penal de Marília — Núcleo de Infraestrutura e Logística" agora ficam centralizados
  horizontal e verticalmente no painel, com o traço decorativo também centralizado.
- **Crédito "ZANONI &amp; MARTINEZ InfraTech" removido do painel institucional** — permanece
  apenas no rodapé do card de acesso, à direita.
- Cache-buster dos scripts (`?v=`) e badge de versão atualizados para `2.7.4`.

### Testes
- `tests/run-exports.js` atualizado: painel teal vivo (`#0f766e`/`#134e4a`), bloco do título
  centralizado, crédito `ZANONI &amp; MARTINEZ InfraTech` presente apenas no rodapé do card
  e sombra de texto no painel. Versões `2.7.4` em `tests/run.js` e `tests/run-neon.js`.

## [2.7.3] — 2026-09-01

### Novidades
- **Painel institucional do login redesenhado**: novo título em caixa alta e destaque —
  **GESTÃO DE ESTOQUE E CONTROLE DE FERRAMENTAS** — sobre o brasão da Polícia Penal de SP
  em marca d'água (`assets/brasao-policia-penal-sp.png`, 700px, fundo removido, 13% de
  opacidade), mantendo a identidade slate + teal do sistema.

### Remoções
- Marca "Ferramentas &amp; Estoque / Polícia Penal" removida do topo do painel institucional.
- Subtítulo "Estoque, empréstimos e relatórios…" e a lista de 3 destaques removidos:
  permanecem apenas o título, a linha "Complexo Penal de Marília — Núcleo de
  Infraestrutura e Logística" e o crédito ZANONI &amp; MARTINEZ InfraTech.

### Infra
- Cache-buster dos scripts (`?v=`) e badge de versão atualizados para `2.7.3`;
  testes de contrato do login atualizados.

## [2.7.2] — 2026-09-01

### Novidades
- **Nova tela de login em tela dividida (split-screen)**: painel institucional à esquerda
  (ardósia profunda com brilhos e grade sutis em teal, marca, apresentação do sistema e
  destaques) e cartão de acesso à direita sobre o fundo cinza-ardósia atual — mesma paleta
  do sistema (slate + teal). Campos com ícones, **botão mostrar/ocultar senha**, rótulos
  acessíveis (`label for` + `autocomplete`) e marca compacta no mobile (painel lateral
  aparece a partir de `lg`). Contrato do `authModule` preservado (mesmos ids/Handlers).

### Remoções (sem duplicidade)
- **Painel “Exportar Dados” removido por completo** da tela de Relatórios: a prévia do
  relatório padronizado já cobre **CSV pt-BR, Excel (.xlsx) e impressão por relatório**,
  com ações no próprio documento. As funções de exportação em lote/dedicadas
  (`_exportAllCSV`, `_exportAllXLSX`, `_exportRelatorioCSV`, `_exportRelatorioXLSX`,
  `_exportCSV`) foram removidas junto com o painel; `_downloadCSV`/`_downloadXLSX`
  permanecem como motores das ações da prévia.

### Correções/Refinamentos
- **Coluna ID oculta em todos os relatórios** (`utils.COLUNAS_OCULTAS_RELATORIO`):
  o identificador técnico interno não aparece mais na prévia em tela, no CSV, no Excel
  nem na impressão — o documento continua único (“o que você vê é o que você baixa”).
- Cache-buster dos scripts (`?v=`) e badge de versão atualizados para `2.7.2`.

### Testes
- `tests/run-exports.js` atualizado para o novo contrato: painel/funções de exportação
  removidos, coluna ID oculta em `buildReportDoc`, login split-screen no `index.html`
  e versão 2.7.2.

## [2.7.1] — 2026-08-31

### Novidades
- **Relatórios padronizados com prévia em tela** (`buildReportDoc`): todos os relatórios
  (consolidado por categoria + as 8 abas) passam a ter um único documento institucional —
  cabeçalho do órgão, metadados (gerado em/por, nº de registros, versão), rótulos de
  colunas em pt-BR, datas `dd/mm/aaaa` e números com vírgula. **O que aparece na prévia
  é exatamente o que sai no arquivo** e na impressão.
- **Impressão fiel do relatório**: imprime somente o documento padronizado
  (`#report-print-root` + `body.printing-report`), sem menu/topbar, sem cortar linhas
  da tabela.
- **Exportação Excel (.xlsx)** via SheetJS: *Exportar Tudo (Excel)* gera **um** arquivo
  com uma folha por aba + consolidado; nomes de folha sanitizados, larguras automáticas
  e números como `Number` (calculáveis). Fallback amigável para CSV quando offline.
- **CSV no padrão pt-BR**: separador `;` (abre direto no Excel brasileiro), datas em
  `dd/mm/aaaa`, números com vírgula e rótulos de coluna padronizados.

### Correções (badge/cache)
- **Badge de sincronização honesto**: cada aba agora registra a fonte real dos dados
  (`remoto`/`cache`/`csv`/`vazio`). O badge fica verde ("Sincronizado") **somente** quando
  todas as abas vieram do servidor; cache/CSV mostram âmbar "Dados locais" (antes, dados
  locais apareciam como sincronizados — inclusive logo após o boot).
- **Fim do "envenenamento" do `cache_timestamp`**: o timestamp só é renovado quando alguma
  aba realmente veio do servidor, e **não é mais gravado no `beforeunload`** (fechar a aba
  renovava o TTL de 5 min e a reabertura pulava a sincronização, exibindo dados velhos).
- **Badge de versão unificado**: o rodapé do login (`data-app-version`) passa a exibir
  `CONFIG.VERSAO` — fonte única de verdade, sem texto hard-coded.
- Cache-buster dos scripts (`?v=`) agora acompanha a versão do release (`2.7.1`).

### Testes
- `tests/run-exports.js` ampliado: CSV `;`, documento padronizado, formatação pt-BR,
  proteção de CNPJ/telefone contra formatação numérica e contratos de prévia/Excel/badge.

## [2.6.1] — 2026-09-01
- Exportação em lote das 8 abas + relatório consolidado por categoria em CSV (PR #13).
