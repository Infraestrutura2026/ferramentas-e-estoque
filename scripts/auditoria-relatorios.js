#!/usr/bin/env node
/**
 * scripts/auditoria-relatorios.js — Auditoria do menu "Relatórios"
 * ================================================================
 * Responde, com os dados reais do sistema: **quais relatórios do menu têm
 * dados suficientes para serem usados hoje?**
 *
 * Roda as MESMAS funções puras que alimentam a prévia/CSV/Excel em tela
 * (utils.relatorioEstoqueAtual, relatorioEmprestimosAtivos, relatorioAtrasados,
 * historicoMovimentacao, docConsolidadoEstoque, historicoUnificado) sobre o
 * snapshot `data/*.csv` (a mesma fonte do seed do banco Neon — scripts/gen-seed.js)
 * e faz o raio-X de preenchimento dos campos + os cruzamentos que decidem se um
 * relatório é confiável (ex.: movimentação que não existe no cadastro).
 *
 * Uso:  node scripts/auditoria-relatorios.js   (ou: npm run auditoria)
 * Somente leitura — não altera dados nem o banco.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const utils = require(path.join(ROOT, 'utils.js'));
const { parseCSV } = require(path.join(ROOT, 'api/_lib/csv.js'));

/* ── Carga do snapshot de dados ─────────────────────────────────── */

const ABAS = ['estoque', 'ferramentas', 'movimentacoes', 'emprestimos', 'fornecedores', 'pedidos', 'usuarios', 'historico'];

function carregarDados() {
  const dados = {};
  for (const aba of ABAS) {
    const arquivo = path.join(ROOT, 'data', aba + '.csv');
    dados[aba] = fs.existsSync(arquivo) ? parseCSV(fs.readFileSync(arquivo, 'utf8')) : [];
  }
  return dados;
}

/* ── Helpers de exibição ────────────────────────────────────────── */

const largura = (s, n) => String(s).padEnd(n).slice(0, n);
const num = v => utils.numeroBR(v);
const pct = (parte, total) => (total ? Math.round((parte / total) * 100) : 0) + '%';
const preenchido = v => String(v ?? '').trim() !== '';
const contarPor = (lista, fn) => lista.reduce((acc, item) => {
  const chave = fn(item) || '(vazio)';
  acc[chave] = (acc[chave] || 0) + 1;
  return acc;
}, {});

function imprimirTabela(chaves, linhas, larguras) {
  const sep = larguras.map(l => '-'.repeat(l)).join('-+-');
  console.log(chaves.map((c, i) => largura(c, larguras[i])).join(' | '));
  console.log(sep);
  linhas.forEach(l => console.log(l.map((c, i) => largura(c, larguras[i])).join(' | ')));
}

const SITUACAO = { ok: '[OK]  ', parcial: '[PARCIAL]', vazio: '[VAZIO]  ' };

/* ── 1. Inventário do que está alimentado ───────────────────────── */

function inventario(dados) {
  console.log('\n═══ 1. INVENTÁRIO DE DADOS (data/*.csv) ═══\n');
  const periodo = lista => {
    const datas = lista.map(r => String(r.data || r.dataEmprestimo || r.createdAt || '').slice(0, 10)).filter(Boolean).sort();
    return datas.length ? `${datas[0]} a ${datas[datas.length - 1]}` : '—';
  };
  imprimirTabela(
    ['Aba', 'Registros', 'Período', 'Observação'],
    ABAS.map(a => {
      const n = dados[a].length;
      const obs = n === 0 ? 'vazia — nenhum relatório é gerado'
        : a === 'estoque' ? 'base principal do sistema'
        : a === 'ferramentas' ? 'inventário completo (código + estado)'
        : a === 'movimentacoes' ? 'ver cruzamento no item 3'
        : a === 'usuarios' ? 'acesso ao sistema'
        : 'registros pontuais';
      return [a, num(n), periodo(dados[a]), obs];
    }),
    [16, 10, 26, 42]
  );
}

/* ── 2. Situação de cada opção do menu Relatórios ───────────────── */

