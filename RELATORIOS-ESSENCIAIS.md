# Relatórios essenciais — diagnóstico e implementação

**Data da verificação:** 30/09/2026 (v3.2.1: ficha de inventário físico)
**Base analisada:** `data/*.csv` (mesmo snapshot que gera o seed do banco Neon — `scripts/gen-seed.js`) e o código do menu (`app.js` / `utils.js`)
**Como repetir:** `npm run auditoria`

---

## 1. Resumo executivo

Hoje o menu tem **8 relatórios**, dos quais **6 geram documento** com os dados alimentados:

| Situação | Relatório no menu | Linhas hoje |
|---|---|---|
| ✅ Usar | **Estoque Atual** (com filtro de situação) | 169 |
| ✅ Usar | **Ficha de Inventário Físico** (contagem no almoxarifado) | 169 |
| ✅ Usar | **Lista de Reposição** (no/abaixo do mínimo) | 15 |
| ✅ Usar | **Consolidado por Categoria** (críticos, % e sem mínimo) | 6 |
| ✅ Usar | **Inventário de Ferramentas** (por estado/categoria) | 64 |
| ✅ Usar | **Histórico Unificado** (quatro fontes) | 30 |
| ⛔ Sem dados | Empréstimos Ativos | 0 |
| ⛔ Sem dados | Empréstimos em Atraso | 0 |

Todos usam o **mesmo documento padronizado** (`utils.buildReportDoc`): prévia em tela, impressão fiel, **CSV pt-BR** e **Excel (.xlsx)** saem do mesmo objeto — o que se vê é o que se baixa.

---

## 2. O que foi implementado (v3.1)

### 2.1 Seletor que mostra o que está alimentado
Cada opção exibe a contagem atual — `Estoque Atual (169 itens)`, `Histórico Unificado (30 registros)`, `Empréstimos Ativos — sem registros`. Opção sem registros fica **desabilitada** e o menu já abre no primeiro relatório com base.
Se a base inteira estiver vazia, nada é desabilitado (senão o seletor ficaria sem opção selecionável).

### 2.2 Filtro por relatório (contextual)
| Relatório | Filtros disponíveis |
|---|---|
| Estoque Atual | todos · críticos e esgotados · no/abaixo do mínimo · sem mínimo definido · regulares |
| Ficha de Inventário Físico | os mesmos recortes do Estoque Atual (ex.: conferir **só os 84 itens sem mínimo**) |
| Inventário de Ferramentas | todas · indisponíveis · em manutenção ou com defeito · disponíveis |
| Histórico Unificado | todos · entradas · saídas · manutenções (antes só entradas/saídas) |

O **filtro aplicado é registrado no título do documento** (ex.: *“Relatório Gerencial — Estoque Atual — Somente críticos e esgotados”*), para o papel impresso não enganar.

### 2.3 Estoque Atual — colunas vazias saem do documento
Colunas sem nenhum valor na base são omitidas automaticamente (hoje: Fornecedor e Valor Unit., vazios em 169 de 169 itens). A prévia avisa em tela, sem poluir a impressão: *“Colunas sem nenhum valor na base foram omitidas: Fornecedor, Valor Unit. (R$)”*.
A decisão de ocultar é tomada sobre a **base completa** — filtrar para “críticos” não apaga uma coluna que existe em outros itens.
Uma coluna parcialmente preenchida (ex.: Local, em 2 itens) **permanece**.

### 2.4 Lista de Reposição (novo)
Só entram itens **com mínimo cadastrado** e no/abaixo dele. Duas colunas explicam a necessidade:

- **Origem da necessidade**: `Saídas (n)` (houve saída registrada desde a última entrada), `Saldo zerado` ou `Mínimo`;
- **Repor (sugerido)**: `mínimo + consumo desde a última entrada − saldo atual`.

A sugestão é preenchida **apenas quando a própria base comprova o consumo** (saída registrada ou saldo zerado). Item que está no mínimo mas nunca foi usado sai com origem `Mínimo` e sugestão vazia — o sistema não transforma “mínimo de cadastro” em ordem de compra. Com os dados de hoje isso acontece nos 15 itens, porque as 20 movimentações existentes são de demonstração e nenhuma casa com o cadastro; a própria tela explica o motivo.

