/**
 * tests/run-exports.js — Testes de relatórios e exportação CSV/Excel pt-BR (v3.0.0)
 * ==================================================================================
 * Cobre:
 *   1. utils.ABAS_EXPORTAVEIS (8 abas, incluindo usuários)
 *   2. utils.escapeCsvValue / utils.buildCSV (RFC 4180, separador configurável)
 *   3. utils.metricasRelatorio (total / esgotados / críticos)
 *   4. utils.categoriaResumo (consolidação por categoria)
 *   5. Contrato no app.js (lote, relatório, guarda de administrador, BOM)
 *   6. Relatório padronizado (v3.0.0): buildReportDoc, csv pt-BR (';'), docConsolidado
 *   7. Formatação pt-BR (datas dd/mm/aaaa, números com vírgula, colunas sensíveis)
 *   8. Contrato v3.0.0 no app.js/index.html (prévia, Excel, badge honesto de cache)
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

// CSV pt-BR (v3.0.0): separador ';' para abrir correto no Excel brasileiro
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
ok('metricasRelatorio total = 5', m.total === 5 && utils.indicadoresResumo(estoque, []).totalItens === 5);
ok('metricasRelatorio esgotados = 1', m.esgotados === 1 && utils.statusEstoque(estoque[0]) === 'Esgotado');
ok('metricasRelatorio críticos = 2', m.criticos === 2 && utils.statusEstoque(estoque[1]) === 'Crítico');
ok('metricasRelatorio trata estoque vazio', JSON.stringify(utils.metricasRelatorio([])) === JSON.stringify({ total: 0, esgotados: 0, criticos: 0 }) && utils.indicadoresResumo([], []).emprestimosAtivos === 0);

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
ok('app.js oferece os relatórios gerenciais no seletor (v3.1 inclui reposição e ferramentas)',
  ['estoque-atual', 'inventario-fisico', 'reposicao', 'consolidado', 'ferramentas', 'historico', 'emprestimos-ativos', 'atrasados'].every(fonte => appJs.includes(`value="${fonte}"`)));
ok('app.js mostra a contagem de registros em cada opção do seletor (v3.1)', appJs.includes('rotuloOpcao(') && appJs.includes('contagensRelatorios'));
ok('app.js desabilita opção sem registros e escolhe a primeira com base (v3.1)',
  appJs.includes('desabilitado(') && appJs.includes('_primeiraFonteRelatorio') && appJs.includes("'disabled'"));
ok('app.js tem filtro próprio por relatório (estoque, ferramentas e histórico)', appJs.includes('_alternarFiltroRelatorio()') && appJs.includes('rel-ferramentas-filtro') && appJs.includes('rel-estoque-filtro'));
ok('app.js não encaminha mais o histórico só de movimentações', !appJs.includes('utils.historicoMovimentacao('));
ok('app.js não tem lista hardcoded de 7 abas', !appJs.includes("['estoque', 'ferramentas', 'emprestimos', 'movimentacoes', 'historico', 'fornecedores', 'pedidos']"));
ok('app.js gera CSV via utils.buildCSVBR (padrão pt-BR ";")', appJs.includes('utils.buildCSVBR('));
ok('app.js não usa mais utils.buildCSV cru nas exportações', !appJs.includes('utils.buildCSV('));
ok('app.js encaminha a prévia para as funções gerenciais padronizadas (v3.1)',
  ['relatorioEstoqueAtual', 'relatorioInventarioFisico', 'relatorioReposicao', 'relatorioConsolidado', 'relatorioFerramentas', 'relatorioHistorico', 'relatorioEmprestimosAtivos', 'relatorioAtrasados'].every(funcao => appJs.includes(`utils.${funcao}`)));
ok('app.js adiciona BOM UTF-8 apenas no download', appJs.includes("new Blob(['\\uFEFF' + csv]"));
ok('app.js restringe exportação de usuários a admin', appJs.includes('_podeExportar') && appJs.includes('usuarios') && appJs.includes('authModule.isAdmin()'));
ok('app.js não expõe usuários no menu de relatórios gerenciais', !appJs.includes('value="usuarios"') && appJs.includes('_podeExportar'));
// v2.7.2: painel "Exportar Dados" removido — a prévia cobre CSV/Excel/impressão por relatório
ok('app.js removeu o painel Exportar Dados (sem duplicidade com a prévia)', !appJs.includes('Exportar Dados'));
ok('app.js removeu exportações em lote (_exportAllCSV/_exportAllXLSX)', !appJs.includes('_exportAllCSV') && !appJs.includes('_exportAllXLSX'));
ok('app.js removeu exports dedicados do consolidado (_exportRelatorioCSV/_exportRelatorioXLSX/_exportCSV)', !appJs.includes('_exportRelatorioCSV') && !appJs.includes('_exportRelatorioXLSX') && !appJs.includes('_exportCSV('));

/* ═══ 6. Relatório padronizado (v3.0.0) ═══ */
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
const hojeOriginal = utils.today;
utils.today = () => '2026-09-01';
const emprestimosRelatorio = [
  { nomeFerramenta: 'Furadeira', responsavel: 'Ana', setor: 'Oficina', quantidade: '2', status: 'Ativo', dataEmprestimo: '2026-08-25', previsaoDevolucao: '2026-08-30' },
  { nomeFerramenta: 'Alicate', responsavel: 'Bruno', setor: 'Manutenção', quantidade: '1', status: 'Ativo', dataEmprestimo: '2026-08-31', previsaoDevolucao: '2026-09-04' },
  { nomeFerramenta: 'Serra', responsavel: 'Carla', setor: 'Oficina', quantidade: '1', status: 'Devolvido', dataEmprestimo: '2026-08-20', previsaoDevolucao: '2026-08-25' }
];
const docAtual = utils.relatorioEstoqueAtual(estoque, 'oliveira');
const docAtivos = utils.relatorioEmprestimosAtivos(emprestimosRelatorio, 'oliveira');
const docAtrasados = utils.relatorioAtrasados(emprestimosRelatorio, 'oliveira');
const docHistorico = utils.historicoMovimentacao([
  { data: '2026-08-31', tipo: 'Entrada', item: 'Cimento', quantidade: '20', local: 'Depósito', usuario: 'admin' },
  { data: '2026-08-30', tipo: 'Saída', item: 'Tinta', quantidade: '3', local: 'Oficina', usuario: 'ana' }
], 'entradas', 'oliveira');
utils.today = hojeOriginal;
ok('docConsolidadoEstoque monta documento a partir do resumo por categoria',
  docCons.aba === 'consolidado' && docCons.totalRegistros === 3 && docCons.colunas[0].rotulo === 'Categoria' && docAtual.totalRegistros === 5 && docAtual.linhasBR[0].at(-1) === 'Esgotado');
