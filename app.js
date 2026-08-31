/**
 * app.js — Núcleo do Sistema de Ferramentas e Estoque
 * ===================================================
 * • Sincronização paralela e robusta com Google Sheets
 * • Autenticação com hash SHA-256 (usuários centralizados via Sheets/CSV)
 * • Telas: Dashboard, Indicadores, Empréstimos, Estoque, Ferramentas,
 *   Histórico, Fornecedores, Pedidos, Usuários, Relatórios
 * • Tema: Complexo Penal de Marília — Polícia Penal (preto + âmbar)
 */

/* ================================================================
   AUTH MODULE — Login e Autenticação
   ================================================================ */
const authModule = {
  STORAGE_KEY: 'erp_auth_users',
  SESSION_KEY: 'erp_session',
  SESSION_TTL_MS: 8 * 60 * 60 * 1000,

  // Usuários iniciais (semente). As senhas são armazenadas como hash SHA-256,
  // nunca em texto puro. (senhas originais de implantação — troque-as!)
  DEFAULT_USERS: [
    { username: 'admin',    senhaHash: '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', role: 'admin',    nome: 'Administrador' },
    { username: 'oliveira', senhaHash: 'b3d1656305f476afeea68c55b907604f7fa06653647b6c34a8b7dfa647b65482', role: 'operador', nome: 'Operador Oliveira' },
    { username: 'souza',    senhaHash: 'eafa9c5f57c3769af7e281e9ffe1fe511780fab37a4c1f0905135fe04382961b', role: 'operador', nome: 'Operador Souza' }
  ],

  init() {
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
    const users = this._getLocalUsers();
    let changed = false;
    for (const defaultUser of this.DEFAULT_USERS) {
      if (!users.some(u => u.username === defaultUser.username)) {
        users.push({ ...defaultUser });
        changed = true;
      }
    }
    if (changed) this._saveLocalUsers(users);
  },

  _getLocalUsers() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  },

  _saveLocalUsers(users) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(users));
  },

  /**
   * Busca usuários remotos (Sheets → CSV local) para permitir login
   * igual em qualquer computador. Linhas: usuario, senha(hash), nivel.
   */
  async _fetchRemoteUsers() {
    const urls = [CONFIG.SHEETS.usuarios, CONFIG.CSV_FALLBACK.usuarios];
    for (const url of urls) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 6000);
        const res = await fetch(url, { signal: ctrl.signal, mode: 'cors' });
        clearTimeout(timer);
        if (!res.ok) continue;

        let rows = [];
        const contentType = res.headers.get('content-type') || '';
        if (url.endsWith('.csv') || contentType.includes('text')) {
          rows = app._parseCSV(await res.text());
        } else {
          const data = await res.json();
          const payload = Array.isArray(data) ? data
            : (data.data || data.result || data.records || data.values || data.rows || []);
          rows = Array.isArray(payload) ? payload : [];
        }

        const users = [];
        for (const r of rows) {
          const username = String(r.usuario || r.username || '').trim().toLowerCase();
          if (!username) continue;
          users.push({
            username,
            senhaHash: String(r.senha || r.senhaHash || '').trim(),
            role: (String(r.nivel || r.role || 'operador').trim().toLowerCase() === 'admin') ? 'admin' : 'operador',
            nome: r.nome || username
          });
        }
        if (users.length) return users;
      } catch (e) { /* tenta a próxima fonte */ }
    }
    return [];
  },

  _getSession() {
    try {
      const raw = sessionStorage.getItem(this.SESSION_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw);
      if (Date.now() - session.timestamp > this.SESSION_TTL_MS) {
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

  async doLogin() {
    const userInput = document.getElementById('login-user');
    const passInput = document.getElementById('login-pass');
    const errorDiv = document.getElementById('login-error');
    const btn = document.getElementById('login-btn');

    const username = (userInput?.value || '').trim().toLowerCase();
    const password = passInput?.value || '';

    if (!username || !password) {
      this._showError(errorDiv, 'Preencha usuário e senha.');
      return;
    }

    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin mr-2"></i>Entrando...'; }
    const restoreBtn = () => {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sign-in-alt mr-2"></i>Entrar no Sistema'; }
    };

    try {
      // Lista local + remota (remota tem precedência para senhas)
      let candidates = [...this._getLocalUsers()];
      const remote = await this._fetchRemoteUsers();
      for (const ru of remote) {
        const idx = candidates.findIndex(u => u.username === ru.username);
        if (idx >= 0) candidates[idx] = ru; else candidates.push(ru);
      }

      const user = candidates.find(u => u.username === username);
      if (!user) {
        this._showError(errorDiv, 'Usuário não encontrado.');
        restoreBtn();
        return;
      }

      const hash = await utils.sha256(password);
      const ok = (user.senhaHash && (user.senhaHash === hash || user.senhaHash === password)) // hash (ou legado)
              || (user.password && user.password === password);                               // semente local
      if (!ok) {
        this._showError(errorDiv, 'Senha incorreta.');
        restoreBtn();
        return;
      }

      this._setSession(user);
      this._hideLogin();
      app.init();
    } catch (e) {
      this._showError(errorDiv, 'Erro ao autenticar: ' + e.message);
      restoreBtn();
    }
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
    console.log('[APP] Iniciando sistema v' + (CONFIG?.VERSAO || '2.6.0') + ' — backend: ' + (CONFIG?.BACKEND || '?') + '...');
    this._renderLayout();
    this._bindNavigation();
    this._bindGlobalEvents();

    this._loadFromCache();
    await this._loadFallbackCSV();
    // Primeira sincronização força busca no Sheets para garantir dados atualizados
    this.syncAll(true).catch(e => console.warn('[SYNC] Erro em segundo plano:', e));
    this.navigate('dashboard');
    this._startAutoSync();
  },

  /* ── Carrega CSVs locais apenas quando não há cache (offline-first corrigido) ── */
  async _loadFallbackCSV() {
    const abas = Object.keys(CONFIG.CSV_FALLBACK);
    await Promise.all(abas.map(async (aba) => {
      // Se já temos dados em memória vindos do cache, não sobrescreve com CSV antigo
      if (this.data[aba] && this.data[aba].length > 0) {
        console.log(`[CSV] ${aba}: mantendo ${this.data[aba].length} registros do cache`);
        return;
      }
      try {
        const csvData = await this._fetchCSV(CONFIG.CSV_FALLBACK[aba]);
        if (csvData && csvData.length > 0) {
          this.data[aba] = csvData;
          // Só grava no cache se não houver cache prévio (evita sobrescrever dados do Sheets)
          const existingCache = localStorage.getItem(CONFIG.CACHE_KEYS[aba]);
          if (!existingCache) {
            localStorage.setItem(CONFIG.CACHE_KEYS[aba], JSON.stringify(csvData));
          }
          console.log(`[CSV] ${aba}: ${csvData.length} registros carregados (fallback)`);
        }
      } catch (e) {
        console.warn(`[CSV] ${aba} falhou:`, e.message);
      }
    }));
    if (!this.lastSync) {
      this.lastSync = new Date();
      this._updateSyncBadge();
    }
  },

  /* ── Sincronização (paralela) com suporte a auto-sync ── */
  async syncAll(force = false) {
    if (this.isLoading) {
      console.log('[SYNC] Já em andamento, ignorando chamada concorrente.');
      return;
    }
    this.isLoading = true;
    this._setLoading(true);
    this.syncErrors = [];

    const cachedTime = localStorage.getItem(CONFIG.CACHE_KEYS.timestamp);
    const isCacheFresh = cachedTime && (Date.now() - parseInt(cachedTime)) < CONFIG.CACHE_TTL_MS;

    if (isCacheFresh && !force) {
      console.log('[SYNC] Cache fresco, pulando sincronização. Use force=true para forçar.');
      this.isLoading = false;
      this._setLoading(false);
      return;
    }

    console.log(`[SYNC] Iniciando sincronização paralela... (force=${force})`);
    const abas = Object.keys(CONFIG.SHEETS);
    const settled = await Promise.allSettled(abas.map(aba => this._fetchAba(aba)));

    let hasNewData = false;
    settled.forEach((result, i) => {
      const aba = abas[i];
      if (result.status === 'fulfilled' && Array.isArray(result.value) && result.value.length > 0) {
        // Só considera mudança se tamanho ou conteúdo mudou (evita re-render desnecessário)
        const prevLen = (this.data[aba] || []).length;
        if (prevLen !== result.value.length) hasNewData = true;
        this.data[aba] = result.value;
        localStorage.setItem(CONFIG.CACHE_KEYS[aba], JSON.stringify(result.value));
        console.log(`[SYNC] ✔ ${aba}: ${result.value.length} registros`);
      } else {
        if (result.status === 'rejected') {
          this.syncErrors.push(`${aba}: ${result.reason?.message || 'erro'}`);
        }
        // Fallback para cache se não houver dados em memória
        if (!this.data[aba] || this.data[aba].length === 0) {
          const cached = localStorage.getItem(CONFIG.CACHE_KEYS[aba]);
          if (cached) { try { this.data[aba] = JSON.parse(cached); } catch (e) { this.data[aba] = []; } }
        }
      }
    });

    localStorage.setItem(CONFIG.CACHE_KEYS.timestamp, Date.now().toString());
    this.lastSync = new Date();
    this.isLoading = false;
    this._setLoading(false);
    this._updateSyncBadge();

    if (this.syncErrors.length > 0) {
      console.warn('[SYNC] Erros:', this.syncErrors);
      if (force) {
        this.showToast(`⚠️ ${this.syncErrors.length} aba(s) não sincronizaram. Usando dados locais.`, 'warning');
      }
    } else if (force) {
      if (hasNewData) {
        this.showToast('✅ Dados atualizados com sucesso!', 'success');
      } else {
        this.showToast('✅ Sincronização concluída — dados já atualizados.', 'info');
      }
    }

    this._refreshCurrentPage();
    console.log('[SYNC] Concluído.');
  },

  /* ── Re-sincroniza UMA aba (usada após gravações) ── */
  async refreshAba(aba) {
    try {
      const data = await this._fetchAba(aba);
      if (Array.isArray(data) && data.length > 0) {
        this.data[aba] = data;
        localStorage.setItem(CONFIG.CACHE_KEYS[aba], JSON.stringify(data));
      }
    } catch (e) {
      console.warn(`[SYNC] refreshAba(${aba}) falhou:`, e.message);
    }
    this._updateSyncBadge();
    this._refreshCurrentPage();
  },

  /* ── Busca uma aba: Sheets → Cache → CSV Fallback ── */
  async _fetchAba(aba) {
    const url = CONFIG.SHEETS[aba];
    if (!url || url.includes('[COMPLETAR_AQUI]')) {
      throw new Error('URL do Apps Script não configurada');
    }

    try {
      const data = await this._fetchJSON(url, aba);
      if (data && Array.isArray(data) && data.length > 0) return data;
      console.warn(`[SYNC] ${aba}: resposta vazia do Sheets`);
    } catch (e) {
      console.warn(`[SYNC] ${aba} Sheets falhou:`, e.message);
    }

    const cached = localStorage.getItem(CONFIG.CACHE_KEYS[aba]);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed.length > 0) return parsed;
      } catch (e) {}
    }

    try {
      const csvData = await this._fetchCSV(CONFIG.CSV_FALLBACK[aba]);
      if (csvData && csvData.length > 0) return csvData;
    } catch (e) { /* sem fallback */ }

    return [];
  },

  /* ── Fetch JSON com timeout ── */
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
          let payload = data;
          if (Array.isArray(data)) {
            payload = data;
          } else if (data && typeof data === 'object') {
            payload = data.data || data.result || data.records || data.values || data.rows || data.items || data;
          }
          if (!Array.isArray(payload)) {
            if (payload && typeof payload === 'object' && Object.keys(payload).every(k => !isNaN(k))) {
              payload = Object.values(payload);
            } else {
              payload = payload ? [payload] : [];
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

  /* ── Fetch CSV local ── */
  async _fetchCSV(path) {
    if (!path) return [];
    try {
      const res = await fetch(path, { mode: 'cors' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return this._parseCSV(await res.text());
    } catch (e) {
      return [];
    }
  },

  _parseCSV(text) {
    const lines = String(text || '').replace(/\r\n?/g, '\n').trim().split('\n');
    if (lines.length < 2) return [];
    const headers = this._parseCSVLine(lines[0]);
    const result = [];
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
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
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
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
    Object.keys(CONFIG.CACHE_KEYS).filter(k => k !== 'timestamp').forEach(aba => {
      const raw = localStorage.getItem(CONFIG.CACHE_KEYS[aba]);
      if (raw) { try { this.data[aba] = JSON.parse(raw); } catch (e) {} }
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
      case 'dashboard':    this._renderDashboard(main); break;
      case 'estoque':      estoqueModule.render(main); break;
      case 'ferramentas':  ferramentasModule.render(main); break;
      case 'indicadores':  indicadoresModule.render(main); break;
      case 'emprestimos':  emprestimosModule.render(main); break;
      case 'historico':    historicoModule.render(main); break;
      case 'fornecedores': fornecedoresModule.render(main); break;
      case 'pedidos':      pedidosModule.render(main); break;
      case 'usuarios':     usuariosModule.render(main); break;
      case 'relatorios':   this._renderRelatorios(main); break;
      default:             this._renderDashboard(main);
    }
  },

  _refreshCurrentPage() {
    this.navigate(this.currentPage);
  },

  /* ── Layout base ── */
  _renderLayout() {
    const root = document.getElementById('app');
    if (!root || root.dataset.layoutReady) return;

    const orgao = CONFIG?.ORGAO || 'COMPLEXO PENAL DE MARÍLIA';
    const usuario = authModule.getCurrentUser() || 'Usuário';
    const role = authModule.getCurrentRole() || 'operador';
    const roleLabel = role === 'admin' ? 'Administrador' : 'Operador';

    root.innerHTML = `
      <div class="min-h-screen bg-[#eef2f6] flex">
        <!-- Sidebar -->
        <aside id="sidebar" class="w-64 bg-white text-slate-900 flex flex-col shadow-xl transition-transform duration-300 fixed inset-y-0 left-0 z-50 lg:relative lg:translate-x-0 -translate-x-full">
          <div class="px-5 py-5 border-b border-slate-200">
            <div class="flex items-center gap-3 mb-1">
              <div class="w-10 h-10 rounded-lg bg-teal-600 flex items-center justify-center shadow-lg shrink-0">
                <i class="fas fa-toolbox text-white text-lg"></i>
              </div>
              <div class="min-w-0">
                <h1 class="font-bold text-sm leading-tight truncate">Ferramentas & Estoque</h1>
                <p class="text-[10px] text-slate-500 uppercase tracking-wider truncate">${utils.escapeHtml(orgao)}</p>
              </div>
            </div>
          </div>

          <nav class="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto" aria-label="Menu principal">
            ${this._navItem('dashboard', 'fa-tachometer-alt', 'Dashboard')}
            ${this._navItem('indicadores', 'fa-chart-pie', 'Indicadores')}
            ${this._navItem('emprestimos', 'fa-hand-holding', 'Empréstimos de Ferramentas')}
            ${this._navItem('estoque', 'fa-boxes', 'Estoque')}
            ${this._navItem('ferramentas', 'fa-tools', 'Ferramentas')}
            ${this._navItem('historico', 'fa-history', 'Histórico')}
            ${this._navItem('fornecedores', 'fa-truck', 'Fornecedores')}
            ${this._navItem('pedidos', 'fa-shopping-cart', 'Pedidos')}
            ${this._navItem('relatorios', 'fa-file-alt', 'Relatórios')}
            ${authModule.isAdmin() ? this._navItem('usuarios', 'fa-users-cog', 'Usuários') : ''}
          </nav>

          <div class="px-3 py-3 border-t border-slate-200 space-y-2">
            <button onclick="authModule.logout()" class="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 text-xs font-medium transition border border-red-200">
              <i class="fas fa-sign-out-alt"></i>
              <span>Sair</span>
            </button>
            <p id="sync-status" class="text-[10px] text-slate-500 text-center">Aguardando sincronização...</p>
          </div>
        </aside>

        <!-- Overlay mobile -->
        <div id="sidebar-overlay" class="fixed inset-0 bg-black/50 z-40 hidden lg:hidden" onclick="app._toggleSidebar()"></div>

        <!-- Main -->
        <div class="flex-1 flex flex-col min-w-0">
          <!-- Topbar -->
          <header class="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-30">
            <button onclick="app._toggleSidebar()" class="lg:hidden p-2 rounded-lg hover:bg-slate-100 text-slate-600">
              <i class="fas fa-bars"></i>
            </button>
            <div class="flex items-center gap-3 min-w-0">
              <span id="page-title" class="font-bold text-slate-900 truncate">Dashboard</span>
              <span id="sync-badge" class="hidden text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 font-medium whitespace-nowrap">Sincronizado</span>
            </div>
            <div class="flex items-center gap-3 shrink-0">
              <span class="text-xs text-slate-500 hidden sm:inline">${new Date().toLocaleDateString('pt-BR')}</span>
              <div class="text-right hidden md:block">
                <p class="text-[10px] text-slate-500 leading-tight">${utils.escapeHtml(usuario)}</p>
                <p class="text-[10px] text-teal-700 font-semibold leading-tight">${roleLabel}</p>
              </div>
              <div class="w-8 h-8 rounded-full bg-teal-50 text-teal-700 flex items-center justify-center text-xs font-bold border-2 border-teal-600 shrink-0" title="${utils.escapeHtml(usuario)}">
                ${utils.escapeHtml(usuario.charAt(0).toUpperCase())}
              </div>
            </div>
          </header>

          <!-- Conteúdo -->
          <main id="main-content" class="flex-1 p-4 lg:p-6 overflow-auto">
            <div class="flex items-center justify-center h-64">
              <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600"></div>
            </div>
          </main>
        </div>
      </div>
    `;

    root.dataset.layoutReady = 'true';
  },

  _navItem(page, icon, label) {
    return `
      <button data-page="${page}" onclick="app.navigate('${page}')" class="nav-item group w-full flex items-center justify-start gap-3 px-3 py-2.5 rounded-lg border border-transparent text-left text-sm font-medium text-slate-600 hover:bg-teal-600 hover:text-white hover:border-teal-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/60 transition-colors duration-150">
        <i class="fas ${icon} w-5 shrink-0 text-center transition-colors duration-150 group-hover:text-white"></i>
        <span class="flex-1 min-w-0 leading-snug text-left">${label}</span>
      </button>
    `;
  },

  _updateActiveNav() {
    document.querySelectorAll('.nav-item').forEach(btn => {
      const isActive = btn.dataset.page === this.currentPage;
      btn.classList.toggle('bg-teal-50', isActive);
      btn.classList.toggle('text-teal-700', isActive);
      btn.classList.toggle('font-semibold', isActive);
      btn.classList.toggle('border-teal-100', isActive);
      btn.classList.toggle('shadow-sm', isActive);
      btn.classList.toggle('text-slate-600', !isActive);
      btn.classList.toggle('border-transparent', !isActive);
    });
    const titleMap = {
      dashboard: 'Dashboard', indicadores: 'Indicadores',
      emprestimos: 'Empréstimos de Ferramentas', estoque: 'Estoque',
      ferramentas: 'Ferramentas', historico: 'Histórico',
      fornecedores: 'Fornecedores', pedidos: 'Pedidos',
      usuarios: 'Usuários', relatorios: 'Relatórios'
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
      if (badge) {
        badge.classList.remove('hidden');
        if (this.syncErrors.length) {
          badge.textContent = 'Dados locais';
          badge.className = 'text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200 font-medium whitespace-nowrap';
        } else {
          badge.textContent = 'Sincronizado';
          badge.className = 'text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 font-medium whitespace-nowrap';
        }
      }
      if (status) status.textContent = `Última: ${timeStr}`;
    }
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
    // Sincroniza quando a aba volta a ficar visível (forçado para garantir dados atuais)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        console.log('[AUTO-SYNC] Aba visível — sincronizando...');
        this.syncAll(true).catch(e => console.warn('[AUTO-SYNC] Falha ao sincronizar na visibilidade:', e));
      }
    });

    // Sincroniza quando volta a ficar online
    window.addEventListener('online', () => {
      console.log('[AUTO-SYNC] Conexão restabelecida — sincronizando...');
      this.showToast('🌐 Conexão restabelecida — sincronizando dados...', 'info');
      this.syncAll(true).catch(e => console.warn('[AUTO-SYNC] Falha ao sincronizar online:', e));
    });

    window.addEventListener('offline', () => {
      console.log('[AUTO-SYNC] Offline — usando dados locais');
      this.showToast('⚠️ Você está offline — usando dados locais.', 'warning');
    });

    // Sincroniza antes de fechar/recarregar (best-effort)
    window.addEventListener('beforeunload', () => {
      // Não bloqueia, apenas tenta salvar timestamp
      try { localStorage.setItem(CONFIG.CACHE_KEYS.timestamp, Date.now().toString()); } catch(e){}
    });
  },

  _startAutoSync() {
    this._stopAutoSync();
    const interval = CONFIG.AUTO_SYNC_INTERVAL_MS || 60000;
    console.log(`[AUTO-SYNC] Iniciando intervalo automático a cada ${interval/1000}s`);
    this._autoSyncTimer = setInterval(() => {
      if (document.visibilityState !== 'visible') {
        console.log('[AUTO-SYNC] Aba oculta — pulando sincronização automática');
        return;
      }
      if (!navigator.onLine) {
        console.log('[AUTO-SYNC] Offline — pulando sincronização automática');
        return;
      }
      console.log('[AUTO-SYNC] Sincronização automática...');
      this.syncAll(true).catch(e => console.warn('[AUTO-SYNC] Falha na sincronização automática:', e));
    }, interval);

    // Também agenda uma sincronização logo após 5s da inicialização (garante dados frescos após login)
    setTimeout(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        console.log('[AUTO-SYNC] Sincronização pós-inicialização (5s)');
        this.syncAll(true).catch(()=>{});
      }
    }, 5000);
  },

  _stopAutoSync() {
    if (this._autoSyncTimer) {
      clearInterval(this._autoSyncTimer);
      this._autoSyncTimer = null;
    }
  },

  /* ── Dashboard ── */
  _renderDashboard(container) {
    const estoque = app.data.estoque || [];
    const ferramentas = app.data.ferramentas || [];
    const emprestimos = app.data.emprestimos || [];
    const hoje = utils.today();

    const totalItens = estoque.length;
    const totalFerramentas = ferramentas.length;

    const emprestimosAtivos = emprestimos.filter(e => !utils.normalize(e.status).includes('devol'));
    const emprestimosAtrasados = emprestimosAtivos.filter(e => e.previsaoDevolucao && e.previsaoDevolucao < hoje);

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

    const movs = (app.data.movimentacoes || []).slice(-5).reverse();

    const card = (titulo, valor, icone, corIcone, corValor = 'text-slate-900') => `
      <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs text-slate-500 uppercase font-semibold">${titulo}</p>
            <p class="text-2xl font-bold ${corValor} mt-1">${valor}</p>
          </div>
          <div class="w-10 h-10 rounded-lg ${corIcone} flex items-center justify-center">
            <i class="fas ${icone}"></i>
          </div>
        </div>
      </div>`;

    container.innerHTML = `
      <div class="space-y-6">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          ${card('Itens em Estoque', totalItens, 'fa-boxes', 'bg-blue-50 text-blue-600')}
          ${card('Ferramentas', totalFerramentas, 'fa-tools', 'bg-amber-50 text-amber-600')}
          ${card('Empréstimos Ativos', emprestimosAtivos.length, 'fa-hand-holding', 'bg-emerald-50 text-emerald-600', emprestimosAtrasados.length ? 'text-red-600' : 'text-slate-900')}
          ${card('Críticos / Esgotados', zerados + criticos, zerados > 0 ? 'fa-exclamation-triangle' : 'fa-exclamation-circle',
                 zerados > 0 ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600',
                 zerados > 0 ? 'text-red-600' : criticos > 0 ? 'text-amber-600' : 'text-slate-900')}
        </div>

        ${emprestimosAtrasados.length > 0 ? `
        <div class="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <i class="fas fa-clock text-red-600 mt-0.5"></i>
          <div>
            <p class="text-sm font-bold text-red-700">${emprestimosAtrasados.length} empréstimo(s) atrasado(s)</p>
            <p class="text-xs text-red-700/90 mt-1">Verifique a tela de Empréstimos e providencie a devolução.</p>
          </div>
        </div>` : ''}

        ${zerados > 0 ? `
        <div class="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <i class="fas fa-exclamation-triangle text-red-600 mt-0.5"></i>
          <div>
            <p class="text-sm font-bold text-red-700">${zerados} item(s) esgotado(s)</p>
            <p class="text-xs text-red-700/90 mt-1">Verifique a tela de Estoque para reposição.</p>
          </div>
        </div>` : ''}

        ${criticos > 0 ? `
        <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <i class="fas fa-exclamation-circle text-amber-600 mt-0.5"></i>
          <div>
            <p class="text-sm font-bold text-amber-700">${criticos} item(s) em nível crítico</p>
            <p class="text-xs text-amber-700/90 mt-1">Quantidade abaixo ou igual ao mínimo permitido.</p>
          </div>
        </div>` : ''}

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <h3 class="text-sm font-bold text-slate-700 mb-4">Status do Estoque</h3>
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-sm text-slate-600">✅ Normal</span>
                <span class="text-sm font-bold text-slate-900">${ok}</span>
              </div>
              <div class="w-full bg-slate-200 rounded-full h-2">
                <div class="bg-emerald-600 h-2 rounded-full" style="width: ${totalItens ? (ok/totalItens*100) : 0}%"></div>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-sm text-slate-600">⚠️ Crítico</span>
                <span class="text-sm font-bold text-amber-600">${criticos}</span>
              </div>
              <div class="w-full bg-slate-200 rounded-full h-2">
                <div class="bg-amber-500 h-2 rounded-full" style="width: ${totalItens ? (criticos/totalItens*100) : 0}%"></div>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-sm text-slate-600">❌ Esgotado</span>
                <span class="text-sm font-bold text-red-600">${zerados}</span>
              </div>
              <div class="w-full bg-slate-200 rounded-full h-2">
                <div class="bg-red-600 h-2 rounded-full" style="width: ${totalItens ? (zerados/totalItens*100) : 0}%"></div>
              </div>
            </div>
          </div>

          <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-5 lg:col-span-2">
            <h3 class="text-sm font-bold text-slate-700 mb-4">Últimas Movimentações</h3>
            ${movs.length ? `
              <div class="overflow-x-auto">
                <table class="w-full text-sm">
                  <thead><tr class="bg-slate-50 border-b border-slate-200">
                    <th class="px-4 py-2 text-left font-semibold text-slate-600">Data</th>
                    <th class="px-4 py-2 text-left font-semibold text-slate-600">Tipo</th>
                    <th class="px-4 py-2 text-left font-semibold text-slate-600">Item</th>
                    <th class="px-4 py-2 text-center font-semibold text-slate-600">Qtd</th>
                  </tr></thead>
                  <tbody>
                    ${movs.map(m => {
                      const tipo = utils.normalize(m.tipo || m.operacao);
                      const tipoClass = tipo.includes('entrada') || tipo.includes('compra') ? 'text-emerald-600' : tipo.includes('saida') || tipo.includes('retirada') ? 'text-red-600' : 'text-slate-600';
                      return `<tr class="border-b border-slate-100 hover:bg-slate-50">
                        <td class="px-4 py-2 text-slate-500">${utils.formatDate(m.data || m.dataHora)}</td>
                        <td class="px-4 py-2 font-semibold ${tipoClass}">${utils.escapeHtml(m.tipo || m.operacao || '—')}</td>
                        <td class="px-4 py-2">${utils.escapeHtml(m.itemNome || m.item || m.nome || '—')}</td>
                        <td class="px-4 py-2 text-center font-mono">${utils.escapeHtml(m.quantidade || '—')}</td>
                      </tr>`;
                    }).join('')}
                  </tbody>
                </table>
              </div>
            ` : '<p class="text-slate-500 text-center py-8">Nenhuma movimentação recente.</p>'}
          </div>
        </div>
      </div>
    `;
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

    const abasExportaveis = ['estoque', 'ferramentas', 'emprestimos', 'movimentacoes', 'historico', 'fornecedores', 'pedidos'];

    container.innerHTML = `
      <div class="space-y-6">
        <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 class="text-lg font-bold text-slate-900 mb-4">📊 Relatório de Estoque</h2>
          <div class="grid grid-cols-3 gap-4 mb-6">
            <div class="bg-slate-50 rounded-lg p-4 text-center">
              <p class="text-2xl font-bold text-slate-900">${total}</p>
              <p class="text-xs text-slate-500 uppercase">Total de Itens</p>
            </div>
            <div class="bg-red-50 rounded-lg p-4 text-center">
              <p class="text-2xl font-bold text-red-600">${zerados}</p>
              <p class="text-xs text-red-700/90 uppercase">Esgotados</p>
            </div>
            <div class="bg-amber-50 rounded-lg p-4 text-center">
              <p class="text-2xl font-bold text-amber-600">${criticos}</p>
              <p class="text-xs text-amber-700/90 uppercase">Críticos</p>
            </div>
          </div>

          <h3 class="text-sm font-bold text-slate-700 mb-3">Por Categoria</h3>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead><tr class="bg-slate-50 border-b border-slate-200">
                <th class="px-4 py-2 text-left font-semibold text-slate-600">Categoria</th>
                <th class="px-4 py-2 text-center font-semibold text-slate-600">Itens</th>
                <th class="px-4 py-2 text-center font-semibold text-slate-600">Qtd Total</th>
                <th class="px-4 py-2 text-center font-semibold text-slate-600">Esgotados</th>
              </tr></thead>
              <tbody>
                ${Object.entries(catMap).sort((a, b) => b[1].count - a[1].count).map(([cat, info]) => `
                  <tr class="border-b border-slate-100 hover:bg-slate-50">
                    <td class="px-4 py-2">${utils.categoriaBadge(cat)}</td>
                    <td class="px-4 py-2 text-center font-medium">${info.count}</td>
                    <td class="px-4 py-2 text-center font-mono">${info.qtd}</td>
                    <td class="px-4 py-2 text-center">
                      ${info.zerados > 0 ? `<span class="text-red-600 font-bold">${info.zerados}</span>` : '<span class="text-slate-500">—</span>'}
                    </td>
                  </tr>
                `).join('') || '<tr><td colspan="4" class="px-4 py-6 text-center text-slate-500">Sem dados de estoque.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>

        <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h3 class="text-sm font-bold text-slate-700 mb-3">📥 Exportar Dados (CSV)</h3>
          <div class="flex flex-wrap gap-3">
            ${abasExportaveis.map(aba => `
              <button onclick="app._exportCSV('${aba}')" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition capitalize">
                <i class="fas fa-file-csv mr-1"></i> ${aba}
              </button>`).join('')}
            <button onclick="window.print()" class="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold rounded-lg transition">
              <i class="fas fa-print mr-1"></i> Imprimir
            </button>
          </div>
        </div>
      </div>
    `;
  },

  _exportCSV(aba) {
    const data = app.data[aba] || [];
    if (!data.length) { app.showToast('Nenhum dado para exportar.', 'warning'); return; }
    const headers = Object.keys(data[0]);
    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [headers.map(esc).join(','), ...data.map(row => headers.map(h => esc(row[h])).join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${aba}_${utils.today()}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 5000);
  },

  /* ── Modal ── */
  openModal(title, bodyHTML, onConfirm, confirmLabel = 'Salvar') {
    const existing = document.getElementById('app-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'app-modal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
      <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" onclick="app.closeModal()"></div>
      <div class="relative bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col fade-in">
        <div class="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 class="text-base font-bold text-slate-900">${utils.escapeHtml(title)}</h3>
          <button onclick="app.closeModal()" class="text-slate-400 hover:text-slate-600"><i class="fas fa-times"></i></button>
        </div>
        <div id="modal-body" class="px-5 py-4 overflow-y-auto flex-1">${bodyHTML}</div>
        <div class="px-5 py-3 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
          <button onclick="app.closeModal()" class="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition">Cancelar</button>
          <button id="modal-confirm" class="px-4 py-2 text-sm bg-teal-600 text-white hover:bg-teal-700 rounded-lg transition font-medium">${utils.escapeHtml(confirmLabel)}</button>
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
    const colors = { success: 'bg-emerald-600', error: 'bg-red-600', warning: 'bg-amber-500 !text-slate-900', info: 'bg-white border border-slate-300 !text-slate-800' };
    const icons = { success: 'fa-check-circle', error: 'fa-times-circle', warning: 'fa-exclamation-circle', info: 'fa-info-circle' };
    const toast = document.createElement('div');
    toast.className = `fixed bottom-5 right-5 z-[60] ${colors[type] || colors.info} text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 fade-in text-sm font-medium`;
    toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span>${utils.escapeHtml(message)}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.4s';
      setTimeout(() => toast.remove(), 400);
    }, 3500);
  },

  /* ── Comunicação com o Google Apps Script ── */
  isSheetsConfigured() {
    return Boolean(URL_BASE_APPS_SCRIPT);
  },

  /**
   * Extrai ?aba= da URL para incluir também no corpo (robustez para o Apps Script)
   */
  _extractAbaFromUrl(url) {
    // Caminho /api/<aba> (backend Neon/Vercel)
    const mPath = String(url).match(/\/api\/([a-z]+)/i);
    if (mPath) return mPath[1];
    try {
      const u = new URL(url);
      return u.searchParams.get('aba') || '';
    } catch (e) {
      const m = String(url).match(/[?&]aba=([^&]+)/);
      return m ? decodeURIComponent(m[1]) : '';
    }
  },

  /**
   * POST para o Apps Script. Usa Content-Type text/plain para evitar o
   * preflight CORS (o Apps Script não responde OPTIONS). O script deve ler
   * o JSON via e.postData.contents. Inclui aba tanto na URL quanto no corpo.
   */
  async post(url, action, payload) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), CONFIG.TIMEOUT_MS);
    try {
      const aba = this._extractAbaFromUrl(url);
      const body = { action, aba, ...payload };
      // Garante que aba do payload prevaleça se já vier, mas mantém fallback
      if (!body.aba) body.aba = aba;
      const res = await fetch(url, {
        method: 'POST',
        mode: 'cors',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  },

  async get(url, action, params = {}) {
    const qs = new URLSearchParams({ action, ...params }).toString();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), CONFIG.TIMEOUT_MS);
    try {
      // Se a URL já tem ?aba, mantém; se não, tenta extrair aba de params.aba
      const fullUrl = url.includes('?') ? `${url}&${qs}` : `${url}?${qs}`;
      const res = await fetch(fullUrl, { mode: 'cors', signal: ctrl.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }
};

/* ================================================================
   EMPRÉSTIMOS — CRUD completo (registrar, devolver, atrasos)
   ================================================================ */
const emprestimosModule = {
  pagina: 1,
  busca: '',
  filtroStatus: '',

  render(container) {
    const hoje = utils.today();
    const todos = app.data.emprestimos || [];

    const nomeDe = e => e.nomeFerramenta || e.ferramenta || e.item || e.nome || '—';
    const dataDe = e => e.dataEmprestimo || e.data || '';
    const isDevolvido = e => utils.normalize(e.status).includes('devol');
    const isAtrasado = e => !isDevolvido(e) && (e.previsaoDevolucao || '') && e.previsaoDevolucao < hoje;

    const ativos = todos.filter(e => !isDevolvido(e));
    const atrasados = todos.filter(isAtrasado);
    const devolvidos = todos.filter(isDevolvido);

    // Filtros
    let items = todos;
    if (this.busca) {
      const b = utils.normalize(this.busca);
      items = items.filter(e =>
        utils.normalize(nomeDe(e)).includes(b) ||
        utils.normalize(e.responsavel || e.solicitante || '').includes(b) ||
        utils.normalize(e.setor || e.local || '').includes(b));
    }
    if (this.filtroStatus === 'ativos') items = items.filter(e => !isDevolvido(e));
    if (this.filtroStatus === 'atrasados') items = items.filter(isAtrasado);
    if (this.filtroStatus === 'devolvidos') items = items.filter(isDevolvido);

    // Ordena: atrasados primeiro, depois ativos, depois por data desc
    items = [...items].sort((a, b) => {
      const pa = isAtrasado(a) ? 0 : isDevolvido(a) ? 2 : 1;
      const pb = isAtrasado(b) ? 0 : isDevolvido(b) ? 2 : 1;
      if (pa !== pb) return pa - pb;
      return String(dataDe(b)).localeCompare(String(dataDe(a)));
    });

    const pg = utils.paginate(items, this.pagina, 10);

    const ferramentasOpts = (app.data.ferramentas || []).map(f =>
      `<option value="${utils.escapeHtml(f.nome || f.item || '')}">${utils.escapeHtml((f.codigo ? f.codigo + ' — ' : '') + (f.nome || f.item || ''))}</option>`).join('');

    container.innerHTML = `
      <div class="space-y-6">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div class="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
            <p class="text-xs text-slate-500 uppercase font-semibold">Ativos</p>
            <p class="text-2xl font-bold text-slate-900">${ativos.length}</p>
          </div>
          <div class="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
            <p class="text-xs text-slate-500 uppercase font-semibold">Atrasados</p>
            <p class="text-2xl font-bold ${atrasados.length ? 'text-red-600' : 'text-slate-900'}">${atrasados.length}</p>
          </div>
          <div class="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
            <p class="text-xs text-slate-500 uppercase font-semibold">Devolvidos</p>
            <p class="text-2xl font-bold text-emerald-600">${devolvidos.length}</p>
          </div>
          <div class="flex items-stretch">
            <button onclick="emprestimosModule.abrirNovo()" class="w-full px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold rounded-xl transition shadow">
              <i class="fas fa-plus mr-1"></i> Novo Empréstimo
            </button>
          </div>
        </div>

        <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div class="p-4 flex flex-wrap items-center gap-3 border-b border-slate-200">
            <div class="relative flex-1 min-w-[200px]">
              <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
              <input type="text" value="${utils.escapeHtml(this.busca)}" placeholder="Buscar por ferramenta, responsável ou setor..."
                class="w-full pl-8 pr-3 py-2 text-sm border border-slate-300 rounded-lg bg-slate-50 text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none"
                oninput="emprestimosModule.setBusca(this.value)">
            </div>
            <select onchange="emprestimosModule.setFiltroStatus(this.value)"
              class="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-slate-50 text-slate-900 focus:ring-2 focus:ring-teal-500">
              <option value="">Todos os status</option>
              <option value="ativos" ${this.filtroStatus === 'ativos' ? 'selected' : ''}>Ativos</option>
              <option value="atrasados" ${this.filtroStatus === 'atrasados' ? 'selected' : ''}>Atrasados</option>
              <option value="devolvidos" ${this.filtroStatus === 'devolvidos' ? 'selected' : ''}>Devolvidos</option>
            </select>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead><tr class="bg-slate-50 border-b border-slate-200">
                <th class="px-4 py-3 text-left font-semibold text-slate-600">Ferramenta</th>
                <th class="px-4 py-3 text-left font-semibold text-slate-600">Responsável / Setor</th>
                <th class="px-4 py-3 text-center font-semibold text-slate-600">Qtd</th>
                <th class="px-4 py-3 text-center font-semibold text-slate-600">Empréstimo</th>
                <th class="px-4 py-3 text-center font-semibold text-slate-600">Previsão Devolução</th>
                <th class="px-4 py-3 text-center font-semibold text-slate-600">Status</th>
                <th class="px-4 py-3 text-center font-semibold text-slate-600">Ações</th>
              </tr></thead>
              <tbody>
                ${pg.rows.map(e => {
                  const atrasado = isAtrasado(e);
                  const devolvido = isDevolvido(e);
                  const statusBadge = atrasado
                    ? '<span class="inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-red-50 text-red-600 border border-red-200">⏰ ATRASADO</span>'
                    : devolvido
                    ? '<span class="inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-600 border border-emerald-200">✓ DEVOLVIDO</span>'
                    : '<span class="inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-600 border border-amber-200">EM USO</span>';
                  const idEsc = utils.escapeHtml(e.id || '');
                  return `<tr class="border-b border-slate-100 hover:bg-slate-50 transition ${atrasado ? 'bg-red-50' : ''}">
                    <td class="px-4 py-3 font-medium text-slate-900">${utils.escapeHtml(nomeDe(e))}</td>
                    <td class="px-4 py-3">
                      <p class="text-slate-700">${utils.escapeHtml(e.responsavel || e.solicitante || '—')}</p>
                      ${e.setor || e.local ? `<p class="text-[11px] text-slate-500">${utils.escapeHtml(e.setor || e.local)}</p>` : ''}
                    </td>
                    <td class="px-4 py-3 text-center font-mono">${utils.escapeHtml(e.quantidade || '1')}</td>
                    <td class="px-4 py-3 text-center text-slate-600">${utils.formatDate(dataDe(e))}</td>
                    <td class="px-4 py-3 text-center ${atrasado ? 'text-red-600 font-bold' : 'text-slate-600'}">${utils.formatDate(e.previsaoDevolucao)}</td>
                    <td class="px-4 py-3 text-center">${statusBadge}</td>
                    <td class="px-4 py-3 text-center whitespace-nowrap">
                      ${!devolvido ? `<button onclick="emprestimosModule.registrarDevolucao('${idEsc}')" class="inline-flex items-center gap-1 px-2.5 py-1.5 mx-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold border border-red-600 transition whitespace-nowrap" title="Registrar devolução"><i class="fas fa-undo"></i> Devolução</button>` : ''}
                      <button onclick="emprestimosModule.excluir('${idEsc}')" class="text-red-600 hover:text-red-700 mx-1" title="Excluir registro"><i class="fas fa-trash-alt"></i></button>
                    </td>
                  </tr>`;
                }).join('') || '<tr><td colspan="7" class="px-4 py-8 text-center text-slate-500">Nenhum empréstimo encontrado.</td></tr>'}
              </tbody>
            </table>
          </div>
          ${utils.paginationControls('emprestimosModule', pg.page, pg.pages, pg.total)}
        </div>
        <datalist id="dlFerramentas">${ferramentasOpts}</datalist>
      </div>
    `;
  },

  setBusca(v) { this.busca = v; this.pagina = 1; this.render(document.getElementById('main-content')); },
  setFiltroStatus(v) { this.filtroStatus = v; this.pagina = 1; this.render(document.getElementById('main-content')); },
  setPage(p) { this.pagina = p; this.render(document.getElementById('main-content')); },

  abrirNovo() {
    const html = utils.formHtml([
      { key: 'ferramenta', label: 'Ferramenta', type: 'text', required: true, placeholder: 'Digite ou selecione da lista' },
      { key: 'quantidade', label: 'Quantidade', type: 'number', value: '1', required: true },
      { key: 'responsavel', label: 'Responsável (quem retira)', type: 'text', required: true },
      { key: 'setor', label: 'Setor / Destino', type: 'text', required: true },
      { key: 'dataEmprestimo', label: 'Data do Empréstimo', type: 'date', value: utils.today(), required: true },
      { key: 'previsaoDevolucao', label: 'Previsão de Devolução', type: 'date', required: true },
      { key: 'motivo', label: 'Motivo / Observação', type: 'textarea' }
    ]);
    app.openModal('Novo Empréstimo de Ferramenta', html + `
      <div class="mt-2 text-[11px] text-slate-500"><i class="fas fa-info-circle mr-1"></i>Digite o nome da ferramenta para ver as sugestões cadastradas.</div>
    `, () => this.salvar());

    // Conecta o datalist ao campo de ferramenta
    const inp = document.getElementById('fld_ferramenta');
    if (inp) inp.setAttribute('list', 'dlFerramentas');
  },

  async salvar() {
    const fields = ['ferramenta', 'quantidade', 'responsavel', 'setor', 'dataEmprestimo', 'previsaoDevolucao', 'motivo'];
    const v = {};
    fields.forEach(f => { v[f] = document.getElementById('fld_' + f)?.value.trim() || ''; });

    if (!v.ferramenta || !v.responsavel || !v.setor || !v.dataEmprestimo || !v.previsaoDevolucao) {
      app.showToast('Preencha todos os campos obrigatórios.', 'error');
      return;
    }
    if (v.previsaoDevolucao < v.dataEmprestimo) {
      app.showToast('A previsão de devolução não pode ser anterior à data do empréstimo.', 'error');
      return;
    }

    const payload = {
      id: utils.generateId(),
      ferramentaId: '',
      nomeFerramenta: v.ferramenta,
      responsavel: v.responsavel,
      setor: v.setor,
      local: v.setor,
      quantidade: v.quantidade || '1',
      status: 'Ativo',
      dataEmprestimo: v.dataEmprestimo,
      previsaoDevolucao: v.previsaoDevolucao,
      dataDevolucao: '',
      motivo: v.motivo,
      createdAt: utils.now(),
      updatedAt: utils.now()
    };

    let sheetsOk = false;
    try {
      const res = await app.post(CONFIG.SHEETS.emprestimos, 'add', payload);
      sheetsOk = Boolean(res && res.success !== false);
    } catch (e) {
      console.warn('[EMPRESTIMOS] Falha ao salvar no Sheets:', e.message);
    }

    if (!app.data.emprestimos) app.data.emprestimos = [];
    app.data.emprestimos.push(payload);
    app.closeModal();
    app.showToast(sheetsOk ? 'Empréstimo registrado!' : 'Empréstimo registrado localmente (modo offline).', sheetsOk ? 'success' : 'warning');
    await app.refreshAba('emprestimos');
  },

  async registrarDevolucao(id) {
    const e = (app.data.emprestimos || []).find(x => x.id === id);
    if (!e) return;
    if (!confirm(`Registrar devolução de "${e.nomeFerramenta || e.item || ''}"?`)) return;

    const payload = { ...e, status: 'Devolvido', dataDevolucao: utils.today(), updatedAt: utils.now() };

    let sheetsOk = false;
    try {
      const res = await app.post(CONFIG.SHEETS.emprestimos, 'update', payload);
      sheetsOk = Boolean(res && res.success !== false);
    } catch (err) {
      console.warn('[EMPRESTIMOS] Falha ao atualizar no Sheets:', err.message);
    }

    Object.assign(e, payload);
    app.showToast(sheetsOk ? 'Devolução registrada!' : 'Devolução registrada localmente (modo offline).', sheetsOk ? 'success' : 'warning');
    await app.refreshAba('emprestimos');
  },

  async excluir(id) {
    if (!confirm('Excluir este registro de empréstimo?')) return;
    try { await app.get(CONFIG.SHEETS.emprestimos, 'delete', { id }); } catch (e) { /* ok */ }
    app.data.emprestimos = (app.data.emprestimos || []).filter(x => x.id !== id);
    app.showToast('Registro removido.', 'success');
    await app.refreshAba('emprestimos');
  }
};

/* ================================================================
   HISTÓRICO — leitura com mapeamento correto das colunas
   ================================================================ */
const historicoModule = {
  pagina: 1,
  busca: '',

  render(container) {
    const hist = [...(app.data.historico || []), ...(app.data.movimentacoes || []).map(m => ({
      id: m.id,
      acao: m.tipo || m.operacao || '',
      item: m.itemNome || m.item || m.nome || '',
      detalhes: m.observacao || '',
      responsavel: m.usuario || m.responsavel || '',
      data: m.data || m.dataHora || '',
      quantidade: m.quantidade || ''
    }))];

    // Mais recente primeiro
    hist.sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')));

    let items = hist;
    if (this.busca) {
      const b = utils.normalize(this.busca);
      items = items.filter(h =>
        utils.normalize(h.item).includes(b) ||
        utils.normalize(h.acao).includes(b) ||
        utils.normalize(h.responsavel).includes(b) ||
        utils.normalize(h.detalhes).includes(b));
    }

    const pg = utils.paginate(items, this.pagina, 15);

    container.innerHTML = `
      <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div class="p-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200">
          <h2 class="text-lg font-bold text-slate-900">Histórico de Movimentações</h2>
          <div class="relative min-w-[220px]">
            <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
            <input type="text" value="${utils.escapeHtml(this.busca)}" placeholder="Buscar..."
              class="w-full pl-8 pr-3 py-2 text-sm border border-slate-300 rounded-lg bg-slate-50 text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none"
              oninput="historicoModule.setBusca(this.value)">
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead><tr class="bg-slate-50 border-b border-slate-200">
              <th class="px-4 py-3 text-left font-semibold text-slate-600">Data</th>
              <th class="px-4 py-3 text-left font-semibold text-slate-600">Ação</th>
              <th class="px-4 py-3 text-left font-semibold text-slate-600">Item</th>
              <th class="px-4 py-3 text-left font-semibold text-slate-600">Detalhes</th>
              <th class="px-4 py-3 text-left font-semibold text-slate-600">Responsável</th>
            </tr></thead>
            <tbody>
              ${pg.rows.map(h => {
                const op = utils.normalize(h.acao);
                const opClass = op.includes('entrada') || op.includes('compra') ? 'text-emerald-600'
                  : op.includes('saida') || op.includes('retirada') ? 'text-red-600'
                  : op.includes('manut') || op.includes('defeito') ? 'text-amber-600'
                  : 'text-slate-700';
                return `<tr class="border-b border-slate-100 hover:bg-slate-50">
                  <td class="px-4 py-3 text-slate-500 whitespace-nowrap">${utils.formatDate(h.data)}</td>
                  <td class="px-4 py-3 font-semibold ${opClass}">${utils.escapeHtml(h.acao || '—')}</td>
                  <td class="px-4 py-3 text-slate-900 font-medium">${utils.escapeHtml(h.item || '—')}${h.quantidade ? ` <span class="text-slate-500 font-mono text-xs">(×${utils.escapeHtml(h.quantidade)})</span>` : ''}</td>
                  <td class="px-4 py-3 text-slate-600">${utils.escapeHtml(h.detalhes || '—')}</td>
                  <td class="px-4 py-3 text-slate-600">${utils.escapeHtml(h.responsavel || '—')}</td>
                </tr>`;
              }).join('') || '<tr><td colspan="5" class="px-4 py-8 text-center text-slate-500">Nenhum histórico encontrado.</td></tr>'}
            </tbody>
          </table>
        </div>
        ${utils.paginationControls('historicoModule', pg.page, pg.pages, pg.total)}
      </div>
    `;
  },

  setBusca(v) { this.busca = v; this.pagina = 1; this.render(document.getElementById('main-content')); },
  setPage(p) { this.pagina = p; this.render(document.getElementById('main-content')); }
};

/* ================================================================
   BOOT
   ================================================================ */
document.addEventListener('DOMContentLoaded', () => {
  authModule.init();
});
