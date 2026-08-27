# Ferramentas & Estoque — Complexo Penal de Marília

Sistema web de **controle de estoque** e **empréstimo de ferramentas entre setores**,
com sincronização online via Google Sheets (Apps Script) e fallback offline em CSV.

**Versão:** 2.5.0 · Polícia Penal — Núcleo de Infraestrutura e Logística

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
# na pasta do projeto
python3 -m http.server 8080
# abra http://localhost:8080
```

> O sistema precisa ser servido por HTTP(S) — abrir o `index.html` direto no
> navegador (file://) bloqueia a leitura dos CSVs.

## 🌐 Publicando online (acesso por outros computadores)

O sistema é 100% estático — pode ser publicado de graça no **GitHub Pages**:

1. No GitHub, abra o repositório `Infraestrutura2026/ferramentas-e-estoque`;
2. Vá em **Settings → Pages**;
3. Em *Source*, escolha **Deploy from a branch**;
4. Em *Branch*, selecione **`main`** e a pasta **`/ (root)`** → **Save**;
5. Aguarde ~1 minuto e acesse `https://infraestrutura2026.github.io/ferramentas-e-estoque/`.

Alternativas equivalentes: Netlify ou Vercel (arraste o repositório e publique).

> O acesso aos dados em si já é online: as abas vêm do Google Sheets via Apps
> Script. O GitHub Pages só hospeda a interface.

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

- Senhas são armazenadas e comparadas como **hash SHA-256** (nunca em texto puro);
  o arquivo `data/usuarios.csv` e o código carregam apenas hashes.
- A autenticação é feita no navegador (adequada para uso interno confiável).
  Para exigir garantias maiores, mova a validação para o Apps Script (login via token).
- **Troque as senhas padrão** criando novas na tela Usuários e desativando as antigas.
- Restrinja o compartilhamento da planilha vinculada ao Apps Script apenas à equipe.

## 🗂️ Estrutura

```
index.html        Tela de login + shell
config.js         URL do Apps Script, abas, cache, versão
utils.js          Utilitários (CSV, formulários, paginação, badges, sha256)
app.js            Núcleo: auth, sincronização, dashboard, empréstimos, histórico
estoque.js        Módulo Estoque (CRUD)
ferramentas.js    Módulo Ferramentas (CRUD)
indicadores.js    Gráficos e indicadores
cadastros.js      Fornecedores, Pedidos e Usuários (CRUD)
data/*.csv        Fallback offline das abas (exportações da planilha)
```

## 🧪 Testes

Validações executadas na v2.5.0:
- Sintaxe de todos os módulos (`node --check`);
- Parser CSV (CRLF, campos com vírgula entre aspas);
- Busca com normalização de acentos;
- Paginação;
- Hashes de senha conferindo com `usuarios.csv`;
- POST sem preflight CORS (`text/plain`);
- Todos os assets respondendo HTTP 200.
