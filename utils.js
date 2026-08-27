/**
 * utils.js — Funções utilitárias do ERP
 * ======================================
 */

const utils = {
  generateId() {
    return 'id_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
  },

  escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  now() {
    return new Date().toISOString();
  },

  today() {
    return new Date().toISOString().split('T')[0];
  },

  formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00');
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString('pt-BR');
  },

  /**
   * Normaliza texto para busca: minúsculas e sem acentos.
   * "Hidráulica" → "hidraulica"
   */
  normalize(str) {
    return String(str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  },

  /**
   * SHA-256 em hexadecimal (usado na autenticação).
   * Em navegadores sem crypto.subtle, usa fallback simples.
   */
  async sha256(text) {
    try {
      if (window.crypto && crypto.subtle) {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
      }
    } catch (e) { /* fallback abaixo */ }
    // Fallback (não criptográfico) apenas para contextos sem WebCrypto
    let h = 5381;
    const s = String(text);
    for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return 'fb_' + h.toString(16);
  },

  /* ────────────────────────────────────────────────
     Formulários genéricos (modais de CRUD)
     fields: [{ key, label, type: text|number|date|select|textarea,
                value, options: [{value,label}], required, placeholder }]
     ──────────────────────────────────────────────── */
  formHtml(fields) {
    const inputCls = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-900 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition';
    return `<div class="space-y-4">` + fields.map(f => {
      const req = f.required ? ' <span class="text-red-600">*</span>' : '';
      const label = `<label class="block text-xs font-semibold text-slate-600 uppercase mb-1">${this.escapeHtml(f.label)}${req}</label>`;
      let control = '';
      if (f.type === 'select') {
        const opts = (f.options || []).map(o =>
          `<option value="${this.escapeHtml(o.value)}" ${String(o.value) === String(f.value) ? 'selected' : ''}>${this.escapeHtml(o.label)}</option>`
        ).join('');
        control = `<select id="fld_${f.key}" class="${inputCls}">${opts}</select>`;
      } else if (f.type === 'textarea') {
        control = `<textarea id="fld_${f.key}" rows="2" placeholder="${this.escapeHtml(f.placeholder || '')}" class="${inputCls}">${this.escapeHtml(f.value || '')}</textarea>`;
      } else {
        control = `<input id="fld_${f.key}" type="${f.type || 'text'}" value="${this.escapeHtml(f.value ?? '')}" placeholder="${this.escapeHtml(f.placeholder || '')}" class="${inputCls}" ${f.type === 'number' ? 'min="0" step="any"' : ''}>`;
      }
      return `<div>${label}${control}</div>`;
    }).join('') + `</div>`;
  },

  readForm(fields) {
    const out = {};
    for (const f of fields) {
      const el = document.getElementById('fld_' + f.key);
      out[f.key] = el ? el.value.trim() : '';
    }
    return out;
  },

  validateForm(fields, values) {
    for (const f of fields) {
      if (f.required && !values[f.key]) return `Preencha o campo "${f.label}".`;
    }
    return null;
  },

  /* ────────────────────────────────────────────────
     Paginação simples de tabelas
     ──────────────────────────────────────────────── */
  paginate(items, page, perPage = 15) {
    const total = items.length;
    const pages = Math.max(1, Math.ceil(total / perPage));
    const current = Math.min(Math.max(1, page), pages);
    const start = (current - 1) * perPage;
    return { rows: items.slice(start, start + perPage), page: current, pages, total };
  },

  paginationControls(moduleName, page, pages, total) {
    if (pages <= 1) return '';
    const btn = 'px-2.5 py-1 rounded-lg text-xs font-semibold border border-slate-300 hover:bg-slate-100 transition disabled:opacity-40 disabled:cursor-not-allowed';
    return `
      <div class="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50 text-xs text-slate-500">
        <span>${total} registro(s)</span>
        <div class="flex items-center gap-2">
          <button class="${btn}" ${page <= 1 ? 'disabled' : ''} onclick="${moduleName}.setPage(${page - 1})"><i class="fas fa-chevron-left"></i></button>
          <span class="text-slate-600 font-semibold">Página ${page} de ${pages}</span>
          <button class="${btn}" ${page >= pages ? 'disabled' : ''} onclick="${moduleName}.setPage(${page + 1})"><i class="fas fa-chevron-right"></i></button>
        </div>
      </div>`;
  },

  /**
   * Retorna estilo (cores) para uma categoria, calibrado para o tema claro
   * (cinza-ardósia): fundo pastel suave, texto escuro da própria matiz e
   * borda delicada. Expõe também cores vivas para gráficos (chart/chartBorder).
   */
  getCategoriaStyle(categoria) {
    // Matiz (hue) por categoria — paleta institucional limpa no tema claro
    const hues = {
      'Hidráulica':          152,
      'Elétrica':            217,
      'Construção':           24,
      'Automotivo':          268,
      'Marcenaria':           36,
      'Serralheria':         197,
      'Jardinagem':           88,
      'Pintura':             330,
      'Limpeza':             174,
      'Escritório':          220,
      'Informática':         238,
      'Segurança':             0,
      'Ferramenta Manual':    48,
      'Ferramenta Elétrica': 187,
      'Alvenaria':            20,
      'Refrigeração':        201,
      'Mecânica':            215,
      'Geral':               220,
      'Entrada':             150
    };

    const key = String(categoria || '').trim();

    // Fallback determinístico: matiz derivada do nome da categoria
    let hue = hues[key];
    if (hue === undefined) {
      const hash = Array.from(key).reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const palette = [20, 40, 88, 152, 174, 197, 217, 268, 330, 350];
      hue = palette[hash % palette.length];
    }

    return {
      bg:     `hsl(${hue}, 70%, 95%)`,
      text:   `hsl(${hue}, 63%, 32%)`,
      border: `hsl(${hue}, 65%, 82%)`,
      chart:  `hsl(${hue}, 66%, 47%)`,
      chartBorder: `#ffffff`,
      label: key
    };
  },

  /**
   * Retorna HTML de um badge estilizado para a categoria.
   */
  categoriaBadge(categoria) {
    const style = this.getCategoriaStyle(categoria);
    const safeLabel = this.escapeHtml(style.label);
    return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border"
      style="background-color:${style.bg};color:${style.text};border-color:${style.border}">
      ${safeLabel}
    </span>`;
  },

  /**
   * Badge de status genérico (cores por palavra-chave).
   */
  statusBadge(status) {
    const s = this.normalize(status || '');
    let cls;
    if (/atras|cancel|defeito|manut|inativo|esgot/.test(s)) {
      cls = 'bg-red-50 text-red-600 border-red-200';
    } else if (/devol|entregue|conclu|dispon|ativo|ok/.test(s)) {
      cls = 'bg-emerald-50 text-emerald-600 border-emerald-200';
    } else if (/pend|aguard|aberto|uso|emprest/.test(s)) {
      cls = 'bg-amber-50 text-amber-700 border-amber-200';
    } else {
      cls = 'bg-slate-100 text-slate-600 border-slate-300';
    }
    return `<span class="inline-flex px-2 py-0.5 rounded-full text-xs font-bold border ${cls}">${this.escapeHtml(status || '—')}</span>`;
  },

  /**
   * Retorna array de cores para gráficos (Chart.js) baseado nas categorias presentes.
   */
  getCategoriaChartColors(categorias) {
    return categorias.map(cat => this.getCategoriaStyle(cat).chart);
  },

  getCategoriaChartBorders(categorias) {
    return categorias.map(cat => this.getCategoriaStyle(cat).chartBorder);
  }
};