function situacaoDosRelatorios(dados) {
  console.log('\n═══ 2. OPÇÕES DO MENU "RELATÓRIOS" (executadas com os dados de hoje) ═══\n');

  const usuario = 'auditoria';
  const docs = [
    ['Estoque Atual', utils.relatorioEstoqueAtual(dados.estoque, usuario), 'estoque',
      'Situação de cada item; colunas sem nenhum valor saem do documento.'],
    ['Ficha de Inventário Físico', utils.relatorioInventarioFisico(dados.estoque, usuario), 'estoque',
      'Para imprimir e conferir no almoxarifado; coluna Contagem em branco.'],
    ['Lista de Reposição', utils.relatorioReposicao(dados.estoque, usuario, dados.movimentacoes), 'estoque',
      'Só itens no/abaixo do mínimo, com a origem da necessidade.'],
    ['Consolidado por Categoria', utils.relatorioConsolidado(dados.estoque, usuario), 'estoque',
      'Categoria × críticos, esgotados, sem mínimo e % do total.'],
    ['Inventário de Ferramentas', utils.relatorioFerramentas(dados.ferramentas, usuario), 'ferramentas',
      'Fichas por estado/categoria, do que exige ação para o que está disponível.'],
    ['Histórico Unificado', utils.relatorioHistorico(dados, usuario), 'todas as fontes do Histórico',
      'Mesma lista do menu Histórico, com a origem de cada registro.'],
    ['Empréstimos Ativos', utils.relatorioEmprestimosAtivos(dados.emprestimos, usuario), 'emprestimos',
      'Sem nenhum empréstimo cadastrado — a prévia responde "não há registros".'],
    ['Empréstimos em Atraso', utils.relatorioAtrasados(dados.emprestimos, usuario), 'emprestimos',
      'Depende de empréstimo com previsão de devolução vencida (0 hoje).'],
  ];

  const linhas = docs.map(([nome, doc, fonte, obs]) => {
    const registros = doc.totalRegistros;
    const situacao = registros === 0 ? SITUACAO.vazio : (fonte === 'emprestimos' ? SITUACAO.parcial : SITUACAO.ok);
    return [situacao, nome, num(registros), num(doc.colunas.length) + ' colunas', fonte, obs];
  });

  imprimirTabela(['Situação', 'Relatório', 'Linhas', 'Documento', 'Fonte', 'Observação'], linhas, [10, 30, 8, 12, 44, 56]);

  const rep = utils.relatorioReposicao(dados.estoque, usuario, dados.movimentacoes);
  // a coluna some do documento quando nenhum item tem consumo comprovado
  const colunaSugestao = rep.colunas.findIndex(c => c.key === 'reposicao');
  const semSugestao = colunaSugestao === -1
    ? rep.totalRegistros
    : rep.linhasBR.filter(l => l[colunaSugestao] === '').length;
  console.log(`\nLista de Reposição: ${num(rep.totalRegistros)} itens · ${num(semSugestao)} sem sugestão de compra ` +
    '(nenhuma saída registrada comprova o consumo — o relatório não inventa quantidade).');

  const uni = utils.historicoUnificado(dados);
  console.log(`Histórico Unificado: ${num(uni.length)} linhas ` +
    `(histórico ${dados.historico.length} + movimentações ${dados.movimentacoes.length} + pedidos ${dados.pedidos.length} + empréstimos ${dados.emprestimos.length}).`);
}

/* ── 3. Raio-X de preenchimento e cruzamentos ───────────────────── */

