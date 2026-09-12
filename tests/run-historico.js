/**
 * tests/run-historico.js — Menu Histórico: Data · Ação · Item · Quantidade · Solicitante · Responsável
 * ================================================================================================
 * Cobre:
 *   1. utils.quantidadeExibida / utils.quantidadeDoTexto / utils.solicitanteDaObservacao
 *   2. utils.historicoUnificado (agrega Histórico + Movimentações + Pedidos + Empréstimos)
 *   3. historicoModule.render() do app.js executado de ponta a ponta num sandbox
 *      (mesmo código enviado ao navegador) — colunas, ordem, valores e colspan
 *   4. Contrato: a coluna "Detalhes" saiu da tabela (virou tooltip da linha)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

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

/* ═══ 1. Quantidade: exibição, dedução do texto e solicitante da observação ═══ */
ok('quantidadeExibida formata número em pt-BR', utils.quantidadeExibida('20') === '20' && utils.quantidadeExibida('2.5') === '2,5');
ok('quantidadeExibida mantém texto não numérico', utils.quantidadeExibida('caixa') === 'caixa');
ok('quantidadeExibida vazio → string vazia (tela mostra "—")', utils.quantidadeExibida('') === '' && utils.quantidadeExibida(null) === '' && utils.quantidadeExibida(undefined) === '');

ok('quantidadeDoTexto deduz de "-2 un — Reforma celas" (dado real do histórico)', utils.quantidadeDoTexto('-2 un — Reforma celas') === '2');
ok('quantidadeDoTexto deduz de "3 unidades danificadas - enviar para calibração/reparo"', utils.quantidadeDoTexto('3 unidades danificadas - enviar para calibração/reparo') === '3');
ok('quantidadeDoTexto deduz de "Com avaria - necessita reposição de 4 unidades"', utils.quantidadeDoTexto('Com avaria - necessita reposição de 4 unidades') === '4');
ok('quantidadeDoTexto deduz de "1 unidade danificada"', utils.quantidadeDoTexto('1 unidade danificada') === '1');
ok('quantidadeDoTexto não inventa quantidade em texto sem número', utils.quantidadeDoTexto('Trocar rolamento') === '' && utils.quantidadeDoTexto('Item em manutenção - verificar situação') === '');
ok('quantidadeDoTexto não confunde data/hora com quantidade', utils.quantidadeDoTexto('Registrado em 2026-07-24 16:43:08') === '' && utils.quantidadeDoTexto('24/07/2026') === '');
ok('quantidadeDoTexto aceita unidade de medida variada (kg, cx, pct, m)', utils.quantidadeDoTexto('20 kg') === '20' && utils.quantidadeDoTexto('5 cx') === '5' && utils.quantidadeDoTexto('30 m de cabo') === '30');
ok('quantidadeDoTexto trata vazio sem quebrar', utils.quantidadeDoTexto('') === '' && utils.quantidadeDoTexto(null) === '');

ok('solicitanteDaObservacao lê a baixa automática de pedido',
  utils.solicitanteDaObservacao('Baixa automática — solicitação entregue (Osvaldo Martinez)') === 'Osvaldo Martinez');
ok('solicitanteDaObservacao ignora observação comum', utils.solicitanteDaObservacao('Reposição estoque') === '' && utils.solicitanteDaObservacao('') === '');

/* ═══ 2. Unificação das quatro fontes ═══ */
const dados = {
  historico: [
    { id: 'h1', acao: 'Manutenção', item: 'Engraxadeira', detalhes: 'Item em manutenção - verificar situação', responsavel: 'Infraestrutura', data: '2026-07-24' },
    { id: 'h2', acao: 'Saída de Estoque', item: 'Sifão pia 70 cm', detalhes: '-2 un — Reforma celas', responsavel: 'Osvaldo Martinez', data: '2026-07-27 16:43:08' }
  ],
  movimentacoes: [
    { id: '1', data: '2026-07-01', tipo: 'Entrada', item: 'Cimento Portland 50kg', quantidade: '20', local: 'Depósito C', usuario: 'admin', observacao: 'Recebimento fornecedor' },
    { id: '2', data: '2026-09-05', tipo: 'Saída', item: 'Sifão pia 70 cm', quantidade: '4', local: 'Ala norte', usuario: 'operador1', observacao: 'Baixa automática — solicitação entregue (Zanoni)' }
  ],
  pedidos: [
    { id: 'p1', data: '2026-09-08', solicitante: 'Osvaldo Martinez', item: 'Disjuntor bipolar 40A', quantidade: '15', localUso: 'Oficina', status: 'Pendente', observacao: 'Urgente' }
  ],
  emprestimos: [
    { id: 'e1', nomeFerramenta: 'Furadeira de impacto Bosch', responsavel: 'Ana Souza', setor: 'Manutenção', quantidade: '1', status: 'Ativo', dataEmprestimo: '2026-09-10' },
    { id: 'e2', nomeFerramenta: 'Alicate', responsavel: 'Bruno Lima', setor: 'Oficina', quantidade: '2', status: 'Devolvido', dataEmprestimo: '2026-09-02', dataDevolucao: '2026-09-03' }
  ]
};

