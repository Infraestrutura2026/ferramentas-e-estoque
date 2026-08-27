# Relatório de Revisão — Ferramentas & Estoque

Auditoria realizada em 27/08/2026 sobre o sistema de controle de estoque e
empréstimo de ferramentas (frontend estático + CSVs locais + Google Sheets via Apps Script).

> ## ✅ Status: implementado na v2.5.0
> Todos os itens das seções 1, 3 e 4 foram corrigidos/implantados neste branch,
> além da higienização de senhas (seção 2). Pendências restantes são decisões
> de equipe: publicar no GitHub Pages (passo a passo no README), trocar as
> senhas padrão e adicionar o código do Apps Script ao repositório.

---

## 🔴 1. Bugs críticos (já corrigidos neste branch)

| # | Problema | Impacto | Correção aplicada |
|---|----------|---------|-------------------|
| 1 | `index.html` carregava `config-tatico.js`, `app-tatico.js` etc., arquivos que **não existem** no repositório | A página abria em branco: nenhum JS era executado, nem a tela de login aparecia | Referências corrigidas para `config.js`, `utils.js`, `estoque.js`, `ferramentas.js`, `indicadores.js`, `app.js` |
| 2 | `estoque.js` usava `CONFIG.SHEETS.ESTOQUE` (chave inexistente — o correto é `estoque`, minúscula) | Todo salvar/editar/excluir de estoque falhava silenciosamente e **nunca chegava ao Google Sheets**; outros computadores não viam as alterações | 3 ocorrências corrigidas |
| 3 | `data/usuarios.csv` usa CRLF e o parser não removia o `\r` | Último campo de cada linha vinha com `\r` invisível (ex.: `"admin\r"`), quebrando comparações | `_parseCSV` agora normaliza CRLF → LF |

---

## 🔴 2. Segurança (urgente — exige decisão da equipe)

1. **Senhas em texto puro no código-fonte e no repositório.**
   - `app.js` → `DEFAULT_USERS` contém `admin/admin123`, `oliveira/oliveira2026`, `souza/souza2026`.
   - `data/usuarios.csv` contém `admin/admin123`, `Osvaldo/infra2026`, `Zanoni/infra2026`.
   - Qualquer pessoa com acesso ao repositório (ou ao site publicado) lê as senhas.
   - **Ação:** trocar todas as senhas imediatamente e remover o arquivo de senhas do repositório.

2. **Login 100% no navegador.** A validação ocorre só no JavaScript do cliente:
   basta abrir o console e gravar uma sessão no `sessionStorage` para entrar sem senha.
   Para um órgão penal isso é um risco real.

3. **URL do Apps Script pública.** Qualquer pessoa com a URL consegue ler/gravar as abas
   (o endpoint não autentica ninguém do lado do frontend). O `doPost`/`doGet` precisa exigir
   token/sessão e validar os dados recebidos.

---

## 🟠 3. Acesso online por outros computadores

- **Não há hospedagem definida.** O sistema é estático, então pode ser publicado de graça no
  **GitHub Pages, Netlify ou Vercel** (HTTPS incluso). Hoje o repositório não tem nenhuma
  configuração/README de deploy.
- **Duas URLs diferentes de Apps Script** em `config.js` (`URL_BASE` ≠ `configUI.getBaseUrl()`).
  Unificar em uma só e remover a segunda.
- **A tela "Configuração" é inacessível** (nenhum item de menu leva a `renderConfigPage`) —
  código morto ou menu faltando.
- **O código do Apps Script não está no repositório.** Sem ele não há como auditar as gravações.
  Recomenda-se incluí-lo (pasta `apps-script/`), usando `LockService` para evitar gravações
  concorrentes corrompendo a planilha.
- **Conflitos entre usuários:** após salvar, o app adiciona o registro localmente mas **não
  re-sincroniza**. Dois computadores editando o mesmo item: o último a sincronizar sobrescreve
  o outro sem aviso. Solução: re-sincronizar após cada gravação e comparar `updatedAt`.
