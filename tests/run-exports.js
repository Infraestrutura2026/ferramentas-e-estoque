/**
 * tests/run-exports.js — Testes de relatórios e exportação CSV (v2.6.1)
 * =====================================================================
 * Cobre:
 *   1. utils.ABAS_EXPORTAVEIS (8 abas, incluindo usuários)
 *   2. utils.escapeCsvValue / utils.buildCSV (RFC 4180)
 *   3. utils.metricasRelatorio (total / esgotados / críticos)
 *   4. utils.categoriaResumo (consolidação por categoria)
 *   5. Contrato no app.js (lote, relatório CSV, guarda de administrador)
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

/* ═══ 2. CSV (RFC 4180) ═══ */
ok('escapeCsvValue mantém texto simples', utils.escapeCsvValue('Martelo') === 'Martelo');
ok('escapeCsvValue escapa vírgula', utils.escapeCsvValue('Chave, 10mm') === '"Chave, 10mm"');
ok('escapeCsvValue escapa aspas (duplica)', utils.escapeCsvValue('a"b') === '"a""b"');
ok('escapeCsvValue escapa quebra de linha', utils.escapeCsvValue('linha1\nlinha2') === '"linha1\nlinha2"');
ok('escapeCsvValue trata null/undefined como vazio', utils.escapeCsvValue(null) === '' && utils.escapeCsvValue(undefined) === '');

const csv = utils.buildCSV(['id', 'nome', 'obs'], [
  [1, 'Martelo', 'cabo, madeira'],
  [2, 'Chave "Fixa"', 'ok'],
]);
const linhasEsperadas = ['id,nome,obs', '1,Martelo,"cabo, madeira"', '2,"Chave ""Fixa""",ok'];
ok('buildCSV gera cabeçalho + linhas com escape correto',
  csv.split('\n').join('|') === linhasEsperadas.join('|') && csv.normalize() === csv);
ok('buildCSV NÃO embute BOM (BOM só no download)', !csv.startsWith('\uFEFF'));
ok('buildCSV retorna string vazia sem dados', utils.buildCSV([], []) === '');

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

/* ═══ 5. Contrato no app.js ═══ */
const appJs = read('app.js');
ok('app.js usa utils.ABAS_EXPORTAVEIS nos relatórios', appJs.includes('utils.ABAS_EXPORTAVEIS'));
ok('app.js não tem lista hardcoded de 7 abas', !appJs.includes("['estoque', 'ferramentas', 'emprestimos', 'movimentacoes', 'historico', 'fornecedores', 'pedidos']"));
ok('app.js implementa exportação em lote (_exportAllCSV)', appJs.includes('_exportAllCSV()'));
ok('app.js implementa exportação do relatório (_exportRelatorioCSV)', appJs.includes('_exportRelatorioCSV()'));
ok('app.js usa utils.buildCSV para gerar CSV', appJs.includes('utils.buildCSV('));
ok('app.js adiciona BOM UTF-8 apenas no download', appJs.includes("new Blob(['\\uFEFF' + csv]"));
ok('app.js restringe exportação de usuários a admin', appJs.includes('_podeExportar') && appJs.includes('usuarios') && appJs.includes('authModule.isAdmin()'));
ok('app.js esconde botão de usuários para não-admin', appJs.includes('abasVisiveis = abasExportaveis.filter(a => this._podeExportar(a))'));

// index.html deve refletir a versão nova (visível na tela de login)
const html = read('index.html');
ok('index.html exibe v2.6.1', html.includes('v2.6.1'));

console.log(`\n${'█'.repeat(46)}`);
console.log(`  EXPORTS: ${passed} passaram, ${failed} falharam (${passed + failed} total)`);
console.log('█'.repeat(46));
process.exit(failed ? 1 : 0);
