/**
 * config.js — Configuração Central do Sistema
 * ============================================
 * Dois backends, detecção automática pela URL:
 *
 *   • Vercel (produção)  → API /api/* com banco PostgreSQL Neon.
 *     A connection string fica na variável de ambiente DATABASE_URL da Vercel
 *     (NUNCA no código — veja DEPLOY-VERCEL.md).
 *   • GitHub Pages (espelho offline) → Google Apps Script (URL abaixo).
 *
 * Override manual: window.__NEON_API__ = true|false antes de carregar este arquivo.
 */

// URL do Google Apps Script (usada apenas no espelho do GitHub Pages)
const URL_BASE_APPS_SCRIPT = 'https://script.google.com/macros/s/AKfycby5BtZrK5u--oopYK75iFSGIYeCLCPJ6PNa6ka_zFx_C-4nAaxp_G4ZZ9jKjlh1WPv6oA/exec';

/* ── Detecção do backend pela origem ── */
(function () {
  let neon;
  if (typeof window !== 'undefined' && window.__NEON_API__ !== undefined) {
    neon = !!window.__NEON_API__; // override manual
  } else if (typeof location !== 'undefined') {
    const host = location.hostname || '';
    neon = host.endsWith('.vercel.app') || host === 'localhost' || host === '127.0.0.1';
  } else {
    neon = false;
  }
  window.__BACKEND_NEON__ = neon;
})();

const CONFIG = buildConfig(URL_BASE_APPS_SCRIPT);

function buildConfig(base) {
  const neon = typeof window !== 'undefined' && window.__BACKEND_NEON__;
  const endpoint = (aba) => neon ? `/api/${aba}` : `${base}?aba=${aba}`;
  return {
    // ── Backend ativo: 'neon' (Vercel/Postgres) ou 'appsscript' (espelho Pages) ──
    BACKEND: neon ? 'neon' : 'appsscript',
    API_HEALTH: neon ? '/api/health' : null,

    // ── Abas (mesmas URLs para todo o sistema) ──
    SHEETS: {
      estoque:       endpoint('estoque'),
      ferramentas:   endpoint('ferramentas'),
      movimentacoes: endpoint('movimentacoes'),
      emprestimos:   endpoint('emprestimos'),
      fornecedores:  endpoint('fornecedores'),
      pedidos:       endpoint('pedidos'),
      usuarios:      endpoint('usuarios'),
      historico:     endpoint('historico')
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
    VERSAO: '2.7.8',
    ORGAO:  'COMPLEXO PENAL DE MARÍLIA — POLÍCIA PENAL',
    EQUIPE: 'Núcleo de Infraestrutura e Logística · ZANONI & MARTINEZ InfraTech'
  };
}

/* ── Badge de versão: fonte única é CONFIG.VERSAO ──
   Qualquer elemento com [data-app-version] recebe "v" + VERSAO ao carregar,
   evitando versão hard-coded no HTML (bug recorrente de badge dessincronizado). */
if (typeof document !== 'undefined') {
  const sincronizarBadgeVersao = () => {
    document.querySelectorAll('[data-app-version]').forEach(el => {
      el.textContent = 'v' + CONFIG.VERSAO;
      el.title = 'Versão do sistema: ' + CONFIG.VERSAO;
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sincronizarBadgeVersao);
  else sincronizarBadgeVersao();
}

/* ── Helpers para salvar configuração via UI ── */
const configUI = {
  getBaseUrl() {
    return (typeof window !== 'undefined' && window.__BACKEND_NEON__) ? '/api/<aba>' : URL_BASE_APPS_SCRIPT;
  },
  hasValidUrl() {
    return true;
  },
  renderConfigPage(container) {
    const neon = CONFIG.BACKEND === 'neon';
    container.innerHTML = `
      <div class="max-w-2xl mx-auto space-y-6">
        <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 class="text-lg font-bold text-slate-900 mb-2">⚙️ Configuração do Sistema</h2>
          <p class="text-sm text-slate-500 mb-6">
            Backend ${neon
              ? '<strong>Neon (PostgreSQL)</strong> via API Vercel — nada a configurar.'
              : 'Google Apps Script (espelho offline do GitHub Pages).'}
          </p>

          ${neon ? `
          <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
            <p class="text-sm text-emerald-700 font-semibold">✅ Banco Neon conectado (modo produção)</p>
            <p class="text-xs text-emerald-700/90 mt-1">API: <code class="font-mono">/api/&lt;aba&gt;</code> · Connection string guardada nas variáveis de ambiente da Vercel</p>
          </div>` : `
          <div class="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p class="text-sm text-amber-700 font-semibold">🪞 Modo espelho (GitHub Pages)</p>
            <p class="text-xs text-amber-700/90 mt-1 font-mono break-all">${this.getBaseUrl()}</p>
          </div>`}
        </div>

        <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h3 class="text-sm font-bold text-slate-700 mb-3">📋 Tabelas/Abas</h3>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            ${Object.keys(CONFIG.SHEETS).map(aba => `
              <div class="border border-slate-200 rounded-lg p-3">
                <p class="text-xs text-slate-500 uppercase font-semibold">${aba}</p>
                <p class="text-sm font-mono truncate text-slate-700">${neon ? '/api/' + aba : 'Apps Script'}</p>
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
      let detalhe;
      if (CONFIG.BACKEND === 'neon') {
        // Modo produção: /api/health informa conexão + contagem por tabela
        const res = await fetch(CONFIG.API_HEALTH, { signal: ctrl.signal });
        const h = await res.json();
        if (!h.ok) throw new Error(h.error || 'banco não respondeu');
        const total = Object.values(h.contagens || {}).reduce((s, n) => s + n, 0);
        detalhe = `✅ Neon OK! ${total} registros · tabelas: ${Object.entries(h.contagens).map(([k, v]) => k + '=' + v).join(', ')}`;
      } else {
        const res = await fetch(CONFIG.SHEETS.estoque, { signal: ctrl.signal, mode: 'cors' });
        const data = await res.json();
        const arr = Array.isArray(data) ? data : (data.data || data.result || data.records || data.values || []);
        detalhe = `✅ Conexão OK! ${arr.length} registros encontrados em "estoque".`;
      }
      msg.className = 'text-sm px-3 py-2 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200 font-medium';
      msg.textContent = detalhe;
    } catch (e) {
      msg.className = 'text-sm px-3 py-2 rounded-lg bg-red-50 text-red-600 border border-red-200 font-medium';
      msg.textContent = '❌ Falha na conexão: ' + e.message;
    }
  }
};
