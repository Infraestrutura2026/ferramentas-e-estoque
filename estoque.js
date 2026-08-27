/**
 * estoque.js — Módulo de Gestão de Estoque
 * =========================================
 * Com badges coloridos por categoria e integração Google Sheets
 */

const estoqueModule = {
  render(container) {
    const items = app.data.estoque || [];
    const categorias = [...new Set(items.map(i => i.categoria).filter(Boolean))].sort();

    container.innerHTML = `
      <div class="space-y-6">
        <!-- Filtros e Ações -->
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex flex-wrap items-center gap-2">
            <div class="relative">
              <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
              <input id="estoqueSearch" type="text" placeholder="Buscar item..." 
                class="pl-8 pr-3 py-2 text-sm border border-slate-700 rounded-lg focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500 w-64"
                oninput="estoqueModule.filtrar()">
            </div>
            <select id="estoqueFiltroCategoria" onchange="estoqueModule.filtrar()"
              class="px-3 py-2 text-sm border border-slate-700 rounded-lg focus:ring-2 focus:ring-amber-500/60">
              <option value="">Todas categorias</option>
              ${categorias.map(c => `<option value="${utils.escapeHtml(c)}">${utils.escapeHtml(c)}</option>`).join('')}
            </select>
            <select id="estoqueFiltroStatus" onchange="estoqueModule.filtrar()"
              class="px-3 py-2 text-sm border border-slate-700 rounded-lg focus:ring-2 focus:ring-amber-500/60">
              <option value="">Todos status</option>
              <option value="ok">✓ Estoque OK</option>
              <option value="critico">⚠ Crítico</option>
              <option value="zerado">✕ Esgotado</option>
            </select>
          </div>
          <button onclick="estoqueModule.abrirModalAdicionar()" 
            class="px-4 py-2 text-sm bg-amber-500 text-slate-950 font-bold rounded-lg hover:bg-amber-500 shadow shadow-black/20 transition">
            <i class="fas fa-plus mr-1"></i> Novo Item
          </button>
        </div>

        <!-- Tabela de Estoque -->
        <div class="bg-slate-800/60 rounded-xl shadow-sm border border-slate-700/60 overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="bg-slate-900 border-b border-slate-700/60">
                  <th class="px-4 py-3 text-left font-semibold text-slate-400">Item</th>
                  <th class="px-4 py-3 text-left font-semibold text-slate-400">Categoria</th>
                  <th class="px-4 py-3 text-center font-semibold text-slate-400">Qtd. Atual</th>
                  <th class="px-4 py-3 text-center font-semibold text-slate-400">Mínimo</th>
                  <th class="px-4 py-3 text-center font-semibold text-slate-400">Status</th>
                  <th class="px-4 py-3 text-left font-semibold text-slate-400">Local</th>
                  <th class="px-4 py-3 text-center font-semibold text-slate-400">Ações</th>
                </tr>
              </thead>
              <tbody id="estoqueTableBody">
                ${this.renderRows(items)}
              </tbody>
            </table>
          </div>
          <div id="estoqueEmpty" class="hidden p-8 text-center text-slate-500">
            <i class="fas fa-box-open text-3xl mb-2"></i>
            <p>Nenhum item encontrado.</p>
          </div>
        </div>
      </div>
    `;
  },

  renderRows(items) {
    if (!items.length) {
      return `<tr><td colspan="7" class="px-4 py-8 text-center text-slate-500">Nenhum item cadastrado.</td></tr>`;
    }
    return items.map(item => {
      const qtd = parseFloat(item.quantidadeAtual) || 0;
      const min = parseFloat(item.quantidadeMinima) || 0;
      let statusBadge = '';
      if (qtd === 0) {
        statusBadge = `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-red-500/10 text-red-300 border border-red-500/20">✕ ESGOTADO</span>`;
      } else if (qtd <= min) {
        statusBadge = `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20">⚠ CRÍTICO</span>`;
      } else {
        statusBadge = `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">✓ OK</span>`;
      }

      const catBadge = utils.categoriaBadge(item.categoria);

      return `
        <tr class="border-b border-slate-700/40 hover:bg-slate-700/30 transition" data-id="${utils.escapeHtml(item.id)}">
          <td class="px-4 py-3 font-medium text-white">${utils.escapeHtml(item.nome || item.item || '—')}</td>
          <td class="px-4 py-3">${catBadge}</td>
          <td class="px-4 py-3 text-center font-semibold">${qtd}</td>
          <td class="px-4 py-3 text-center text-slate-500">${min > 0 ? min : '—'}</td>
          <td class="px-4 py-3 text-center">${statusBadge}</td>
          <td class="px-4 py-3 text-slate-400">${utils.escapeHtml(item.local || '—')}</td>
          <td class="px-4 py-3 text-center">
            <button onclick="estoqueModule.editar('${utils.escapeHtml(item.id)}')" class="text-sky-400 hover:text-sky-300 mx-1" title="Editar"><i class="fas fa-edit"></i></button>
            <button onclick="estoqueModule.excluir('${utils.escapeHtml(item.id)}')" class="text-red-300 hover:text-red-300 mx-1" title="Excluir"><i class="fas fa-trash-alt"></i></button>
          </td>
        </tr>
      `;
    }).join('');
  },

  filtrar() {
    const search = document.getElementById('estoqueSearch')?.value || '';
    const cat = document.getElementById('estoqueFiltroCategoria')?.value || '';
    const status = document.getElementById('estoqueFiltroStatus')?.value || '';

    let items = app.data.estoque || [];

    if (search) {
      items = items.filter(i => utils.normalize(i.nome || i.item).includes(utils.normalize(search)));
    }
    if (cat) {
      items = items.filter(i => i.categoria === cat);
    }
    if (status) {
      items = items.filter(i => {
        const qtd = parseFloat(i.quantidadeAtual) || 0;
        const min = parseFloat(i.quantidadeMinima) || 0;
        if (status === 'zerado') return qtd === 0;
        if (status === 'critico') return qtd > 0 && qtd <= min;
        if (status === 'ok') return qtd > min;
        return true;
      });
    }

    const tbody = document.getElementById('estoqueTableBody');
    const empty = document.getElementById('estoqueEmpty');
    if (tbody) tbody.innerHTML = this.renderRows(items);
    if (empty) empty.classList.toggle('hidden', items.length > 0);
  },

  abrirModalAdicionar() {
    const categorias = [...new Set((app.data.estoque || []).map(i => i.categoria).filter(Boolean))].sort();
    const catOptions = categorias.map(c => `<option value="${utils.escapeHtml(c)}">${utils.escapeHtml(c)}</option>`).join('');

    const html = `
      <div class="space-y-4">
        <div>
          <label class="block text-xs font-semibold text-slate-400 uppercase mb-1">Nome do Item</label>
          <input id="inpNome" type="text" class="w-full border border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500/60">
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-semibold text-slate-400 uppercase mb-1">Categoria</label>
            <select id="inpCategoria" class="w-full border border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500/60">
              <option value="">Selecione...</option>
              ${catOptions}
              <option value="__nova__">+ Nova categoria...</option>
            </select>
            <input id="inpCategoriaNova" type="text" placeholder="Digite nova categoria" class="hidden w-full mt-2 border border-slate-700 rounded-lg px-3 py-2 text-sm">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-400 uppercase mb-1">Local</label>
            <input id="inpLocal" type="text" class="w-full border border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500/60">
          </div>
        </div>
        <div class="grid grid-cols-3 gap-3">
          <div>
            <label class="block text-xs font-semibold text-slate-400 uppercase mb-1">Qtd. Atual</label>
            <input id="inpQtd" type="number" min="0" class="w-full border border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500/60">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-400 uppercase mb-1">Qtd. Mínima</label>
            <input id="inpMin" type="number" min="0" class="w-full border border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500/60">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-400 uppercase mb-1">Unidade</label>
            <input id="inpUnidade" type="text" value="un" class="w-full border border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500/60">
          </div>
        </div>
      </div>
    `;

    app.openModal('Novo Item de Estoque', html, () => this.salvar());

    document.getElementById('inpCategoria')?.addEventListener('change', (e) => {
      const nova = document.getElementById('inpCategoriaNova');
      if (e.target.value === '__nova__') {
        nova.classList.remove('hidden');
      } else {
        nova.classList.add('hidden');
      }
    });
  },

  async salvar() {
    const nome = document.getElementById('inpNome')?.value.trim();
    let categoria = document.getElementById('inpCategoria')?.value;
    const categoriaNova = document.getElementById('inpCategoriaNova')?.value.trim();
    const local = document.getElementById('inpLocal')?.value.trim();
    const qtd = parseFloat(document.getElementById('inpQtd')?.value) || 0;
    const min = parseFloat(document.getElementById('inpMin')?.value) || 0;
    const unidade = document.getElementById('inpUnidade')?.value.trim() || 'un';

    if (!nome) { app.showToast('Informe o nome do item.', 'error'); return; }
    if (categoria === '__nova__') {
      if (!categoriaNova) { app.showToast('Informe a nova categoria.', 'error'); return; }
      categoria = categoriaNova;
    }

    const payload = {
      id: utils.generateId(),
      nome,
      item: nome,
      categoria: categoria || '',
      local: local || '',
      quantidadeAtual: qtd,
      quantidadeMinima: min,
      unidade,
      data: new Date().toISOString().split('T')[0]
    };

    let sheetsOk = false;
    if (app.isSheetsConfigured()) {
      try {
        const res = await app.post(CONFIG.SHEETS.estoque, 'add', payload);
        if (res.success) {
          sheetsOk = true;
          app.showToast('Item salvo no Google Sheets!', 'success');
        } else {
          console.warn('[ESTOQUE] Sheets retornou erro:', res.error);
        }
      } catch (e) {
        console.warn('[ESTOQUE] Falha ao salvar no Sheets:', e.message);
      }
    }

    app.data.estoque.push(payload);
    if (!sheetsOk) {
      app.showToast('Item adicionado localmente (modo offline).', 'warning');
    } else {
      app.showToast('Item adicionado com sucesso!', 'success');
    }
    app.closeModal();
    await app.refreshAba('estoque');
  },

  editar(id) {
    const item = app.data.estoque.find(i => i.id === id);
    if (!item) return;
    const categorias = [...new Set((app.data.estoque || []).map(i => i.categoria).filter(Boolean))].sort();
    const catOptions = categorias.map(c => 
      `<option value="${utils.escapeHtml(c)}" ${c === item.categoria ? 'selected' : ''}>${utils.escapeHtml(c)}</option>`
    ).join('');

    const html = `
      <div class="space-y-4">
        <input type="hidden" id="editId" value="${utils.escapeHtml(item.id)}">
        <div>
          <label class="block text-xs font-semibold text-slate-400 uppercase mb-1">Nome do Item</label>
          <input id="editNome" type="text" value="${utils.escapeHtml(item.nome || item.item || '')}" class="w-full border border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500/60">
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-semibold text-slate-400 uppercase mb-1">Categoria</label>
            <select id="editCategoria" class="w-full border border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500/60">
              ${catOptions}
              <option value="__nova__">+ Nova categoria...</option>
            </select>
            <input id="editCategoriaNova" type="text" placeholder="Nova categoria" class="hidden w-full mt-2 border border-slate-700 rounded-lg px-3 py-2 text-sm">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-400 uppercase mb-1">Local</label>
            <input id="editLocal" type="text" value="${utils.escapeHtml(item.local || '')}" class="w-full border border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500/60">
          </div>
        </div>
        <div class="grid grid-cols-3 gap-3">
          <div>
            <label class="block text-xs font-semibold text-slate-400 uppercase mb-1">Qtd. Atual</label>
            <input id="editQtd" type="number" min="0" value="${parseFloat(item.quantidadeAtual) || 0}" class="w-full border border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500/60">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-400 uppercase mb-1">Qtd. Mínima</label>
            <input id="editMin" type="number" min="0" value="${parseFloat(item.quantidadeMinima) || 0}" class="w-full border border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500/60">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-400 uppercase mb-1">Unidade</label>
            <input id="editUnidade" type="text" value="${utils.escapeHtml(item.unidade || 'un')}" class="w-full border border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500/60">
          </div>
        </div>
      </div>
    `;

    app.openModal('Editar Item', html, () => this.atualizar());

    document.getElementById('editCategoria')?.addEventListener('change', (e) => {
      const nova = document.getElementById('editCategoriaNova');
      if (e.target.value === '__nova__') nova.classList.remove('hidden');
      else nova.classList.add('hidden');
    });
  },

  async atualizar() {
    const id = document.getElementById('editId')?.value;
    const item = app.data.estoque.find(i => i.id === id);
    if (!item) return;

    let categoria = document.getElementById('editCategoria')?.value;
    const categoriaNova = document.getElementById('editCategoriaNova')?.value.trim();
    if (categoria === '__nova__') {
      if (!categoriaNova) { app.showToast('Informe a nova categoria.', 'error'); return; }
      categoria = categoriaNova;
    }

    const payload = {
      ...item,
      nome: document.getElementById('editNome')?.value.trim() || item.nome,
      item: document.getElementById('editNome')?.value.trim() || item.item,
      categoria: categoria || item.categoria,
      local: document.getElementById('editLocal')?.value.trim() || item.local,
      quantidadeAtual: parseFloat(document.getElementById('editQtd')?.value) || item.quantidadeAtual,
      quantidadeMinima: parseFloat(document.getElementById('editMin')?.value) || item.quantidadeMinima,
      unidade: document.getElementById('editUnidade')?.value.trim() || item.unidade,
      updatedAt: new Date().toISOString()
    };

    let sheetsOk = false;
    if (app.isSheetsConfigured()) {
      try {
        const res = await app.post(CONFIG.SHEETS.estoque, 'update', payload);
        if (res.success) {
          sheetsOk = true;
        } else {
          console.warn('[ESTOQUE] Sheets retornou erro:', res.error);
        }
      } catch (e) {
        console.warn('[ESTOQUE] Falha ao atualizar no Sheets:', e.message);
      }
    }

    Object.assign(item, payload);
    if (!sheetsOk) {
      app.showToast('Item atualizado localmente (modo offline).', 'warning');
    } else {
      app.showToast('Item atualizado!', 'success');
    }
    app.closeModal();
    await app.refreshAba('estoque');
  },

  async excluir(id) {
    if (!confirm('Tem certeza que deseja excluir este item?')) return;
    const idx = app.data.estoque.findIndex(i => i.id === id);
    if (idx === -1) return;

    if (app.isSheetsConfigured()) {
      try {
        await app.get(CONFIG.SHEETS.estoque, 'delete', { id });
      } catch (e) {
        console.warn('Erro ao deletar do Sheets:', e);
      }
    }

    app.data.estoque.splice(idx, 1);
    app.showToast('Item removido.', 'success');
    await app.refreshAba('estoque');
  }
};
