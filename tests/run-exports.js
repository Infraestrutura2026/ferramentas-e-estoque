/**
 * tests/run-exports.js — Testes de relatórios e exportação CSV/Excel pt-BR (v2.7.1/v2.7.2)
 * ==================================================================================
 * Cobre:
 *   1. utils.ABAS_EXPORTAVEIS (8 abas, incluindo usuários)
 *   2. utils.escapeCsvValue / utils.buildCSV (RFC 4180, separador configurável)
 *   3. utils.metricasRelatorio (total / esgotados / críticos)
 *   4. utils.categoriaResumo (consolidação por categoria)
 *   5. Contrato no app.js (lote, relatório, guarda de administrador, BOM)
 *   6. Relatório padronizado (v2.7.1/v2.7.2): buildReportDoc, csv pt-BR (';'), docConsolidado
 *   7. Formatação pt-BR (datas dd/mm/aaaa, números com vírgula, colunas sensíveis)
 *   8. Contrato v2.7.1/v2.7.2 no app.js/index.html (prévia, Excel, badge honesto de cache)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const utils = require('../utils.js');

let passed = 0;
let failed = 0;
function ok(name, cond, msg = '') {
  if (cond) { console.log(`✔ ${name}`); passed++; }
  else { console.error(`✖ ${name}${msg ? ': ' + msg : ''}`); failed++; }
}

function read(p) {
  return fs.readFileSync(path.join(ROOT, p), 'utf8');
}

/* ═══ 1. Abas exportáveis ═══ */
const esperadas = ['estoque', 'ferramentas', 'emprestimos', 'movimentacoes', 'historico', 'fornecedores', 'pedidos', 'usuarios'];
ok('ABAS_EXPORTAVEIS tem as 8 abas do sistema', Array.isArray(utils.ABAS_EXPORTAVEIS) && utils.ABAS_EXPORTAVEIS.length === 8);
ok('ABAS_EXPORTAVEIS inclui usuarios', utils.ABAS_EXPORTAVEIS.includes('usuarios'));
ok('ABAS_EXPORTAVEIS é exatamente a lista oficial', JSON.stringify(utils.ABAS_EXPORTAVEIS) === JSON.stringify(esperadas));

// Configuração do sistema cobre as mesmas abas
const cfg = read('config.js');
const cfgAbas = ['estoque', 'ferramentas', 'movimentacoes', 'emprestimos', 'fornecedores', 'pedidos', 'usuarios', 'historico'];
ok('config.js não tem abas fora de ABAS_EXPORTAVEIS', cfgAbas.every(a => utils.ABAS_EXPORTAVEIS.includes(a)));

/* ═══ 2. CSV (RFC 4180, separador configurável) ═══ */
ok('escapeCsvValue mantém texto simples', utils.escapeCsvValue('Martelo') === 'Martelo');
ok('escapeCsvValue escapa vírgula', utils.escapeCsvValue('Chave, 10mm') === '"Chave, 10mm"');
ok('escapeCsvValue escapa aspas (duplica)', utils.escapeCsvValue('a"b') === '"a""b"');
ok('escapeCsvValue escapa quebra de linha', utils.escapeCsvValue('linha1\nlinha2') === '"linha1\nlinha2"');
ok('escapeCsvValue trata null/undefined como vazio', utils.escapeCsvValue(null) === '' && utils.escapeCsvValue(undefined) === '');
ok('escapeCsvValue com sep ";" escapa ponto-e-vírgula', utils.escapeCsvValue('a;b', ';') === '"a;b"');
ok('escapeCsvValue com sep ";" NÃO escapa vírgula solta', utils.escapeCsvValue('a,b', ';') === 'a,b');

const csv = utils.buildCSV(['id', 'nome', 'obs'], [
  [1, 'Martelo', 'cabo, madeira'],
  [2, 'Chave "Fixa"', 'ok'],
]);
const linhasEsperadas = ['id,nome,obs', '1,Martelo,"cabo, madeira"', '2,"Chave ""Fixa""",ok'];
ok('buildCSV gera cabeçalho + linhas com escape correto',
  csv.split('\n').join('|') === linhasEsperadas.join('|') && csv.normalize() === csv);
ok('buildCSV NÃO embute BOM (BOM só no download)', !csv.startsWith('﻿'));
ok('buildCSV retorna string vazia sem dados', utils.buildCSV([], []) === '');

// CSV pt-BR (v2.7.1/v2.7.2): separador ';' para abrir correto no Excel brasileiro
const csvBR = utils.buildCSVBR(['Nome', 'Obs'], [['Alicate', 'cabos; vermelhos'], ['Chave', 'ok']]);
ok('buildCSVBR usa separador ";"', csvBR.split('\n')[0] === 'Nome;Obs');
ok('buildCSVBR escapa valores com ";"', csvBR.includes('Alicate;"cabos; vermelhos"'));
ok('buildCSVBR respeita acentuação pt-BR', utils.buildCSVBR(['Categoria'], [['Hidráulica']]) === 'Categoria\nHidráulica');

