# Ferramentas & Estoque — Complexo Penal de Marília

Sistema web de **controle de estoque** e **empréstimo de ferramentas entre setores**.

**v2.6.0 — Backend PostgreSQL (Neon) com API serverless na Vercel.** Quem abre o
site oficial (`https://<projeto>.vercel.app`) já está conectado ao banco — nada a
configurar por computador. A connection string fica em variável de ambiente da
Vercel (nunca no código). O GitHub Pages segue como **espelho offline** em modo
Apps Script/CSV. Guia completo: **[DEPLOY-VERCEL.md](DEPLOY-VERCEL.md)**.

**Versão:** 2.6.0 · Polícia Penal — Núcleo de Infraestrutura e Logística

---

## ✨ Funcionalidades

| Tela | O que faz |
|------|-----------|
| Dashboard | Resumo geral, alertas de itens críticos/esgotados e **empréstimos atrasados** |
| Indicadores | Gráficos (Chart.js), saúde do estoque, top 10 críticos |
| **Empréstimos** | **Registrar empréstimo, registrar devolução, destacar atrasos**, busca e filtros |
| Estoque | CRUD completo de itens, mínimos de reposição, status OK/Crítico/Esgotado |
| Ferramentas | CRUD completo (código, categoria, estado, local, responsável) |
| Histórico | Movimentações + manutenções, com busca e paginação |
| Fornecedores | CRUD completo |
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

## 🌐 Publicando online (acesso por outros computadores)

### Produção — Vercel + Neon (recomendado, v2.6.0)

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
vercel.json       Configuração das funções + headers CORS
apps-script/      Backend legado do espelho (Google Sheets)
  Code.gs         Backend real (Google Apps Script) com LockService
  README.md       Como implantar o backend
  appsscript.json Manifesto do projeto Apps Script
tests/
  run.js          Testes gerais (sintaxe, CSV, utils, módulos)
  run-contract.js Testes de contrato do Apps Script
  run-neon.js     Testes da API Neon/Vercel (SQL, segurança, contrato, HTTP)
```

## 🧪 Testes

Validações executadas na v2.6.0 (**87 testes**):

```bash
npm test   # roda as três suítes
node tests/run.js          # 23 — geral (sintaxe, CSV, utils, módulos)
node tests/run-contract.js # 15 — contrato do Apps Script
node tests/run-neon.js     # 49 — API Neon/Vercel (SQL, segurança, HTTP)
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