### 2.5 Inventário de Ferramentas (novo)
64 ferramentas com código, nome, categoria, estado e descrição (Local e Responsável estão vazios em 100% e saem do documento). A ordem é por **prioridade de ação**: Defeito → Manutenção → Em uso → Disponível. Com o filtro “Em manutenção ou com defeito” saem as **5 ferramentas** que precisam de atenção (F012 Alicate de trava, F023 Lixadeira, F032 Engraxadeira, F036 Multímetro, F040 Espátula de borracha).

### 2.6 Consolidado por Categoria (melhorado)
A coluna “Esgotados” (0 em todas as linhas) deixou de ser a leitura principal. Agora o documento traz **Itens · % do total · Qtd · Críticos · Esgotados · Sem mínimo** e, quando houver preço cadastrado, **Valor em estoque**. A tabela em tela ganhou as mesmas colunas (Críticos: 15; Sem mínimo: 84) e um card novo no painel gerencial.

### 2.7 Histórico Unificado (corrigido)
O relatório era alimentado só por `movimentacoes` (20 linhas) e ignorava o resto do menu Histórico. Agora usa `utils.historicoUnificado`, com **30 linhas** (20 movimentações + 10 registros) e uma coluna **Origem** com o rótulo amigável (*Movimentações de Estoque*, *Histórico*…).

### 2.8 Ficha de Inventário Físico (novo, v3.2.1)
Folha para **imprimir e levar ao almoxarifado**, com 6 colunas: **Nome · Categoria · Qtd. Sistema · Unid. · Local · Contagem**.

- A coluna **Contagem sai em branco de propósito** — é o espaço para escrever à mão. Ela é mantida mesmo vazia (`manterVazias`) e tem **largura de escrita** garantida na tela e na impressão (`.data-col="contagem"`, mínimo de 6,5 rem), separada por uma linha tracejada.
- **Instruções impressas no próprio documento**: *“Anote na coluna Contagem a quantidade encontrada e compare com a Qtd. Sistema: divergências devem ser lançadas no sistema (Movimentações) e itens não cadastrados registrados em Estoque.”*
- **Ordem de prateleira**: categoria → nome, que é a sequência natural da conferência. O cabeçalho da tabela se repete em cada página impressa.
- **Contagem dirigida**: usa os mesmos filtros do Estoque Atual, permitindo imprimir só os **15 críticos**, os **84 sem mínimo** ou uma categoria.
- CSV e Excel saem com a coluna Contagem **vazia** (não com “____”), então também serve para digitar a contagem direto na planilha e comparar.
- Como não há valor preenchido, o arquivo continua sendo um documento honesto: é uma folha de campo, não um retrato do estoque.

### 2.9 Detalhes de robustez
- **Prévia vazia não deixa documento velho na tela**: ao gerar um relatório sem registros, a prévia anterior é limpa e `_docPreviaAtual` volta a `null` — sem risco de imprimir/baixar o documento errado.
- **Taxa de consumo ancorada na base, não no relógio do aparelho**: a janela de 3 meses é contada a partir da data mais recente conhecida. Assim a sugestão de reposição é a mesma hoje e daqui a seis meses, mesmo se a base ficar parada.
- **Cruzamento de nomes tolerante**: `"CIMENTO CP-II 50KG"`, `"Cimento CP-II 50kg"` e `"cimento cp-ii 50 kg"` são o mesmo item (sem acento, caixa ou pontuação).

---

## 3. O que ficou de fora (com justificativa)

| Relatório pretendido | Por que ainda não | O que destrava |
|---|---|---|
| Empréstimos ativos / em atraso | Opção existe, mas **0 empréstimos** | Usar o módulo de Empréstimos |
| Movimentações por período / setor / usuário | 20 registros de demonstração, sem vínculo com o cadastro | Registrar entradas e saídas reais |
| Ferramentas em manutenção / pendências | Atendido hoje pelo **filtro** do Inventário de Ferramentas | — |
| Itens com excesso de estoque (30 acima de 5x o mínimo) | P2 ainda não implementado (não solicitado) | — |
| Valorização do estoque / Curva ABC | `valorUnitario` vazio em 100% dos itens | Preencher valor unitário |
| Compras por fornecedor / cotação | 0 fornecedores e 0 pedidos | Cadastrar fornecedores e usar Pedidos |
| Estoque por local / almoxarifado | `local` preenchido em 2 de 169 itens | Preencher local |
| Giro / consumo por item | Sem série histórica confiável | ≥ 3 meses de movimentações reais |

