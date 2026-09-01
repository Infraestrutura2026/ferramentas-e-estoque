/**
 * tests/run-contract.js — Testes de contrato do backend Apps Script v2.5.1
 * 15 testes
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;

function ok(name, cond, msg = '') {
  if (cond) {
    console.log(`✔ ${name}`);
    passed++;
  } else {
    console.error(`✖ ${name}${msg ? ': ' + msg : ''}`);
    failed++;
  }
}

function read(p) {
  return fs.readFileSync(path.join(ROOT, p), 'utf8');
}

function exists(p) {
  return fs.existsSync(path.join(ROOT, p));
}

// 1. apps-script/Code.gs existe
ok('apps-script/Code.gs existe', exists('apps-script/Code.gs'));

// 2. Contém doGet
try {
  const code = read('apps-script/Code.gs');
  ok('Code.gs contém doGet', /function\s+doGet/.test(code));
} catch (e) {
  ok('Code.gs contém doGet', false, e.message);
}

// 3. Contém doPost
try {
  const code = read('apps-script/Code.gs');
  ok('Code.gs contém doPost', /function\s+doPost/.test(code));
} catch (e) {
  ok('Code.gs contém doPost', false, e.message);
}

// 4. Contém LockService.getScriptLock
try {
  const code = read('apps-script/Code.gs');
  ok('Code.gs usa LockService.getScriptLock()', code.includes('LockService.getScriptLock()'));
} catch (e) {
  ok('Code.gs usa LockService', false, e.message);
}

// 5. Contém ContentService.createTextOutput
try {
  const code = read('apps-script/Code.gs');
  ok('Code.gs usa ContentService.createTextOutput', code.includes('ContentService.createTextOutput'));
} catch (e) {
  ok('Code.gs usa ContentService', false, e.message);
}

// 6. Contém e.postData.contents (leitura do POST text/plain)
try {
  const code = read('apps-script/Code.gs');
  ok('Code.gs lê e.postData.contents (suporte a text/plain)', code.includes('e.postData.contents'));
} catch (e) {
  ok('Code.gs lê e.postData.contents', false, e.message);
}

// 7. Trata action add
try {
  const code = read('apps-script/Code.gs');
  ok('Code.gs trata action add', /action.*add/.test(code) || code.includes("'add'") || code.includes('"add"'));
} catch (e) {
  ok('Code.gs trata action add', false, e.message);
}

// 8. Trata action update
try {
  const code = read('apps-script/Code.gs');
  ok('Code.gs trata action update', /action.*update/.test(code) || code.includes("'update'") || code.includes('"update"'));
} catch (e) {
  ok('Code.gs trata action update', false, e.message);
}

// 9. Trata action delete
try {
  const code = read('apps-script/Code.gs');
  ok('Code.gs trata action delete', code.includes('delete') && (code.includes("action === 'delete'") || code.includes('action=delete') || /delete/.test(code)));
} catch (e) {
  ok('Code.gs trata action delete', false, e.message);
}

// 10. Define ABAS_ESPERADAS com 8 abas
try {
  const code = read('apps-script/Code.gs');
  const abas = ['estoque','ferramentas','movimentacoes','emprestimos','fornecedores','pedidos','usuarios','historico'];
  const hasAll = abas.every(a => code.includes(a));
  ok('Code.gs define 8 abas esperadas', hasAll && code.includes('ABAS_ESPERADAS'));
} catch (e) {
  ok('Code.gs define 8 abas', false, e.message);
}

// 11. Define HEADERS_PADRAO
try {
  const code = read('apps-script/Code.gs');
  ok('Code.gs define HEADERS_PADRAO por aba', code.includes('HEADERS_PADRAO') && code.includes('quantidadeAtual'));
} catch (e) {
  ok('Code.gs define HEADERS_PADRAO', false, e.message);
}

// 12. Retorna JSON com success:true
try {
  const code = read('apps-script/Code.gs');
  ok('Code.gs retorna {success:true}', code.includes('success') && code.includes('true') && /JSON\.stringify/.test(code));
} catch (e) {
  ok('Code.gs retorna success', false, e.message);
}

// 13. Usa tryLock para concorrência
try {
  const code = read('apps-script/Code.gs');
  ok('Code.gs usa tryLock para evitar corrupção concorrente', code.includes('tryLock'));
} catch (e) {
  ok('Code.gs usa tryLock', false, e.message);
}

// 14. config.js URL_BASE_APPS_SCRIPT é https válida com script.google.com
try {
  const cfg = read('config.js');
  const m = cfg.match(/URL_BASE_APPS_SCRIPT\s*=\s*['"]([^'"]+)['"]/);
  const url = m ? m[1] : '';
  const valid = url.startsWith('https://script.google.com') && url.includes('/exec');
  ok('config.js URL_BASE_APPS_SCRIPT é https://script.google.com/.../exec válida', valid, url);
} catch (e) {
  ok('config.js URL_BASE_APPS_SCRIPT válida', false, e.message);
}

// 15. README menciona apps-script e contrato
try {
  const readme = read('README.md');
  const hasMention = readme.toLowerCase().includes('apps-script') && readme.includes('?aba=estoque');
  ok('README.md documenta pasta apps-script e contrato ?aba=estoque', hasMention);
} catch (e) {
  ok('README.md documenta apps-script', false, e.message);
}

// 16. Paridade de colunas: schema.js (Neon) ⊇ HEADERS_PADRAO do Apps Script
// Guard-rail do bug v2.7.5: o schema do Neon perdeu `quantidade`/`setor` de
// `emprestimos`, e o store descarta qualquer chave fora de colunasDa(aba).
try {
  const code = read('apps-script/Code.gs');
  const { colunasDa } = require('../api/_lib/schema');
  const faltantes = [];
  const bloco = code.match(/HEADERS_PADRAO\s*=\s*\{([\s\S]*?)\n\};/);
  const linhas = bloco ? bloco[1].split('\n') : [];
  for (const linha of linhas) {
    const m = linha.match(/^\s*(\w+)\s*:\s*\[([^\]]*)\]/);
    if (!m) continue;
    const aba = m[1];
    const cols = colunasDa(aba);
    if (!cols.length) continue;
    m[2].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
      .forEach(c => { if (!cols.includes(c)) faltantes.push(`${aba}.${c}`); });
  }
  ok('schema.js cobre todas as colunas do Apps Script (sem perda de campos)',
    linhas.length > 0 && faltantes.length === 0, 'faltando: ' + faltantes.join(', '));
} catch (e) {
  ok('schema.js x Apps Script paridade de colunas', false, e.message);
}

// 17. emprestimos aceita quantidade/setor (campos enviados por app.js)
try {
  const { colunasDa } = require('../api/_lib/schema');
  const cols = colunasDa('emprestimos');
  ok('schema emprestimos tem quantidade, setor e updatedAt',
    ['quantidade', 'setor', 'updatedAt'].every(c => cols.includes(c)), cols.join(','));
} catch (e) {
  ok('schema emprestimos tem quantidade/setor', false, e.message);
}

console.log(`\n${passed} passed, ${failed} failed — total ${passed+failed}`);
process.exit(failed > 0 ? 1 : 0);
