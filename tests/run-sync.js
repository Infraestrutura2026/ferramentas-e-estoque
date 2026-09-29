'use strict';

// Regressões da sincronização: não reconstruir a tela nem exibir avisos em
// verificações automáticas quando os dados não mudaram.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const abas = ['estoque', 'ferramentas', 'movimentacoes', 'emprestimos', 'fornecedores', 'pedidos', 'usuarios', 'historico'];
const stored = new Map();
const config = {
  SHEETS: Object.fromEntries(abas.map(aba => [aba, `https://example.test/${aba}`])),
  CACHE_KEYS: Object.fromEntries([...abas.map(aba => [aba, `cache_${aba}`]), ['timestamp', 'cache_timestamp']]),
  CACHE_TTL_MS: 300000
};
const sandbox = {
  CONFIG: config,
  console: { log() {}, warn() {}, error() {} },
  document: { addEventListener() {}, getElementById() { return null; } },
  window: { addEventListener() {} },
  localStorage: {
    getItem(key) { return stored.has(key) ? stored.get(key) : null; },
    setItem(key, value) { stored.set(key, String(value)); }
  },
  setTimeout,
  setInterval,
  clearInterval,
  Date,
  Promise,
  JSON,
  URLSearchParams,
  AbortController
};
vm.createContext(sandbox);
vm.runInContext(`${source}\n;this.app = app;`, sandbox, { filename: 'app.js' });

const remote = Object.fromEntries(abas.map(aba => [aba, [{ id: `${aba}-1`, nome: 'Registro atual' }]]));
sandbox.app.data = Object.fromEntries(abas.map(aba => [aba, remote[aba].map(registro => ({ ...registro }))]));
let chamadasServidor = 0;
sandbox.app._fetchAba = async (aba) => {
  chamadasServidor++;
  sandbox.app.fetchSources[aba] = 'remoto';
  return remote[aba].map(registro => ({ ...registro }));
};
sandbox.app._setLoading = () => {};
sandbox.app._updateSyncBadge = () => {};
let renders = 0;
let toasts = 0;
sandbox.app._refreshCurrentPage = () => { renders++; };
sandbox.app.showToast = () => { toasts++; };

(async () => {
  await sandbox.app.syncAll(true, { quiet: true });
  if (renders !== 0 || toasts !== 0) {
    throw new Error(`Sin alteração de dados deveria manter a tela: renders=${renders}, avisos=${toasts}`);
  }
  console.log('✔ sincronização sem mudanças não redesenha a tela nem mostra toast');

  // A chamada forçada seguinte ainda consulta as oito abas mesmo com timestamp
  // de cache recém-atualizado: auto-sync não espera o TTL de cinco minutos.
  await sandbox.app.syncAll(true, { quiet: true });
  if (chamadasServidor !== abas.length * 2) {
    throw new Error(`Sync forçado deve consultar o servidor mesmo com cache fresco: chamadas=${chamadasServidor}`);
  }
  console.log('✔ sync forçado consulta o servidor mesmo com cache recém-atualizado');

  // Mudança real, mesmo mantendo o número de linhas, deve atualizar a página.
  remote.estoque = [{ id: 'estoque-1', nome: 'Nome atualizado' }];
  await sandbox.app.syncAll(true, { quiet: true });
  if (renders !== 1 || toasts !== 0) {
    throw new Error(`Mudança remota deveria redesenhar uma vez sem toast automático: renders=${renders}, avisos=${toasts}`);
  }
  console.log('✔ mudança real (mesmo tamanho) atualiza a página sem interromper com toast');

  remote.estoque = [{ id: 'estoque-1', nome: 'Nome manualmente atualizado' }];
  await sandbox.app.syncAll(true);
  if (renders !== 2 || toasts !== 1) {
    throw new Error(`Sincronização manual deveria avisar sobre a mudança: renders=${renders}, avisos=${toasts}`);
  }
  console.log('✔ sincronização manual continua notificando quando encontra alterações');
})().catch(error => {
  console.error(`✖ ${error.message}`);
  process.exitCode = 1;
});
