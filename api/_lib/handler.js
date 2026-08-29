/**
 * api/_lib/handler.js — Handler HTTP compartilhado (contrato = Apps Script)
 * ==========================================================================
 * Rotas (equivalentes às do Apps Script, em /api):
 *
 *   GET  /api/<aba>                        → [ {...}, ... ]         (listar)
 *   GET  /api/<aba>?action=delete&id=X     → { success:true, ... }  (remover)
 *   POST /api/<aba>  body {action:'add'|'update', aba, ...}
 *         → { success:true, message, id, aba }
 *
 *   GET  /api/health   → status da conexão + contagem por tabela
 *   GET  /api/setup    → status/força re-criação (?force=1 re-executa o setup)
 *
 * Paridade de respostas com apps-script/Code.gs: erros de domínio retornam
 * HTTP 200 com {success:false, error} (o frontend exibe a mensagem amigável).
 */

'use strict';

const { ABAS_VALIDAS } = require('./schema');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function enviarJSON(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  Object.keys(CORS_HEADERS).forEach(h => res.setHeader(h, CORS_HEADERS[h]));
  res.end(JSON.stringify(obj));
}

/** Lê o corpo bruto da requisição independente do Content-Type */
function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const bruto = Buffer.concat(chunks).toString('utf8');
      if (!bruto || !bruto.trim()) return resolve(null);
      try { resolve(JSON.parse(bruto)); } catch (e) { reject(new Error('JSON inválido: ' + e.message)); }
    });
    req.on('error', reject);
  });
}

/**
 * Handler principal. `storeFactory` é injetável (Neon na Vercel; Memory no dev).
 * Vercel Node functions: req.query já traz os parâmetros de rota/querystring.
 */
function criarHandler(storeFactory) {
  return async function handle(req, res) {
    const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
    const query = Object.assign({}, req.query, Object.fromEntries(url.searchParams));
    const aba = (query.aba || '').toString();

    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      Object.keys(CORS_HEADERS).forEach(h => res.setHeader(h, CORS_HEADERS[h]));
      return res.end();
    }

    let store;
    try {
      store = storeFactory();
    } catch (e) {
      return enviarJSON(res, 500, { success: false, error: e.message, abas: ABAS_VALIDAS });
    }

    try {
      /* ── GET: listar ou remover ── */
      if (req.method === 'GET') {
        const action = (query.action || '').toString();
        if (action === 'delete') {
          const r = await store.remove(aba, query.id);
          if (!r.removidos) return enviarJSON(res, 200, { success: false, error: 'Registro não encontrado: ' + query.id });
          return enviarJSON(res, 200, { success: true, message: 'Removido', id: r.id, aba });
        }
        const dados = await store.list(aba);
        return enviarJSON(res, 200, dados);
      }

      /* ── POST: add / update ── */
      if (req.method === 'POST') {
        let payload;
        try {
          payload = await lerCorpo(req);
        } catch (e) {
          return enviarJSON(res, 200, { success: false, error: e.message });
        }
        if (!payload || typeof payload !== 'object') {
          return enviarJSON(res, 200, { success: false, error: 'Corpo vazio ou inválido' });
        }
        const action = payload.action || 'add';
        const abaFinal = aba || payload.aba;

        if (action === 'add') {
          const r = await store.add(abaFinal, payload);
          return enviarJSON(res, 200, { success: true, message: 'Adicionado', id: r.id, aba: abaFinal });
        }
        if (action === 'update') {
          const r = await store.update(abaFinal, payload);
          return enviarJSON(res, 200, {
            success: true,
            message: r.upserted ? 'Criado via update (upsert)' : 'Atualizado',
            id: r.id,
            aba: abaFinal,
          });
        }
        return enviarJSON(res, 200, { success: false, error: 'Ação desconhecida: ' + action });
      }

      return enviarJSON(res, 200, { success: false, error: 'Método não suportado: ' + req.method });
    } catch (e) {
      const status = e.status || 200; // erros de domínio → 200 com success:false (paridade)
      const inesperado = !e.status;
      return enviarJSON(res, inesperado ? 500 : status, {
        success: false,
        error: e.message || String(e),
        aba,
      });
    }
  };
}

/** Handler de /api/health */
function criarHealthHandler(storeFactory) {
  return async function (req, res) {
    if (req.method === 'OPTIONS') { res.statusCode = 204; Object.keys(CORS_HEADERS).forEach(h => res.setHeader(h, CORS_HEADERS[h])); return res.end(); }
    try {
      const r = await storeFactory().health();
      enviarJSON(res, r.ok ? 200 : 503, Object.assign({ success: r.ok }, r));
    } catch (e) {
      enviarJSON(res, 503, { success: false, ok: false, error: e.message });
    }
  };
}

/** Handler de /api/setup */
function criarSetupHandler(storeFactory) {
  return async function (req, res) {
    if (req.method === 'OPTIONS') { res.statusCode = 204; Object.keys(CORS_HEADERS).forEach(h => res.setHeader(h, CORS_HEADERS[h])); return res.end(); }
    try {
      const url = new URL(req.url, 'http://localhost');
      const force = url.searchParams.get('force') === '1';
      const resumo = await storeFactory().ensureReady({ force: true }).catch(() => null);
      const health = await storeFactory().health();
      enviarJSON(res, 200, {
        success: true,
        message: force ? 'Setup re-executado (tabelas vazias foram populadas)' : 'Setup verificado',
        seed: resumo,
        contagens: health.contagens || {},
        backend: health.backend,
      });
    } catch (e) {
      enviarJSON(res, 500, { success: false, error: e.message });
    }
  };
}

module.exports = { criarHandler, criarHealthHandler, criarSetupHandler, enviarJSON };
