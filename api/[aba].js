/**
 * api/[aba].js — Função Vercel (Node) para /api/estoque, /api/usuarios, ...
 * ==========================================================================
 * Mesmo contrato do Apps Script:
 *   GET  /api/estoque                     → [ {...} ]
 *   GET  /api/estoque?action=delete&id=X  → { success:true }
 *   POST /api/estoque {action, aba, ...}  → { success:true, id }
 *
 * A variável de ambiente DATABASE_URL (connection string do Neon) é definida
 * no painel da Vercel — nunca no código.
 */
'use strict';

const { criarHandler } = require('./_lib/handler');
const { getNeonStore } = require('./_lib/store');

module.exports = criarHandler(getNeonStore);
