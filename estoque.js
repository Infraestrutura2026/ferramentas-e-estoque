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
                class="pl-8 pr-3 py-2 text-sm border border-slate-300 rounded-lg bg-slate-50 text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none w-64"
                oninput="estoqueModule.filtrar()">
            </div>
            <select id="estoqueFiltroCategoria" onchange="estoqueModule.filtrar()"
              class="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-slate-50 text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none">
              <option value="">Todas categorias</option>
              ${categorias.map(c => `<option value="${utils.escapeHtml(c)}">${utils.escapeHtml(c)}</option>`).join('')}
            </select>
            <select id="estoqueFiltroStatus" onchange="estoqueModule.filtrar()"
              class="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-slate-50 text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none">
              <option value="">Todos status</option>
              <option value="ok">✓ Estoque OK</option>
              <option value="critico">⚠ Crítico</option>
              <option value="zerado">✕ Esgotado</option>
            </select>
            ${this._fornecedores().length ? `
            <select id="estoqueFiltroFornecedor" onchange="estoqueModule.filtrar()"
              class="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-slate-50 text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none max-w-56">
              <option value="">Todos os fornecedores</option>
              ${this._fornecedores().map(f => `<option value="${utils.escapeHtml(f)}">${utils.escapeHtml(f)}</option>`).join('')}
            </select>` : ''}
          </div>
          <button onclick="estoqueModule.abrirModalAdicionar()" 
            class="app-button px-4 py-2 text-sm bg-teal-600 text-white font-bold rounded-lg hover:bg-teal-700 shadow shadow-black/20 transition">
            <i class="fas fa-plus mr-1"></i> Novo Item
          </button>
        </div>

        <!-- Tabela de Estoque -->
        <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="bg-slate-50 border-b border-slate-200">
                  <th class="px-4 py-3 text-left font-semibold text-slate-600">Item</th>
                  <th class="px-4 py-3 text-left font-semibold text-slate-600">Categoria</th>
                  <th class="px-4 py-3 text-center font-semibold text-slate-600">Qtd. Atual</th>
                  <th class="px-4 py-3 text-center font-semibold text-slate-600">Mínimo</th>
                  <th class="px-4 py-3 text-center font-semibold text-slate-600">Status</th>
                  <th class="px-4 py-3 text-left font-semibold text-slate-600">Fornecedor</th>
                  <th class="px-4 py-3 text-right font-semibold text-slate-600">Valor Unit.</th>
                  <th class="px-4 py-3 text-left font-semibold text-slate-600">Local</th>
                  <th class="px-4 py-3 text-center font-semibold text-slate-600">Ações</th>
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
      return `<tr><td colspan="9" class="px-4 py-8 text-center text-slate-500">Nenhum item cadastrado.</td></tr>`;
    }
    return items.map(item => {
      const qtd = parseFloat(item.quantidadeAtual) || 0;
      const min = parseFloat(item.quantidadeMinima) || 0;
      let statusBadge = '';
      if (qtd === 0) {
        statusBadge = `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-red-50 text-red-600 border border-red-200">✕ ESGOTADO</span>`;
      } else if (qtd <= min) {
        statusBadge = `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-600 border border-amber-200">⚠ CRÍTICO</span>`;
      } else {
        statusBadge = `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-600 border border-emerald-200">✓ OK</span>`;
      }

      const catBadge = utils.categoriaBadge(item.categoria);
      // Valor unitário (novo) aceita vírgula ou ponto; sem valor informado mostra '—'.
      const valorUnit = utils.valorNumerico(item.valorUnitario);
      const valorUnitario = valorUnit > 0 ? utils.moedaBR(valorUnit) : '—';
      const saldo = valorUnit > 0 ? utils.moedaBR(valorUnit * qtd) : '—';
      const fornecedor = item.fornecedor ? utils.escapeHtml(item.fornecedor) : '—';

      return `
        <tr class="border-b border-slate-100 hover:bg-slate-50 transition" data-id="${utils.escapeHtml(item.id)}"
          title="${saldo !== '—' ? `Saldo do item: ${qtd} × ${utils.moedaBR(valorUnit)} = ${saldo}` : ''}">
          <td class="px-4 py-3 font-medium text-slate-900">${utils.escapeHtml(item.nome || item.item || '—')}</td>
          <td class="px-4 py-3">${catBadge}</td>
          <td class="px-4 py-3 text-center font-semibold">${qtd}</td>
          <td class="px-4 py-3 text-center text-slate-500">${min > 0 ? min : '—'}</td>
          <td class="px-4 py-3 text-center">${statusBadge}</td>
          <td class="px-4 py-3 text-slate-600">${fornecedor}</td>
          <td class="px-4 py-3 text-right whitespace-nowrap text-slate-700">${valorUnitario}</td>
          <td class="px-4 py-3 text-slate-600">${utils.escapeHtml(item.local || '—')}</td>
          <td class="px-4 py-3 text-center">
            <button onclick="estoqueModule.editar('${utils.escapeHtml(item.id)}')" class="icon-action icon-action-edit text-blue-600 hover:text-blue-700 mx-1" title="Editar"><i class="fas fa-edit"></i></button>
            <button onclick="estoqueModule.excluir('${utils.escapeHtml(item.id)}')" class="icon-action icon-action-danger text-red-600 hover:text-red-700 mx-1" title="Excluir"><i class="fas fa-trash-alt"></i></button>
          </td>
        </tr>
      `;
    }).join('');
  },

  filtrar() {
    const search = document.getElementById('estoqueSearch')?.value || '';
    const cat = document.getElementById('estoqueFiltroCategoria')?.value || '';
    const status = document.getElementById('estoqueFiltroStatus')?.value || '';
    const fornecedor = document.getElementById('estoqueFiltroFornecedor')?.value || '';

    let items = app.data.estoque || [];

    if (search) {
      const termo = utils.normalize(search);
      items = items.filter(i => utils.normalize(i.nome || i.item).includes(termo)
        // buscar também pelo fornecedor: "quem me vende este item?"
        || utils.normalize(i.fornecedor || '').includes(termo));
    }
    if (cat) {
      items = items.filter(i => i.categoria === cat);
    }
    if (fornecedor) {
      items = items.filter(i => String(i.fornecedor || '') === fornecedor);
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
    const dlForn = this._datalistFornecedores('dlFornecedoresNovo');

    const html = `
      <div class="space-y-4">
        <div>
          <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Nome do Item</label>
          <input id="inpNome" type="text" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none">
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Categoria</label>
            <select id="inpCategoria" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none">
              <option value="">Selecione...</option>
              ${catOptions}
              <option value="__nova__">+ Nova categoria...</option>
            </select>
            <input id="inpCategoriaNova" type="text" placeholder="Digite nova categoria" class="hidden w-full mt-2 border border-slate-300 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Local</label>
            <input id="inpLocal" type="text" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none">
          </div>
        </div>
        <div class="grid grid-cols-3 gap-3">
          <div>
            <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Qtd. Atual</label>
            <input id="inpQtd" type="number" min="0" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Qtd. Mínima</label>
            <input id="inpMin" type="number" min="0" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Unidade</label>
            <input id="inpUnidade" type="text" value="un" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none">
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Fornecedor</label>
            <input id="inpFornecedor" type="text" list="dlFornecedoresNovo" autocomplete="off"
              placeholder="${this._fornecedores().length ? 'Selecione ou digite...' : 'Cadastre em Fornecedores'}"
              class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none">
            ${dlForn}
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Valor Unitário (R$)</label>
            <input id="inpValorUnitario" type="text" inputmode="decimal" autocomplete="off" placeholder="0,00 (aceita vírgula ou ponto)"
              class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none">
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

  /* ── Fornecedores cadastrados (fonte do datalist e do filtro) ──
     Vêm da aba `fornecedores` já sincronizada pelo app; nomes repetidos no
     cadastro antigo são agrupados, e itens com fornecedor livre (digitado à
     mão) também entram, para o filtro nunca "esquecer" um item. */
  _fornecedores(itensExtras = []) {
    const nomes = new Set();
    (app.data.fornecedores || []).forEach(f => { if (f && f.nome) nomes.add(String(f.nome).trim()); });
    (app.data.estoque || []).concat(itensExtras).forEach(i => { if (i && i.fornecedor) nomes.add(String(i.fornecedor).trim()); });
    return [...nomes].filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  },

  _datalistFornecedores(id) {
    const opcoes = this._fornecedores().map(f => `<option value="${utils.escapeHtml(f)}"></option>`).join('');
    return `<datalist id="${id}">${opcoes}</datalist>`;
  },

  /** Valor guardado (string/number) -> texto do campo de edição em padrão pt-BR. */
  _valorParaEdicao(v) {
    const n = utils.valorNumerico(v);
    return n ? n.toFixed(2).replace('.', ',') : '';
  },

  /** Texto do campo do modal. Sem o campo (modal antigo), preserva `atual`. */
  _campoTexto(id, atual = '') {
    const el = document.getElementById(id);
    return el ? el.value.trim() : String(atual ?? '');
  },

  /** Valor monetário do campo, aceitando vírgula ou ponto. '12,5' → '12.50'. */
  _campoValor(id, atual = '') {
    const el = document.getElementById(id);
    if (!el) return String(atual ?? '');
    const bruto = el.value.trim();
    if (!bruto) return '';
    const n = utils.valorNumerico(bruto);
    // Duas casas decimais fixas: o backend é TEXT e o espelho Sheets precisa
    // receber um número estável ('12.50', não '12,5' nem '12.5').
    return isFinite(n) ? n.toFixed(2) : bruto;
  },

  async salvar() {
    const nome = document.getElementById('inpNome')?.value.trim();
    let categoria = document.getElementById('inpCategoria')?.value;
    const categoriaNova = document.getElementById('inpCategoriaNova')?.value.trim();
    const local = document.getElementById('inpLocal')?.value.trim();
    const qtd = parseFloat(document.getElementById('inpQtd')?.value) || 0;
    const min = parseFloat(document.getElementById('inpMin')?.value) || 0;
    const unidade = document.getElementById('inpUnidade')?.value.trim() || 'un';
    const fornecedor = this._campoTexto('inpFornecedor');
    const valorUnitario = this._campoValor('inpValorUnitario');

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
      fornecedor,
      valorUnitario,
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
          <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Nome do Item</label>
          <input id="editNome" type="text" value="${utils.escapeHtml(item.nome || item.item || '')}" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none">
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Categoria</label>
            <select id="editCategoria" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none">
              ${catOptions}
              <option value="__nova__">+ Nova categoria...</option>
            </select>
            <input id="editCategoriaNova" type="text" placeholder="Nova categoria" class="hidden w-full mt-2 border border-slate-300 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Local</label>
            <input id="editLocal" type="text" value="${utils.escapeHtml(item.local || '')}" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none">
          </div>
        </div>
        <div class="grid grid-cols-3 gap-3">
          <div>
            <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Qtd. Atual</label>
            <input id="editQtd" type="number" min="0" value="${parseFloat(item.quantidadeAtual) || 0}" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Qtd. Mínima</label>
            <input id="editMin" type="number" min="0" value="${parseFloat(item.quantidadeMinima) || 0}" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Unidade</label>
            <input id="editUnidade" type="text" value="${utils.escapeHtml(item.unidade || 'un')}" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none">
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Fornecedor</label>
            <input id="editFornecedor" type="text" list="dlFornecedoresEdicao" autocomplete="off"
              value="${utils.escapeHtml(item.fornecedor || '')}" placeholder="Selecione ou digite..."
              class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none">
            ${this._datalistFornecedores('dlFornecedoresEdicao')}
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Valor Unitário (R$)</label>
            <input id="editValorUnitario" type="text" inputmode="decimal" autocomplete="off"
              value="${utils.escapeHtml(this._valorParaEdicao(item.valorUnitario))}" placeholder="0,00 (aceita vírgula ou ponto)"
              class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none">
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
      // Fornecedor/valor unitário: campo vazio apaga o valor (diferente das
      // demais chaves, que caem no "ou item.x" para não zerar o que não veio).
      fornecedor: this._campoTexto('editFornecedor', item.fornecedor),
      valorUnitario: this._campoValor('editValorUnitario', item.valorUnitario),
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
