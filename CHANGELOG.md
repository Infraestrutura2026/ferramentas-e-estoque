# Changelog — Ferramentas & Estoque

Todas as mudanças relevantes do sistema. Formato inspirado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).

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
