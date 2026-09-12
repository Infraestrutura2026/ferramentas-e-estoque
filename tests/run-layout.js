/**
 * tests/run-layout.js — Casca do sistema: botão "Sair" no topo, ao lado do usuário
 * ==============================================================================
 * Executa app._renderLayout() do app.js num sandbox (mesmo código do navegador)
 * e confere a estrutura gerada:
 *   1. O botão Sair fica no cabeçalho (topbar), à direita, junto do nome do usuário
 *   2. Ele saiu do rodapé da sidebar (que mantém só o status de sincronização)
 *   3. Contrato do logout e do CSS responsivo
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const utils = require('../utils.js');

let passed = 0;
let failed = 0;
function ok(name, cond, msg = '') {
  if (cond) { console.log(`✔ ${name}`); passed++; }
  else { console.error(`✖ ${name}${msg ? ': ' + msg : ''}`); failed++; }
}

function read(p) {
  return fs.readFileSync(path.join(ROOT, p), 'utf8');
}

const appJs = read('app.js');

/* ── Renderiza a casca real do sistema com um usuário logado ── */
const html = (() => {
  const rootEl = { dataset: {}, innerHTML: '' };
  const sandbox = {
    console,
    utils,
    CONFIG: { ORGAO: 'COMPLEXO PENAL DE MARÍLIA — POLÍCIA PENAL', VERSAO: '3.0.0' },
    document: {
      addEventListener() {},
      getElementById(id) { return id === 'app' ? rootEl : null; },
      querySelectorAll() { return []; },
      readyState: 'complete'
    },
    window: { addEventListener() {} },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    fetch: () => Promise.reject(new Error('offline no teste')),
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
    AbortController, URLSearchParams, TextEncoder, Date, confirm: () => true, alert: () => {}
  };
  vm.createContext(sandbox);
  vm.runInContext(
    appJs + '\n;this.app = app; this.authModule = authModule;',
    sandbox, { filename: 'app.js' }
  );
  // Sessão simulada: usuário "Osvaldo", operador
  sandbox.authModule.getCurrentUser = () => 'Osvaldo';
  sandbox.authModule.getCurrentRole = () => 'operador';
  sandbox.app._renderLayout();
  return rootEl.innerHTML;
})();

const inicio = html.indexOf('<aside');
const fim = html.indexOf('</aside>');
const sidebar = inicio >= 0 && fim > inicio ? html.slice(inicio, fim) : '';
const inicioHeader = html.indexOf('<header');
const fimHeader = html.indexOf('</header>');
const header = inicioHeader >= 0 && fimHeader > inicioHeader ? html.slice(inicioHeader, fimHeader) : '';

ok('_renderLayout gera sidebar e topbar', sidebar.length > 0 && header.length > 0);

/* 1. Botão Sair no topo, ao lado do nome do usuário logado */
ok('topbar contém o botão que chama authModule.logout()', header.includes('onclick="authModule.logout()"'));
ok('topbar exibe o nome de quem está logado', header.includes('Osvaldo'));
ok('botão Sair vem depois do nome do usuário na topbar (lado direito)',
  header.indexOf('onclick="authModule.logout()"') > header.indexOf('Osvaldo'));
ok('botão Sair tem rótulo e acessibilidade (title/aria-label + texto "Sair")',
  /<button[^>]*authModule\.logout\(\)[^>]*title="Sair do sistema"[^>]*aria-label="Sair do sistema"/.test(header) &&
  header.includes('>Sair</span>'));
ok('botão Sair segue o estilo de ação destrutiva (btn-danger) e some o texto no celular',
  /<button[^>]*class="logout-btn btn-danger/.test(header) && header.includes('class="hidden sm:inline">Sair</span>'));
ok('topbar mantém data e badge de sincronização',
  /\d{2}\/\d{2}\/\d{4}/.test(header) && header.includes('id="sync-badge"'));

/* 2. Sidebar sem o botão de sair */
ok('sidebar não tem mais o botão de sair', !sidebar.includes('authModule.logout()'));
ok('sidebar mantém o status de sincronização (#sync-status)', sidebar.includes('id="sync-status"'));
ok('layout tem exatamente um botão de logout', html.split('authModule.logout()').length - 1 === 1);

/* 3. Contrato: função de logout intacta + CSS sem regras mortas */
ok('authModule.logout continua removendo a sessão e recarregando',
  /logout\(\)\s*\{[\s\S]{0,160}sessionStorage\.removeItem\(this\.SESSION_KEY\);[\s\S]{0,80}location\.reload\(\);/.test(appJs));

const css = read('assets/responsivo.css');
ok('CSS responsivo não referencia mais botão dentro da sidebar (.sidebar .btn-danger)', !css.includes('.sidebar .btn-danger'));
ok('CSS responsivo compacta o novo botão do topo (.logout-btn) na faixa de trilho',
  css.includes('.logout-btn span') && css.includes('.logout-btn {'));

console.log(`\n${'█'.repeat(46)}`);
console.log(`  LAYOUT: ${passed} passaram, ${failed} falharam (${passed + failed} total)`);
console.log('█'.repeat(46));
process.exit(failed ? 1 : 0);
