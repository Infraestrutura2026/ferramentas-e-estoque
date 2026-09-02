/**
 * cadastros.js — Módulos de Fornecedores, Pedidos e Usuários
 * ===========================================================
 * CRUD completo com o mesmo contrato do Apps Script (add/update/delete).
 */

/* ────────────────────────────────────────────────
   FORNECEDORES
   ──────────────────────────────────────────────── */
const fornecedoresModule = {
  pagina: 1,
  busca: '',
  ABA: 'fornecedores',

  render(container) {
    let items = app.data[this.ABA] || [];
    if (this.busca) {
      const b = utils.normalize(this.busca);
      items = items.filter(f =>
        utils.normalize(f.nome).includes(b) ||
        utils.normalize(f.categoria).includes(b) ||
        utils.normalize(f.contato).includes(b));
    }
    const pg = utils.paginate(items, this.pagina, 10);

    container.innerHTML = `
      <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div class="p-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200">
          <div class="flex items-center gap-3">
            <h2 class="text-lg font-bold text-slate-900">Fornecedores</h2>
            <span class="text-xs text-slate-500">${items.length} cadastrado(s)</span>
          </div>
          <div class="flex items-center gap-2">
            <div class="relative">
              <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
              <input type="text" value="${utils.escapeHtml(this.busca)}" placeholder="Buscar fornecedor..."
                class="pl-8 pr-3 py-2 text-sm border border-slate-300 rounded-lg bg-slate-50 text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none w-56"
                oninput="fornecedoresModule.setBusca(this.value)">
            </div>
            <button onclick="fornecedoresModule.abrirModal()" class="app-button px-4 py-2 text-sm bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-lg transition">
              <i class="fas fa-plus mr-1"></i> Novo
            </button>
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead><tr class="bg-slate-50 border-b border-slate-200">
              <th class="px-4 py-3 text-left font-semibold text-slate-600">Fornecedor</th>
              <th class="px-4 py-3 text-left font-semibold text-slate-600">Categorias</th>
              <th class="px-4 py-3 text-left font-semibold text-slate-600">Contato</th>
              <th class="px-4 py-3 text-left font-semibold text-slate-600">Telefone</th>
              <th class="px-4 py-3 text-center font-semibold text-slate-600">Status</th>
              <th class="px-4 py-3 text-center font-semibold text-slate-600">Ações</th>
            </tr></thead>
            <tbody>
              ${pg.rows.map(f => `
                <tr class="border-b border-slate-100 hover:bg-slate-50 transition">
                  <td class="px-4 py-3">
                    <p class="font-medium text-slate-900">${utils.escapeHtml(f.nome || '—')}</p>
                    <p class="text-[11px] text-slate-500">${utils.escapeHtml(f.cnpj || '')}</p>
                  </td>
                  <td class="px-4 py-3 text-slate-600">${utils.escapeHtml(f.categoria || '—')}</td>
                  <td class="px-4 py-3">
                    <p class="text-slate-700">${utils.escapeHtml(f.contato || '—')}</p>
                    <p class="text-[11px] text-slate-500">${utils.escapeHtml(f.email || '')}</p>
                  </td>
                  <td class="px-4 py-3 text-slate-600 whitespace-nowrap">${utils.escapeHtml(f.telefone || '—')}</td>
                  <td class="px-4 py-3 text-center">${utils.statusBadge(f.status || 'Ativo')}</td>
                  <td class="px-4 py-3 text-center whitespace-nowrap">
                    <button onclick="fornecedoresModule.abrirModal('${utils.escapeHtml(f.id)}')" class="icon-action icon-action-edit text-blue-600 hover:text-blue-700 mx-1" title="Editar"><i class="fas fa-edit"></i></button>
                    <button onclick="fornecedoresModule.excluir('${utils.escapeHtml(f.id)}')" class="icon-action icon-action-danger text-red-600 hover:text-red-700 mx-1" title="Excluir"><i class="fas fa-trash-alt"></i></button>
                  </td>
                </tr>`).join('') || '<tr><td colspan="6" class="px-4 py-8 text-center text-slate-500">Nenhum fornecedor encontrado.</td></tr>'}
            </tbody>
          </table>
        </div>
        ${utils.paginationControls('fornecedoresModule', pg.page, pg.pages, pg.total)}
      </div>
    `;
  },

  setBusca(v) { this.busca = v; this.pagina = 1; this.render(document.getElementById('main-content')); },
  setPage(p) { this.pagina = p; this.render(document.getElementById('main-content')); },

  _fields(item = {}) {
    return [
      { key: 'nome', label: 'Nome / Razão Social', type: 'text', value: item.nome, required: true },
      { key: 'cnpj', label: 'CNPJ', type: 'text', value: item.cnpj },
      { key: 'categoria', label: 'Categorias fornecidas', type: 'text', value: item.categoria, placeholder: 'Ex.: Hidráulica/Elétrica' },
      { key: 'contato', label: 'Pessoa de contato', type: 'text', value: item.contato },
      { key: 'telefone', label: 'Telefone', type: 'text', value: item.telefone },
      { key: 'email', label: 'E-mail', type: 'text', value: item.email },
      { key: 'endereco', label: 'Endereço', type: 'text', value: item.endereco },
      { key: 'status', label: 'Status', type: 'select', value: item.status || 'Ativo',
        options: [{ value: 'Ativo', label: 'Ativo' }, { value: 'Inativo', label: 'Inativo' }] }
    ];
  },

  abrirModal(id) {
    const item = id ? (app.data[this.ABA] || []).find(f => f.id === id) : null;
    const fields = this._fields(item || {});
    app.openModal(item ? 'Editar Fornecedor' : 'Novo Fornecedor', utils.formHtml(fields),
      () => this.salvar(fields, item), 'Salvar');
  },

  async salvar(fields, item) {
    const v = utils.readForm(fields);
    const erro = utils.validateForm(fields, v);
    if (erro) { app.showToast(erro, 'error'); return; }

    const payload = {
      ...(item || {}),
      id: item?.id || String((app.data[this.ABA] || []).length + 1),
      ...v,
      updatedAt: utils.now()
    };

    let sheetsOk = false;
    try {
      const res = await app.post(CONFIG.SHEETS[this.ABA], item ? 'update' : 'add', payload);
      sheetsOk = Boolean(res && res.success !== false);
    } catch (e) {
      console.warn('[FORNECEDORES] Falha no Sheets:', e.message);
    }

    if (item) Object.assign(item, payload);
    else {
      if (!app.data[this.ABA]) app.data[this.ABA] = [];
      app.data[this.ABA].push(payload);
    }

    app.closeModal();
    app.showToast(sheetsOk ? 'Fornecedor salvo!' : 'Salvo localmente (modo offline).', sheetsOk ? 'success' : 'warning');
    await app.refreshAba(this.ABA);
  },

  async excluir(id) {
    if (!confirm('Excluir este fornecedor?')) return;
    try { await app.get(CONFIG.SHEETS[this.ABA], 'delete', { id }); } catch (e) { /* ok */ }
    app.data[this.ABA] = (app.data[this.ABA] || []).filter(f => f.id !== id);
    app.showToast('Fornecedor removido.', 'success');
    await app.refreshAba(this.ABA);
  }
};

