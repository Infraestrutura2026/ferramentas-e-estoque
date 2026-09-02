/**
 * dev/server.js — Servidor de desenvolvimento local
 * ==================================================
 * Serve o frontend estático + a API /api/* usando o MESMO handler de produção
 * (api/_lib/handler.js), porém com MemoryStore (banco em memória, seed dos
 * CSVs). Assim o comportamento do app é idêntico ao da Vercel, sem precisar
 * de DATABASE_URL nem rede.
 *
 *   node dev/server.js            → http://localhost:8080
 *   PORT=3000 node dev/server.js  → porta custom
 *
 * Para testar contra o Neon REAL, defina DATABASE_URL — o servidor usa o
 * NeonStore automaticamente (requer internet).
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = parseInt(process.env.PORT || '8080', 10);
const HOST = '0.0.0.0';

const { criarHandler, criarHealthHandler, criarSetupHandler } = require('../api/_lib/handler');
const { MemoryStore, getNeonStore } = require('../api/_lib/store');

// DATABASE_URL definida → Neon real; senão → memória (singleton: dados
// persistem entre as requisições enquanto o servidor roda)
const usarNeon = !!process.env.DATABASE_URL;
const storeMemoria = new MemoryStore();
const storeFactory = usarNeon ? getNeonStore : () => storeMemoria;

const handleApi = criarHandler(storeFactory);
const handleHealth = criarHealthHandler(storeFactory);
const handleSetup = criarSetupHandler(storeFactory);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const rota = url.pathname;

  /* ── API ── */
  if (rota === '/api/health') return handleHealth(req, res);
  if (rota === '/api/setup') return handleSetup(req, res);
  const mApi = rota.match(/^\/api\/([a-zA-Z_]+)$/);
  if (mApi) {
    req.query = Object.assign({ aba: mApi[1] }, Object.fromEntries(url.searchParams));
    return handleApi(req, res);
  }

  /* ── Estáticos ── */
  let arquivo = rota === '/' ? '/index.html' : rota;
  const caminho = path.normalize(path.join(ROOT, arquivo));
  if (!caminho.startsWith(ROOT)) { res.statusCode = 403; return res.end('Proibido'); }
  fs.readFile(caminho, (err, buf) => {
    if (err) { res.statusCode = 404; return res.end('404'); }
    res.setHeader('Content-Type', MIME[path.extname(caminho)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache, must-revalidate'); // dev: sempre revalidar
    res.end(buf);
  });
});

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`\n🛠  Servidor de desenvolvimento (backend: ${usarNeon ? 'Neon REAL' : 'memória (seed dos CSVs)'})`);
    console.log(`   → http://localhost:${PORT}\n`);
  });
}

module.exports = server;
