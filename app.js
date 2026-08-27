/**
 * app.js — Núcleo do Sistema de Ferramentas e Estoque
 * ===================================================
 * • Sincronização robusta com Google Sheets
 * • Tela de login com autenticação local
 * • 3 usuários pré-cadastrados: 1 admin + 2 operadores
 * • Telas: Dashboard, Indicadores, Empréstimos, Estoque, Ferramentas, Histórico, Relatórios, Config
 * • Tema: Complexo Penal de Marília — Polícia Penal (azul escuro + amarelo/dourado)
 */

/* ================================================================
   AUTH MODULE — Login e Autenticação
   ================================================================ */
const authModule = {
  STORAGE_KEY: 'erp_auth_users',
  SESSION_KEY: 'erp_session',

  // Usuários pré-cadastrados (1 admin + 2 operadores)
  DEFAULT_USERS: [
    { username: 'admin', password: 'admin123', role: 'admin', nome: 'Administrador' },
    { username: 'oliveira', password: 'oliveira2026', role: 'operador', nome: 'Operador Oliveira' },
    { username: 'souza', password: 'souza2026', role: 'operador', nome: 'Operador Souza' }
  ],

  init() {
    // Garante que os usuários padrão existem
    this._ensureDefaultUsers();

    const session = this._getSession();
    if (session) {
      this._hideLogin();
      app.init();
      return;
    }
    this._showLogin();
  },

  _ensureDefaultUsers() {
    const users = this._getUsers();
    let changed = false;
    for (const defaultUser of this.DEFAULT_USERS) {
      if (!users.some(u => u.username === defaultUser.username)) {
        users.push({ ...defaultUser });
        changed = true;
      }
    }
    if (changed) {
      this._saveUsers(users);
    }
  },

  _getUsers() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  },

  _saveUsers(users) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(users));
  },

  _getSession() {
    try {
      const raw = sessionStorage.getItem(this.SESSION_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw);
      if (Date.now() - session.timestamp > 8 * 60 * 60 * 1000) {
        sessionStorage.removeItem(this.SESSION_KEY);
        return null;
      }
      return session;
    } catch (e) { return null; }
  },

  _setSession(user) {
    sessionStorage.setItem(this.SESSION_KEY, JSON.stringify({
      username: user.username,
      role: user.role || 'operador',
      nome: user.nome || user.username,
      timestamp: Date.now()
    }));
  },

  doLogin() {
    const userInput = document.getElementById('login-user');
    const passInput = document.getElementById('login-pass');
    const errorDiv = document.getElementById('login-error');

    const username = (userInput?.value || '').trim().toLowerCase();
    const password = passInput?.value || '';

    if (!username || !password) {
      this._showError(errorDiv, 'Preencha usuário e senha.');
      return;
    }

    const users = this._getUsers();
    const user = users.find(u => u.username === username);

    if (!user) {
      this._showError(errorDiv, 'Usuário não encontrado.');
      return;
    }

    if (user.password !== password) {
      this._showError(errorDiv, 'Senha incorreta.');
      return;
    }

    this._setSession(user);
    this._hideLogin();
    app.init();
  },

  logout() {
    sessionStorage.removeItem(this.SESSION_KEY);
    location.reload();
  },

  _showError(el, msg) {
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
  },

  _showLogin() {
    const screen = document.getElementById('login-screen');
    if (screen) screen.style.display = 'flex';
  },

  _hideLogin() {
    const screen = document.getElementById('login-screen');
    if (screen) {
      screen.style.opacity = '0';
      screen.style.transition = 'opacity 0.4s';
      setTimeout(() => { screen.style.display = 'none'; }, 400);
    }
  },

  getCurrentUser() {
    const session = this._getSession();
    return session ? session.username : null;
  },

  getCurrentRole() {
    const session = this._getSession();
    return session ? session.role : 'operador';
  },

  isAdmin() {
    return this.getCurrentRole() === 'admin';
  },

  fillLogin(username) {
    const userInput = document.getElementById('login-user');
    const passInput = document.getElementById('login-pass');
    if (userInput) userInput.value = username;
    if (passInput) { passInput.value = ''; passInput.focus(); }
    // Limpa erro
    const errorDiv = document.getElementById('login-error');
    if (errorDiv) errorDiv.classList.add('hidden');
  }
};

/* ================================================================
   APP CORE
   ================================================================ */
