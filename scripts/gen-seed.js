/**
 * scripts/gen-seed.js — Gera api/_lib/seed-data.js a partir de data/*.csv
 * =======================================================================
 * A carga inicial do banco Neon fica EMBUTIDA no bundle da função (arquivo
 * .js), eliminando qualquer dependência de leitura de arquivos em runtime na
 * Vercel. Rodar de novo após atualizar os CSVs:
 *
 *   node scripts/gen-seed.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { parseCSV } = require('../api/_lib/csv');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const DEST = path.join(ROOT, 'api', '_lib', 'seed-data.js');

const abas = [
  'estoque', 'ferramentas', 'movimentacoes', 'emprestimos',
  'fornecedores', 'pedidos', 'usuarios', 'historico',
];

const carga = {};
for (const aba of abas) {
  const arquivo = path.join(DATA_DIR, `${aba}.csv`);
  if (!fs.existsSync(arquivo)) { carga[aba] = []; continue; }
  carga[aba] = parseCSV(fs.readFileSync(arquivo, 'utf8'));
}

const corpo =
`/**
 * api/_lib/seed-data.js — CARGA INICIAL EMBUTIDA (gerada automaticamente)
 * =======================================================================
 * ⚠️ ARQUIVO GERADO — não editar à mão.
 * Fonte: data/*.csv · Regenerar com: node scripts/gen-seed.js
 * Usada pela API na primeira execução para criar e popular as tabelas no Neon.
 */
'use strict';

module.exports = ${JSON.stringify(carga, null, 2)};
`;

fs.writeFileSync(DEST, corpo);
const total = Object.values(carga).reduce((s, a) => s + a.length, 0);
console.log('✔ seed-data.js gerado:');
for (const aba of abas) console.log(`   ${aba.padEnd(14)} ${String(carga[aba].length).padStart(4)} registros`);
console.log(`   ${'-'.repeat(22)}\n   total: ${total} registros`);
