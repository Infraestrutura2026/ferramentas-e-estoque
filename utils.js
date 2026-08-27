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
    const inputCls = 'w-full border border-[#333333] rounded-lg px-3 py-2 text-sm bg-[#1a1a1a] text-gray-100 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition';
    return `<div class="space-y-4">` + fields.map(f => {
      const req = f.required ? ' <span class="text-red-400">*</span>' : '';
      const label = `<label class="block text-xs font-semibold text-gray-400 uppercase mb-1">${this.escapeHtml(f.label)}${req}</label>`;
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
    const btn = 'px-2.5 py-1 rounded-lg text-xs font-semibold border border-[#333333] hover:bg-[#2a2a2a] transition disabled:opacity-40 disabled:cursor-not-allowed';
    return `
      <div class="flex items-center justify-between px-4 py-3 border-t border-[#2a2a2a] bg-[#0a0a0a]/50 text-xs text-gray-500">
        <span>${total} registro(s)</span>
        <div class="flex items-center gap-2">
          <button class="${btn}" ${page <= 1 ? 'disabled' : ''} onclick="${moduleName}.setPage(${page - 1})"><i class="fas fa-chevron-left"></i></button>
          <span class="text-gray-400 font-semibold">Página ${page} de ${pages}</span>
          <button class="${btn}" ${page >= pages ? 'disabled' : ''} onclick="${moduleName}.setPage(${page + 1})"><i class="fas fa-chevron-right"></i></button>
        </div>
      </div>`;
  },

  /**
   * Retorna estilo (cor de fundo e texto) para uma categoria.
   * Cores baseadas nas cores do Google Sheets, com paleta profissional institucional.
   */
  getCategoriaStyle(categoria) {
    const map = {
      'Hidráulica':         { bg: '#dcfce7', text: '#166534', border: '#86efac', label: 'Hidráulica' },
      'Elétrica':           { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd', label: 'Elétrica' },
      'Construção':         { bg: '#ffedd5', text: '#9a3412', border: '#fdba74', label: 'Construção' },
      'Automotivo':         { bg: '#f3e8ff', text: '#6b21a8', border: '#d8b4fe', label: 'Automotivo' },
      'Marcenaria':         { bg: '#fef3c7', text: '#92400e', border: '#fcd34d', label: 'Marcenaria' },
      'Serralheria':        { bg: '#e0f2fe', text: '#075985', border: '#7dd3fc', label: 'Serralheria' },
      'Jardinagem':         { bg: '#ecfccb', text: '#3f6212', border: '#bef264', label: 'Jardinagem' },
      'Pintura':            { bg: '#fce7f3', text: '#9d174d', border: '#f9a8d4', label: 'Pintura' },
      'Limpeza':            { bg: '#ccfbf1', text: '#0f766e', border: '#5eead4', label: 'Limpeza' },
      'Escritório':         { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1', label: 'Escritório' },
      'Informática':        { bg: '#e0e7ff', text: '#3730a3', border: '#a5b5fc', label: 'Informática' },
      'Segurança':          { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5', label: 'Segurança' },
      'Ferramenta Manual':  { bg: '#fef9c3', text: '#854d0e', border: '#fde047', label: 'Ferramenta Manual' },
      'Ferramenta Elétrica':{ bg: '#cffafe', text: '#155e75', border: '#67e8f9', label: 'Ferramenta Elétrica' },
      'Alvenaria':          { bg: '#fed7aa', text: '#7c2d12', border: '#fb923c', label: 'Alvenaria' },
      'Refrigeração':       { bg: '#e0f2fe', text: '#0c4a6e', border: '#38bdf8', label: 'Refrigeração' },
      'Mecânica':           { bg: '#f3f4f6', text: '#374151', border: '#9ca3af', label: 'Mecânica' },
      'Geral':              { bg: '#f3f4f6', text: '#4b5563', border: '#d1d5db', label: 'Geral' },
      'Entrada':            { bg: '#f3f4f6', text: '#6b7280', border: '#d1d5db', label: 'Entrada' }
    };

    const key = String(categoria || '').trim();
    if (map[key]) return map[key];

    // Fallback: gera cor determinística baseada no nome da categoria
    const hash = Array.from(key).reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const hues = [20, 45, 70, 150, 190, 210, 260, 280, 320, 340];
    const hue = hues[hash % hues.length];
    return {
      bg: `hsl(${hue}, 85%, 93%)`,
      text: `hsl(${hue}, 80%, 28%)`,
      border: `hsl(${hue}, 70%, 75%)`,
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
      cls = 'bg-red-900/30 text-red-400 border-red-800/50';
    } else if (/devol|entregue|conclu|dispon|ativo|ok/.test(s)) {
      cls = 'bg-green-900/30 text-green-400 border-green-800/50';
    } else if (/pend|aguard|aberto|uso|emprest/.test(s)) {
      cls = 'bg-amber-900/30 text-amber-400 border-amber-800/50';
    } else {
      cls = 'bg-[#1a1a1a] text-gray-400 border-[#333333]';
    }
    return `<span class="inline-flex px-2 py-0.5 rounded-full text-xs font-bold border ${cls}">${this.escapeHtml(status || '—')}</span>`;
  },

  /**
   * Retorna array de cores para gráficos (Chart.js) baseado nas categorias presentes.
   */
  getCategoriaChartColors(categorias) {
    return categorias.map(cat => this.getCategoriaStyle(cat).bg);
  },

  getCategoriaChartBorders(categorias) {
    return categorias.map(cat => this.getCategoriaStyle(cat).border);
  }
};
