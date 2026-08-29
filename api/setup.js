/** api/setup.js — GET /api/setup → verifica/força criação de tabelas + seed */
'use strict';

const { criarSetupHandler } = require('./_lib/handler');
const { getNeonStore } = require('./_lib/store');

module.exports = criarSetupHandler(getNeonStore);