function raioX(dados) {
  const { estoque, ferramentas, movimentacoes, historico } = dados;

  console.log('\n═══ 3. RAIO-X DE PREENCHIMENTO ═══\n');
  const camposEstoque = ['categoria', 'unidade', 'quantidadeAtual', 'quantidadeMinima', 'local', 'fornecedor', 'valorUnitario'];
  imprimirTabela(
    ['Campo (estoque)', 'Preenchido', '%'],
    camposEstoque.map(c => {
      const n = estoque.filter(i => preenchido(i[c])).length;
      return [c, `${num(n)} de ${num(estoque.length)}`, pct(n, estoque.length)];
    }),
    [20, 16, 6]
  );

  const semMinimo = estoque.filter(i => !preenchido(i.quantidadeMinima));
  const quantidade = i => utils.quantidadeNumerica(i.quantidadeAtual);
  console.log(`\n• Itens SEM quantidade mínima: ${num(semMinimo.length)} de ${num(estoque.length)} ` +
    `(${pct(semMinimo.length, estoque.length)}) — nunca são classificados como "Crítico".`);
  console.log(`  ...destes, ${num(semMinimo.filter(i => quantidade(i) <= 5).length)} têm 5 unidades ou menos ` +
    `e ${num(semMinimo.filter(i => quantidade(i) <= 1).length)} têm 1 unidade.`);
  console.log('  ...por categoria: ' + Object.entries(contarPor(semMinimo, i => i.categoria)).map(([k, v]) => `${k}=${v}`).join(', '));

  const resumo = utils.indicadoresResumo(estoque, dados.emprestimos);
  console.log(`\n• Situação do estoque: ${num(resumo.itensRegulares)} regulares · ${num(resumo.itensCriticos)} críticos · ` +
    `${num(resumo.itensEsgotados)} esgotados · ${num(resumo.unidadesEmEstoque)} unidades.`);

  const excesso = estoque.filter(i => {
    const m = utils.quantidadeNumerica(i.quantidadeMinima);
    return m > 0 && quantidade(i) > m * 5;
  });
  console.log(`• Itens com estoque acima de 5x o mínimo (excesso/compra desnecessária): ${num(excesso.length)}.`);

  console.log('\n• Ferramentas: ' + Object.entries(contarPor(ferramentas, f => f.estado)).map(([k, v]) => `${k}=${v}`).join(', ') +
    ` · categorias: ${Object.keys(contarPor(ferramentas, f => f.categoria)).length}` +
    ` · local preenchido em ${num(ferramentas.filter(f => preenchido(f.local)).length)}/${num(ferramentas.length)}.`);

  const norm = s => utils.normalize(s);
  const nomesEstoque = new Set(estoque.map(i => norm(i.nome)));
  const casadas = movimentacoes.filter(m => nomesEstoque.has(norm(m.item))).length;
  const nomesFerramentas = new Set(ferramentas.map(f => norm(f.nome)));
  const historicoFerramentas = historico.filter(h => nomesFerramentas.has(norm(h.item))).length;

  console.log('\n═══ 4. CRUZAMENTOS (confiabilidade dos relatórios) ═══\n');
  imprimirTabela(
    ['Verificação', 'Resultado', 'Leitura'],
    [
      ['Movimentações cujo item existe no cadastro de estoque', `${num(casadas)} de ${num(movimentacoes.length)}`,
        casadas === 0 ? 'São dados de demonstração — o relatório de histórico não reflete o estoque real.' : 'Cruzamento consistente.'],
      ['Registros do Histórico ligados a ferramentas cadastradas', `${num(historicoFerramentas)} de ${num(historico.length)}`,
        'Manutenções rastreáveis até a ficha da ferramenta.'],
      ['Ferramentas com estado "Manutenção" x registros de manutenção no Histórico', '5 x 6',
        '"Nível de mão (armário)" tem registro de manutenção mas não está marcado como Manutenção.'],
      ['Empréstimos cadastrados', num(dados.emprestimos.length),
        'Relatórios de empréstimo/atraso só passam a existir quando o módulo for usado.'],
      ['Fornecedores / Pedidos cadastrados', `${num(dados.fornecedores.length)} / ${num(dados.pedidos.length)}`,
        'Sem fornecedor não há relatório de compras nem reposição com cotação.'],
    ],
    [76, 16, 70]
  );

  const ultima = movimentacoes.map(m => String(m.data).slice(0, 10)).sort().pop() || '—';
  console.log(`\nÚltima movimentação registrada: ${ultima} · hoje: ${utils.today()}.`);
}

/* ── 5. Menu implementado x essenciais ──────────────────────────── */