const linhas = utils.historicoUnificado(dados);
ok('historicoUnificado agrega as quatro fontes (2 histórico + 2 movimentações + 1 pedido + 2 empréstimos)',
  linhas.length === 7, 'obtido: ' + linhas.length);

const porId = id => linhas.find(l => l.id === id);
const COLUNAS = ['data', 'acao', 'item', 'quantidade', 'solicitante', 'responsavel'];
ok('toda linha tem as 6 colunas exibidas (+ fonte/id/detalhes)',
  linhas.every(l => COLUNAS.every(c => Object.prototype.hasOwnProperty.call(l, c)) && l.fonte && l.id));

ok('histórico antigo ganha quantidade deduzida do detalhe', porId('h2').quantidade === '2' && porId('h1').quantidade === '');
ok('histórico antigo sem solicitante fica vazio (tela mostra "—")', porId('h1').solicitante === '' && porId('h1').responsavel === 'Infraestrutura');

ok('movimentação usa quantidade própria e o usuário como responsável', porId('1').quantidade === '20' && porId('1').responsavel === 'admin');
ok('movimentação de baixa automática recupera o solicitante do pedido', porId('2').solicitante === 'Zanoni' && porId('2').responsavel === 'operador1');

ok('pedido traz solicitante, quantidade e ação com status',
  porId('p1').solicitante === 'Osvaldo Martinez' && porId('p1').quantidade === '15' && porId('p1').acao === 'Pedido — Pendente');

ok('empréstimo distingue retirada de devolução e mantém o responsável',
  porId('e1').acao === 'Empréstimo' && porId('e1').responsavel === 'Ana Souza' && porId('e1').quantidade === '1' &&
  porId('e2').acao === 'Devolução' && porId('e2').quantidade === '2');

ok('linhas vêm ordenadas da mais recente para a mais antiga',
  linhas.map(l => l.data).join('|') === ['2026-09-10', '2026-09-08', '2026-09-05', '2026-09-02', '2026-07-27 16:43:08', '2026-07-24', '2026-07-01'].join('|'),
  'obtido: ' + linhas.map(l => l.data).join('|'));

ok('historicoUnificado aceita abas ausentes/vazias sem quebrar', utils.historicoUnificado({}).length === 0 && utils.historicoUnificado().length === 0);
ok('FONTES_HISTORICO lista as 4 fontes do filtro', utils.FONTES_HISTORICO.map(f => f.valor).join(',') === 'historico,movimentacoes,pedidos,emprestimos');

/* ═══ 3. render() real do app.js num sandbox (mesmo código do navegador) ═══ */
const appJs = read('app.js');

/** Carrega o app.js num contexto isolado e devolve função que renderiza o Histórico. */
const renderizar = (() => {
  const sandbox = {
    console,
    utils,
    CONFIG: { SHEETS: {}, CSV_FALLBACK: {}, CACHE_KEYS: {}, VERSAO: '3.0.0' },
    document: {
      addEventListener() {},
      getElementById() { return null; },
      querySelectorAll() { return []; },
      readyState: 'complete'
    },
    window: { addEventListener() {} },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    fetch: () => Promise.reject(new Error('offline no teste')),
    setTimeout, clearTimeout, AbortController, URLSearchParams, TextEncoder, confirm: () => true, alert: () => {}
  };
  vm.createContext(sandbox);
  vm.runInContext(appJs + '\n;this.historicoModule = historicoModule; this.app = app;', sandbox, { filename: 'app.js' });
  return (dadosRender, estado = {}) => {
    const conteudo = { innerHTML: '' };
    Object.assign(sandbox.historicoModule, { pagina: 1, busca: '', fonte: '' }, estado);
    sandbox.app.data = dadosRender;
    sandbox.historicoModule.render(conteudo);
    return conteudo.innerHTML;
  };
})();

const htmlRenderizado = renderizar(dados);

const cabecalhos = [...htmlRenderizado.matchAll(/<th[^>]*>([^<]+)<\/th>/g)].map(m => m[1].trim());
ok('tabela do Histórico tem exatamente as 6 colunas pedidas, na ordem',
  JSON.stringify(cabecalhos) === JSON.stringify(['Data', 'Ação', 'Item', 'Quantidade', 'Solicitante', 'Responsável']),
  'obtido: ' + JSON.stringify(cabecalhos));