ok('docConsolidadoEstoque tem rótulos pt-BR no padrão do relatório',
  docCons.colunas.map(c => c.rotulo).includes('Esgotados') && docCons.geradoPor === 'oliveira' && docAtivos.totalRegistros === 2 && docAtivos.linhasBR[0].at(-1) === 'Atrasado (2 dias)');

/* ── Estoque Atual: fornecedor e valor unitário (novas colunas do cadastro) ── */
{
  const comForn = [
    { nome: 'Cimento CP-II 50kg', categoria: 'Construção', quantidadeAtual: '12', quantidadeMinima: '4', unidade: 'sc', local: 'Depósito', fornecedor: 'Casa do Construtor', valorUnitario: '48,90', codigo: 'CIM50' },
    { nome: 'Tubo PVC 25mm', categoria: 'Hidráulica', quantidadeAtual: '5', quantidadeMinima: '1', unidade: 'm', local: '', fornecedor: '', valorUnitario: '' }
  ];
  const docForn = utils.relatorioEstoqueAtual(comForn, 'admin');
  const chaves = docForn.colunas.map(c => c.key);
  ok('relatório Estoque Atual inclui Fornecedor e Valor Unit.',
    chaves.includes('fornecedor') && chaves.includes('valorUnitario') &&
    docForn.colunas.map(c => c.rotulo).includes('Fornecedor') &&
    docForn.colunas.map(c => c.rotulo).includes('Valor Unit. (R$)'), chaves.join(','));
  ok('relatório normaliza o valor para número e mantém o padrão pt-BR',
    docForn.linhasBR[0][chaves.indexOf('valorUnitario')] === '48,90' &&
    docForn.linhasXLSX[0][chaves.indexOf('valorUnitario')] === 48.9,
    JSON.stringify(docForn.linhasBR[0]));
  ok('item sem valor unitário fica com a célula vazia (não vira R$ 0,00)',
    docForn.linhasBR[1][chaves.indexOf('valorUnitario')] === '' &&
    docForn.linhasBR[1][chaves.indexOf('fornecedor')] === '', JSON.stringify(docForn.linhasBR[1]));
}

