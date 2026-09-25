# Ferramentas & Estoque — Complexo Penal de Marília

Sistema web de **controle de estoque** e **empréstimo de ferramentas entre setores**.

**v2.6.1 — Relatórios e exportação em lote (8 abas) + CI de testes.** Sobre a base
v2.6.0 (Backend PostgreSQL/Neon com API serverless na Vercel): quem abre o
site oficial (`https://<projeto>.vercel.app`) já está conectado ao banco — nada a
configurar por computador. A connection string fica em variável de ambiente da
Vercel (nunca no código). O GitHub Pages segue como **espelho offline** em modo
Apps Script/CSV. Guia completo: **[DEPLOY-VERCEL.md](DEPLOY-VERCEL.md)**.

**Versão:** 2.6.1 · Polícia Penal — Núcleo de Infraestrutura e Logística

---

## ✨ Funcionalidades

| Tela | O que faz |
|------|-----------|
| Dashboard | Resumo geral, alertas de itens críticos/esgotados e **empréstimos atrasados** |
| Indicadores | Gráficos (Chart.js), saúde do estoque, top 10 críticos |
| **Empréstimos** | **Registrar empréstimo, registrar devolução, destacar atrasos**, busca e filtros |
| Estoque | CRUD completo de itens, mínimos de reposição, status OK/Crítico/Esgotado, **fornecedor e valor unitário** por item |
| Ferramentas | CRUD completo (código, categoria, estado, local, responsável) |
| Histórico | **Data, Ação, Item, Quantidade, Solicitante e Responsável** — lista unificada de movimentações, pedidos, empréstimos e manutenções, com busca, filtro por fonte e paginação |
| Fornecedores | CRUD completo + **limpar o cadastro inteiro** (exclusão em lote com confirmação) |
| Pedidos | Pedidos de compra com valores, previsão de entrega e status |
| Usuários | Gestão centralizada de acessos (somente admin) |
| Relatórios | Totais por categoria + exportação CSV de todas as abas + impressão |

## 🔑 Login

Usuários iniciais ( **troque as senhas após a implantação** — veja seção Segurança):

| Usuário | Senha | Nível |
|---------|-------|-------|
| `admin` | `admin123` | Administrador |
| `oliveira` | `oliveira2026` | Operador |
| `souza` | `souza2026` | Operador |
| `Osvaldo` | `infra2026` | Operador |
| `Zanoni` | `infra2026` | Operador |

Novos usuários podem ser criados na tela **Usuários** (admin) e passam a valer
para todos os computadores (são gravados na aba `usuarios` do Google Sheets).

## ▶️ Rodando localmente

```bash
npm install        # 1x (baixa o driver do Neon)
npm start          # servidor com API /api/* em memória (seed dos CSVs)
# abra http://localhost:8080 — comportamento idêntico ao da Vercel

# sem Node? o frontend estático também roda:
python3 -m http.server 8080
```