/* ═══ 3. Métricas do relatório ═══ */
const estoque = [
  { categoria: 'Elétrica', quantidadeAtual: '0',  quantidadeMinima: '2' },  // esgotado
  { categoria: 'Elétrica', quantidadeAtual: '1',  quantidadeMinima: '2' },  // crítico
  { categoria: 'Elétrica', quantidadeAtual: '10', quantidadeMinima: '2' },  // ok
  { categoria: 'Hidráulica', quantidadeAtual: '3', quantidadeMinima: '5' }, // crítico
  { categoria: 'Ferramentas', quantidadeAtual: '5', quantidadeMinima: '1' },// ok
];
const m = utils.metricasRelatorio(estoque);
ok('metricasRelatorio total = 5', m.total === 5);
ok('metricasRelatorio esgotados = 1', m.esgotados === 1);
ok('metricasRelatorio críticos = 2', m.criticos === 2);
ok('metricasRelatorio trata estoque vazio', JSON.stringify(utils.metricasRelatorio([])) === JSON.stringify({ total: 0, esgotados: 0, criticos: 0 }));

/* ═══ 4. Consolidação por categoria ═══ */
const cats = utils.categoriaResumo(estoque);
const eletrica = cats.find(c => c.categoria === 'Elétrica');
ok('categoriaResumo agrega por categoria', cats.length === 3);
ok('categoriaResumo calcula itens/qtd/esgotados da Elétrica',
  eletrica.itens === 3 && eletrica.qtdTotal === 11 && eletrica.esgotados === 1);
ok('categoriaResumo ordena por nº de itens (desc)', cats[0].itens >= cats[1].itens && cats[1].itens >= cats[2].itens);
ok('categoriaResumo usa "Sem categoria" como fallback',
  utils.categoriaResumo([{ qualidade: 'x' }])[0].categoria === 'Sem categoria');

/* ═══ 5. Contrato no app.js (exportação pela prévia do relatório) ═══ */
const appJs = read('app.js');
ok('app.js usa utils.ABAS_EXPORTAVEIS nos relatórios', appJs.includes('utils.ABAS_EXPORTAVEIS'));
ok('app.js não tem lista hardcoded de 7 abas', !appJs.includes("['estoque', 'ferramentas', 'emprestimos', 'movimentacoes', 'historico', 'fornecedores', 'pedidos']"));
ok('app.js gera CSV via utils.buildCSVBR (padrão pt-BR ";")', appJs.includes('utils.buildCSVBR('));
ok('app.js não usa mais utils.buildCSV cru nas exportações', !appJs.includes('utils.buildCSV('));
ok('app.js passa TODAS as exportações pelo documento padronizado (buildReportDoc)', appJs.includes('buildReportDoc'));
ok('app.js adiciona BOM UTF-8 apenas no download', appJs.includes("new Blob(['\\uFEFF' + csv]"));
ok('app.js restringe exportação de usuários a admin', appJs.includes('_podeExportar') && appJs.includes('usuarios') && appJs.includes('authModule.isAdmin()'));
ok('app.js esconde botão de usuários para não-admin', appJs.includes('abasVisiveis = abasExportaveis.filter(a => this._podeExportar(a))'));
// v2.7.2: painel "Exportar Dados" removido — a prévia cobre CSV/Excel/impressão por relatório
ok('app.js removeu o painel Exportar Dados (sem duplicidade com a prévia)', !appJs.includes('Exportar Dados'));
ok('app.js removeu exportações em lote (_exportAllCSV/_exportAllXLSX)', !appJs.includes('_exportAllCSV') && !appJs.includes('_exportAllXLSX'));
ok('app.js removeu exports dedicados do consolidado (_exportRelatorioCSV/_exportRelatorioXLSX/_exportCSV)', !appJs.includes('_exportRelatorioCSV') && !appJs.includes('_exportRelatorioXLSX') && !appJs.includes('_exportCSV('));