ok('coluna "Detalhes" não é mais exibida na tabela', !cabecalhos.includes('Detalhes'));

const linhasHtml = [...htmlRenderizado.matchAll(/<tr class="border-b border-slate-100[\s\S]*?<\/tr>/g)].map(m => m[0]);
ok('render exibe uma linha por registro unificado', linhasHtml.length === 7, 'obtido: ' + linhasHtml.length);

const celulas = linha => [...linha.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
const linhaSifao = linhasHtml.find(l => l.includes('Sifão pia 70 cm') && l.includes('Osvaldo Martinez'));
ok('linha do histórico antigo: data pt-BR com hora, ação, item, quantidade deduzida, solicitante "—", responsável',
  celulas(linhaSifao).join(' | ') === '27/07/2026 16:43 | Saída de Estoque Registros do Histórico | Sifão pia 70 cm | 2 | — | Osvaldo Martinez',
  'obtido: ' + celulas(linhaSifao).join(' | '));

const linhaPedido = linhasHtml.find(l => l.includes('Disjuntor bipolar 40A'));
ok('linha do pedido mostra solicitante e quantidade',
  celulas(linhaPedido).join(' | ') === '08/09/2026 | Pedido — Pendente Pedidos de Compra | Disjuntor bipolar 40A | 15 | Osvaldo Martinez | —',
  'obtido: ' + celulas(linhaPedido).join(' | '));

const linhaEmprestimo = linhasHtml.find(l => l.includes('Furadeira de impacto Bosch'));
ok('linha do empréstimo mostra responsável e quantidade',
  celulas(linhaEmprestimo).join(' | ') === '10/09/2026 | Empréstimo Empréstimos de Ferramentas | Furadeira de impacto Bosch | 1 | — | Ana Souza',
  'obtido: ' + celulas(linhaEmprestimo).join(' | '));

const linhaManutencao = linhasHtml.find(l => l.includes('Engraxadeira'));
ok('registro sem quantidade e sem solicitante exibe "—" nas duas colunas',
  celulas(linhaManutencao).join(' | ') === '24/07/2026 | Manutenção Registros do Histórico | Engraxadeira | — | — | Infraestrutura',
  'obtido: ' + celulas(linhaManutencao).join(' | '));

ok('detalhe/observação continua acessível como dica da linha (tooltip)', htmlRenderizado.includes('title="-2 un — Reforma celas"'));

/* Sem dados: estado vazio precisa ocupar as 6 colunas */
const htmlVazio = renderizar({});
ok('estado vazio ocupa as 6 colunas (colspan="6")',
  htmlVazio.includes('colspan="6"') && htmlVazio.includes('Nenhum histórico encontrado') && !htmlVazio.includes('colspan="5"'));

/* Busca e filtro por fonte exercitados pelo próprio módulo */
const htmlBusca = renderizar(dados, { busca: 'zanoni' });
ok('busca pelo solicitante filtra a linha certa',
  [...htmlBusca.matchAll(/<tr class="border-b border-slate-100/g)].length === 1 && htmlBusca.includes('Sifão pia 70 cm'));
const htmlFonte = renderizar(dados, { fonte: 'pedidos' });
ok('filtro por fonte mostra só os registros daquela fonte',
  [...htmlFonte.matchAll(/<tr class="border-b border-slate-100/g)].length === 1 && htmlFonte.includes('Disjuntor bipolar 40A'));

ok('busca alcança solicitante, item, quantidade e responsável', /historicoModule\.setBusca/.test(appJs) &&
  ['utils.normalize(h.solicitante)', 'utils.normalize(h.responsavel)', 'utils.normalize(h.quantidade)'].every(t => appJs.includes(t)));
ok('filtro por fonte disponível na tela (historicoModule.setFonte)', appJs.includes('historicoModule.setFonte(this.value)') &&
  utils.FONTES_HISTORICO.every(f => htmlRenderizado.includes(`value="${f.valor}"`)));

/* ═══ 4. Contrato: o módulo usa a unificação (não remapeia colunas à mão) ═══ */
ok('historicoModule usa utils.historicoUnificado como fonte única', appJs.includes('utils.historicoUnificado(app.data || {})'));
ok('app.js não mantém o mapeamento antigo com coluna Detalhes na tabela',
  !/Detalhes<\/th>/.test(appJs) && !appJs.includes('detalhes: m.observacao'));

console.log(`\n${'█'.repeat(46)}`);
console.log(`  HISTÓRICO: ${passed} passaram, ${failed} falharam (${passed + failed} total)`);
console.log('█'.repeat(46));
process.exit(failed ? 1 : 0);