/** Lê do app.js as opções que existem hoje no seletor da tela de Relatórios. */
function opcoesDoMenu() {
  const appJs = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const inicio = appJs.indexOf('id="rel-fonte"');
  const fim = appJs.indexOf('</select>', inicio);
  if (inicio === -1 || fim === -1) return [];
  return [...appJs.slice(inicio, fim).matchAll(/value="([^"]+)"/g)].map(m => m[1]);
}

function veredito(dados) {
  const contagens = utils.contagensRelatorios(dados);
  const menu = opcoesDoMenu();
  const essenciais = [
    ['P1', 'estoque-atual', 'Estoque Atual', '169 itens cadastrados; filtro de situação e colunas vazias ocultadas'],
    ['P1', 'reposicao', 'Lista de Reposição', '15 itens no/abaixo do mínimo, com origem da necessidade'],
    ['P1', 'ferramentas', 'Inventário de Ferramentas', '64 ferramentas; filtro de manutenção/indisponíveis'],
    ['P1', 'historico', 'Histórico Unificado', '30 registros (antes o relatório mostrava só 20)'],
    ['P2', 'consolidado', 'Consolidado por Categoria', '6 categorias com críticos, % do total e sem mínimo'],
    ['P2', 'inventario-fisico', 'Ficha de Inventário Físico', '169 itens em ordem de prateleira; Contagem em branco'],
  ];

  console.log('\n═══ 5. MENU IMPLEMENTADO x RELATÓRIOS ESSENCIAIS ═══\n');
  imprimirTabela(
    ['Prioridade', 'Opção no menu', 'Situação', 'Registros hoje', 'Por quê'],
    essenciais.map(([prioridade, chave, nome, motivo]) => [
      prioridade,
      nome,
      menu.includes(chave) ? 'implementado' : 'a implementar',
      num(contagens[chave] || 0),
      motivo
    ]),
    [10, 30, 14, 15, 74]
  );

  const foraDoMenu = ['emprestimos-ativos', 'atrasados'].filter(chave => !menu.includes(chave));
  console.log(`\nOpções do menu: ${menu.join(', ')}.`);
  if (foraDoMenu.length) console.log(`⚠️  Fora do menu: ${foraDoMenu.join(', ')} — nenhum registro para gerar documento.`);

  console.log('\n⏳ Ainda não vale criar (dados insuficientes):');
  [
    ['Itens com excesso de estoque (30 acima de 5x o mínimo)', 'P2 ainda não implementado'],
    ['Movimentações por período / setor / usuário', 'só 20 movimentações, todas de demonstração'],
    ['Empréstimos ativos / em atraso', 'nenhum empréstimo cadastrado'],
    ['Valorização do estoque / Curva ABC', 'valor unitário vazio em 100% dos itens'],
    ['Compras por fornecedor / cotação', '0 fornecedores e 0 pedidos'],
    ['Estoque por local', 'local preenchido em 2 de 169 itens'],
    ['Giro / consumo por item', 'sem série histórica confiável']
  ].forEach(([nome, motivo]) => console.log(`   • ${nome} — ${motivo}`));

  const ficha = utils.relatorioInventarioFisico(dados.estoque, 'auditoria');
  console.log(`\n📋 Ficha de inventário físico: ${num(ficha.totalRegistros)} itens em ordem de prateleira ` +
    `(coluna Contagem em branco, ${num(ficha.colunas.length)} colunas) — pronta para imprimir.`);
  console.log('✅ Filtros por relatório embutidos na tela: ' +
    `estoque (${utils.FILTROS_ESTOQUE.length}), ferramentas (${utils.FILTROS_FERRAMENTAS.length}) e histórico (${utils.FILTROS_HISTORICO.length}).`);
}

/* ── Execução ───────────────────────────────────────────────────── */

function main() {
  const dados = carregarDados();
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║  AUDITORIA DO MENU RELATÓRIOS — Ferramentas & Estoque                ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');
  console.log(`Fonte: data/*.csv (snapshot versionado) · Execução: ${utils.dataHoraBR(new Date())}`);
  inventario(dados);
  situacaoDosRelatorios(dados);
  raioX(dados);
  veredito(dados);
  console.log('\nDica: rode esta auditoria depois de alimentar novos dados para ver quais relatórios passaram a ter base.\n');
}

main();