/* ═══ 6. Relatório padronizado (v2.7.1/v2.7.2) ═══ */
const docEstoque = utils.buildReportDoc({
  aba: 'estoque', usuario: 'admin',
  dados: [
    { id: 'ea3ce453-900d', nome: 'Sifão pia 70 cm', categoria: 'Hidráulica', quantidadeAtual: '268', unidade: 'un', data: '2026-07-24' },
    { id: 'b71f0c22-11aa', nome: 'Chuveiro', categoria: 'Hidráulica', quantidadeAtual: '0', unidade: 'un', data: '2026-07-24' }
  ]
});
ok('buildReportDoc rotula colunas em pt-BR', docEstoque.colunas.map(c => c.rotulo).join('|') === 'Nome|Categoria|Qtd. Atual|Unid.|Data');
ok('buildReportDoc OCULTA a coluna ID (v2.7.2)', !docEstoque.colunas.some(c => c.key === 'id') && !docEstoque.colunas.some(c => c.rotulo === 'ID'));
ok('buildReportDoc marca coluna de quantidade como numérica', docEstoque.colunas[2].numerica === true && docEstoque.colunas[0].numerica === false);
ok('buildReportDoc formata data ISO para dd/mm/aaaa', docEstoque.linhasBR[0][4] === '24/07/2026');
ok('buildReportDoc mantém código/texto como texto puro (sem coluna ID)', docEstoque.linhasBR[0][0] === 'Sifão pia 70 cm');
ok('buildReportDoc linhas para Excel tipam números como Number',
  typeof docEstoque.linhasXLSX[0][2] === 'number' && docEstoque.linhasXLSX[0][2] === 268);
ok('buildReportDoc registra metadados (gerado por, total, título)',
  docEstoque.geradoPor === 'admin' && docEstoque.totalRegistros === 2 && docEstoque.titulo === 'Estoque' && /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/.test(docEstoque.geradoEmBR));
ok('buildReportDoc aceita dados vazios sem quebrar',
  utils.buildReportDoc({ aba: 'pedidos', dados: [] }).totalRegistros === 0);

const docCons = utils.docConsolidadoEstoque(estoque, 'oliveira');
ok('docConsolidadoEstoque monta documento a partir do resumo por categoria',
  docCons.aba === 'consolidado' && docCons.totalRegistros === 3 && docCons.colunas[0].rotulo === 'Categoria');
ok('docConsolidadoEstoque tem rótulos pt-BR no padrão do relatório',
  docCons.colunas.map(c => c.rotulo).includes('Esgotados') && docCons.geradoPor === 'oliveira');

ok('rotuloAba usa nomes oficiais', utils.rotuloAba('movimentacoes') === 'Movimentações de Estoque' && utils.rotuloAba('xyz') === 'Xyz');
ok('rotuloColuna cai em fallback camelCase', utils.rotuloColuna('campoNovo') === 'Campo Novo');

/* ═══ 7. Formatação pt-BR ═══ */
ok('isDataISO reconhece data e data+hora', utils.isDataISO('2026-07-24') && utils.isDataISO('2026-07-24T13:45:00') && !utils.isDataISO('F001'));
ok('formatDataBR data pura → dd/mm/aaaa', utils.formatDataBR('2026-07-24') === '24/07/2026');
ok('formatDataBR 13:45 → dd/mm/aaaa hh:mm', utils.formatDataBR('2026-07-24T13:45:00') === '24/07/2026 13:45');
ok('formatDataBR meia-noite ISO exibe só a data', utils.formatDataBR('2026-07-24T00:00:00') === '24/07/2026');
ok('numeroBR agrupa milhares com ponto', utils.numeroBR(1234567.8) === '1.234.567,8');
ok('numeroBR sem decimais desnecessários', utils.numeroBR('268') === '268');
ok('numeroBR força 2 casas para moeda', utils.numeroBR('150', 2) === '150,00');
ok('ehNumeroRelatorio protege CNPJ/telefone/código de milhar',
  !utils.ehNumeroRelatorio('14999988877', 'telefone') && !utils.ehNumeroRelatorio('12345678000199', 'cnpj') && utils.ehNumeroRelatorio('268', 'quantidadeAtual'));
ok('formatCellBR booleano → Sim/Não', utils.formatCellBR(true, 'ativo') === 'Sim' && utils.formatCellBR(false, 'ativo') === 'Não');
ok('formatCellBR moeda pt-BR (valorUnitario)', utils.formatCellBR('1250.5', 'valorUnitario') === '1.250,50');
ok('formatCellBR telefone permanece intacto', utils.formatCellBR('14999988877', 'telefone') === '14999988877');

/* ═══ 8. Contrato v2.7.1/v2.7.2: prévia, Excel, badge honesto de cache e painel de exportação removido ═══ */
ok('app.js implementa prévia de relatório (_gerarPreviaRelatorio/_docHtml)', appJs.includes('_gerarPreviaRelatorio()') && appJs.includes('_docHtml(doc)'));
ok('app.js prévia tem ações csv/xlsx/print no documento (_relatorioAtualAcao)', appJs.includes("_relatorioAtualAcao('xlsx')") && appJs.includes("acao === 'print'"));
ok('app.js implementa impressão fiel do documento (_imprimirDoc + printing-report)', appJs.includes('_imprimirDoc()') && appJs.includes('printing-report'));
ok('app.js implementa Excel pelo documento da prévia (_downloadXLSX)', appJs.includes('_downloadXLSX('));
ok('app.js Excel tem fallback quando SheetJS não carrega', appJs.includes("typeof XLSX === 'undefined'"));
ok('app.js Excel sanitiza nomes de folha (31 chars, sem caracteres inválidos)', appJs.includes('slice(0, 31)') && appJs.includes("replace(/[\\\\/?*\\[\\]:]/g, ' ')"));

