# Próximo Passo — v2.5.1 → v2.6.0

## ✅ O que foi entregue na v2.5.1 — Integração real com o backend Apps Script

- **Backend real versionado**: `apps-script/Code.gs` implementa `doGet`, `doPost`, `LockService.getScriptLock()`, `ContentService`, leitura via `e.postData.contents`, CRUD completo por aba (add/update/delete).
- **Contrato validado**: `GET ?aba=X`, `POST {action:"add"|"update", aba, ...}`, `GET ?aba=X&action=delete&id=...`
- **Headers padrão** por aba definidos em `HEADERS_PADRAO` e criação automática via `setup_()`.
- **Frontend ajustado**: versão bump para `2.5.1` em `config.js` e `index.html`, README atualizado, pasta `apps-script/` documentada.
- **33 testes originais**: `node tests/run.js` (18) + `node tests/run-contract.js` (15) cobrindo sintaxe, CSV, utils, segurança de senhas, CORS `text/plain`, `Promise.allSettled`, e contrato do Apps Script.

### 🔧 Correção v2.5.1-hotfix — Sincronização automática

**Problema reportado**: sistema não estava fazendo sincronização automática — ficava preso em cache fresco e sobrescrevia cache do Sheets com CSV antigo.

**Correções aplicadas em `app.js` e `config.js`:**
- `config.js` agora define `AUTO_SYNC_INTERVAL_MS = 60s`
- `app.init()` agora chama `syncAll(true)` (forçado) na inicialização + `_startAutoSync()`
- `_loadFallbackCSV()` corrigido: só carrega CSV se não houver dados em memória/cache, preserva dados do Sheets
- `syncAll(force)` com log detalhado e detecção de `hasNewData`
- `_bindGlobalEvents()` agora trata:
  - `visibilitychange` → `syncAll(true)` quando aba volta a ficar visível
  - `online` → sincroniza forçado + toast
  - `offline` → aviso de modo local
  - `beforeunload` → salva timestamp
- `_startAutoSync()` / `_stopAutoSync()`:
  - `setInterval` a cada 60s, só se `document.visibilityState === 'visible'` e `navigator.onLine`
  - Sincronização extra após 5s do login para garantir dados frescos
  - Log `[AUTO-SYNC]` no console
- `app.post()` agora extrai `aba` da URL e inclui no corpo JSON (`{action, aba, ...payload}`) para robustez no Apps Script
- `app.get()` monta URL corretamente

**Testes atualizados (38):**
- `tests/run.js` agora com 23 testes (5 novos validando `AUTO_SYNC_INTERVAL_MS`, `_startAutoSync`, `_bindGlobalEvents` com `online`/`offline`/`visibilitychange`, `init` forçando sync, e preservação de cache)

Rodar para confirmar:

```bash
node tests/run.js && node tests/run-contract.js
# deve mostrar 38 testes passando (23 + 15)
```

## ⏭️ Próximos passos recomendados (v2.6.0)

### 1. Publicação online (decisão de equipe)
- Publicar o frontend no **GitHub Pages** (Settings → Pages → Branch `main` / root) ou Netlify/Vercel.
- URL final: `https://infraestrutura2026.github.io/ferramentas-e-estoque/`
- Validar que `data/*.csv` continua acessível como fallback.

### 2. Implantação do backend Apps Script
- Criar projeto Apps Script **a partir da planilha** (Extensões → Apps Script).
- Colar `apps-script/Code.gs` e `apps-script/appsscript.json`.
- Rodar `setup_()` uma vez para criar as 8 abas se necessário.
- Implantar como **App da Web** → acesso **Qualquer pessoa** (planilha compartilhada só com equipe).
- Atualizar `URL_BASE_APPS_SCRIPT` em `config.js` com a nova URL `/exec` se for diferente.

### 3. Troca de senhas padrão (urgente)
- Entrar como `admin`, ir em **Usuários**, criar novos usuários com senhas fortes.
- Desativar/remover `admin/admin123`, `oliveira`, `souza`, `Osvaldo`, `Zanoni` após migração.
- `data/usuarios.csv` já contém apenas hashes SHA-256.

### 4. Endurecimento de segurança (v2.6.0)
- **Autenticação server-side**: mover validação de login para o Apps Script com token (ex.: `PropertiesService` + expiração).
- Validar `e.parameter.token` em `doGet`/`doPost`.
- Adicionar rate limiting simples no Apps Script.
- Auditar compartilhamento da planilha (apenas e-mails da equipe).

### 5. Melhorias de UX
- Substituir `window.confirm()` por modal custom (já existe `app.openModal`).
- Paginação server-side quando histórico > 1000 linhas.
- Filtro por período em **Histórico** e **Pedidos**.
- Exportação XLSX além de CSV (usar SheetJS).
- Tema claro/escuro alternável.

### 6. Qualidade
- Gerar `styles.css` compilado do Tailwind (`tailwindcss -i input.css -o styles.css --minify`) para não depender do Play CDN em produção.
- Adicionar `eslint` e `prettier`.
- CI no GitHub Actions rodando `node tests/run.js && node tests/run-contract.js` a cada push.

### 7. Monitoramento
- Adicionar aba `logs` no Sheets para registrar erros do `doPost`.
- Dashboard de auditoria: quem criou/editou o quê (usar `Session.getActiveUser().getEmail()` no Apps Script).

---

**Versão atual**: 2.5.1  
**Branch**: `arena/01a042f8-ferramentas-e-estoque`  
**PR alvo**: `main` com título **"v2.5.1 — Integração real com o backend Apps Script"**
