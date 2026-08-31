# 🚀 Deploy Vercel + Neon — Guia Completo (v2.6.0)

> **Objetivo:** site oficial em `https://<seu-projeto>.vercel.app`, com banco
> PostgreSQL **Neon** de verdade. **Nenhum computador precisa colar nada** —
> quem abre o link já está conectado ao banco.
>
> **A connection string do Neon NUNCA fica no código.** Ela vive como variável
> de ambiente secreta no painel da Vercel.

---

## ✅ Pré-requisitos (você já tem)

- [x] Repositório no GitHub (`Infraestrutura2026/ferramentas-e-estoque`)
- [x] Projeto criado no **Neon** (neon.tech) → connection string copiada
- [x] Código da v2.6.0 com a pasta `api/` (backend serverless) mergeado no `main`

## 📱 Passo a passo (uma única vez, ~2 minutos)

1. **Acesse [vercel.com](https://vercel.com)** e entre com o GitHub
   (conta que enxerga o repositório).

2. **Add New… → Project** → localize `Infraestrutura2026/ferramentas-e-estoque`
   → **Import**.

3. Na tela de configuração:
   - **Framework Preset:** `Other` (detectado automaticamente)
   - **Root Directory:** `./` (padrão)
   - Não mexa em Build Command / Output Directory (fica vazio)

4. **Expanda "Environment Variables"** e adicione:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | `postgresql://usuario:senha@ep-xxxx.neon.tech/neondb?sslmode=require` |

   👉 Cole aqui a connection string do **Dashboard do Neon** (botão *Copy*).
   Marque os ambientes **Production**, **Preview** e **Development**.

5. **Deploy** → aguarde ~30s. Pronto: `https://<projeto>.vercel.app`.

6. **Teste imediato:** abra `https://<projeto>.vercel.app/api/health`
   - 1ª chamada pode demorar alguns segundos (cria as 8 tabelas + importa os
     172 registros dos CSVs automaticamente).
   - Deve responder: `{"success":true,"ok":true,"backend":"neon-postgres","contagens":{"estoque":51,...}}`

7. Entre com `admin` / `admin123` (troque as senhas depois — seção Segurança).

> 💡 **Publicações futuras:** com o repo conectado, todo *merge* no `main`
> reimplementa o site automaticamente. Não há mais nenhum passo manual.

---

## 🔄 Como funciona (arquitetura v2.6.0)

```
Navegador (qualquer computador)
   │  abre https://<projeto>.vercel.app
   ▼
Frontend estático (index.html, app.js, …)  ──── servido pela Vercel
   │  fetch('/api/estoque') etc.  (mesma origem, sem CORS)
   ▼
Funções serverless  api/[aba].js · api/health.js · api/setup.js
   │  driver HTTP @neondatabase/serverless
   ▼
Neon PostgreSQL  —  8 tabelas (estoque, ferramentas, …) + _setup
                     ▲
                     └─ 1ª execução: cria tabelas + seed com data/*.csv
                        (embutido em api/_lib/seed-data.js — sem passo manual)
```

- **Contrato idêntico ao Apps Script** (`GET ?aba=X`, `POST {action, aba, …}`,
  `GET ?action=delete&id=…`) — o frontend não mudou de comportamento, só de URL.
- **Detecção automática de backend** (`config.js`):
  - host `*.vercel.app` → usa `/api/*` (Neon) ✅ produção
  - host `github.io` → usa o Apps Script (espelho offline) 🪞
  - override manual: `window.__NEON_API__ = true/false` antes de carregar o `config.js`
- **Ordem de inserção preservada** (coluna interna `_seq`) como na planilha.

## 🛠 Comandos úteis

```bash
npm start            # servidor local idêntico à produção (banco em memória)
npm test             # 99 testes (23 + 15 + 49 + 12) incl. migração online
npm run gen          # regenera api/_lib/seed-data.js após atualizar data/*.csv
DATABASE_URL=postgres://… npm start   # dev apontando para o Neon REAL

# Migração não destrutiva dos CSVs para o ambiente online:
DATABASE_URL=postgresql://... npm run migrate:online
# ou via API, sem expor a connection string:
MIGRATE_API_BASE=https://<projeto>.vercel.app npm run migrate:online
# conferência local, sem conectar nem alterar:
DRY_RUN=1 npm run migrate:online
```

## 🔁 Reexecutar a carga inicial

`https://<projeto>.vercel.app/api/setup?force=1` — recria tabelas ausentes e
popula **apenas as que estiverem vazias** (nunca apaga dados existentes).

Para levar uma versão atualizada dos CSVs a um ambiente que já contém dados,
use `npm run migrate:online` conforme os comandos acima. A migração é
idempotente e só insere chaves ausentes; `DRY_RUN=1` não abre conexão com o
destino.

## 🔒 Segurança — estado atual e próximos passos

| Item | Estado v2.6.0 |
|---|---|
| Connection string do banco | ✅ Segura (env var da Vercel, fora do código) |
| Senhas de usuário | ✅ Hashes SHA-256 (nunca em claro) |
| Escrita no banco | ⚠️ API aberta (qualquer um com o link pode escrever) — igual ao Apps Script atual |
| Login | ⚠️ Validado no cliente — migrar para token server-side (v2.7.0) |

**Troca de senhas padrão (urgente):** entre como `admin` → Usuários → crie
usuários reais com senhas fortes → desative `admin/admin123`.

## 🪞 O espelho do GitHub Pages continua no ar

`https://infraestrutura2026.github.io/ferramentas-e-estoque/` segue funcionando
em modo Apps Script/CSV (consulta e offline). O link oficial da equipe passa a
ser o da Vercel.

---

**Versão**: 2.6.0 · Complexo Penal de Marília — Polícia Penal · Núcleo de Infraestrutura e Logística