/* ────────────────────────────────────────────────
   PEDIDOS (compras)
   ──────────────────────────────────────────────── */
const pedidosModule = {
  pagina: 1,
  busca: '',
  filtroStatus: '',
  ABA: 'pedidos',

  render(container) {
    const hoje = utils.today();
    let items = app.data[this.ABA] || [];

    const isAtrasado = p => utils.normalize(p.status).includes('pend') && (p.previsaoEntrega || '') && p.previsaoEntrega < hoje && !p.dataEntrega;

    if (this.busca) {
      const b = utils.normalize(this.busca);
      items = items.filter(p =>
        utils.normalize(p.item).includes(b) ||
        utils.normalize(p.solicitante).includes(b) ||
        utils.normalize(p.localUso || '').includes(b));
    }
    if (this.filtroStatus) {
      items = items.filter(p => utils.normalize(p.status).includes(utils.normalize(this.filtroStatus)));
    }

    items = [...items].sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')));
    const pg = utils.paginate(items, this.pagina, 10);

    const kpi = (label, valor, cor) => `
      <div class="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <p class="text-xs text-slate-500 uppercase font-semibold">${label}</p>
        <p class="text-2xl font-bold ${cor}">${valor}</p>
      </div>`;

    const todos = app.data[this.ABA] || [];
    const pendentes = todos.filter(p => utils.normalize(p.status).includes('pend')).length;
    const entregues = todos.filter(p => utils.normalize(p.status).includes('entreg')).length;
    const valorTotal = todos.reduce((s, p) => s + (parseFloat(String(p.valorTotal).replace(',', '.')) || 0), 0);

    container.innerHTML = `
      <div class="space-y-6">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          ${kpi('Total de Solicitações', todos.length, 'text-slate-900')}
          ${kpi('Pendentes', pendentes, 'text-amber-600')}
          ${kpi('Entregues', entregues, 'text-emerald-600')}
          ${kpi('Valor Total', 'R$ ' + valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 }), 'text-slate-900')}
        </div>

        <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div class="p-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200">
            <h2 class="text-lg font-bold text-slate-900">Solicitações de Compra</h2>
            <div class="flex items-center gap-2">
              <div class="relative">
                <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
                <input type="text" value="${utils.escapeHtml(this.busca)}" placeholder="Buscar item, solicitante ou local..."
                  class="pl-8 pr-3 py-2 text-sm border border-slate-300 rounded-lg bg-slate-50 text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none w-56"
                  oninput="pedidosModule.setBusca(this.value)">
              </div>
              <select onchange="pedidosModule.setFiltroStatus(this.value)"
                class="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-slate-50 text-slate-900 focus:ring-2 focus:ring-teal-500">
                <option value="">Todos</option>
                <option value="pendente" ${this.filtroStatus === 'pendente' ? 'selected' : ''}>Pendentes</option>
                <option value="entregue" ${this.filtroStatus === 'entregue' ? 'selected' : ''}>Entregues</option>
              </select>
              <button onclick="pedidosModule.abrirModal()" class="app-button px-4 py-2 text-sm bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-lg transition">
                <i class="fas fa-plus mr-1"></i> Novo
              </button>
            </div>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead><tr class="bg-slate-50 border-b border-slate-200">
                <th class="px-4 py-3 text-left font-semibold text-slate-600">Data</th>
                <th class="px-4 py-3 text-left font-semibold text-slate-600">Item</th>
                <th class="px-4 py-3 text-left font-semibold text-slate-600">Solicitante</th>
                <th class="px-4 py-3 text-center font-semibold text-slate-600">Qtd</th>
                <th class="px-4 py-3 text-left font-semibold text-slate-600">Local de Uso</th>
                <th class="px-4 py-3 text-right font-semibold text-slate-600">Valor Total</th>
                <th class="px-4 py-3 text-center font-semibold text-slate-600">Previsão</th>
                <th class="px-4 py-3 text-center font-semibold text-slate-600">Entrega</th>
                <th class="px-4 py-3 text-center font-semibold text-slate-600">Status</th>
                <th class="px-4 py-3 text-center font-semibold text-slate-600">Ações</th>
              </tr></thead>
              <tbody>
                ${pg.rows.map(p => {
                  const atrasado = isAtrasado(p);
                  const valor = parseFloat(String(p.valorTotal).replace(',', '.')) || 0;
                  return `<tr class="border-b border-slate-100 hover:bg-slate-50 transition ${atrasado ? 'bg-red-50' : ''}">
                    <td class="px-4 py-3 text-slate-500 whitespace-nowrap">${utils.formatDate(p.data)}</td>
                    <td class="px-4 py-3 font-medium text-slate-900">${utils.escapeHtml(p.item || '—')}</td>
                    <td class="px-4 py-3 text-slate-600">${utils.escapeHtml(p.solicitante || '—')}</td>
                    <td class="px-4 py-3 text-center font-mono">${utils.escapeHtml(p.quantidade || '—')}</td>
                    <td class="px-4 py-3 text-slate-600">${utils.escapeHtml(p.localUso || '—')}</td>
                    <td class="px-4 py-3 text-right font-mono text-slate-700">R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                    <td class="px-4 py-3 text-center ${atrasado ? 'text-red-600 font-bold' : 'text-slate-600'}">${utils.formatDate(p.previsaoEntrega)}</td>
                    <td class="px-4 py-3 text-center text-slate-600 whitespace-nowrap">${utils.formatDate(p.dataEntrega)}</td>
                    <td class="px-4 py-3 text-center">${atrasado
                      ? '<span class="inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-red-50 text-red-600 border border-red-200">⏰ ATRASADO</span>'
                      : utils.statusBadge(p.status || 'Pendente')}</td>
                    <td class="px-4 py-3 text-center whitespace-nowrap">
                      <button onclick="pedidosModule.abrirModal('${utils.escapeHtml(p.id)}')" class="icon-action icon-action-edit text-blue-600 hover:text-blue-700 mx-1" title="Editar"><i class="fas fa-edit"></i></button>
                      <button onclick="pedidosModule.excluir('${utils.escapeHtml(p.id)}')" class="icon-action icon-action-danger text-red-600 hover:text-red-700 mx-1" title="Excluir"><i class="fas fa-trash-alt"></i></button>
                    </td>
                  </tr>`;
                }).join('') || '<tr><td colspan="10" class="px-4 py-8 text-center text-slate-500">Nenhuma solicitação encontrada.</td></tr>'}
              </tbody>
            </table>
          </div>
          ${utils.paginationControls('pedidosModule', pg.page, pg.pages, pg.total)}
        </div>
      </div>
    `;
  },

  setBusca(v) { this.busca = v; this.pagina = 1; this.render(document.getElementById('main-content')); },
  setFiltroStatus(v) { this.filtroStatus = v; this.pagina = 1; this.render(document.getElementById('main-content')); },
  setPage(p) { this.pagina = p; this.render(document.getElementById('main-content')); },

  _fields(item = {}) {
    return [
      { key: 'data', label: 'Data da Solicitação', type: 'date', value: item.data || utils.today(), required: true },
      { key: 'item', label: 'Item', type: 'text', value: item.item, required: true },
      { key: 'solicitante', label: 'Solicitante', type: 'text', value: item.solicitante, required: true },
      { key: 'quantidade', label: 'Quantidade', type: 'number', value: item.quantidade, required: true },
      { key: 'localUso', label: 'Local de Utilização', type: 'text', value: item.localUso,
        placeholder: 'Onde o item será usado (ex.: Almoxarifado, Oficina, Refeitório)' },
      { key: 'valorUnitario', label: 'Valor Unitário (R$)', type: 'number', value: item.valorUnitario },
      { key: 'valorTotal', label: 'Valor Total (R$)', type: 'number', value: item.valorTotal,
        placeholder: 'Calculado automaticamente (Qtd × Valor Unitário)' },
      { key: 'previsaoEntrega', label: 'Previsão de Entrega', type: 'date', value: item.previsaoEntrega },
      { key: 'dataEntrega', label: 'Data da Entrega', type: 'date', value: item.dataEntrega },
      { key: 'status', label: 'Status', type: 'select', value: item.status || 'Pendente',
        options: [{ value: 'Pendente', label: 'Pendente' }, { value: 'Entregue', label: 'Entregue' }, { value: 'Cancelado', label: 'Cancelado' }] },
      { key: 'observacao', label: 'Observação', type: 'textarea', value: item.observacao }
    ];
  },

  abrirModal(id) {
    const item = id ? (app.data[this.ABA] || []).find(p => p.id === id) : null;
    const fields = this._fields(item || {});
    app.openModal(item ? 'Editar Solicitação' : 'Nova Solicitação', utils.formHtml(fields),
      () => this.salvar(fields, item), 'Salvar');
    this._bindCalculoTotal();
  },

  /* Calcula o Valor Total automaticamente (Quantidade × Valor Unitário) */
  _bindCalculoTotal() {
    const qtd = document.getElementById('fld_quantidade');
    const unit = document.getElementById('fld_valorUnitario');
    const total = document.getElementById('fld_valorTotal');
    if (!qtd || !unit || !total) return;
    const calc = () => {
      const q = parseFloat(String(qtd.value).replace(',', '.'));
      const u = parseFloat(String(unit.value).replace(',', '.'));
      if (!isNaN(q) && !isNaN(u)) total.value = (q * u).toFixed(2);
    };
    qtd.addEventListener('input', calc);
    unit.addEventListener('input', calc);
  },

  async salvar(fields, item) {
    const v = utils.readForm(fields);
    const erro = utils.validateForm(fields, v);
    if (erro) { app.showToast(erro, 'error'); return; }

    // Calcula valor total se não informado
    if (!v.valorTotal && v.quantidade && v.valorUnitario) {
      v.valorTotal = (parseFloat(v.quantidade) * parseFloat(v.valorUnitario)).toFixed(2);
    }

    // Detecta transição de status para "Entregue" → dispara baixa no estoque
    const eraEntregue = utils.normalize(item?.status || '').includes('entreg');
    const ficouEntregue = utils.normalize(v.status || '').includes('entreg');
    const jaDeuBaixa = String(item?.baixaEstoque || '') === 'sim';
    const deveBaixar = ficouEntregue && !eraEntregue && !jaDeuBaixa;

    const payload = {
      ...(item || {}),
      id: item?.id || String((app.data[this.ABA] || []).length + 1),
      ...v,
      updatedAt: utils.now()
    };

    if (deveBaixar) {
      const baixou = await this._darBaixaEstoque(payload);
      if (baixou) payload.baixaEstoque = 'sim';
    }

    let sheetsOk = false;
    try {
      const res = await app.post(CONFIG.SHEETS[this.ABA], item ? 'update' : 'add', payload);
      sheetsOk = Boolean(res && res.success !== false);
    } catch (e) {
      console.warn('[PEDIDOS] Falha no Sheets:', e.message);
    }

    if (item) Object.assign(item, payload);
    else {
      if (!app.data[this.ABA]) app.data[this.ABA] = [];
      app.data[this.ABA].push(payload);
    }

    app.closeModal();
    app.showToast(sheetsOk ? 'Solicitação salva!' : 'Salva localmente (modo offline).', sheetsOk ? 'success' : 'warning');
    await app.refreshAba(this.ABA);
  },

  /* Dá baixa no estoque quando a solicitação é marcada como Entregue.
     Localiza o item do estoque pelo nome e subtrai a quantidade solicitada. */
  async _darBaixaEstoque(pedido) {
    const nomePedido = utils.normalize(pedido.item || '');
    const qtd = parseFloat(String(pedido.quantidade || '').replace(',', '.')) || 0;
    if (!nomePedido || qtd <= 0) return false;

    const estoque = app.data.estoque || [];
    const itemEstoque = estoque.find(e => utils.normalize(e.nome || e.item || '') === nomePedido)
      || estoque.find(e => utils.normalize(e.nome || e.item || '').includes(nomePedido) || nomePedido.includes(utils.normalize(e.nome || e.item || '')));

    if (!itemEstoque) {
      app.showToast(`Item "${pedido.item}" não encontrado no estoque — baixa não realizada.`, 'warning');
      return false;
    }

    const atual = parseFloat(itemEstoque.quantidadeAtual) || 0;
    const nova = Math.max(0, atual - qtd);
    const payloadEstoque = { ...itemEstoque, quantidadeAtual: nova, updatedAt: utils.now() };

    try {
      await app.post(CONFIG.SHEETS.estoque, 'update', payloadEstoque);
    } catch (e) {
      console.warn('[PEDIDOS] Falha ao dar baixa no estoque (Sheets):', e.message);
    }
    Object.assign(itemEstoque, payloadEstoque);

    // Registra a movimentação de saída
    const mov = {
      id: 'mov_' + Date.now(),
      data: pedido.dataEntrega || utils.today(),
      tipo: 'Saída',
      item: itemEstoque.nome || itemEstoque.item || pedido.item,
      quantidade: qtd,
      local: pedido.localUso || itemEstoque.local || '',
      usuario: (typeof authModule !== 'undefined' && authModule.getCurrentUser) ? authModule.getCurrentUser() : '',
      observacao: `Baixa automática — solicitação entregue (${pedido.solicitante || ''})`
    };
    try {
      await app.post(CONFIG.SHEETS.movimentacoes, 'add', mov);
    } catch (e) {
      console.warn('[PEDIDOS] Falha ao registrar movimentação (Sheets):', e.message);
    }
    if (!app.data.movimentacoes) app.data.movimentacoes = [];
    app.data.movimentacoes.push(mov);

    if (atual < qtd) {
      app.showToast(`Baixa realizada, mas o estoque de "${mov.item}" tinha apenas ${atual} (solicitado: ${qtd}). Saldo zerado.`, 'warning');
    } else {
      app.showToast(`Baixa no estoque: ${qtd} × "${mov.item}" (saldo: ${nova}).`, 'success');
    }
    return true;
  },

  async excluir(id) {
    if (!confirm('Excluir esta solicitação?')) return;
    try { await app.get(CONFIG.SHEETS[this.ABA], 'delete', { id }); } catch (e) { /* ok */ }
    app.data[this.ABA] = (app.data[this.ABA] || []).filter(p => p.id !== id);
    app.showToast('Solicitação removida.', 'success');
    await app.refreshAba(this.ABA);
  }
};

