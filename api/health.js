/** api/health.js — GET /api/health → status da conexão com o Neon */
'use strict';

const { criarHealthHandler } = require('./_lib/handler');
const { getNeonStore } = require('./_lib/store');

module.exports = criarHealthHandler(getNeonStore);
