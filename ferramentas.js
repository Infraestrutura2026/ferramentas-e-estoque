/**
 * ferramentas.js — Módulo de Ferramentas
 * =======================================
 * CRUD dedicado sobre a aba "ferramentas" (colunas: id, nome, codigo,
 * categoria, descricao, estado, local, responsavel, createdAt, updatedAt).
 * Com badges coloridos por categoria, filtros, busca com acentos ignorados.
 */

const ferramentasModule = {
  filtroAtual: '',
  categoriaAtiva: 'todas',
  ABA: 'ferramentas',

  _itens() {
    if (app.data.ferramentas && app.data.ferramentas.length > 0) return app.data.ferramentas;
    // Fallback: extrai ferramentas do estoque geral por categoria/palavras-chave
    return (app.data.estoque || []).filter(i => this._isFerramenta(i));
  },

  render(container) {
    const items = this._itens();

    if (!items.length) {
      container.innerHTML = `
        <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
          <i class="fas fa-tools text-4xl text-slate-600 mb-3"></i>
          <h3 class="text-lg font-bold text-slate-700">Nenhuma ferramenta cadastrada</h3>
          <p class="text-sm text-slate-500 mt-1 mb-4">Cadastre a primeira ferramenta usando o botão abaixo.</p>
          <button onclick="ferramentasModule.abrirModal()" class="app-button px-4 py-2 text-sm bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-lg transition">
            <i class="fas fa-plus mr-1"></i> Nova Ferramenta
          </button>
        </div>`;
      return;
    }

    const categorias = [...new Set(items.map(i => i.categoria || 'Sem categoria'))].sort();

    const normEstado = i => utils.normalize(i.estado || i.status || '');
    const total = items.length;
    const disponiveis = items.filter(i => normEstado(i).includes('dispon') || normEstado(i) === '').length;
    const emUso = items.filter(i => /uso|emprest|externo/.test(normEstado(i))).length;
    const manutencao = items.filter(i => /manut|defeito/.test(normEstado(i))).length;

    const termo = utils.normalize(this.filtroAtual);
    const catFiltro = this.categoriaAtiva;
    const filtrados = items.filter(i => {
      const matchTermo = !termo ||
        utils.normalize(i.nome || i.item).includes(termo) ||
        utils.normalize(i.codigo).includes(termo) ||
        utils.normalize(i.local).includes(termo) ||
        utils.normalize(i.responsavel).includes(termo);
      const matchCat = catFiltro === 'todas' || (i.categoria || 'Sem categoria') === catFiltro;
      return matchTermo && matchCat;
    });

    container.innerHTML = `
      <div class="space-y-4">
        <!-- KPIs -->
        <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div class="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
            <p class="text-xs text-slate-500 uppercase font-semibold">Total</p>
            <p class="text-2xl font-bold text-slate-900">${total}</p>
          </div>
          <div class="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
            <p class="text-xs text-slate-500 uppercase font-semibold">Disponíveis</p>
            <p class="text-2xl font-bold text-emerald-600">${disponiveis}</p>
          </div>
          <div class="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
            <p class="text-xs text-slate-500 uppercase font-semibold">Em Uso</p>
            <p class="text-2xl font-bold text-amber-600">${emUso}</p>
          </div>
          <div class="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
            <p class="text-xs text-slate-500 uppercase font-semibold">Manutenção</p>
            <p class="text-2xl font-bold text-red-600">${manutencao}</p>
          </div>
          <button onclick="ferramentasModule.abrirModal()"
            class="app-button px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold rounded-xl transition shadow">
            <i class="fas fa-plus mr-1"></i> Nova Ferramenta
          </button>
        </div>

        <!-- Filtros -->
        <div class="bg-white rounded-xl p-4 shadow-sm border border-slate-200 space-y-3">
          <div class="flex flex-col md:flex-row gap-3">
            <div class="relative flex-1">
              <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm"></i>
              <input type="text" id="filtro-ferramentas" value="${utils.escapeHtml(this.filtroAtual)}"
                placeholder="Buscar por nome, código, local ou responsável..."
                class="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm bg-slate-50 text-slate-900 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition"
                oninput="ferramentasModule.setFiltro(this.value)">
            </div>
            <select id="cat-ferramentas" onchange="ferramentasModule.setCategoria(this.value)"
              class="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none bg-slate-50 text-slate-900">
              <option value="todas">Todas as categorias</option>
              ${categorias.map(c => `<option value="${utils.escapeHtml(c)}" ${c === catFiltro ? 'selected' : ''}>${utils.escapeHtml(c)}</option>`).join('')}
            </select>
          </div>
          <div class="flex flex-wrap gap-2">
            <button onclick="ferramentasModule.setCategoria('todas')"
              class="filter-chip px-2.5 py-1 rounded-full text-xs font-medium border transition ${catFiltro === 'todas' ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}">
              Todas
            </button>
            ${categorias.map(cat => {
              const style = utils.getCategoriaStyle(cat);
              const isActive = cat === catFiltro;
              return `<button onclick="ferramentasModule.setCategoria('${utils.escapeHtml(cat).replace(/'/g, "\\'")}')"
                class="filter-chip px-2.5 py-1 rounded-full text-xs font-medium border transition ${isActive ? 'ring-1 ring-teal-500 ring-offset-2 ring-offset-white' : ''}"
                style="background-color:${style.bg};color:${style.text};border-color:${style.border}">
                ${utils.escapeHtml(cat)}
              </button>`;
            }).join('')}
          </div>
        </div>

        <!-- Tabela -->
        <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="bg-slate-50 border-b border-slate-200">
                  <th class="px-4 py-3 text-left font-semibold text-slate-600">Código</th>
                  <th class="px-4 py-3 text-left font-semibold text-slate-600">Ferramenta</th>
                  <th class="px-4 py-3 text-left font-semibold text-slate-600">Categoria</th>
                  <th class="px-4 py-3 text-center font-semibold text-slate-600">Estado</th>
                  <th class="px-4 py-3 text-left font-semibold text-slate-600">Local</th>
                  <th class="px-4 py-3 text-left font-semibold text-slate-600">Responsável</th>
                  <th class="px-4 py-3 text-center font-semibold text-slate-600">Ações</th>
                </tr>
              </thead>
              <tbody>
                ${filtrados.map(item => {
                  const estado = item.estado || item.status || 'Disponível';
                  const statusBadge = utils.statusBadge(estado);
                  return `
                    <tr class="border-b border-slate-100 hover:bg-slate-50 transition">
                      <td class="px-4 py-3 font-mono text-xs text-slate-500">${utils.escapeHtml(item.codigo || item.id || '—')}</td>
                      <td class="px-4 py-3 font-medium text-slate-900">
                        ${utils.escapeHtml(item.nome || item.item || '—')}
                        ${item.descricao ? `<p class="text-[11px] text-slate-500 font-normal">${utils.escapeHtml(item.descricao)}</p>` : ''}
                      </td>
                      <td class="px-4 py-3">${utils.categoriaBadge(item.categoria)}</td>
                      <td class="px-4 py-3 text-center">${statusBadge}</td>
                      <td class="px-4 py-3 text-slate-600">${utils.escapeHtml(item.local || '—')}</td>
                      <td class="px-4 py-3 text-slate-600">${utils.escapeHtml(item.responsavel || item.usuario || '—')}</td>
                      <td class="px-4 py-3 text-center whitespace-nowrap">
                        <button onclick="ferramentasModule.abrirModal('${utils.escapeHtml(item.id)}')" class="icon-action icon-action-edit text-blue-600 hover:text-blue-700 mx-1" title="Editar"><i class="fas fa-edit"></i></button>
                        <button onclick="ferramentasModule.excluir('${utils.escapeHtml(item.id)}')" class="icon-action icon-action-danger text-red-600 hover:text-red-700 mx-1" title="Excluir"><i class="fas fa-trash-alt"></i></button>
                      </td>
                    </tr>
                  `;
                }).join('') || '<tr><td colspan="7" class="px-4 py-8 text-center text-slate-500">Nenhuma ferramenta encontrada com os filtros atuais.</td></tr>'}
              </tbody>
            </table>
          </div>
          <div class="px-4 py-3 border-t border-slate-200 bg-slate-50 text-xs text-slate-500">
            Mostrando ${filtrados.length} de ${items.length} ferramentas
          </div>
        </div>
      </div>
    `;
  },

  setFiltro(valor) {
    this.filtroAtual = valor;
    const main = document.getElementById('main-content');
    if (main) this.render(main);
  },

  setCategoria(cat) {
    this.categoriaAtiva = cat;
    const main = document.getElementById('main-content');
    if (main) this.render(main);
  },

  _fields(item = {}) {
    const categorias = [...new Set(this._itens().map(i => i.categoria).filter(Boolean))].sort();
    return [
      { key: 'nome', label: 'Nome da Ferramenta', type: 'text', value: item.nome || item.item, required: true },
      { key: 'codigo', label: 'Código (ex.: F065)', type: 'text', value: item.codigo },
      { key: 'categoria', label: 'Categoria', type: 'select', value: item.categoria || '',
        options: [{ value: '', label: 'Selecione...' }, ...categorias.map(c => ({ value: c, label: c }))] },
      { key: 'descricao', label: 'Descrição', type: 'textarea', value: item.descricao },
      { key: 'estado', label: 'Estado', type: 'select', value: item.estado || item.status || 'Disponível',
        options: [
          { value: 'Disponível', label: 'Disponível' },
          { value: 'Em uso', label: 'Em uso' },
          { value: 'Manutenção', label: 'Manutenção' },
          { value: 'Defeito', label: 'Defeito' }
        ] },
      { key: 'local', label: 'Local de guarda', type: 'text', value: item.local },
      { key: 'responsavel', label: 'Responsável atual', type: 'text', value: item.responsavel }
    ];
  },

  abrirModal(id) {
    const item = id ? this._itens().find(f => f.id === id) : null;
    const fields = this._fields(item || {});
    app.openModal(item ? 'Editar Ferramenta' : 'Nova Ferramenta', utils.formHtml(fields),
      () => this.salvar(fields, item), 'Salvar');
  },

  async salvar(fields, item) {
    const v = utils.readForm(fields);
    const erro = utils.validateForm(fields, v);
    if (erro) { app.showToast(erro, 'error'); return; }

    const payload = {
      ...(item || {}),
      id: item?.id || utils.generateId(),
      nome: v.nome,
      item: v.nome,
      codigo: v.codigo,
      categoria: v.categoria,
      descricao: v.descricao,
      estado: v.estado || 'Disponível',
      local: v.local,
      responsavel: v.responsavel,
      createdAt: item?.createdAt || utils.now(),
      updatedAt: utils.now()
    };

    let sheetsOk = false;
    try {
      const res = await app.post(CONFIG.SHEETS[this.ABA], item ? 'update' : 'add', payload);
      sheetsOk = Boolean(res && res.success !== false);
    } catch (e) {
      console.warn('[FERRAMENTAS] Falha no Sheets:', e.message);
    }

    if (item) Object.assign(item, payload);
    else {
      if (!app.data[this.ABA]) app.data[this.ABA] = [];
      app.data[this.ABA].push(payload);
    }

    app.closeModal();
    app.showToast(sheetsOk ? 'Ferramenta salva!' : 'Salva localmente (modo offline).', sheetsOk ? 'success' : 'warning');
    await app.refreshAba(this.ABA);
  },

  async excluir(id) {
    if (!confirm('Excluir esta ferramenta?')) return;
    try { await app.get(CONFIG.SHEETS[this.ABA], 'delete', { id }); } catch (e) { /* ok */ }
    app.data[this.ABA] = (app.data[this.ABA] || []).filter(f => f.id !== id);
    app.showToast('Ferramenta removida.', 'success');
    await app.refreshAba(this.ABA);
  },

  _isFerramenta(item) {
    const cat = utils.normalize(item.categoria);
    const nome = utils.normalize(item.nome || item.item);
    const ferramentaCats = ['ferramenta', 'manual', 'eletrica', 'pneumatica', 'medicao'];
    const isFerramentaCat = ferramentaCats.some(c => cat.includes(c));
    const palavras = ['ferramenta', 'furadeira', 'serra', 'esmeril', 'parafusadeira', 'torno',
      'plaina', 'soprador', 'morsa', 'alicate', 'chave', 'martelo', 'serrote', 'trena', 'nivel'];
    const isFerramentaNome = palavras.some(p => nome.includes(p));
    return isFerramentaCat || isFerramentaNome;
  }
};