---

## 4. Retrato dos dados hoje

| Aba | Registros | Período | Qualidade |
|---|---:|---|---|
| `estoque` | **169** | 24/07 a 10/09/2026 | Categoria 98%, unidade/quantidade 100%, **mínimo 50%**, local 1%, fornecedor e valor 0% |
| `ferramentas` | **64** | 24/07/2026 | Completo (código, descrição, estado); local/responsável 0% |
| `movimentacoes` | **20** | 01/07 a 05/08/2026 | 11 entradas / 9 saídas — **nenhum item existe no cadastro** (demonstração) |
| `historico` | **10** | 24/07 a 27/07/2026 | 6 manutenções (5 vinculadas a ferramentas reais) + 4 saídas de estoque |
| `emprestimos`, `fornecedores`, `pedidos` | **0** | — | Nunca alimentados |
| `usuarios` | 3 | — | admin, Osvaldo, Zanoni |

### Sinais de alerta

- **50% do estoque não tem quantidade mínima** (84 itens — 82 da Hidráulica): esses itens **nunca** entram como “Crítico”. Dos 84, **51 têm ≤ 5 unidades** e **21 têm 1 unidade** — o indicador “9% exigem atenção” é um piso, não o retrato do almoxarifado.
- **Fornecedor e valor unitário vazios em 100% dos itens**: sem valorização, curva ABC ou compra por fornecedor.
- **Local preenchido em 2 de 169 itens**: sem relatório por local.
- **Movimentações desconectadas do cadastro**: 0 de 20 casam com o estoque real; a última é de 05/08 (56 dias atrás).
- **Divergência ferramentas × histórico**: 5 ferramentas em “Manutenção” e 6 registros de manutenção — “Nível de mão (armário)” tem pendência registrada mas não está marcada como em manutenção.

---

## 5. Ações sobre os dados (o que destrava os próximos relatórios)

| # | Ação | Esforço | Destrava |
|---|---|---|---|
| 1 | Preencher **quantidade mínima** nos 84 itens sem mínimo (51 com ≤ 5 un) | 1 sessão no almoxarifado | Reposição e alertas confiáveis |
| 2 | Marcar “Nível de mão (armário)” como **Manutenção** | 1 clique | Consistência ferramentas × histórico |
| 3 | Registrar **empréstimos** de ferramentas | contínuo | Relatórios de empréstimos e atrasos |
| 4 | Registrar **movimentações reais** de estoque | contínuo | Sugestão de reposição, consumo e giro |
| 5 | Preencher **valor unitário** e **fornecedor** | médio | Valorização, curva ABC e compras |
| 6 | Preencher **local** dos itens | médio | Estoque por local |
| 7 | Classificar os **3 itens sem categoria** e padronizar unidades (`rolos`/`tubos`) | 5 min | Agrupamentos por categoria/unidade |

---

## 6. Anexo — verificação

Comando: `npm run auditoria` (`scripts/auditoria-relatorios.js`). O script roda as **mesmas funções puras** da prévia/CSV/Excel sobre `data/*.csv`, sem tocar no banco, e lê do `app.js` quais opções existem no menu — se um relatório for removido do código, a auditoria acusa.

```
[OK]    Estoque Atual              | 169 linhas | 7 colunas
[OK]    Ficha de Inventário Físico | 169 linhas | 6 colunas (Contagem em branco)
[OK]    Lista de Reposição         |  15 linhas | 7 colunas
[OK]    Consolidado por Categoria  |   6 linhas | 7 colunas
[OK]    Inventário de Ferramentas  |  64 linhas | 5 colunas
[OK]    Histórico Unificado        |  30 linhas | 7 colunas
[VAZIO] Empréstimos Ativos         |   0 linhas
[VAZIO] Empréstimos em Atraso      |   0 linhas

Estoque: 154 regulares · 15 críticos · 0 esgotados · 9.972 unidades · 84 sem mínimo
Ferramentas: 59 disponíveis · 5 em manutenção
Cruzamento movimentações ↔ cadastro: 0 de 20
```

> Rode a auditoria novamente depois de alimentar novos dados para ver, na hora, quais relatórios passaram a ter base.
