/**
 * indicadores.js — Dashboard de Indicadores Críticos de Estoque
 * ================================================================
 * Com categorias coloridas e gráficos interativos (Chart.js)
 */

const indicadoresModule = {
  charts: {},

  render(container) {
    const items = app.data.estoque || [];
    if (!items.length) {
      container.innerHTML = `<div class="p-8 text-center text-slate-500"><i class="fas fa-box-open text-3xl mb-2"></i><p>Nenhum dado de estoque disponível.</p></div>`;
      return;
    }

    // KPIs
    const total = items.length;
    const zerados = items.filter(i => (parseFloat(i.quantidadeAtual) || 0) === 0);
    const criticos = items.filter(i => {
      const q = parseFloat(i.quantidadeAtual) || 0;
      const m = parseFloat(i.quantidadeMinima) || 0;
      return q > 0 && q <= m;
    });
    const ok = items.filter(i => {
      const q = parseFloat(i.quantidadeAtual) || 0;
      const m = parseFloat(i.quantidadeMinima) || 0;
      return q > m;
    });

    // Saúde = % de itens com estoque acima do mínimo
    const saudePct = total > 0 ? Math.round((ok.length / total) * 100) : 100;
    const saudeColor = saudePct >= 80 ? 'bg-emerald-600' : saudePct >= 50 ? 'bg-amber-500' : 'bg-red-600';

    // Agrupar por categoria
    const catMap = {};
    items.forEach(i => {
      const cat = i.categoria || 'Sem categoria';
      if (!catMap[cat]) catMap[cat] = { count: 0, qtd: 0 };
      catMap[cat].count++;
      catMap[cat].qtd += parseFloat(i.quantidadeAtual) || 0;
    });
    const categorias = Object.keys(catMap).sort();
    const catCounts = categorias.map(c => catMap[c].count);
    const catQtys = categorias.map(c => catMap[c].qtd);

    // Agrupar por local
    const locMap = {};
    items.forEach(i => {
      const loc = i.local || 'Sem local';
      if (!locMap[loc]) locMap[loc] = 0;
      locMap[loc] += parseFloat(i.quantidadeAtual) || 0;
    });
    const locais = Object.keys(locMap).sort();
    const locValues = locais.map(l => locMap[l]);

    // Top 10 críticos
    const topCriticos = [...items]
      .filter(i => {
        const q = parseFloat(i.quantidadeAtual) || 0;
        const m = parseFloat(i.quantidadeMinima) || 0;
        return q <= m;
      })
      .sort((a, b) => (parseFloat(a.quantidadeAtual) || 0) - (parseFloat(b.quantidadeAtual) || 0))
      .slice(0, 10);

    container.innerHTML = `
      <div class="space-y-6">
        <!-- KPIs -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
            <p class="text-xs text-slate-500 uppercase font-semibold">Total de Itens</p>
            <p class="text-2xl font-bold text-slate-900">${total}</p>
          </div>
          <div class="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
            <p class="text-xs text-slate-500 uppercase font-semibold">Estoque OK</p>
            <p class="text-2xl font-bold text-emerald-600">${ok.length}</p>
          </div>
          <div class="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
            <p class="text-xs text-slate-500 uppercase font-semibold">Críticos</p>
            <p class="text-2xl font-bold text-amber-600">${criticos.length}</p>
          </div>
          <div class="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
            <p class="text-xs text-slate-500 uppercase font-semibold">Esgotados</p>
            <p class="text-2xl font-bold text-red-600">${zerados.length}</p>
          </div>
        </div>

        <!-- Barra de Saúde -->
        <div class="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm font-semibold text-slate-700">Saúde do Estoque</span>
            <span class="text-sm font-bold ${saudePct >= 80 ? 'text-emerald-600' : saudePct >= 50 ? 'text-amber-600' : 'text-red-600'}">${saudePct}%</span>
          </div>
          <div class="w-full bg-slate-200 rounded-full h-3">
            <div class="${saudeColor} h-3 rounded-full transition-all" style="width:${saudePct}%"></div>
          </div>
        </div>

        <!-- Gráficos -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div class="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
            <h3 class="text-sm font-bold text-slate-700 mb-3">Itens por Categoria</h3>
            <canvas id="chartCategorias"></canvas>
          </div>
          <div class="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
            <h3 class="text-sm font-bold text-slate-700 mb-3">Quantidade por Local</h3>
            <canvas id="chartLocais"></canvas>
          </div>
          <div class="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
            <h3 class="text-sm font-bold text-slate-700 mb-3">Top 10 Itens Críticos</h3>
            <canvas id="chartCriticos"></canvas>
          </div>
        </div>

        <!-- Tabela de Alertas -->
        <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div class="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
            <i class="fas fa-exclamation-triangle text-amber-600"></i>
            <h3 class="text-sm font-bold text-slate-700">Itens em Alerta (Críticos ou Esgotados)</h3>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="bg-slate-50 border-b border-slate-200">
                  <th class="px-4 py-3 text-left font-semibold text-slate-600">Item</th>
                  <th class="px-4 py-3 text-left font-semibold text-slate-600">Categoria</th>
                  <th class="px-4 py-3 text-center font-semibold text-slate-600">Atual</th>
                  <th class="px-4 py-3 text-center font-semibold text-slate-600">Mínimo</th>
                  <th class="px-4 py-3 text-left font-semibold text-slate-600">Local</th>
                  <th class="px-4 py-3 text-center font-semibold text-slate-600">Status</th>
                </tr>
              </thead>
              <tbody>
                ${[...zerados, ...criticos].map(item => {
                  const q = parseFloat(item.quantidadeAtual) || 0;
                  const m = parseFloat(item.quantidadeMinima) || 0;
                  const isZero = q === 0;
                  const catBadge = utils.categoriaBadge(item.categoria);
                  return `
                    <tr class="border-b border-slate-100 hover:bg-slate-50 transition">
                      <td class="px-4 py-3 font-medium text-slate-900">${utils.escapeHtml(item.nome || item.item || '—')}</td>
                      <td class="px-4 py-3">${catBadge}</td>
                      <td class="px-4 py-3 text-center font-bold ${isZero ? 'text-red-600' : 'text-amber-600'}">${q}</td>
                      <td class="px-4 py-3 text-center text-slate-500">${m > 0 ? m : '—'}</td>
                      <td class="px-4 py-3 text-slate-600">${utils.escapeHtml(item.local || '—')}</td>
                      <td class="px-4 py-3 text-center">
                        ${isZero 
                          ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-red-50 text-red-600 border border-red-200">✕ ESGOTADO</span>`
                          : `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-600 border border-amber-200">⚠ CRÍTICO</span>`}
                      </td>
                    </tr>
                  `;
                }).join('') || '<tr><td colspan="6" class="px-4 py-6 text-center text-slate-500">Nenhum item em alerta. Estoque saudável!</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    this._initCharts(categorias, catCounts, catQtys, locais, locValues, topCriticos);
  },

  _loadChartJS() {
    return new Promise((resolve) => {
      if (window.Chart) { resolve(); return; }
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
      s.onload = resolve;
      document.head.appendChild(s);
    });
  },

  async _initCharts(categorias, catCounts, catQtys, locais, locValues, topCriticos) {
    await this._loadChartJS();
    const Chart = window.Chart;

    // Destruir gráficos anteriores
    Object.values(this.charts).forEach(c => c?.destroy?.());
    this.charts = {};

    // Padrões do Chart.js ajustados ao tema claro (cinza-ardósia + teal)
    Chart.defaults.color = '#64748b';
    Chart.defaults.font.family = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
    Chart.defaults.borderColor = 'rgba(15,23,42,0.08)';
    const gridColor = 'rgba(15,23,42,0.07)';
    const tooltipLight = {
      backgroundColor: '#ffffff',
      borderColor: '#e2e8f0',
      borderWidth: 1,
      titleColor: '#0f172a',
      bodyColor: '#334155',
      boxShadow: '0 4px 12px rgba(15,23,42,0.12)'
    };

    const catBgColors = categorias.map(cat => utils.getCategoriaStyle(cat).chart);
    const catBorderColors = categorias.map(() => '#ffffff');

    // 1. Doughnut — Itens por Categoria
    const ctxCat = document.getElementById('chartCategorias');
    if (ctxCat) {
      this.charts.categorias = new Chart(ctxCat, {
        type: 'doughnut',
        data: {
          labels: categorias,
          datasets: [{
            data: catCounts,
            backgroundColor: catBgColors,
            borderColor: catBorderColors,
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 12, boxHeight: 12, font: { size: 11 }, color: '#64748b' } },
            tooltip: tooltipLight
          }
        }
      });
    }

    // 2. Barras — Quantidade por Local
    const ctxLoc = document.getElementById('chartLocais');
    if (ctxLoc) {
      this.charts.locais = new Chart(ctxLoc, {
        type: 'bar',
        data: {
          labels: locais,
          datasets: [{
            label: 'Quantidade',
            data: locValues,
            backgroundColor: 'rgba(13, 148, 136, 0.55)',
            borderColor: 'rgba(13, 148, 136, 0.95)',
            borderWidth: 1,
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false }, tooltip: tooltipLight },
          scales: {
            y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: '#64748b' } },
            x: { grid: { display: false }, ticks: { color: '#64748b', maxRotation: 45, minRotation: 0 } }
          }
        }
      });
    }

    // 3. Barras horizontais — Top 10 Críticos
    const ctxCrit = document.getElementById('chartCriticos');
    if (ctxCrit && topCriticos.length) {
      const critColors = topCriticos.map(item => {
        const q = parseFloat(item.quantidadeAtual) || 0;
        return q === 0 ? 'rgba(220, 38, 38, 0.7)' : 'rgba(245, 158, 11, 0.7)';
      });
      this.charts.criticos = new Chart(ctxCrit, {
        type: 'bar',
        data: {
          labels: topCriticos.map(i => (i.nome || i.item || '').substring(0, 20)),
          datasets: [{
            label: 'Qtd. Atual',
            data: topCriticos.map(i => parseFloat(i.quantidadeAtual) || 0),
            backgroundColor: critColors,
            borderRadius: 4
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          plugins: { legend: { display: false }, tooltip: tooltipLight },
          scales: {
            x: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: '#64748b' } },
            y: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 10 } } }
          }
        }
      });
    }
  }
};