> O sistema precisa ser servido por HTTP(S) — abrir o `index.html` direto no
> navegador (file://) bloqueia a leitura dos CSVs.
> Com `DATABASE_URL=... npm start` o servidor local usa o banco Neon **real**.

## 🔄 Migrando os CSVs para o ambiente online

O comando `migrate:online` leva os dados versionados em `data/*.csv` para o
banco online. A operação é **não destrutiva**: cria/evolui as tabelas e insere
somente chaves primárias que ainda não existem; nunca apaga nem sobrescreve um
registro já online.

### Opção A — direto no banco

Requer a connection string do PostgreSQL/Neon:

```bash
DATABASE_URL=postgresql://... npm run migrate:online
```

### Opção B — pela API do próprio sistema

Não expõe a connection string e usa apenas o contrato HTTP da aplicação:

```bash
MIGRATE_API_BASE=https://<projeto>.vercel.app npm run migrate:online
```

### Conferir antes de executar

`DRY_RUN=1` valida os CSVs e mostra a quantidade planejada sem conectar nem
alterar o destino:

```bash
DRY_RUN=1 npm run migrate:online
```

As duas variáveis de destino são mutuamente exclusivas. Para uma pasta de CSVs
diferente, use `DATA_DIR=/caminho/dos/csvs`. O comando também pode ser
consultado com `npm run migrate:online -- --help`.

Se você não usa terminal, depois de publicar esta versão é possível fazer a
sincronização pelo navegador abrindo:

```text
https://<projeto>.vercel.app/api/setup?migrate=1
```

Essa URL também é não destrutiva: adiciona somente chaves ausentes do seed e
não remove nem atualiza registros existentes.

## 📥 Importando uma lista de itens para o estoque

Para lançar uma contagem/lista recebida (papel, planilha ou e-mail) sem digitar
item a item na tela:

```bash
# 1) cole a lista num arquivo — uma linha por item, na ordem que preferir
#    (nome, quantidade, mínimo, unidade, categoria, local)
# 2) prévia: mostra o que vai acontecer sem gravar nada
npm run import:estoque -- --arquivo data/importar-2026-09-10.txt

# 3) grava em data/estoque.csv e regenera o seed automaticamente
npm run import:estoque -- --arquivo data/importar-2026-09-10.txt --gravar
```

Formatos aceitos: texto livre separado por vírgula, `;`, tab ou `|`
(`Tomada 20A, Elétrica, 40, 10, un, Almoxarifado`, `Registro 3/4 | 12 un | Hidráulica`)
ou CSV com cabeçalho (`nome;categoria;quantidade;minimo;unidade;local` — os
títulos são reconhecidos em português, com ou sem acento). Linhas começando com
`#` e cabeçalhos repetidos no meio do arquivo são ignorados.

Regras do importador:

| Situação | Comportamento |
|----------|---------------|
| Item com o mesmo nome já cadastrado | **soma** a quantidade e atualiza `updatedAt` (`--duplicados novo` cria separado; `--duplicados parar` ignora) |
| Repetição dentro do próprio arquivo | somada em um único lançamento |
| Campo que veio vazio | **fica vazio** — nada é inventado (`--min-padrao 10` preenche o mínimo, se quiser) |
| Nomes com aspas de polegada (`1/2"`) | preservados com escape RFC 4180 |

> ⚠️ O importador **não é idempotente**: rodar duas vezes com a mesma lista
> soma as quantidades outra vez. Confira a prévia antes de usar `--gravar`.

Depois de gravar, publique online com `npm run migrate:online` (veja a seção
acima) ou abra `https://<projeto>.vercel.app/api/setup?migrate=1`.

## 🌐 Publicando online (acesso por outros computadores)

### Produção — Vercel + Neon (recomendado, v2.6.1)

Basta conectar o repositório na Vercel **uma vez** e definir a env var
`DATABASE_URL` (connection string do Neon). Depois disso, **todo merge no
`main` publica automaticamente**. Passo a passo com prints do que clicar:
**[DEPLOY-VERCEL.md](DEPLOY-VERCEL.md)**.

### Espelho offline — GitHub Pages (continua ativo)

`https://infraestrutura2026.github.io/ferramentas-e-estoque/` — serve o mesmo
frontend em modo Apps Script/CSV (consulta + fallback offline). Já configurado
(Settings → Pages → branch `main` / root).

## 🔗 Integração Google Sheets (Apps Script)

A URL do endpoint está em `config.js` (constante `URL_BASE_APPS_SCRIPT`).

**Contrato esperado do Apps Script:**

| Operação | Como o front chama | O que o script deve fazer |
|----------|--------------------|---------------------------|
| Leitura | `GET ?aba=estoque` (idem para as 8 abas) | Retornar JSON (array de objetos ou `{data: [...]}`) |
| Criar | `POST` com corpo JSON `{action:"add", ...campos}` | Anexar linha na aba (ler via `e.postData.contents`) |
| Atualizar | `POST` com corpo JSON `{action:"update", id, ...campos}` | Localizar pelo `id` e atualizar a linha |
| Excluir | `GET ?aba=X&action=delete&id=...` | Remover a linha correspondente |

**Recomendações para o script (importante):**
- Usar `LockService.getScriptLock()` em toda escrita (evita corrupção por uso simultâneo);
- Responder sempre com `ContentService` + `JSON.stringify({success:true})`;
- O front envia POST com `Content-Type: text/plain` de propósito — isso evita o
  *preflight* CORS que o Apps Script não responde. **Não mude para `application/json`.**
- Versione o código do Apps Script dentro deste repositório (ex.: pasta `apps-script/`).

## 🔒 Segurança

- **A connection string do Neon nunca fica no código** — vive como variável de
  ambiente (`DATABASE_URL`) no painel da Vercel. Veja [DEPLOY-VERCEL.md](DEPLOY-VERCEL.md).
- Todo SQL é **parametrizado** ($1, $2, …) e nomes de tabela/coluna vêm de uma
  lista fixa (`api/_lib/schema.js`) — validado por testes de injeção.
- Senhas são armazenadas e comparadas como **hash SHA-256** (nunca em texto puro);
  o arquivo `data/usuarios.csv` e o código carregam apenas hashes.
- A autenticação é feita no navegador (adequada para uso interno confiável);
  próximo passo: token server-side (v2.7.0).
- **Troque as senhas padrão** criando novas na tela Usuários e desativando as antigas.
- Restrinja o compartilhamento da planilha vinculada ao Apps Script apenas à equipe.

## 🗂️ Estrutura

```
index.html        Tela de login + shell
config.js         Detecção de backend (Vercel→Neon / Pages→Apps Script), abas, cache, versão
utils.js          Utilitários (CSV, formulários, paginação, badges, sha256)
app.js            Núcleo: auth, sincronização, dashboard, empréstimos, histórico
estoque.js        Módulo Estoque (CRUD)
ferramentas.js    Módulo Ferramentas (CRUD)
indicadores.js    Gráficos e indicadores
cadastros.js      Fornecedores, Pedidos e Usuários (CRUD)
data/*.csv        Fallback offline das abas (exportações da planilha)
api/              ★ v2.6.0 — Backend serverless Vercel + Neon
  [aba].js        Rotas /api/<aba> (contrato idêntico ao Apps Script)
  health.js       GET /api/health (status do banco + contagens)
  setup.js        GET /api/setup (recria tabelas vazias + seed)
  _lib/schema.js  8 tabelas, colunas e chaves primárias
  _lib/store.js   NeonStore (SQL parametrizado) + MemoryStore (dev)
  _lib/handler.js Contrato HTTP compartilhado (CORS, add/update/delete)
  _lib/seed-data.js Carga inicial embutida (gerada de data/*.csv)
dev/server.js     Servidor local idêntico à produção (API em memória)
scripts/gen-seed.js Regenera o seed-data.js após atualizar CSVs
scripts/import-estoque.js Importa lista colada/CSV para data/estoque.csv
scripts/migrate-online.js Migra data/*.csv para PostgreSQL ou API online
vercel.json       Configuração das funções + headers CORS
apps-script/      Backend legado do espelho (Google Sheets)
  Code.gs         Backend real (Google Apps Script) com LockService
  README.md       Como implantar o backend
  appsscript.json Manifesto do projeto Apps Script
tests/
  run.js          Testes gerais (sintaxe, CSV, utils, módulos)
  run-contract.js Testes de contrato do Apps Script
  run-neon.js     Testes da API Neon/Vercel (SQL, segurança, contrato, HTTP)
  run-migrate.js  Testes da migração online em lotes
  run-exports.js  Testes de relatórios e exportação CSV (v2.6.1)
  run-import.js   Testes do importador de itens do estoque
```

## 🧪 Testes

Validações executadas (**240 testes**, com CI no GitHub Actions):

```bash
npm test   # roda as seis suítes
node tests/run.js          # 23 — geral (sintaxe, CSV, utils, módulos)
node tests/run-contract.js # 17 — contrato do Apps Script
node tests/run-neon.js     # 57 — API Neon/Vercel (SQL em lote, segurança, HTTP)
node tests/run-migrate.js  # 15 — migração online em lotes (sem rede/banco real)
node tests/run-exports.js  # 85 — relatórios e exportação CSV (lote, 8 abas, admin)
node tests/run-import.js   # 43 — importação de itens para o estoque
```

- Sintaxe de todos os módulos (`node --check`);
- Parser CSV (CRLF, campos com vírgula entre aspas);
- Busca com normalização de acentos;
- Paginação;
- Hashes de senha conferindo com `usuarios.csv`;
- POST sem preflight CORS (`text/plain`);
- Todos os assets respondendo HTTP 200;
- **Backend Apps Script versionado** (`apps-script/Code.gs`);
- **LockService em toda escrita**;
- **Contrato GET/POST/DELETE** validado;
- **Headers padrão** por aba;
- **Tratamento de `e.postData.contents`** e `text/plain`.