ok('rotuloAba usa nomes oficiais', utils.rotuloAba('movimentacoes') === 'Movimentações de Estoque' && utils.rotuloAba('xyz') === 'Xyz' && docAtrasados.totalRegistros === 1 && docAtrasados.linhasBR[0][6] === '2');
ok('rotuloColuna cai em fallback camelCase', utils.rotuloColuna('campoNovo') === 'Campo Novo' && utils.rotuloColuna('diasAtraso') === 'Dias de Atraso' && docHistorico.totalRegistros === 1 && docHistorico.linhasBR[0][1] === 'Entrada');

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

/* ═══ 8. Contrato v3.0.0: prévia, Excel, badge honesto de cache e painel de exportação removido ═══ */
ok('app.js implementa prévia de relatório (_gerarPreviaRelatorio/_docHtml)', appJs.includes('_gerarPreviaRelatorio()') && appJs.includes('_docHtml(doc)'));
ok('app.js prévia tem ações csv/xlsx/print no documento (_relatorioAtualAcao)', appJs.includes("_relatorioAtualAcao('xlsx')") && appJs.includes("acao === 'print'"));
ok('app.js implementa impressão fiel do documento (_imprimirDoc + printing-report)', appJs.includes('_imprimirDoc()') && appJs.includes('printing-report'));
ok('app.js implementa Excel pelo documento da prévia (_downloadXLSX)', appJs.includes('_downloadXLSX('));
ok('app.js Excel tem fallback quando SheetJS não carrega', appJs.includes("typeof XLSX === 'undefined'"));
ok('app.js Excel sanitiza nomes de folha (31 chars, sem caracteres inválidos)', appJs.includes('slice(0, 31)') && appJs.includes("replace(/[\\\\/?*\\[\\]:]/g, ' ')"));

