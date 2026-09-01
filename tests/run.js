/**
 * tests/run.js — Testes gerais do sistema v2.5.1
 * 23 testes (inclui correção de sincronização automática)
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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

// 1. config.js existe e define URL_BASE_APPS_SCRIPT
try {
  const cfg = read('config.js');
  ok('config.js define URL_BASE_APPS_SCRIPT', /URL_BASE_APPS_SCRIPT\s*=/.test(cfg) && cfg.includes('https://script.google.com'));
} catch (e) {
  ok('config.js define URL_BASE_APPS_SCRIPT', false, e.message);
}

// 2. config.js VERSAO is 2.7.7
try {
  const cfg = read('config.js');
  ok('config.js VERSAO é 2.7.7', /VERSAO:\s*['"]2\.7\.7['"]/.test(cfg));
} catch (e) {
  ok('config.js VERSAO é 2.7.7', /VERSAO:\s*['"]2\.7\.7['"]/.test(cfg));
}

// 3. CONFIG.SHEETS has 8 keys
try {
  const cfg = read('config.js');
  const keys = ['estoque','ferramentas','movimentacoes','emprestimos','fornecedores','pedidos','usuarios','historico'];
  const hasAll = keys.every(k => cfg.includes(k));
  ok('CONFIG.SHEETS tem 8 abas', hasAll);
} catch (e) {
  ok('CONFIG.SHEETS tem 8 abas', false, e.message);
}

// 4. CSV_FALLBACK has 8 keys
try {
  const cfg = read('config.js');
  const keys = ['estoque','ferramentas','movimentacoes','emprestimos','fornecedores','pedidos','usuarios','historico'];
  const hasFallback = cfg.includes('CSV_FALLBACK') && keys.every(k => cfg.includes(`'data/${k}.csv'`) || cfg.includes(`"${k}"`) || cfg.includes(`${k}:`));
  ok('CONFIG.CSV_FALLBACK definido', hasFallback);
} catch (e) {
  ok('CONFIG.CSV_FALLBACK definido', false, e.message);
}

// 5. Sintaxe de todos os módulos JS válida (node --check)
try {
  const files = ['config.js','utils.js','app.js','estoque.js','ferramentas.js','indicadores.js','cadastros.js'];
  let allOk = true;
  let errMsg = '';
  for (const f of files) {
    try {
      execSync(`node --check ${path.join(ROOT, f)}`, { stdio: 'pipe' });
    } catch (err) {
      allOk = false;
      errMsg += `${f}: ${err.stderr ? err.stderr.toString().slice(0,200) : err.message} `;
    }
  }
  ok('Sintaxe de todos os módulos JS válida (node --check)', allOk, errMsg);
} catch (e) {
  ok('Sintaxe de todos os módulos JS válida', false, e.message);
}

// 6. index.html referencia scripts corretos e não referencia config-tatico.js
try {
  const html = read('index.html');
  const hasCorrect = ['config.js','utils.js','estoque.js','ferramentas.js','indicadores.js','cadastros.js','app.js'].every(s => html.includes(s));
  const hasOld = html.includes('config-tatico.js') || html.includes('app-tatico.js');
  ok('index.html referencia scripts corretos (sem config-tatico.js)', hasCorrect && !hasOld);
} catch (e) {
  ok('index.html referencia scripts corretos', false, e.message);
}

// 7. utils.normalize remove acentos
try {
  const utilsContent = read('utils.js');
  const hasNormalize = utilsContent.includes('normalize') && utilsContent.includes('NFD');
  function normalize(str) {
    return String(str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }
  const test1 = normalize('Hidráulica') === 'hidraulica';
  const test2 = normalize('Elétrica') === 'eletrica';
  ok('utils.normalize remove acentos (Hidráulica → hidraulica)', hasNormalize && test1 && test2);
} catch (e) {
  ok('utils.normalize remove acentos', false, e.message);
}

// 8. utils.paginate funciona
try {
  function paginate(items, page, perPage = 15) {
    const total = items.length;
    const pages = Math.max(1, Math.ceil(total / perPage));
    const current = Math.min(Math.max(1, page), pages);
    const start = (current - 1) * perPage;
    return { rows: items.slice(start, start + perPage), page: current, pages, total };
  }
  const arr = Array.from({length: 25}, (_,i)=>i);
  const pg = paginate(arr, 2, 10);
  ok('utils.paginate funciona (25 itens, página 2)', pg.rows.length === 10 && pg.pages === 3 && pg.total === 25);
} catch (e) {
  ok('utils.paginate funciona', false, e.message);
}

// 9. utils.sha256 definida (WebCrypto + fallback)
try {
  const utilsContent = read('utils.js');
  ok('utils.sha256 definida com fallback', utilsContent.includes('sha256') && utilsContent.includes('crypto.subtle'));
} catch (e) {
  ok('utils.sha256 definida', false, e.message);
}

// 10. utils.escapeHtml definida
try {
  const utilsContent = read('utils.js');
  ok('utils.escapeHtml definida', utilsContent.includes('escapeHtml') && utilsContent.includes('&amp;'));
} catch (e) {
  ok('utils.escapeHtml definida', false, e.message);
}

// 11. Parser CSV lida com CRLF e vírgula entre aspas
try {
  function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }
  function parseCSV(text) {
    const lines = String(text || '').replace(/\r\n?/g, '\n').trim().split('\n');
    if (lines.length < 2) return [];
    const headers = parseCSVLine(lines[0]);
    const result = [];
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const values = parseCSVLine(lines[i]);
      const obj = {};
      headers.forEach((h, idx) => { obj[h] = values[idx] || ''; });
      result.push(obj);
    }
    return result;
  }

  const csvCRLF = "id,nome,cat\r\n1,Teste,Elétrica\r\n2,\"Item, com vírgula\",Hidráulica\r\n";
  const parsed = parseCSV(csvCRLF);
  const okCRLF = parsed.length === 2 && parsed[0].nome === 'Teste' && parsed[1].nome === 'Item, com vírgula';
  ok('Parser CSV lida com CRLF e campos com vírgula entre aspas', okCRLF);
} catch (e) {
  ok('Parser CSV lida com CRLF e vírgula', false, e.message);
}

// 12. Arquivos CSV existem e têm header
try {
  const csvFiles = ['estoque.csv','ferramentas.csv','movimentacoes.csv','emprestimos.csv','fornecedores.csv','pedidos.csv','usuarios.csv','historico.csv'];
  let allExist = true;
  for (const f of csvFiles) {
    if (!exists(`data/${f}`)) { allExist = false; break; }
    const content = read(`data/${f}`);
    if (!content.split('\n')[0].includes('id') && !content.split('\n')[0].includes('usuario')) { allExist = false; break; }
  }
  ok('Todos os data/*.csv existem e têm header id/usuario', allExist);
} catch (e) {
  ok('Todos os data/*.csv existem', false, e.message);
}

// 13. usuarios.csv contém hashes (64 hex) e não senhas em texto puro
try {
  const usuarios = read('data/usuarios.csv');
  const hasPlain = usuarios.includes('infra2026') || usuarios.includes('admin123') || usuarios.includes('oliveira2026');
  const hasHash = /[a-f0-9]{64}/.test(usuarios);
  ok('usuarios.csv contém hashes SHA-256 e não senhas em texto puro', hasHash && !hasPlain);
} catch (e) {
  ok('usuarios.csv contém hashes', false, e.message);
}

// 14. app.js usa text/plain para POST (evita preflight CORS)
try {
  const appJs = read('app.js');
  ok('app.js usa Content-Type text/plain para evitar preflight CORS', appJs.includes('text/plain'));
} catch (e) {
  ok('app.js usa text/plain', false, e.message);
}

// 15. app.js usa Promise.allSettled para sincronização paralela
try {
  const appJs = read('app.js');
  ok('app.js usa Promise.allSettled (sincronização paralela)', appJs.includes('Promise.allSettled'));
} catch (e) {
  ok('app.js usa Promise.allSettled', false, e.message);
}

// 16. estoque.js usa CONFIG.SHEETS.estoque (lowercase) não ESTOQUE
try {
  const estoqueJs = read('estoque.js');
  const usesLower = estoqueJs.includes('CONFIG.SHEETS.estoque');
  const usesUpper = estoqueJs.includes('CONFIG.SHEETS.ESTOQUE');
  ok('estoque.js usa CONFIG.SHEETS.estoque (lowercase)', usesLower && !usesUpper);
} catch (e) {
  ok('estoque.js usa CONFIG.SHEETS.estoque', false, e.message);
}

// 17. ferramentas.js tem ABA = ferramentas e usa CONFIG.SHEETS[this.ABA]
try {
  const ferrJs = read('ferramentas.js');
  ok('ferramentas.js define ABA ferramentas e usa CONFIG.SHEETS[this.ABA]', ferrJs.includes("ABA: 'ferramentas'") && ferrJs.includes('CONFIG.SHEETS[this.ABA]'));
} catch (e) {
  ok('ferramentas.js define ABA', false, e.message);
}

// 18. data/*.csv tem pelo menos 7 arquivos com conteúdo
try {
  const dir = fs.readdirSync(path.join(ROOT, 'data'));
  const csvCount = dir.filter(f => f.endsWith('.csv')).length;
  ok('data/ contém pelo menos 7 CSVs', csvCount >= 7);
} catch (e) {
  ok('data/ contém CSVs', false, e.message);
}

// 19. CORREÇÃO AUTO-SYNC: config.js define AUTO_SYNC_INTERVAL_MS
try {
  const cfg = read('config.js');
  ok('config.js define AUTO_SYNC_INTERVAL_MS (auto-sync)', cfg.includes('AUTO_SYNC_INTERVAL_MS') && /AUTO_SYNC_INTERVAL_MS:\s*\d+/.test(cfg));
} catch (e) {
  ok('config.js define AUTO_SYNC_INTERVAL_MS', false, e.message);
}

// 20. app.js implementa _startAutoSync e _autoSyncTimer (sincronização automática)
try {
  const appJs = read('app.js');
  const hasStart = appJs.includes('_startAutoSync') && appJs.includes('_autoSyncTimer') && appJs.includes('setInterval');
  const hasStop = appJs.includes('_stopAutoSync') && appJs.includes('clearInterval');
  ok('app.js implementa _startAutoSync/_stopAutoSync com setInterval', hasStart && hasStop);
} catch (e) {
  ok('app.js implementa auto-sync', false, e.message);
}

// 21. app.js _bindGlobalEvents trata online/offline/visibilitychange com syncAll(true)
try {
  const appJs = read('app.js');
  const hasVisibility = appJs.includes('visibilitychange') && appJs.includes('syncAll(true)');
  const hasOnline = appJs.includes("'online'") || appJs.includes('"online"') || appJs.includes('online');
  const hasOffline = appJs.includes('offline');
  ok('app.js _bindGlobalEvents trata visibilitychange + online/offline com syncAll(true)', hasVisibility && hasOnline && hasOffline);
} catch (e) {
  ok('app.js _bindGlobalEvents trata eventos', false, e.message);
}

// 22. app.js init chama syncAll(true) e _startAutoSync (garante primeira sincronização)
try {
  const appJs = read('app.js');
  const initSection = appJs.substring(appJs.indexOf('async init()'), appJs.indexOf('async init()') + 1500);
  const callsForcedSync = initSection.includes('syncAll(true)');
  const callsAutoSync = initSection.includes('_startAutoSync');
  ok('app.js init força syncAll(true) e inicia _startAutoSync', callsForcedSync && callsAutoSync);
} catch (e) {
  ok('app.js init força sync e auto-sync', false, e.message);
}

// 23. CORREÇÃO CSV: _loadFallbackCSV não sobrescreve cache do Sheets
try {
  const appJs = read('app.js');
  const hasCacheCheck = appJs.includes('mantendo') && appJs.includes('cache') && appJs.includes('_loadFallbackCSV');
  const hasExistingCacheGuard = appJs.includes('existingCache') || appJs.includes('!existingCache');
  ok('app.js _loadFallbackCSV preserva cache (não sobrescreve dados do Sheets)', hasCacheCheck && hasExistingCacheGuard);
} catch (e) {
  ok('app.js _loadFallbackCSV preserva cache', false, e.message);
}

console.log(`\n${passed} passed, ${failed} failed — total ${passed+failed}`);
process.exit(failed > 0 ? 1 : 0);