const html = read('index.html');
ok('index.html carrega SheetJS (xlsx.full.min.js)', html.includes('cdn.sheetjs.com') && html.includes('xlsx.full.min.js'));
ok('index.html tem raiz dedicada à impressão do relatório (#report-print-root)', html.includes('#report-print-root'));
ok('index.html exibe v2.7.6', html.includes('v2.7.6'));
ok('index.html login split-screen (painel institucional + card de acesso)', html.includes('login-brand') && html.includes('Acesse o sistema'));
ok('index.html login mantém ids/contrato do authModule (login-user/login-pass/login-btn/login-error)', ['login-user', 'login-pass', 'login-btn', 'login-error', 'authModule.doLogin()'].every(id => html.includes(id)));

// v2.7.3: painel institucional — brasão em marca d'água + título em caixa alta, sem marca do topo nem lista de destaques
ok('index.html usa brasão da Polícia Penal SP em marca d\'água (v2.7.3)', html.includes('assets/brasao-policia-penal-sp.png'));
ok('index.html título institucional em destaque (v2.7.3)', html.includes('Gestão de Estoque') && html.includes('Controle de Ferramentas') && html.includes('uppercase'));
ok('index.html mantém linha do Complexo Penal de Marília (v2.7.3)', html.includes('Complexo Penal de Marília — Núcleo de Infraestrutura e Logística'));
ok('index.html sem marca "Ferramentas & Estoque / Polícia Penal" no topo do painel (v2.7.3)', !html.includes('<p class="text-sm font-bold tracking-wide">Ferramentas &amp; Estoque</p>'));
ok('index.html sem lista de 3 destaques no painel (v2.7.3)', !html.includes('Controle de estoque com alertas de mínimo e esgotados') && !html.includes('Empréstimos e devoluções de ferramentas com histórico'));

// v2.7.4: painel teal vivo, bloco do título centralizado e crédito InfraTech só no rodapé do card
const idxPainel = html.indexOf('login-brand');
const idxForm = html.indexOf('Lado do formulário');
const painelLogin = idxPainel >= 0 && idxForm > idxPainel ? html.slice(idxPainel, idxForm) : '';
const ocorrenciasZanoni = html.split('ZANONI &amp; MARTINEZ InfraTech').length - 1;
ok('index.html painel institucional em teal vivo (gradiente #0f766e → #134e4a)', html.includes('#0f766e') && html.includes('#134e4a'));
ok('index.html bloco do título centralizado no painel (justify-center + items-center + text-center)', /login-brand[^"]*justify-center/.test(html) && /login-brand[^"]*items-center/.test(html) && /login-brand[^"]*text-center/.test(html));
ok('index.html traço decorativo centralizado (flex flex-col items-center no miolo do painel)', painelLogin.includes('flex flex-col items-center'));
ok('index.html painel sem crédito "ZANONI & MARTINEZ InfraTech" (permanece só no rodapé do card de acesso)', painelLogin.length > 0 && !painelLogin.includes('ZANONI') && ocorrenciasZanoni === 1);
ok('index.html textos do painel com sombra suave (legibilidade sobre o brasão)', html.includes('text-shadow') && painelLogin.includes('text-teal-100'));
ok('index.html tem badge de versão dinâmico (data-app-version, sem hard-code)', html.includes('data-app-version'));

// Badge/cache honestos (v2.7.1/v2.7.2): dados locais nunca se passam por sincronizados
ok('app.js rastreia fonte real dos dados por aba (fetchSources)', appJs.includes('this.fetchSources[aba]'));
ok('app.js badge usa estado localOnly (Dados locais vs Sincronizado)', appJs.includes('this.localOnly'));
ok('app.js NÃO renova cache_timestamp no beforeunload (bug do TTL mascarando dados velhos)',
  !appJs.includes("window.addEventListener('beforeunload'"));
ok('app.js só renova cache_timestamp quando alguma aba veio do servidor', appJs.includes('veioDoServidor'));

console.log(`\n${'█'.repeat(46)}`);
console.log(`  EXPORTS: ${passed} passaram, ${failed} falharam (${passed + failed} total)`);
console.log('█'.repeat(46));
process.exit(failed ? 1 : 0);
