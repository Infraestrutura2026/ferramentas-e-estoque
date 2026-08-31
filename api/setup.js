/** api/setup.js — GET /api/setup → setup e, opcionalmente, merge do seed faltante */
'use strict';

const { criarSetupHandler } = require('./_lib/handler');
const { getNeonStore } = require('./_lib/store');

module.exports = criarSetupHandler(getNeonStore);
