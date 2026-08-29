# Próximo Passo — v2.6.0 → v2.7.0

## ✅ O que foi entregue na v2.6.0 — Backend Neon (PostgreSQL) + API Vercel

Substitui a dependência do Google Apps Script na produção por um backend
serverless versionado junto com o código, com banco PostgreSQL real (Neon).

### Arquitetura

- **`api/[aba].js`** (função Vercel/Node): rotas `/api/estoque`, `/api/usuarios`, …
  com **contrato idêntico** ao Apps Script (`GET ?aba`, `POST {action, aba, …}`,
  `GET ?action=delete&id`) — o frontend só trocou as URLs.
- **`api/health.js`** — status da conexão + contagem por tabela.
- **`api/setup.js`** — recria tabelas ausentes e popula as vazias (`?force=1`).
- **`api/_lib/store.js`** — `NeonStore` (driver HTTP `@neondatabase/serverless`,
  SQL 100% parametrizado, upsert igual ao Code.gs, ordem de inserção via `_seq`)
  + `MemoryStore` para dev/testes (mesma interface).
- **`api/_lib/schema.js`** — as 8 abas como tabelas (PK `id`, exceto `usuarios` → `usuario`).
- **Carga inicial automática**: `api/_lib/seed-data.js` (gerado de `data/*.csv`
  por `scripts/gen-seed.js`) — na 1ª execução cria as tabelas e importa os
  **172 registros** sem nenhum passo manual.
- **`config.js` com detecção automática**: `*.vercel.app` → `/api/*` (Neon);
  `github.io` → Apps Script (espelho offline); override `window.__NEON_API__`.
- **Connection string fora do código**: env var `DATABASE_URL` na Vercel.
- **`dev/server.js`**: produção-local idêntica (mesmo handler, banco em memória;
  com `DATABASE_URL` usa o Neon real).
- **`vercel.json`**: funções (256 MB, 15 s) + headers CORS.

### Segurança adicionada

- SQL sempre parametrizado; identificadores vêm de whitelist do schema;
- testes de injeção (aba maliciosa, colunas fora do schema, payload `DROP TABLE`);
- connection string do banco fora do repositório.

### Testes (87 = 23 + 15 + 49)

```bash
npm test   # node tests/run.js && node tests/run-contract.js && node tests/run-neon.js
```

`tests/run-neon.js` cobre: DDL+seed, add/update/upsert/delete, ORDER BY _seq,
parametrização, injeção, contrato HTTP completo, integração via servidor real,
detecção de backend no frontend e parser CSV (aspas/vírgulas).

## ⏭️ Para PUBLICAR (ação da equipe — 1x, ~2 minutos)

Seguir **[DEPLOY-VERCEL.md](DEPLOY-VERCEL.md)**: conectar o repo na Vercel e
definir `DATABASE_URL` (connection string do Neon) como env var. Depois disso,
**todo merge no `main` publica sozinho**. Verificar `/api/health`.

## ⏭️ Próximos passos recomendados (v2.7.0)

### 1. Autenticação server-side (prioridade máxima)
- Login no backend: `POST /api/auth` valida hash e devolve **token** (expiração).
- Exigir token nas escritas (`/api/<aba>` POST/DELETE).
- Rate limiting simples por IP (Vercel WAF ou tabela `tentativas_login`).
- Remover dependência do hash de senha no cliente.

### 2. Pós-publicação imediata
- Trocar senhas padrão (`admin/admin123` etc.) na tela Usuários.
- Se a planilha do Google tiver dados mais novos que os CSVs: exportar e rodar
  `npm run gen` + merge, ou atualizar direto pelo sistema.
- Marcar o link da Vercel como oficial (intranet/atalhos) e comunicar a equipe.

### 3. Endurecimento
- `DATABASE_URL` com usuário limitado ( Neon → Roles: só as 9 tabelas, sem DROP).
- Backup automático (Neon história de restores no plano free — validar janela).
- Logs de auditoria server-side (quem criou/editou/apagou o quê, quando).

### 4. Melhorias de UX (da v2.5.1, ainda válidas)
- `window.confirm` → modal custom; paginação server-side quando histórico > 1000;
  filtro por período; exportação XLSX (SheetJS); tema claro/escuro.
- Compilar Tailwind para `styles.css` (sair do Play CDN).

### 5. Qualidade/CI
- GitHub Actions rodando `npm test` a cada push/PR.
- ESLint + Prettier.

---

**Versão atual**: 2.6.0
**Branch**: `arena/01a04e88-ferramentas-e-estoque`
**PR alvo**: `main` com título **"v2.6.0 — Backend Neon (PostgreSQL) + API Vercel"**