/* ────────────────────────────────────────────────
   USUÁRIOS (somente admin)
   ──────────────────────────────────────────────── */
const usuariosModule = {
  ABA: 'usuarios',

  render(container) {
    if (!authModule.isAdmin()) {
      container.innerHTML = `<div class="p-8 text-center text-slate-500"><i class="fas fa-lock text-3xl mb-2"></i><p>Acesso restrito ao administrador.</p></div>`;
      return;
    }

    const usuarios = (app.data[this.ABA] || []).map(u => ({
      id: u.id || u.usuario,
      usuario: u.usuario || u.username || '',
      nome: u.nome || u.usuario || '',
      nivel: u.nivel || u.role || 'usuario',
      senhaHash: u.senha || u.senhaHash || ''
    }));

    container.innerHTML = `
      <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div class="p-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200">
          <div>
            <h2 class="text-lg font-bold text-slate-900">Usuários do Sistema</h2>
            <p class="text-xs text-slate-500 mt-1">Senhas são armazenadas com hash SHA-256. Usuários valem para todos os computadores.</p>
          </div>
          <button onclick="usuariosModule.abrirModal()" class="app-button px-4 py-2 text-sm bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-lg transition">
            <i class="fas fa-user-plus mr-1"></i> Novo Usuário
          </button>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead><tr class="bg-slate-50 border-b border-slate-200">
              <th class="px-4 py-3 text-left font-semibold text-slate-600">Usuário</th>
              <th class="px-4 py-3 text-left font-semibold text-slate-600">Nome</th>
              <th class="px-4 py-3 text-center font-semibold text-slate-600">Nível</th>
              <th class="px-4 py-3 text-center font-semibold text-slate-600">Ações</th>
            </tr></thead>
            <tbody>
              ${usuarios.map(u => `
                <tr class="border-b border-slate-100 hover:bg-slate-50 transition">
                  <td class="px-4 py-3 font-medium text-slate-900">${utils.escapeHtml(u.usuario)}</td>
                  <td class="px-4 py-3 text-slate-600">${utils.escapeHtml(u.nome)}</td>
                  <td class="px-4 py-3 text-center">
                    ${u.nivel === 'admin'
                      ? '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-600 border border-amber-200"><i class="fas fa-user-shield mr-1"></i>Admin</span>'
                      : '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-300"><i class="fas fa-user mr-1"></i>Operador</span>'}
                  </td>
                  <td class="px-4 py-3 text-center whitespace-nowrap">
                    <button onclick="usuariosModule.abrirModal('${utils.escapeHtml(u.id)}')" class="icon-action icon-action-edit text-blue-600 hover:text-blue-700 mx-1" title="Editar/Alterar senha"><i class="fas fa-edit"></i></button>
                    ${u.usuario !== authModule.getCurrentUser() ? `<button onclick="usuariosModule.excluir('${utils.escapeHtml(u.id)}')" class="icon-action icon-action-danger text-red-600 hover:text-red-700 mx-1" title="Excluir"><i class="fas fa-trash-alt"></i></button>` : ''}
                  </td>
                </tr>`).join('') || '<tr><td colspan="4" class="px-4 py-8 text-center text-slate-500">Nenhum usuário remoto carregado (usando usuários padrão locais).</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  abrirModal(id) {
    const usuarios = app.data[this.ABA] || [];
    const item = id ? usuarios.find(u => (u.id || u.usuario) === id) : null;

    const html = utils.formHtml([
      { key: 'usuario', label: 'Usuário (login)', type: 'text', value: item?.usuario, required: true },
      { key: 'nome', label: 'Nome completo', type: 'text', value: item?.nome },
      { key: 'nivel', label: 'Nível', type: 'select', value: item?.nivel || 'usuario',
        options: [{ value: 'usuario', label: 'Operador' }, { value: 'admin', label: 'Administrador' }] },
      { key: 'senha', label: item ? 'Nova senha (deixe em branco para manter)' : 'Senha', type: 'password', required: !item }
    ]);

    app.openModal(item ? 'Editar Usuário' : 'Novo Usuário', html, () => this.salvar(item), 'Salvar');
  },

  async salvar(item) {
    const usuario = document.getElementById('fld_usuario')?.value.trim().toLowerCase();
    const nome = document.getElementById('fld_nome')?.value.trim();
    const nivel = document.getElementById('fld_nivel')?.value || 'usuario';
    const senha = document.getElementById('fld_senha')?.value;

    if (!usuario) { app.showToast('Informe o usuário.', 'error'); return; }
    if (!item && !senha) { app.showToast('Informe a senha.', 'error'); return; }
    if (senha && senha.length < 6) { app.showToast('A senha deve ter pelo menos 6 caracteres.', 'error'); return; }

    if (!app.data[this.ABA]) app.data[this.ABA] = [];
    const duplicado = app.data[this.ABA].some(u => u.usuario?.toLowerCase() === usuario && u !== item);
    if (duplicado) { app.showToast('Já existe um usuário com esse login.', 'error'); return; }

    const payload = {
      ...(item || {}),
      usuario,
      nome: nome || usuario,
      nivel,
      updatedAt: utils.now()
    };
    if (senha) payload.senha = await utils.sha256(senha); // envia o hash, nunca a senha

    let sheetsOk = false;
    try {
      const res = await app.post(CONFIG.SHEETS[this.ABA], item ? 'update' : 'add', payload);
      sheetsOk = Boolean(res && res.success !== false);
    } catch (e) {
      console.warn('[USUARIOS] Falha no Sheets:', e.message);
    }

    if (item) Object.assign(item, payload);
    else app.data[this.ABA].push(payload);

    app.closeModal();
    app.showToast(sheetsOk ? 'Usuário salvo!' : 'Salvo localmente (modo offline).', sheetsOk ? 'success' : 'warning');
    await app.refreshAba(this.ABA);
  },

  async excluir(id) {
    if (!confirm('Excluir este usuário?')) return;
    const usuarios = app.data[this.ABA] || [];
    const alvo = usuarios.find(u => (u.id || u.usuario) === id);
    if (!alvo) return;
    try { await app.get(CONFIG.SHEETS[this.ABA], 'delete', { id: alvo.id || alvo.usuario }); } catch (e) { /* ok */ }
    app.data[this.ABA] = usuarios.filter(u => u !== alvo);
    app.showToast('Usuário removido.', 'success');
    await app.refreshAba(this.ABA);
  }
};