const app = {
  data: {},
  currentPage: 'dashboard',
  isLoading: false,
  lastSync: null,
  syncErrors: [],

  /* ── Inicialização ── */
  async init() {
    console.log('[APP] Iniciando sistema v' + (CONFIG?.VERSAO || '2.4.0') + '...');
    this._initTheme();
    this._renderLayout();
    this._bindNavigation();
    this._bindGlobalEvents();

    // Carrega cache imediatamente
    this._loadFromCache();

    // Carrega CSVs locais PRIMEIRO (offline-first) para exibir dados imediatamente
    await this._loadFallbackCSV();

    // Tenta sincronizar com Google Sheets em segundo plano (não bloqueia UI)
    this.syncAll().catch(e => console.warn('[SYNC] Erro em segundo plano:', e));

    // Dispara a tela inicial
    this.navigate('dashboard');
  },

  /* ── Carrega CSVs locais como fonte primária (offline-first) ── */
  async _loadFallbackCSV() {
    const abas = Object.keys(CONFIG.CSV_FALLBACK);
    let loadedAny = false;
    for (const aba of abas) {
      try {
        const path = CONFIG.CSV_FALLBACK[aba];
        if (!path) continue;
        const csvData = await this._fetchCSV(path);
        if (csvData && csvData.length > 0) {
          this.data[aba] = csvData;
          sessionStorage.setItem(CONFIG.CACHE_KEYS[aba], JSON.stringify(csvData));
          console.log(`[CSV] ${aba}: ${csvData.length} registros carregados`);
          loadedAny = true;
        }
      } catch (e) {
        console.warn(`[CSV] ${aba} falhou:`, e.message);
      }
    }
    if (loadedAny) {
      this.lastSync = new Date();
      this._updateSyncBadge();
    }
  },

  /* ── Sincronização ── */
  async syncAll(force = false) {
    if (this.isLoading) return;
    this.isLoading = true;
    this._setLoading(true);
    this.syncErrors = [];

    const abas = Object.keys(CONFIG.SHEETS);
    const results = {};

    // Verifica cache
    const cachedTime = sessionStorage.getItem(CONFIG.CACHE_KEYS.timestamp);
    const isCacheFresh = cachedTime && (Date.now() - parseInt(cachedTime)) < CONFIG.CACHE_TTL_MS;

    if (isCacheFresh && !force) {
      console.log('[SYNC] Cache fresco, pulando sincronização.');
      this.isLoading = false;
      this._setLoading(false);
      return;
    }

    console.log('[SYNC] Iniciando sincronização...');

    for (const aba of abas) {
      try {
        const data = await this._fetchAba(aba);
        if (data && Array.isArray(data) && data.length > 0) {
          results[aba] = data;
          this.data[aba] = data;
          sessionStorage.setItem(CONFIG.CACHE_KEYS[aba], JSON.stringify(data));
          console.log(`[SYNC] ✔ ${aba}: ${data.length} registros`);
        } else {
          console.warn(`[SYNC] ${aba}: retornou vazio do Sheets, mantendo dados locais`);
        }
      } catch (err) {
        console.warn(`[SYNC] ✕ ${aba} falhou:`, err.message);
        this.syncErrors.push(`${aba}: ${err.message}`);
        // Mantém dados já carregados (CSV/cache) sem sobrescrever
        if (!this.data[aba] || this.data[aba].length === 0) {
          const cached = sessionStorage.getItem(CONFIG.CACHE_KEYS[aba]);
          if (cached) {
            try {
              this.data[aba] = JSON.parse(cached);
              results[aba] = this.data[aba];
              console.log(`[SYNC] ↻ ${aba} usando cache local`);
            } catch (e) {
              this.data[aba] = [];
            }
          }
        }
      }
    }

    sessionStorage.setItem(CONFIG.CACHE_KEYS.timestamp, Date.now().toString());
    this.lastSync = new Date();
    this.isLoading = false;
    this._setLoading(false);
    this._updateSyncBadge();

    if (this.syncErrors.length > 0) {
      console.warn('[SYNC] Erros:', this.syncErrors);
      this.showToast(`⚠️ ${this.syncErrors.length} aba(s) não sincronizaram. Usando dados locais.`, 'warning');
    } else if (force) {
      this.showToast('✅ Sincronização concluída com sucesso!', 'success');
    }

    this._refreshCurrentPage();
    console.log('[SYNC] Concluído.');
    return results;
  },

  /* ── Busca uma aba: Sheets → Cache → CSV Fallback ── */
  async _fetchAba(aba) {
    const url = CONFIG.SHEETS[aba];

    if (!url || url.includes('[COMPLETAR_AQUI]')) {
      throw new Error('URL do Apps Script não configurada corretamente');
    }

    // Tenta Google Sheets
    try {
      const data = await this._fetchJSON(url, aba);
      if (data && Array.isArray(data) && data.length > 0) {
        return data;
      }
      // Se retornou array vazio, pode ser que a aba exista mas esteja vazia
      if (data && Array.isArray(data) && data.length === 0) {
        console.warn(`[SYNC] ${aba}: retornou array vazio do Sheets`);
      }
    } catch (e) {
      console.warn(`[SYNC] ${aba} Sheets falhou:`, e.message);
    }

    // Tenta cache antigo
    const cached = sessionStorage.getItem(CONFIG.CACHE_KEYS[aba]);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed.length > 0) return parsed;
      } catch (e) {}
    }

    // Último recurso: CSV local (fallback)
    try {
      const csvData = await this._fetchCSV(CONFIG.CSV_FALLBACK[aba]);
      if (csvData && csvData.length > 0) {
        console.log(`[SYNC] ${aba}: ${csvData.length} registros do CSV fallback`);
        return csvData;
      }
    } catch (e) {
      console.warn(`[SYNC] ${aba} CSV fallback falhou:`, e.message);
    }

    return [];
  },

  /* ── Fetch JSON com timeout e múltiplos formatos de resposta ── */
  _fetchJSON(url, aba) {
    return new Promise((resolve, reject) => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => {
        ctrl.abort();
        reject(new Error('Timeout — verifique a URL do Apps Script'));
      }, CONFIG.TIMEOUT_MS);

      fetch(url, { signal: ctrl.signal, mode: 'cors' })
        .then(r => {
          clearTimeout(timer);
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .then(data => {
          // Tenta extrair array de vários formatos possíveis de resposta
          let payload = data;
          if (Array.isArray(data)) {
            payload = data;
          } else if (data && typeof data === 'object') {
            // Tenta múltiplos formatos de resposta comuns do Apps Script
            payload = data.data || data.result || data.records || data.values || data.rows || data.items || data;
          }
          // Se ainda não é array, tenta converter objeto em array
          if (!Array.isArray(payload)) {
            // Se o objeto tem chaves numéricas, pode ser um array-like
            if (Object.keys(payload).every(k => !isNaN(k))) {
              payload = Object.values(payload);
            } else {
              payload = [payload]; // Objeto único, converte para array
            }
          }
          resolve(payload);
        })
        .catch(err => {
          clearTimeout(timer);
          reject(err);
        });
    });
  },

  /* ── Fetch CSV local e converte para JSON ── */
  async _fetchCSV(path) {
    if (!path) return [];
    try {
      const res = await fetch(path, { mode: 'cors' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      return this._parseCSV(text);
    } catch (e) {
      return [];
    }
  },

  _parseCSV(text) {
    // Normaliza quebras de linha (CRLF → LF) para não corromper o último campo
    const lines = text.replace(/\r\n?/g, '\n').trim().split('\n');
    if (lines.length < 2) return [];
    const headers = this._parseCSVLine(lines[0]);
    const result = [];
    for (let i = 1; i < lines.length; i++) {
      const values = this._parseCSVLine(lines[i]);
      const obj = {};
      headers.forEach((h, idx) => { obj[h] = values[idx] || ''; });
      result.push(obj);
    }
    return result;
  },

  _parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  },

  /* ── Cache local ── */
  _loadFromCache() {
    const keys = Object.keys(CONFIG.CACHE_KEYS).filter(k => k !== 'timestamp');
    keys.forEach(aba => {
      const raw = sessionStorage.getItem(CONFIG.CACHE_KEYS[aba]);
      if (raw) {
        try { this.data[aba] = JSON.parse(raw); } catch (e) {}
      }
    });
  },

  /* ── Navegação ── */
  navigate(page) {
    this.currentPage = page;
    this._updateActiveNav();

    const main = document.getElementById('main-content');
    if (!main) return;
    main.innerHTML = '';

    switch (page) {
      case 'dashboard':
        this._renderDashboard(main);
        break;
      case 'estoque':
        estoqueModule.render(main);
        break;
      case 'ferramentas':
        ferramentasModule.render(main);
        break;
      case 'indicadores':
        indicadoresModule.render(main);
        break;
      case 'emprestimos':
        this._renderEmprestimos(main);
        break;
      case 'historico':
        this._renderHistorico(main);
        break;
      case 'relatorios':
        this._renderRelatorios(main);
        break;
      default:
        this._renderDashboard(main);
    }
  },

  _refreshCurrentPage() {
    this.navigate(this.currentPage);
  },

  /* ── Render layout base ── */
  _renderLayout() {
    const root = document.getElementById('app');
    if (!root || root.dataset.layoutReady) return;

    const orgao = CONFIG?.ORGAO || 'COMPLEXO PENAL DE MARÍLIA';
    const versao = CONFIG?.VERSAO || '2.4.0';
    const usuario = authModule.getCurrentUser() || 'Usuário';
    const role = authModule.getCurrentRole() || 'operador';
    const roleLabel = role === 'admin' ? 'Administrador' : 'Operador';

    root.innerHTML = `
      <div class="min-h-screen bg-[#0a0a0a] flex">
        <!-- Sidebar -->
        <aside id="sidebar" class="w-64 bg-[#0f0f0f] text-white flex flex-col shadow-xl transition-transform duration-300 fixed inset-y-0 left-0 z-50 lg:relative lg:translate-x-0 -translate-x-full">
          <div class="px-5 py-5 border-b border-[#2a2a2a]">
            <div class="flex items-center gap-3 mb-1">
              <div class="w-10 h-10 rounded-lg bg-amber-600 flex items-center justify-center shadow-lg shrink-0">
                <i class="fas fa-toolbox text-black text-lg"></i>
              </div>
              <div class="min-w-0">
                <h1 class="font-bold text-sm leading-tight truncate">Ferramentas & Estoque</h1>
                <p class="text-[10px] text-gray-500 uppercase tracking-wider truncate">${orgao}</p>
              </div>
            </div>
          </div>

          <nav class="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            ${this._navItem('dashboard', 'fa-tachometer-alt', 'Dashboard')}
            ${this._navItem('indicadores', 'fa-chart-pie', 'Indicadores')}
            ${this._navItem('emprestimos', 'fa-hand-holding', 'Empréstimos')}
            ${this._navItem('estoque', 'fa-boxes', 'Estoque')}
            ${this._navItem('ferramentas', 'fa-tools', 'Ferramentas')}
            ${this._navItem('historico', 'fa-history', 'Histórico')}
            ${this._navItem('relatorios', 'fa-file-alt', 'Relatórios')}
          </nav>

          <div class="px-3 py-3 border-t border-[#2a2a2a] space-y-2">
            <button onclick="app.syncAll(true)" class="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-400 text-white text-sm font-semibold transition shadow">
              <i class="fas fa-sync-alt" id="sync-icon"></i>
              <span>Sincronizar</span>
            </button>
            <button onclick="authModule.logout()" class="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-red-900/50 hover:bg-red-900 text-red-300 text-xs font-medium transition border border-red-800/50">
              <i class="fas fa-sign-out-alt"></i>
              <span>Sair</span>
            </button>
            <p id="sync-status" class="text-[10px] text-gray-500 text-center">Aguardando sincronização...</p>
          </div>
        </aside>

        <!-- Overlay mobile -->
        <div id="sidebar-overlay" class="fixed inset-0 bg-black/50 z-40 hidden lg:hidden" onclick="app._toggleSidebar()"></div>

        <!-- Main -->
        <div class="flex-1 flex flex-col min-w-0">
          <!-- Topbar -->
          <header class="bg-[#141414] border-b border-[#2a2a2a] px-4 py-3 flex items-center justify-between sticky top-0 z-30">
            <button onclick="app._toggleSidebar()" class="lg:hidden p-2 rounded-lg hover:bg-[#1a1a1a] text-gray-400">
              <i class="fas fa-bars"></i>
            </button>
            <div class="flex items-center gap-3 min-w-0">
              <span id="page-title" class="font-bold text-white truncate">Dashboard</span>
              <span id="sync-badge" class="hidden text-[10px] px-2 py-0.5 rounded-full bg-green-900/30 text-green-400 border border-green-800/50 font-medium whitespace-nowrap">Sincronizado</span>
            </div>
            <div class="flex items-center gap-3 shrink-0">
              <span class="text-xs text-gray-500 hidden sm:inline">${new Date().toLocaleDateString('pt-BR')}</span>
              <div class="text-right hidden md:block">
                <p class="text-[10px] text-gray-500 leading-tight">${usuario}</p>
                <p class="text-[10px] text-amber-400 font-semibold leading-tight">${roleLabel}</p>
              </div>
              <div class="w-8 h-8 rounded-full bg-[#1a1a1a] text-amber-400 flex items-center justify-center text-xs font-bold border-2 border-amber-500 shrink-0" title="${usuario}">
                ${usuario.charAt(0).toUpperCase()}
              </div>
            </div>
          </header>

          <!-- Conteúdo -->
          <main id="main-content" class="flex-1 p-4 lg:p-6 overflow-auto">
            <div class="flex items-center justify-center h-64">
              <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-500"></div>
            </div>
          </main>
        </div>
      </div>
    `;

    root.dataset.layoutReady = 'true';
  },

  _navItem(page, icon, label) {
    return `
      <button data-page="${page}" onclick="app.navigate('${page}')" class="nav-item w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:bg-[#1a1a1a] hover:text-white transition">
        <i class="fas ${icon} w-5 text-center"></i>
        <span>${label}</span>
      </button>
    `;
  },

  _updateActiveNav() {
    document.querySelectorAll('.nav-item').forEach(btn => {
      const isActive = btn.dataset.page === this.currentPage;
      btn.classList.toggle('bg-[#1a1a1a]', isActive);
      btn.classList.toggle('text-white', isActive);
      btn.classList.toggle('text-gray-400', !isActive);
      if (isActive) btn.classList.add('shadow-sm');
      else btn.classList.remove('shadow-sm');
    });
    const titleMap = {
      dashboard: 'Dashboard', indicadores: 'Indicadores',
      emprestimos: 'Empréstimos', estoque: 'Estoque',
      ferramentas: 'Ferramentas', historico: 'Histórico',
      relatorios: 'Relatórios'
    };
    const pt = document.getElementById('page-title');
    if (pt) pt.textContent = titleMap[this.currentPage] || 'Sistema';
  },

  _toggleSidebar() {
    const sb = document.getElementById('sidebar');
    const ov = document.getElementById('sidebar-overlay');
    if (!sb) return;
    const isHidden = sb.classList.contains('-translate-x-full');
    sb.classList.toggle('-translate-x-full', !isHidden);
    if (ov) ov.classList.toggle('hidden', !isHidden);
  },

  /* ── Loading & Sync UI ── */
  _setLoading(show) {
    const icon = document.getElementById('sync-icon');
    if (icon) icon.classList.toggle('fa-spin', show);
  },

  _updateSyncBadge() {
    const badge = document.getElementById('sync-badge');
    const status = document.getElementById('sync-status');
    if (this.lastSync) {
      const timeStr = this.lastSync.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      if (badge) { badge.classList.remove('hidden'); badge.textContent = this.syncErrors.length ? 'Com erros' : 'Sincronizado'; }
      if (badge && this.syncErrors.length) { badge.className = 'text-[10px] px-2 py-0.5 rounded-full bg-amber-900/30 text-amber-400 border border-amber-800/50 font-medium whitespace-nowrap'; }
      if (status) status.textContent = `Última: ${timeStr}`;
    }
  },

  _initTheme() {
    // Tailwind já cuida do tema
  },

  _bindNavigation() {
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case '1': e.preventDefault(); this.navigate('dashboard'); break;
          case '2': e.preventDefault(); this.navigate('estoque'); break;
          case '3': e.preventDefault(); this.navigate('ferramentas'); break;
          case '4': e.preventDefault(); this.navigate('indicadores'); break;
          case 'r': e.preventDefault(); this.syncAll(true); break;
        }
      }
    });
  },

  _bindGlobalEvents() {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.syncAll();
      }
    });
  },

  /* ── Dashboard ── */
  _renderDashboard(container) {
    const estoque = app.data.estoque || [];
    const ferramentas = app.data.ferramentas || [];
    const movs = app.data.movimentacoes || [];

    const totalItens = estoque.length;
    const totalFerramentas = ferramentas.length;
    const totalMov = movs.length;

    const zerados = estoque.filter(i => (parseFloat(i.quantidadeAtual) || 0) === 0).length;
    const criticos = estoque.filter(i => {
      const q = parseFloat(i.quantidadeAtual) || 0;
      const m = parseFloat(i.quantidadeMinima) || 0;
      return q > 0 && q <= m;
    }).length;
    const ok = estoque.filter(i => {
      const q = parseFloat(i.quantidadeAtual) || 0;
      const m = parseFloat(i.quantidadeMinima) || 0;
      return q > m;
    }).length;

    const recentes = movs.slice(-5).reverse();

    container.innerHTML = `
      <div class="space-y-6">
        <!-- Cards resumo -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="bg-[#141414] rounded-xl shadow-sm border border-[#2a2a2a] p-5">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs text-gray-500 uppercase font-semibold">Itens em Estoque</p>
                <p class="text-2xl font-bold text-white mt-1">${totalItens}</p>
              </div>
              <div class="w-10 h-10 rounded-lg bg-blue-900/30 flex items-center justify-center text-blue-400">
                <i class="fas fa-boxes"></i>
              </div>
            </div>
          </div>
          <div class="bg-[#141414] rounded-xl shadow-sm border border-[#2a2a2a] p-5">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs text-gray-500 uppercase font-semibold">Ferramentas</p>
                <p class="text-2xl font-bold text-white mt-1">${totalFerramentas}</p>
              </div>
              <div class="w-10 h-10 rounded-lg bg-amber-900/30 flex items-center justify-center text-amber-400">
                <i class="fas fa-tools"></i>
              </div>
            </div>
          </div>
          <div class="bg-[#141414] rounded-xl shadow-sm border border-[#2a2a2a] p-5">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs text-gray-500 uppercase font-semibold">Movimentações</p>
                <p class="text-2xl font-bold text-white mt-1">${totalMov}</p>
              </div>
              <div class="w-10 h-10 rounded-lg bg-green-900/30 flex items-center justify-center text-green-400">
                <i class="fas fa-exchange-alt"></i>
              </div>
            </div>
          </div>
          <div class="bg-[#141414] rounded-xl shadow-sm border border-[#2a2a2a] p-5">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs text-gray-500 uppercase font-semibold">Críticos / Esgotados</p>
                <p class="text-2xl font-bold ${zerados > 0 ? 'text-red-400' : criticos > 0 ? 'text-amber-400' : 'text-white'} mt-1">${zerados + criticos}</p>
              </div>
              <div class="w-10 h-10 rounded-lg ${zerados > 0 ? 'bg-red-100 text-red-400' : criticos > 0 ? 'bg-amber-100 text-amber-400' : 'bg-[#1a1a1a] text-gray-400'} flex items-center justify-center">
                <i class="fas ${zerados > 0 ? 'fa-exclamation-triangle' : criticos > 0 ? 'fa-exclamation-circle' : 'fa-check-circle'}"></i>
              </div>
            </div>
          </div>
        </div>

        <!-- Alertas -->
        ${zerados > 0 ? `
        <div class="bg-red-900/20 border border-red-800/50 rounded-xl p-4 flex items-start gap-3">
          <i class="fas fa-exclamation-triangle text-red-400 mt-0.5"></i>
          <div>
            <p class="text-sm font-bold text-red-400">${zerados} item(s) esgotado(s)</p>
            <p class="text-xs text-red-400 mt-1">Verifique a tela de Estoque para reposição.</p>
          </div>
        </div>
        ` : ''}

        ${criticos > 0 ? `
        <div class="bg-amber-900/20 border border-amber-800/50 rounded-xl p-4 flex items-start gap-3">
          <i class="fas fa-exclamation-circle text-amber-400 mt-0.5"></i>
          <div>
            <p class="text-sm font-bold text-amber-400">${criticos} item(s) em nível crítico</p>
            <p class="text-xs text-amber-400 mt-1">Quantidade abaixo ou igual ao mínimo permitido.</p>
          </div>
        </div>
        ` : ''}

        <!-- Gráfico de status -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div class="bg-[#141414] rounded-xl shadow-sm border border-[#2a2a2a] p-5">
            <h3 class="text-sm font-bold text-gray-300 mb-4">Status do Estoque</h3>
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-sm text-gray-400">✅ Normal</span>
                <span class="text-sm font-bold text-white">${ok}</span>
              </div>
              <div class="w-full bg-[#1a1a1a] rounded-full h-2">
                <div class="bg-green-600 h-2 rounded-full" style="width: ${totalItens ? (ok/totalItens*100) : 0}%"></div>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-sm text-gray-400">⚠️ Crítico</span>
                <span class="text-sm font-bold text-amber-400">${criticos}</span>
              </div>
              <div class="w-full bg-[#1a1a1a] rounded-full h-2">
                <div class="bg-amber-600 h-2 rounded-full" style="width: ${totalItens ? (criticos/totalItens*100) : 0}%"></div>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-sm text-gray-400">❌ Esgotado</span>
                <span class="text-sm font-bold text-red-400">${zerados}</span>
              </div>
              <div class="w-full bg-[#1a1a1a] rounded-full h-2">
                <div class="bg-red-600 h-2 rounded-full" style="width: ${totalItens ? (zerados/totalItens*100) : 0}%"></div>
              </div>
            </div>
          </div>

          <div class="bg-[#141414] rounded-xl shadow-sm border border-[#2a2a2a] p-5 lg:col-span-2">
            <h3 class="text-sm font-bold text-gray-300 mb-4">Últimas Movimentações</h3>
            ${recentes.length ? `
              <div class="overflow-x-auto">
                <table class="w-full text-sm">
                  <thead><tr class="bg-[#1a1a1a] border-b border-[#2a2a2a]">
                    <th class="px-4 py-2 text-left font-semibold text-gray-400">Data</th>
                    <th class="px-4 py-2 text-left font-semibold text-gray-400">Tipo</th>
                    <th class="px-4 py-2 text-left font-semibold text-gray-400">Item</th>
                    <th class="px-4 py-2 text-center font-semibold text-gray-400">Qtd</th>
                  </tr></thead>
                  <tbody>
                    ${recentes.map(m => {
                      const tipo = (m.tipo || m.operacao || 'Mov.').toLowerCase();
                      const tipoClass = tipo.includes('entrada') || tipo.includes('compra') ? 'text-green-400' : tipo.includes('saida') || tipo.includes('retirada') ? 'text-red-400' : 'text-gray-400';
                      return `<tr class="border-b border-[#1f1f1f] hover:bg-[#0a0a0a]/60">
                        <td class="px-4 py-2 text-gray-500">${m.data || m.dataHora || '—'}</td>
                        <td class="px-4 py-2 font-semibold ${tipoClass}">${utils.escapeHtml(m.tipo || m.operacao || '—')}</td>
                        <td class="px-4 py-2">${utils.escapeHtml(m.itemNome || m.item || m.nome || '—')}</td>
                        <td class="px-4 py-2 text-center font-mono">${m.quantidade || '—'}</td>
                      </tr>`;
                    }).join('')}
                  </tbody>
                </table>
              </div>
            ` : '<p class="text-gray-500 text-center py-8">Nenhuma movimentação recente.</p>'}
          </div>
        </div>
      </div>
    `;
  },

  _isFerramenta(item) {
    const nome = (item.nome || item.name || '').toLowerCase();
    return nome.includes('ferramenta') || nome.includes('parafusadeira') || nome.includes('furadeira')
      || nome.includes('serra') || nome.includes('chave') || nome.includes('alicate') || nome.includes('martelo');
  },

  /* ── Empréstimos ── */
  _renderEmprestimos(container) {
    const items = app.data.emprestimos || [];
    container.innerHTML = `
      <div class="bg-[#141414] rounded-xl shadow-sm border border-[#2a2a2a] p-6">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-bold text-white">Empréstimos</h2>
          <span class="text-xs text-gray-500">${items.length} registros</span>
        </div>
        ${items.length ? `
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead><tr class="bg-[#1a1a1a] border-b border-[#2a2a2a]">
                <th class="px-4 py-2 text-left font-semibold text-gray-400">Data</th>
                <th class="px-4 py-2 text-left font-semibold text-gray-400">Item</th>
                <th class="px-4 py-2 text-left font-semibold text-gray-400">Solicitante</th>
                <th class="px-4 py-2 text-center font-semibold text-gray-400">Qtd</th>
                <th class="px-4 py-2 text-center font-semibold text-gray-400">Status</th>
              </tr></thead>
              <tbody>
                ${items.map(e => {
                  const st = (e.status || 'Pendente').toLowerCase();
                  const stClass = st.includes('devol') ? 'bg-green-900/30 text-green-400 border border-green-800/50' : st.includes('atras') ? 'bg-red-900/30 text-red-400 border border-red-800/50' : 'bg-amber-900/30 text-amber-400 border border-amber-800/50';
                  return `<tr class="border-b border-[#1f1f1f] hover:bg-[#0a0a0a]/60">
                    <td class="px-4 py-2">${e.data || '—'}</td>
                    <td class="px-4 py-2 font-medium">${utils.escapeHtml(e.item || e.nome || '—')}</td>
                    <td class="px-4 py-2">${utils.escapeHtml(e.solicitante || e.usuario || '—')}</td>
                    <td class="px-4 py-2 text-center font-mono">${e.quantidade || '—'}</td>
                    <td class="px-4 py-2 text-center"><span class="inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${stClass}">${e.status || 'Pendente'}</span></td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        ` : '<p class="text-gray-500 text-center py-8">Nenhum empréstimo registrado.</p>'}
      </div>`;
  },

  /* ── Histórico ── */
  _renderHistorico(container) {
    const hist = app.data.historico || app.data.movimentacoes || [];
    container.innerHTML = `
      <div class="bg-[#141414] rounded-xl shadow-sm border border-[#2a2a2a] p-6">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-bold text-white">Histórico de Movimentações</h2>
          <span class="text-xs text-gray-500">${hist.length} registros</span>
        </div>
        ${hist.length ? `
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead><tr class="bg-[#1a1a1a] border-b border-[#2a2a2a]">
                <th class="px-4 py-2 text-left font-semibold text-gray-400">Data/Hora</th>
                <th class="px-4 py-2 text-left font-semibold text-gray-400">Operação</th>
                <th class="px-4 py-2 text-left font-semibold text-gray-400">Item</th>
                <th class="px-4 py-2 text-center font-semibold text-gray-400">Qtd</th>
                <th class="px-4 py-2 text-left font-semibold text-gray-400">Usuário</th>
              </tr></thead>
              <tbody>
                ${hist.map(h => {
                  const op = (h.operacao || h.tipo || 'Mov.').toLowerCase();
                  const opClass = op.includes('entrada') || op.includes('compra') ? 'text-green-400' : op.includes('saida') || op.includes('retirada') ? 'text-red-400' : 'text-gray-400';
                  return `<tr class="border-b border-[#1f1f1f] hover:bg-[#0a0a0a]/60">
                    <td class="px-4 py-2 text-gray-500">${h.data || h.dataHora || '—'}</td>
                    <td class="px-4 py-2 font-semibold ${opClass}">${utils.escapeHtml(h.operacao || h.tipo || '—')}</td>
                    <td class="px-4 py-2">${utils.escapeHtml(h.item || h.nome || '—')}</td>
                    <td class="px-4 py-2 text-center font-mono">${h.quantidade || '—'}</td>
                    <td class="px-4 py-2">${utils.escapeHtml(h.usuario || h.responsavel || '—')}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        ` : '<p class="text-gray-500 text-center py-8">Nenhum histórico disponível.</p>'}
      </div>`;
  },

  /* ── Relatórios ── */
  _renderRelatorios(container) {
    const estoque = app.data.estoque || [];
    const total = estoque.length;
    const zerados = estoque.filter(i => (parseFloat(i.quantidadeAtual) || 0) === 0).length;
    const criticos = estoque.filter(i => {
      const q = parseFloat(i.quantidadeAtual) || 0;
      const m = parseFloat(i.quantidadeMinima) || 0;
      return q > 0 && q <= m;
    }).length;

    const catMap = {};
    estoque.forEach(i => {
      const cat = i.categoria || 'Sem categoria';
      if (!catMap[cat]) catMap[cat] = { count: 0, qtd: 0, zerados: 0 };
      catMap[cat].count++;
      catMap[cat].qtd += parseFloat(i.quantidadeAtual) || 0;
      if ((parseFloat(i.quantidadeAtual) || 0) === 0) catMap[cat].zerados++;
    });

    container.innerHTML = `
      <div class="space-y-6">
        <div class="bg-[#141414] rounded-xl shadow-sm border border-[#2a2a2a] p-6">
          <h2 class="text-lg font-bold text-white mb-4">📊 Relatório de Estoque</h2>
          <div class="grid grid-cols-3 gap-4 mb-6">
            <div class="bg-[#0a0a0a] rounded-lg p-4 text-center">
              <p class="text-2xl font-bold text-white">${total}</p>
              <p class="text-xs text-gray-500 uppercase">Total de Itens</p>
            </div>
            <div class="bg-red-900/20 rounded-lg p-4 text-center">
              <p class="text-2xl font-bold text-red-400">${zerados}</p>
              <p class="text-xs text-red-400 uppercase">Esgotados</p>
            </div>
            <div class="bg-amber-900/20 rounded-lg p-4 text-center">
              <p class="text-2xl font-bold text-amber-400">${criticos}</p>
              <p class="text-xs text-amber-400 uppercase">Críticos</p>
            </div>
          </div>

          <h3 class="text-sm font-bold text-gray-300 mb-3">Por Categoria</h3>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead><tr class="bg-[#1a1a1a] border-b border-[#2a2a2a]">
                <th class="px-4 py-2 text-left font-semibold text-gray-400">Categoria</th>
                <th class="px-4 py-2 text-center font-semibold text-gray-400">Itens</th>
                <th class="px-4 py-2 text-center font-semibold text-gray-400">Qtd Total</th>
                <th class="px-4 py-2 text-center font-semibold text-gray-400">Esgotados</th>
              </tr></thead>
              <tbody>
                ${Object.entries(catMap).sort((a, b) => b[1].count - a[1].count).map(([cat, info]) => `
                  <tr class="border-b border-[#1f1f1f] hover:bg-[#0a0a0a]/60">
                    <td class="px-4 py-2">${utils.categoriaBadge(cat)}</td>
                    <td class="px-4 py-2 text-center font-medium">${info.count}</td>
                    <td class="px-4 py-2 text-center font-mono">${info.qtd}</td>
                    <td class="px-4 py-2 text-center">
                      ${info.zerados > 0 ? `<span class="text-red-400 font-bold">${info.zerados}</span>` : '<span class="text-gray-500">—</span>'}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div class="bg-[#141414] rounded-xl shadow-sm border border-[#2a2a2a] p-6">
          <h3 class="text-sm font-bold text-gray-300 mb-3">📥 Exportar Dados</h3>
          <div class="flex flex-wrap gap-3">
            <button onclick="app._exportCSV('estoque')" class="px-4 py-2 bg-[#1a1a1a] hover:bg-[#2a2a2a] text-white text-sm font-medium rounded-lg transition">
              <i class="fas fa-file-csv mr-1"></i> Estoque CSV
            </button>
            <button onclick="app._exportCSV('ferramentas')" class="px-4 py-2 bg-amber-600 hover:bg-amber-400 text-white text-sm font-medium rounded-lg transition">
              <i class="fas fa-file-csv mr-1"></i> Ferramentas CSV
            </button>
            <button onclick="window.print()" class="px-4 py-2 bg-[#1a1a1a] hover:bg-[#2a2a2a] text-gray-300 text-sm font-medium rounded-lg transition">
              <i class="fas fa-print mr-1"></i> Imprimir
            </button>
          </div>
        </div>
      </div>
    `;
  },

  _exportCSV(aba) {
    const data = app.data[aba] || [];
    if (!data.length) { alert('Nenhum dado para exportar.'); return; }
    const headers = Object.keys(data[0]);
    const csv = [
      headers.join(','),
      ...data.map(row => headers.map(h => `"${(row[h] || '').toString().replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${aba}_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
  },

  /* ── Modal ── */
  openModal(title, bodyHTML, onConfirm) {
    const existing = document.getElementById('app-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'app-modal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
      <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" onclick="app.closeModal()"></div>
      <div class="relative bg-[#141414] rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col fade-in">
        <div class="px-5 py-4 border-b border-[#2a2a2a] flex items-center justify-between">
          <h3 class="text-base font-bold text-white">${utils.escapeHtml(title)}</h3>
          <button onclick="app.closeModal()" class="text-gray-500 hover:text-gray-400"><i class="fas fa-times"></i></button>
        </div>
        <div id="modal-body" class="px-5 py-4 overflow-y-auto flex-1">${bodyHTML}</div>
        <div class="px-5 py-3 border-t border-[#2a2a2a] bg-[#0a0a0a] flex justify-end gap-2">
          <button onclick="app.closeModal()" class="px-4 py-2 text-sm text-gray-400 hover:bg-[#2a2a2a] rounded-lg transition">Cancelar</button>
          <button id="modal-confirm" class="px-4 py-2 text-sm bg-amber-600 text-black hover:bg-amber-500 rounded-lg transition font-medium">Salvar</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    if (onConfirm) {
      document.getElementById('modal-confirm').addEventListener('click', onConfirm);
    } else {
      document.getElementById('modal-confirm').style.display = 'none';
    }
  },

  closeModal() {
    const modal = document.getElementById('app-modal');
    if (modal) modal.remove();
  },

  /* ── Toast ── */
  showToast(message, type = 'info') {
    const colors = {
      success: 'bg-green-600',
      error: 'bg-red-600',
      warning: 'bg-amber-600',
      info: 'bg-[#1a1a1a]'
    };
    const icons = {
      success: 'fa-check-circle',
      error: 'fa-times-circle',
      warning: 'fa-exclamation-circle',
      info: 'fa-info-circle'
    };
    const toast = document.createElement('div');
    toast.className = `fixed bottom-5 right-5 z-50 ${colors[type] || colors.info} text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 fade-in text-sm font-medium`;
    toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span>${utils.escapeHtml(message)}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.4s'; setTimeout(() => toast.remove(), 400); }, 3000);
  },

  /* ── Sheets helpers ── */
  isSheetsConfigured() {
    return true;
  },

  async post(url, action, payload) {
    const body = JSON.stringify({ action, ...payload });
    const res = await fetch(url, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'application/json' },
      body
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  },

  async get(url, action, params = {}) {
    const qs = new URLSearchParams({ action, ...params }).toString();
    const res = await fetch(`${url}&${qs}`, { mode: 'cors' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }
};

/* ================================================================
   BOOT
   ================================================================ */
document.addEventListener('DOMContentLoaded', () => {
  authModule.init();
});