- **Cache em `sessionStorage`** vale só para a aba atual — trocar para `localStorage` para
  reaproveitar entre abas/computadores com mesmo navegador.
- **Sincronização sequencial** de 8 abas (cada uma com timeout de 15 s). No pior caso a tela
  pode levar 2 min para estabilizar. Usar `Promise.allSettled` para buscar em paralelo.

---

## 🟠 4. Lacunas funcionais

1. **Empréstimos — tela somente leitura.** É o coração do sistema e hoje **não há como:**
   - registrar um novo empréstimo (ferramenta, setor/destino, responsável, data prevista);
   - registrar devolução;
   - visualizar **atrasos** (`previsaoDevolucao` existe no CSV mas nunca é usada).
   É a prioridade funcional nº 1.

2. **Sem tela de Fornecedores e Pedidos.** Os dados existem (`fornecedores.csv`, `pedidos.csv`)
   mas não há navegação para eles.

3. **Usuários não são centralizados.** O login usa `DEFAULT_USERS` gravado no `localStorage`
   de cada navegador — cada computador tem sua própria lista; usuários novos não aparecem nos
   demais. Usuários devem vir da aba `usuarios` do Sheets (autenticados no servidor).

4. **Botões de editar/excluir da tela Ferramentas não funcionam.** Eles chamam
   `estoqueModule.editar/excluir`, que procura o item em `app.data.estoque` — mas os itens vêm
   de `app.data.ferramentas`. Resultado: clique sem efeito.

5. **Schemas inconsistentes entre CSV e telas:**
   - `ferramentas.csv` não tem `quantidadeAtual`/`status` → a tela Ferramentas mostra tudo com
     quantidade **0** e status "Indisponível".
   - `historico.csv` usa `acao/detalhes/responsavel`, mas a tela espera
     `operacao/quantidade/usuario` → histórico aparece cheio de "—".
   - `emprestimos.csv` usa `nomeFerramenta/dataEmprestimo/responsavel`, mas a tela espera
     `data/item/solicitante/quantidade` → mesma consequência.

6. **Busca sem normalização de acentos** ("hidraulica" não encontra "Hidráulica").

7. **Sem paginação** nas tabelas (vai pesar quando o histórico crescer).

8. `utils.parseCSV` é código morto (e quebrado para campos com vírgula entre aspas); o parser
   correto é `app._parseCSVLine`.

---

## 🟡 5. Qualidade e acabamento

- **Tailwind via Play CDN**: exige internet, é pesado e o próprio Tailwind não recomenda em
  produção. Gerar o CSS compilado (`tailwindcss -i ... -o styles.css --minify`).
- Indicador **"Saúde do Estoque"** usa `qtd/(qtd+mínimo)`, fórmula pouco intuitiva; melhor:
  `% de itens OK` ou `1 − (críticos + esgotados)/total`.
- `window.confirm()` nativo para excluir — substituir pelo modal já existente no app.
- Sem `README.md` nem `.gitignore`.
- Chart.js carregado sob demanda via CDN (ok, mas adicionar fallback/mensagem se offline).

---

## ✅ Roadmap (status de execução)

1. ✅ **Segurança:** senhas em texto puro removidas (hashes SHA-256 no lugar),
   gestão de usuários centralizada. *Ação da equipe: trocar as senhas padrão.*
2. ✅ **Base online:** URL do Apps Script unificada, sincronização paralela,
   cache persistente, re-sync pós-gravação, POST sem preflight CORS.
   *Ação da equipe: publicar no GitHub Pages (passo a passo no README).*
3. ✅ **CRUD de Empréstimos:** registrar, devolver, destacar atrasados.
4. ✅ **Tela Ferramentas** corrigida (CRUD próprio) e schemas CSV ↔ telas alinhados.
5. ✅ **Telas de Fornecedores, Pedidos e Usuários** (CRUD completo).
6. ⏳ **Versionar o código do Apps Script** no repo + `LockService`
   (contrato esperado documentado no README).
7. ⏳ **Autenticação server-side** (evolução futura, se necessário).
