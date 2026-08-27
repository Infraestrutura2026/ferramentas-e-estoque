/**
 * config.js — Configuração Central do Sistema
 * ============================================
 * URL do Google Apps Script já configurada (hardcoded).
 * NÃO é necessário colar URL na tela de Configuração.
 */

// URL única do Google Apps Script (fonte de verdade para todo o sistema)
const URL_BASE_APPS_SCRIPT = 'https://script.google.com/macros/s/AKfycby5BtZrK5u--oopYK75iFSGIYeCLCPJ6PNa6ka_zFx_C-4nAaxp_G4ZZ9jKjlh1WPv6oA/exec';

const CONFIG = buildConfig(URL_BASE_APPS_SCRIPT);

function buildConfig(base) {
  const withParam = (aba) => `${base}?aba=${aba}`;
  return {
    // ── Google Sheets ──
    SHEETS: {
      estoque:       withParam('estoque'),
      ferramentas:   withParam('ferramentas'),
      movimentacoes: withParam('movimentacoes'),
      emprestimos:   withParam('emprestimos'),
      fornecedores:  withParam('fornecedores'),
      pedidos:       withParam('pedidos'),
      usuarios:      withParam('usuarios'),
      historico:     withParam('historico')
    },

    // ── CSVs de fallback (mesmo repositório) ──
    CSV_FALLBACK: {
      estoque:       'data/estoque.csv',
      ferramentas:   'data/ferramentas.csv',
      movimentacoes: 'data/movimentacoes.csv',
      emprestimos:   'data/emprestimos.csv',
      fornecedores:  'data/fornecedores.csv',
      pedidos:       'data/pedidos.csv',
      usuarios:      'data/usuarios.csv',
      historico:     'data/historico.csv'
    },

    // ── Cache local ──
    CACHE_KEYS: {
      estoque:       'cache_estoque',
      ferramentas:   'cache_ferramentas',
      movimentacoes: 'cache_movimentacoes',
      emprestimos:   'cache_emprestimos',
      fornecedores:  'cache_fornecedores',
      pedidos:       'cache_pedidos',
      usuarios:      'cache_usuarios',
      historico:     'cache_historico',
      timestamp:     'cache_timestamp'
    },
    CACHE_TTL_MS: 5 * 60 * 1000,
    AUTO_SYNC_INTERVAL_MS: 60 * 1000,
    TIMEOUT_MS:   15000,

    // ── Versão ──
    VERSAO: '2.5.1',
    ORGAO:  'COMPLEXO PENAL DE MARÍLIA — POLÍCIA PENAL',
    EQUIPE: 'Núcleo de Infraestrutura e Logística · ZANONI & MARTINEZ InfraTech'
  };
}

/* ── Helpers para salvar configuração via UI ── */
const configUI = {
  getBaseUrl() {
    return URL_BASE_APPS_SCRIPT;
  },
  hasValidUrl() {
    return true;
  },
  renderConfigPage(container) {
    container.innerHTML = `
      <div class="max-w-2xl mx-auto space-y-6">
        <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 class="text-lg font-bold text-slate-900 mb-2">⚙️ Configuração do Sistema</h2>
          <p class="text-sm text-slate-500 mb-6">
            A URL do Google Apps Script já está configurada no sistema. <br>
            Se precisar alterar, edite o arquivo <code>config.js</code>.
          </p>

          <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
            <p class="text-sm text-emerald-700 font-semibold">✅ URL configurada</p>
            <p class="text-xs text-emerald-700/90 mt-1 font-mono break-all">${this.getBaseUrl()}</p>
          </div>
        </div>

        <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h3 class="text-sm font-bold text-slate-700 mb-3">Status das Abas</h3>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            ${Object.keys(CONFIG.SHEETS).map(aba => `
              <div class="border border-slate-200 rounded-lg p-3">
                <p class="text-xs text-slate-500 uppercase font-semibold">${aba}</p>
                <p class="text-sm font-mono truncate text-slate-700">${CONFIG.SHEETS[aba].substring(0, 40)}...</p>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h3 class="text-sm font-bold text-slate-700 mb-3">🧪 Testar Conexão</h3>
          <button onclick="configUI.testConnection()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-lg transition">
            🧪 Testar Conexão
          </button>
          <div id="cfg-msg" class="hidden text-sm px-3 py-2 rounded-lg mt-3"></div>
        </div>
      </div>
    `;
  },

  async testConnection() {
    const msg = document.getElementById('cfg-msg');
    msg.className = 'text-sm px-3 py-2 rounded-lg bg-amber-50 text-amber-600 border border-amber-200 font-medium';
    msg.textContent = '🔄 Testando conexão...';
    msg.classList.remove('hidden');

    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 10000);
      const res = await fetch(CONFIG.SHEETS.estoque, { signal: ctrl.signal, mode: 'cors' });
      const data = await res.json();
      const arr = Array.isArray(data) ? data : (data.data || data.result || data.records || data.values || []);
      msg.className = 'text-sm px-3 py-2 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200 font-medium';
      msg.textContent = `✅ Conexão OK! ${arr.length} registros encontrados em "estoque".`;
    } catch (e) {
      msg.className = 'text-sm px-3 py-2 rounded-lg bg-red-50 text-red-600 border border-red-200 font-medium';
      msg.textContent = '❌ Falha na conexão: ' + e.message;
    }
  }
};
