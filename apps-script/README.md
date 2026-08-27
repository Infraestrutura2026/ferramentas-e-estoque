# Backend Apps Script — Ferramentas & Estoque v2.5.1

Este diretório contém o código **real** do backend Google Apps Script que
sincroniza o frontend com a planilha Google Sheets.

## Arquivos

- `Code.gs` — implementação completa (`doGet`, `doPost`, `LockService`, CRUD por aba)
- `appsscript.json` — manifesto do projeto Apps Script
- `README.md` — este arquivo

## Como implantar

1. Abra https://script.google.com e crie um novo projeto;
2. Copie o conteúdo de `Code.gs` para o editor;
3. Copie o conteúdo de `appsscript.json` para o manifesto (⚙️ → Mostrar appsscript.json);
4. Vincule a planilha:
   - No Apps Script: **Recursos → Bibliotecas?** Não. Use `SpreadsheetApp.getActiveSpreadsheet()`
   - Por isso **crie o projeto a partir da planilha**: na planilha → Extensões → Apps Script
5. Rode a função `setup_()` **uma vez** para criar as 8 abas com headers padrão, se ainda não existirem;
6. Publique:
   - **Implantar → Nova implantação → App da Web**
   - Descrição: `v2.5.1`
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa** (o frontend valida via hash; restrinja o compartilhamento da planilha à equipe)
   - Copie a URL `/exec` gerada
7. Cole a URL em `config.js` na constante `URL_BASE_APPS_SCRIPT`.

## Contrato com o frontend

| Operação | Chamada do frontend | O que o backend faz |
|----------|---------------------|---------------------|
| Leitura | `GET ?aba=estoque` (e demais abas) | Retorna JSON array de objetos lidos da aba |
| Criar | `POST ?aba=estoque` com corpo `{action:"add", ...campos}` | `appendRow` na aba (usa `e.postData.contents`) |
| Atualizar | `POST ?aba=estoque` com corpo `{action:"update", id, ...}` | Localiza pelo `id` e atualiza a linha |
| Excluir | `GET ?aba=estoque&action=delete&id=...` | Remove a linha correspondente |

- Todas as escritas usam `LockService.getScriptLock()` para evitar corrupção concorrente.
- Respostas sempre `ContentService.createTextOutput(JSON.stringify({success:true}))`.
- O frontend envia `Content-Type: text/plain;charset=utf-8` de propósito para evitar preflight CORS.

## Teste rápido (curl)

```bash
# Leitura
curl -L "https://script.google.com/macros/s/SEU_ID/exec?aba=estoque"

# Criar
curl -L -X POST -H "Content-Type: text/plain;charset=utf-8" \
  -d '{"action":"add","aba":"estoque","id":"teste123","nome":"Teste","categoria":"Geral","quantidadeAtual":1}' \
  "https://script.google.com/macros/s/SEU_ID/exec?aba=estoque"

# Atualizar
curl -L -X POST -H "Content-Type: text/plain;charset=utf-8" \
  -d '{"action":"update","aba":"estoque","id":"teste123","nome":"Teste Atualizado"}' \
  "https://script.google.com/macros/s/SEU_ID/exec?aba=estoque"

# Deletar
curl -L "https://script.google.com/macros/s/SEU_ID/exec?aba=estoque&action=delete&id=teste123"
```

## Segurança

- A planilha deve ser compartilhada **apenas com a equipe** (não pública).
- Senhas na aba `usuarios` são hashes SHA-256, nunca texto puro.
- Para endurecer, implemente validação de token no `doPost`/`doGet` (evolução futura).

## Versão

2.5.1 — Integração real com o backend Apps Script