const html = read('index.html');
ok('index.html carrega SheetJS (xlsx.full.min.js)', html.includes('cdn.sheetjs.com') && html.includes('xlsx.full.min.js'));
ok('index.html tem raiz dedicada à impressão do relatório (#report-print-root)', html.includes('#report-print-root'));
ok('index.html dá largura de escrita à coluna Contagem na tela e na impressão (v3.2.1)',
  /#report-print-root \[data-col="contagem"\]/.test(html) && /min-width/.test(html));
ok('index.html exibe v3.0.0', html.includes('v3.0.0'));
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

// Badge/cache honestos (v3.0.0): dados locais nunca se passam por sincronizados
ok('app.js rastreia fonte real dos dados por aba (fetchSources)', appJs.includes('this.fetchSources[aba]'));
ok('app.js badge usa estado localOnly (Dados locais vs Sincronizado)', appJs.includes('this.localOnly'));
ok('app.js NÃO renova cache_timestamp no beforeunload (bug do TTL mascarando dados velhos)',
  !appJs.includes("window.addEventListener('beforeunload'"));
ok('app.js só renova cache_timestamp quando alguma aba veio do servidor', appJs.includes('veioDoServidor'));


/* ═══ 9. Relatórios essenciais (v3.1): filtros, reposição, ferramentas e histórico unificado ═══ */

const estoqueV31 = [
  { nome: 'Cimento CP-II 50kg', categoria: 'Construção', quantidadeAtual: '20', quantidadeMinima: '5', unidade: 'sc' },
  { nome: 'Cimento CP-II 50kg', categoria: 'Construção', quantidadeAtual: '0', quantidadeMinima: '5', unidade: 'sc' },
  { nome: 'Disjuntor 1x16A', categoria: 'Elétrica', quantidadeAtual: '4', quantidadeMinima: '4', unidade: 'un' },
  { nome: 'Tubo PVC 25mm', categoria: 'Hidráulica', quantidadeAtual: '30', quantidadeMinima: '', unidade: 'm' },
  { nome: 'Areia média', categoria: 'Construção', quantidadeAtual: '2', quantidadeMinima: '10', unidade: 'm³', fornecedor: 'Casa do Construtor', valorUnitario: '120,00' }
];

ok('filtrarEstoque todos devolve tudo', utils.filtrarEstoque(estoqueV31, 'todos').length === 5);
ok('filtrarEstoque criticos pega esgotados + críticos', utils.filtrarEstoque(estoqueV31, 'criticos').length === 3);
ok('filtrarEstoque reposicao exige mínimo cadastrado (não inclui "sem mínimo")',
  utils.filtrarEstoque(estoqueV31, 'reposicao').length === 3 &&
  utils.filtrarEstoque(estoqueV31, 'reposicao').every(i => utils.quantidadeNumerica(i.quantidadeMinima) > 0));
ok('filtrarEstoque semMinimo lista quem está fora do alerta', utils.filtrarEstoque(estoqueV31, 'semMinimo').length === 1);
ok('filtrarEstoque regulares lista o que está acima do mínimo', utils.filtrarEstoque(estoqueV31, 'regulares').length === 2);

const docFiltrado = utils.relatorioEstoqueAtual(estoqueV31, 'admin', 'criticos');
ok('relatorioEstoqueAtual aplica o filtro e registra no título',
  docFiltrado.totalRegistros === 3 && docFiltrado.titulo.includes('Somente críticos e esgotados'));
ok('relatorioEstoqueAtual sem filtro mantém todos os itens',
  utils.relatorioEstoqueAtual(estoqueV31, 'admin').totalRegistros === 5);

// Colunas 100% vazias saem do documento; a decisão usa a base COMPLETA (não o recorte filtrado)
const docComLocal = utils.relatorioEstoqueAtual([
  { nome: 'A', quantidadeAtual: '1', quantidadeMinima: '1', local: 'Depósito' },
  { nome: 'B', quantidadeAtual: '9', quantidadeMinima: '1', local: '' }
], 'admin');
ok('buildReportDoc oculta coluna 100% vazia (fornecedor/valor unitário)',
  !docComLocal.colunas.some(c => c.key === 'fornecedor') && !docComLocal.colunas.some(c => c.key === 'valorUnitario'));
ok('buildReportDoc mantém coluna parcialmente preenchida (local em 1 de 2 itens)',
  docComLocal.colunas.some(c => c.key === 'local'));
ok('buildReportDoc com ocultarVazias:false mantém todas as colunas pedidas',
  utils.buildReportDoc({ aba: 'x', dados: [{ a: '1', b: '' }], colunas: ['a', 'b'], ocultarVazias: false }).colunas.length === 2);

// Demanda: saídas depois da última entrada (casa o nome ignorando acento/caixa/pontuação)
const movV31 = [
  { data: '2026-08-01', tipo: 'Entrada', item: 'CIMENTO CP-II 50KG', quantidade: '100' },
  { data: '2026-08-10', tipo: 'Saída', item: 'Cimento CP-II 50kg', quantidade: '20' },
  { data: '2026-08-20', tipo: 'Saída', item: 'cimento cp-ii 50 kg', quantidade: '5' },
  { data: '2026-08-25', tipo: 'Saída', item: 'Areia média', quantidade: '8' },
  { data: '2026-08-26', tipo: 'Entrada', item: 'Areia média', quantidade: '50' },
  { data: '2026-08-27', tipo: 'Saída', item: 'Areia média', quantidade: '3' }
];
const demanda = utils.demandaDesdeUltimaEntrada(movV31);
ok('demandaDesdeUltimaEntrada soma as saídas após a última entrada', demanda.cimentocpii50kg === 25 && demanda.areiamedia === 3);
ok('demandaDesdeUltimaEntrada ignora movimentação sem item',
  Object.keys(utils.demandaDesdeUltimaEntrada([{ tipo: 'Saída', quantidade: '2' }])).length === 0);

const docRepos = utils.relatorioReposicao(estoqueV31, 'admin', movV31);
ok('relatorioReposicao lista só itens no/abaixo do mínimo', docRepos.totalRegistros === 3 && docRepos.aba === 'reposicao');
const linhaCimento = docRepos.linhasBR.find(l => l[0] === 'Cimento CP-II 50kg');
const linhaDisjuntor = docRepos.linhasBR.find(l => l[0] === 'Disjuntor 1x16A');
ok('relatorioReposicao sugere repor com base no consumo comprovado (mínimo 5 + 25 saídas − 0)',
  linhaCimento.includes('30') && linhaCimento.includes('Saídas (25)'), linhaCimento.join(' | '));
ok('relatorioReposicao NÃO inventa compra sem consumo registrado (origem "Mínimo", sugestão vazia)',
  linhaDisjuntor.includes('Mínimo') && !linhaDisjuntor.includes('4') === false && linhaDisjuntor[5] === '', linhaDisjuntor.join(' | '));

const { taxa, janelaMeses, fim, inicio } = utils.taxaConsumoMensal(movV31, 3, '2026-09-30');
ok('taxaConsumoMensal soma o consumo da janela e divide pelos 3 meses',
  Math.abs(taxa.cimentocpii50kg - 25 / 3) < 0.001 && Math.abs(taxa.areiamedia - 11 / 3) < 0.001);
ok('taxaConsumoMensal ancora a janela na data mais recente conhecida (base parada não infla o consumo)',
  janelaMeses === 3 && fim === '2026-09-30' && inicio === '2026-07-30');
ok('taxaConsumoMensal ignora saída fora da janela (não infla a média)',
  (utils.taxaConsumoMensal([
    { data: '2026-01-05', tipo: 'Saída', item: 'Areia média', quantidade: '500' },
    { data: '2026-08-25', tipo: 'Saída', item: 'Areia média', quantidade: '9' }
  ], 3, '2026-08-25').taxa.areiamedia || 0) === 3);

const ferramentasV31 = [
  { codigo: 'F002', nome: 'Furadeira', categoria: 'Elétrica', estado: 'Disponível' },
  { codigo: 'F001', nome: 'Lixadeira', categoria: 'Elétrica', estado: 'Manutenção' },
  { codigo: 'F003', nome: 'Serra', categoria: 'Mecânica', estado: 'Defeito' },
  { codigo: 'F004', nome: 'Chave', categoria: 'Mecânica', estado: 'Em uso' }
];
const docFerr = utils.relatorioFerramentas(ferramentasV31, 'admin');
ok('relatorioFerramentas monta o inventário e prioriza o que exige ação',
  docFerr.totalRegistros === 4 && docFerr.linhasBR[0][3] === 'Defeito' && docFerr.linhasBR[3][3] === 'Disponível');
ok('relatorioFerramentas filtra por situação e registra no título',
  utils.relatorioFerramentas(ferramentasV31, 'admin', 'manutencao').totalRegistros === 2 &&
  utils.relatorioFerramentas(ferramentasV31, 'admin', 'manutencao').titulo.includes('Em manutenção ou com defeito') &&
  utils.relatorioFerramentas(ferramentasV31, 'admin', 'disponiveis').totalRegistros === 1 &&
  utils.relatorioFerramentas(ferramentasV31, 'admin', 'indisponiveis').totalRegistros === 3);
ok('relatorioFerramentas oculta colunas vazias (local/responsável)',
  !docFerr.colunas.some(c => c.key === 'local') && docFerr.colunas.some(c => c.key === 'codigo'));

const resumoV31 = utils.resumoCategorias(estoqueV31);
const construcao = resumoV31.find(c => c.categoria === 'Construção');
ok('resumoCategorias soma críticos, esgotados e % do total',
  construcao.itens === 3 && construcao.criticos === 1 && construcao.esgotados === 1 && construcao.percentual === '60%');
ok('resumoCategorias conta itens sem mínimo (fora do alerta)', construcao.semMinimo === 0 && resumoV31.find(c => c.categoria === 'Hidráulica').semMinimo === 1);
ok('resumoCategorias soma o valor em estoque quando há preço (2 × R$ 120,00)',
  resumoV31.find(c => c.categoria === 'Construção').valor === 240 && resumoV31.find(c => c.categoria === 'Hidráulica').valor === 0);
ok('resumoCategorias deixa o valor VAZIO quando nenhum item tem preço',
  utils.resumoCategorias([{ categoria: 'X', quantidadeAtual: '2', quantidadeMinima: '1' }])[0].valor === '');
const docConsolidadoV31 = utils.relatorioConsolidado(estoqueV31, 'admin');
ok('relatorioConsolidado traz críticos, % do total e sem mínimo (esgotados deixam de ser a única leitura)',
  docConsolidadoV31.aba === 'consolidado' &&
  docConsolidadoV31.colunas.map(c => c.rotulo).includes('Críticos') &&
  docConsolidadoV31.colunas.map(c => c.rotulo).includes('% do total') &&
  docConsolidadoV31.colunas.map(c => c.rotulo).includes('Sem mínimo'));
ok('relatorioConsolidado traz a coluna de valor quando há preço e a omite quando não há',
  docConsolidadoV31.colunas.some(c => c.key === 'valor') &&
  !utils.relatorioConsolidado([{ categoria: 'X', quantidadeAtual: '2', quantidadeMinima: '1' }], 'admin').colunas.some(c => c.key === 'valor'));

/* ── Ficha de inventário físico (v3.2.1): coluna de contagem em branco para escrever à mão ── */
const estoqueFicha = [
  { nome: 'Zinco', categoria: 'Zeta', quantidadeAtual: '7', unidade: 'un' },
  { nome: 'Ácido', categoria: 'Alfa', quantidadeAtual: '3', unidade: 'L' },
  { nome: 'Base', categoria: 'Alfa', quantidadeAtual: '0', quantidadeMinima: '2', unidade: 'un' }
];
const docFicha = utils.relatorioInventarioFisico(estoqueFicha, 'admin');
ok('ficha de inventário mantém a coluna Contagem MESMO vazia (é para preencher à mão)',
  docFicha.colunas.some(c => c.key === 'contagem') && docFicha.colunas.map(c => c.rotulo).includes('Contagem'));
ok('ficha de inventário sai com a coluna Contagem em branco em todas as linhas',
  docFicha.linhasBR.every(l => l[docFicha.colunas.findIndex(c => c.key === 'contagem')] === '') &&
  docFicha.linhasXLSX.every(l => l[docFicha.colunas.findIndex(c => c.key === 'contagem')] === ''));
ok('ficha de inventário ordena por categoria e nome (acompanha a prateleira)',
  JSON.stringify(docFicha.linhasBR.map(l => l[0])) === JSON.stringify(['Ácido', 'Base', 'Zinco']));
ok('ficha de inventário mostra a Qtd. Sistema e omite o que está vazio (local)',
  docFicha.linhasBR[0][docFicha.colunas.findIndex(c => c.key === 'quantidadeSistema')] === '3' &&
  !docFicha.colunas.some(c => c.key === 'local'));
ok('ficha de inventário traz instruções para imprimir no próprio documento',
  /Contagem/.test(docFicha.instrucoes) && /Qtd\. Sistema/.test(docFicha.instrucoes));
ok('ficha de inventário aceita o mesmo filtro de situação do estoque e registra no título',
  utils.relatorioInventarioFisico(estoqueFicha, 'admin', 'criticos').totalRegistros === 1 &&
  utils.relatorioInventarioFisico(estoqueFicha, 'admin', 'criticos').titulo.includes('Somente críticos e esgotados') &&
  utils.relatorioInventarioFisico(estoqueFicha, 'admin', 'todos').totalRegistros === 3);
ok('ficha de inventário com estoque vazio não quebra',
  utils.relatorioInventarioFisico([], 'admin').totalRegistros === 0);
ok('buildReportDoc sem manterVazias descarta coluna sem valor (comportamento preservado)',
  !utils.buildReportDoc({ aba: 'x', dados: [{ a: '1', b: '' }], colunas: ['a', 'b'] }).colunas.some(c => c.key === 'b') &&
  utils.buildReportDoc({ aba: 'x', dados: [{ a: '1', b: '' }], colunas: ['a', 'b'], manterVazias: ['b'] }).colunas.some(c => c.key === 'b'));
ok('buildReportDoc com colunas fixas marca a coluna de contagem como text', (() => {
  const d = utils.buildReportDoc({ aba: 'x', dados: [{ a: '1', b: '' }], colunas: ['a', 'b'], manterVazias: ['b'] });
  return d.colunas[1].numerica === false && d.colunasOmitidas.length === 0;
})());

const dadosHist = {
  historico: [{ data: '2026-07-24', acao: 'Manutenção', item: 'Lixadeira', detalhes: 'Trocar rolamento', responsavel: 'Infraestrutura' }],
  movimentacoes: [
    { data: '2026-08-05', tipo: 'Entrada', item: 'Cimento', quantidade: '20', usuario: 'admin' },
    { data: '2026-08-03', tipo: 'Saída', item: 'Tinta', quantidade: '2', usuario: 'ana' }
  ],
  pedidos: [{ data: '2026-07-30', item: 'Broca', quantidade: '10', solicitante: 'Osvaldo', status: 'Pendente' }],
  emprestimos: []
};
const docHistV31 = utils.relatorioHistorico(dadosHist, 'admin');
ok('relatorioHistorico une as quatro fontes do menu Histórico (v3.1)', docHistV31.totalRegistros === 4);
ok('relatorioHistorico mostra o rótulo amigável da origem, não a chave crua',
  docHistV31.linhasBR.some(l => l.includes('Movimentações de Estoque')) && !docHistV31.linhasBR.some(l => l.includes('movimentacoes')));
ok('relatorioHistorico filtra entradas/saídas/manutenções',
  utils.relatorioHistorico(dadosHist, 'admin', 'entradas').totalRegistros === 1 &&
  utils.relatorioHistorico(dadosHist, 'admin', 'saidas').totalRegistros === 2 &&
  utils.relatorioHistorico(dadosHist, 'admin', 'manutencao').totalRegistros === 1);
ok('categoriaMovimento classifica pedido/empréstimo como saída e manutenção à parte',
  utils.categoriaMovimento({ acao: 'Pedido — Pendente' }) === 'saida' &&
  utils.categoriaMovimento({ acao: 'Empréstimo' }) === 'saida' &&
  utils.categoriaMovimento({ acao: 'Manutenção' }) === 'manutencao' &&
  utils.categoriaMovimento({ acao: 'Devolução' }) === 'entrada');

// Invariante: nenhum documento pode sair com linha de tamanho diferente das colunas
// (a mesma lista alimenta tela, CSV, Excel e impressão).
const emprestimosV31 = [{ nomeFerramenta: 'Furadeira', responsavel: 'Ana', setor: 'Oficina', quantidade: '1', status: 'Ativo', dataEmprestimo: '2026-08-01', previsaoDevolucao: '2026-08-10' }];
const documentosV31 = [
  utils.relatorioEstoqueAtual(estoqueV31, 'admin'),
  utils.relatorioEstoqueAtual(estoqueV31, 'admin', 'reposicao'),
  utils.relatorioReposicao(estoqueV31, 'admin', movV31),
  utils.relatorioConsolidado(estoqueV31, 'admin'),
  utils.relatorioFerramentas(ferramentasV31, 'admin'),
  utils.relatorioFerramentas(ferramentasV31, 'admin', 'manutencao'),
  utils.relatorioHistorico(dadosHist, 'admin', 'saidas'),
  utils.relatorioEmprestimosAtivos(emprestimosV31, 'admin'),
  utils.relatorioAtrasados(emprestimosV31, 'admin')
];
ok('todo documento sai com linhas do tamanho exato das colunas (tela, CSV e Excel)',
  documentosV31.every(doc =>
    doc.linhasBR.every(l => l.length === doc.colunas.length) &&
    doc.linhasXLSX.every(l => l.length === doc.colunas.length) &&
    doc.colunas.length > 0));
ok('nenhum documento repete o identificador técnico nem vaza o id',
  documentosV31.every(doc => !doc.colunas.some(c => c.key === 'id')));

const contagensV31 = utils.contagensRelatorios({ estoque: estoqueV31, ferramentas: ferramentasV31, movimentacoes: movV31, historico: dadosHist.historico, pedidos: dadosHist.pedidos, emprestimos: [] });
ok('contagensRelatorios informa o que cada opção tem hoje',
  contagensV31['estoque-atual'] === 5 && contagensV31.reposicao === 3 && contagensV31.consolidado === 3 &&
  contagensV31.ferramentas === 4 && contagensV31.historico === 8 && contagensV31['emprestimos-ativos'] === 0 && contagensV31.atrasados === 0 &&
  contagensV31['inventario-fisico'] === 5 && contagensV31['estoque-atual'] === contagensV31['inventario-fisico']);


/* ═══ 10. Tela de Relatórios renderizada (mesmo app.js do navegador) ═══ */
{
  const vm = require('vm');
  const elementos = {};
  const elStub = id => {
    if (!elementos[id]) elementos[id] = { id, innerHTML: '', value: '', classList: { add() {}, remove() {}, toggle() {} }, scrollIntoView() {} };
    return elementos[id];
  };
  const sandbox = {
    console,
    utils,
    CONFIG: { ORGAO: 'COMPLEXO PENAL DE MARÍLIA — POLÍCIA PENAL', VERSAO: '3.0.0' },
    document: {
      addEventListener() {},
      getElementById(id) { return /^rel-/.test(id) ? elStub(id) : null; },
      querySelectorAll() { return []; },
      readyState: 'complete'
    },
    window: { addEventListener() {} },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    fetch: () => Promise.reject(new Error('offline no teste')),
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
    AbortController, URLSearchParams, TextEncoder, Date, confirm: () => true, alert() {}
  };
  vm.createContext(sandbox);
  vm.runInContext(appJs + '\n;this.app = app;', sandbox, { filename: 'app.js' });
  const app = sandbox.app;
  app.showToast = () => {};
  app.data = {
    estoque: [
      { nome: 'Cimento', categoria: 'Construção', quantidadeAtual: '20', quantidadeMinima: '5', unidade: 'sc' },
      { nome: 'Areia', categoria: 'Construção', quantidadeAtual: '2', quantidadeMinima: '10', unidade: 'm³' },
      { nome: 'Zinco', categoria: 'Zeta', quantidadeAtual: '7', unidade: 'un' }
    ],
    ferramentas: [{ codigo: 'F001', nome: 'Lixadeira', categoria: 'Elétrica', estado: 'Manutenção' }],
    movimentacoes: [{ data: '2026-08-10', tipo: 'Saída', item: 'Areia', quantidade: '4', usuario: 'ana' }],
    emprestimos: [], pedidos: [], historico: []
  };
  const container = { innerHTML: '' };
  app._renderRelatorios(container);
  const telaHtml = container.innerHTML;

  ok('tela de relatórios mostra a contagem de registros em cada opção',
    telaHtml.includes('Estoque Atual (3 itens)') && telaHtml.includes('Histórico Unificado') &&
    telaHtml.includes('Ficha de Inventário Físico — contagem no almoxarifado (3 itens)') &&
    telaHtml.includes('Lista de Reposição — no/abaixo do mínimo (1)'));
  ok('tela de relatórios desabilita a opção sem registros',
    /<option value="emprestimos-ativos"[^>]*disabled/.test(telaHtml) && telaHtml.includes('Empréstimos Ativos — sem registros'));
  ok('tela de relatórios traz os filtros de estoque, ferramentas e histórico',
    telaHtml.includes('id="rel-estoque-filtro"') && telaHtml.includes('id="rel-ferramentas-filtro"') && telaHtml.includes('id="rel-historico-filtro"'));
  ok('tela de relatórios abre no relatório com mais base', app._primeiraFonteRelatorio === 'estoque-atual');
  ok('tabela de categorias da tela mostra críticos, % e sem mínimo (não só esgotados)',
    telaHtml.includes('% do total') && telaHtml.includes('Sem mínimo') && telaHtml.includes('Sem mínimo definido'));

  // Prévia: cada fonte gera o documento certo e o filtro escolhido é respeitado
  elStub('rel-estoque-filtro').value = 'criticos';
  elStub('rel-fonte').value = 'estoque-atual';
  app._gerarPreviaRelatorio();
  ok('prévia de Estoque Atual respeita o filtro de situação',
    app._docPreviaAtual.totalRegistros === 1 && app._docPreviaAtual.titulo.includes('Somente críticos e esgotados'));

  elStub('rel-fonte').value = 'reposicao';
  app._gerarPreviaRelatorio();
  ok('prévia da Lista de Reposição sai com a sugestão comprovada pela saída de estoque',
    app._docPreviaAtual.aba === 'reposicao' && app._docPreviaAtual.linhasBR.some(l => l.includes('Saídas (4)')));

  elStub('rel-fonte').value = 'ferramentas';
  elStub('rel-ferramentas-filtro').value = 'manutencao';
  app._gerarPreviaRelatorio();
  ok('prévia de Ferramentas respeita o filtro de situação',
    app._docPreviaAtual.totalRegistros === 1 && app._docPreviaAtual.titulo.includes('Em manutenção ou com defeito'));

  elStub('rel-fonte').value = 'historico';
  elStub('rel-historico-filtro').value = 'saidas';
  app._gerarPreviaRelatorio();
  ok('prévia do Histórico Unificado usa a lista unificada e o filtro',
    app._docPreviaAtual.aba === 'historico_unificado' && app._docPreviaAtual.totalRegistros === 1);

  // Ficha de inventário físico: contagem em branco, instruções impressas e largura de escrita
  app.data.estoque = estoqueFicha;
  elStub('rel-fonte').value = 'inventario-fisico';
  elStub('rel-estoque-filtro').value = 'todos';
  app._gerarPreviaRelatorio();
  const fichaTela = elStub('rel-preview').innerHTML;
  ok('prévia da ficha de inventário marca a coluna Contagem para escrita (data-col)',
    fichaTela.includes('data-col="contagem"') && app._docPreviaAtual.colunas.some(c => c.key === 'contagem'));
  ok('prévia da ficha de inventário imprime as instruções de preenchimento',
    /Instruções:/.test(fichaTela) && /Contagem/.test(app._docPreviaAtual.instrucoes));
  ok('prévia da ficha explica que a coluna sai em branco de propósito', /em branco de propósito/.test(fichaTela));
  ok('ficha de inventário respeita o filtro de estoque escolhido na tela',
    (() => { elStub('rel-estoque-filtro').value = 'criticos'; app._gerarPreviaRelatorio();
      return app._docPreviaAtual.totalRegistros === 1 && app._docPreviaAtual.titulo.includes('Somente críticos'); })());

  // Relatório vazio não deixa documento velho na tela
  elStub('rel-preview').innerHTML = '<div>documento anterior</div>';
  elStub('rel-fonte').value = 'emprestimos-ativos';
  app._gerarPreviaRelatorio();
  ok('prévia sem registros limpa a prévia anterior e não guarda documento obsoleto',
    app._docPreviaAtual === null && elStub('rel-preview').innerHTML === '' && app._docPreviaAtual !== undefined);
}

console.log(`\n${'█'.repeat(46)}`);
console.log(`  EXPORTS: ${passed} passaram, ${failed} falharam (${passed + failed} total)`);
console.log('█'.repeat(46));
process.exit(failed ? 1 : 0);
