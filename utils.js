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
    return `<div class="crud-form">` + fields.map(f => {
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
    const btn = 'pagination-btn px-2.5 py-1 rounded-lg text-xs font-semibold border border-slate-300 transition disabled:opacity-40 disabled:cursor-not-allowed';
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
  },

  /* ══════════════════════════════════════════════════════════════
     RELATÓRIOS & EXPORTAÇÃO (v2.6.1)
     Funções puras (sem DOM) — testadas em tests/run-exports.js
     ══════════════════════════════════════════════════════════════ */

  /** As 8 abas do sistema, na ordem oficial dos relatórios. */
  ABAS_EXPORTAVEIS: ['estoque', 'ferramentas', 'emprestimos', 'movimentacoes', 'historico', 'fornecedores', 'pedidos', 'usuarios'],

  /** Escapa um valor para célula CSV (RFC 4180), considerando o separador em uso. */
  escapeCsvValue(v, sep = ',') {
    const s = String(v ?? '');
    const precisa = s.includes('"') || s.includes('\n') || s.includes('\r') || s.includes(sep);
    return precisa ? `"${s.replace(/"/g, '""')}"` : s;
  },

  /**
   * Gera o conteúdo CSV (sem BOM) a partir de cabeçalhos e linhas.
   * O BOM UTF-8 (\uFEFF) é acrescentado apenas no download (app._downloadCSV).
   * opts.sep: separador de campos — ',' (RFC 4180) ou ';' (padrão Excel pt-BR).
   */
  buildCSV(headers, rows, opts = {}) {
    const sep = opts.sep === ';' ? ';' : ',';
    const h = (headers || []).map(x => this.escapeCsvValue(x, sep));
    const linhas = (rows || []).map(row => row.map(v => this.escapeCsvValue(v, sep)));
    return [h, ...linhas].map(l => l.join(sep)).join('\n');
  },

  /**
   * Métricas do relatório consolidado: total de itens, esgotados (qtd 0)
   * e críticos (qtd > 0 e <= mínimo).
   */
  metricasRelatorio(estoque) {
    const items = estoque || [];
    const total = items.length;
    const esgotados = items.filter(i => (parseFloat(i.quantidadeAtual) || 0) === 0).length;
    const criticos = items.filter(i => {
      const q = parseFloat(i.quantidadeAtual) || 0;
      const m = parseFloat(i.quantidadeMinima) || 0;
      return q > 0 && q <= m;
    }).length;
    return { total, esgotados, criticos };
  },

  /**
   * Relatório consolidado por categoria:
   * retorna [{ categoria, itens, qtdTotal, esgotados }] ordenado por nº de itens (desc).
   */
  categoriaResumo(estoque) {
    const map = {};
    (estoque || []).forEach(i => {
      const cat = i.categoria || 'Sem categoria';
      if (!map[cat]) map[cat] = { categoria: cat, itens: 0, qtdTotal: 0, esgotados: 0 };
      map[cat].itens++;
      map[cat].qtdTotal += parseFloat(i.quantidadeAtual) || 0;
      if ((parseFloat(i.quantidadeAtual) || 0) === 0) map[cat].esgotados++;
    });
    return Object.values(map).sort((a, b) => b.itens - a.itens || a.categoria.localeCompare(b.categoria, 'pt-BR'));
  },

  /* ──────────────────────────────────────────────────────────────
     RELATÓRIOS GERENCIAIS (v3.0.0)
     Cada função entrega o mesmo documento padronizado usado na prévia,
     no CSV, no Excel e na impressão. Assim, a informação consultada e a
     informação exportada nunca divergem.
     ────────────────────────────────────────────────────────────── */

  /** Converte uma quantidade do cadastro para número, sem propagar NaN. */
  quantidadeNumerica(valor) {
    const numero = parseFloat(String(valor ?? '').replace(',', '.'));
    return isFinite(numero) ? numero : 0;
  },

  /** Empréstimo finalizado/devolvido, independentemente da grafia do status. */
  emprestimoDevolvido(emprestimo) {
    return /devol/.test(this.normalize(emprestimo && emprestimo.status));
  },

  /** Diferença em dias de calendário entre uma data prevista e hoje. */
  diasAtraso(dataPrevista, hoje = this.today()) {
    const data = String(dataPrevista || '').slice(0, 10);
    const referencia = String(hoje || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !/^\d{4}-\d{2}-\d{2}$/.test(referencia)) return 0;
    const [ano, mes, dia] = data.split('-').map(Number);
    const [anoHoje, mesHoje, diaHoje] = referencia.split('-').map(Number);
    const prazoUTC = Date.UTC(ano, mes - 1, dia);
    const hojeUTC = Date.UTC(anoHoje, mesHoje - 1, diaHoje);
    return Math.max(0, Math.floor((hojeUTC - prazoUTC) / 86400000));
  },

  /** Estado operacional de um item para consulta rápida de estoque. */
  statusEstoque(item) {
    const quantidade = this.quantidadeNumerica(item && item.quantidadeAtual);
    const minimo = this.quantidadeNumerica(item && item.quantidadeMinima);
    if (quantidade <= 0) return 'Esgotado';
    if (minimo > 0 && quantidade <= minimo) return 'Crítico';
    return 'Regular';
  },

  /** Relatório operacional: situação atual de cada item de estoque. */
  relatorioEstoqueAtual(estoque, usuario) {
    const dados = (Array.isArray(estoque) ? estoque : []).map(item => ({
      codigo: item.codigo || '',
      nome: item.nome || item.item || '',
      categoria: item.categoria || 'Sem categoria',
      quantidadeAtual: this.quantidadeNumerica(item.quantidadeAtual),
      quantidadeMinima: this.quantidadeNumerica(item.quantidadeMinima),
      unidade: item.unidade || '',
      local: item.local || '',
      status: this.statusEstoque(item)
    }));
    return this.buildReportDoc({
      aba: 'estoque_atual',
      titulo: 'Relatório Gerencial — Estoque Atual',
      usuario,
      dados,
      colunas: ['codigo', 'nome', 'categoria', 'quantidadeAtual', 'quantidadeMinima', 'unidade', 'local', 'status']
    });
  },

  /** Relatório operacional: retiradas que ainda aguardam devolução. */
  relatorioEmprestimosAtivos(emprestimos, usuario) {
    const hoje = this.today();
    const dados = (Array.isArray(emprestimos) ? emprestimos : [])
      .filter(emprestimo => !this.emprestimoDevolvido(emprestimo))
      .map(emprestimo => {
        const atraso = this.diasAtraso(emprestimo.previsaoDevolucao, hoje);
        return {
          ferramenta: emprestimo.nomeFerramenta || emprestimo.ferramenta || emprestimo.item || emprestimo.nome || '',
          responsavel: emprestimo.responsavel || emprestimo.solicitante || '',
          setor: emprestimo.setor || emprestimo.local || '',
          quantidade: this.quantidadeNumerica(emprestimo.quantidade || 1),
          dataEmprestimo: emprestimo.dataEmprestimo || emprestimo.data || '',
          previsaoDevolucao: emprestimo.previsaoDevolucao || '',
          status: atraso ? `Atrasado (${atraso} dia${atraso === 1 ? '' : 's'})` : 'Em uso'
        };
      })
      .sort((a, b) => String(a.previsaoDevolucao).localeCompare(String(b.previsaoDevolucao)));
    return this.buildReportDoc({
      aba: 'emprestimos_ativos',
      titulo: 'Relatório Gerencial — Empréstimos Ativos',
      usuario,
      dados,
      colunas: ['ferramenta', 'responsavel', 'setor', 'quantidade', 'dataEmprestimo', 'previsaoDevolucao', 'status']
    });
  },

  /** Relatório de alerta: somente empréstimos vencidos, com dias de atraso. */
  relatorioAtrasados(emprestimos, usuario) {
    const hoje = this.today();
    const dados = (Array.isArray(emprestimos) ? emprestimos : [])
      .filter(emprestimo => !this.emprestimoDevolvido(emprestimo))
      .map(emprestimo => ({ emprestimo, diasAtraso: this.diasAtraso(emprestimo.previsaoDevolucao, hoje) }))
      .filter(item => item.diasAtraso > 0)
      .map(({ emprestimo, diasAtraso }) => ({
        ferramenta: emprestimo.nomeFerramenta || emprestimo.ferramenta || emprestimo.item || emprestimo.nome || '',
        responsavel: emprestimo.responsavel || emprestimo.solicitante || '',
        setor: emprestimo.setor || emprestimo.local || '',
        quantidade: this.quantidadeNumerica(emprestimo.quantidade || 1),
        dataEmprestimo: emprestimo.dataEmprestimo || emprestimo.data || '',
        previsaoDevolucao: emprestimo.previsaoDevolucao || '',
        diasAtraso,
        status: 'Atrasado'
      }))
      .sort((a, b) => b.diasAtraso - a.diasAtraso || String(a.previsaoDevolucao).localeCompare(String(b.previsaoDevolucao)));
    return this.buildReportDoc({
      aba: 'emprestimos_atrasados',
      titulo: 'Relatório Gerencial — Empréstimos em Atraso',
      usuario,
      dados,
      colunas: ['ferramenta', 'responsavel', 'setor', 'quantidade', 'dataEmprestimo', 'previsaoDevolucao', 'diasAtraso', 'status']
    });
  },

  /** Indicadores consolidados para o painel de gestão e para tomada de decisão. */
  indicadoresResumo(estoque, emprestimos) {
    const itens = Array.isArray(estoque) ? estoque : [];
    const retiradas = Array.isArray(emprestimos) ? emprestimos : [];
    const metricas = this.metricasRelatorio(itens);
    const emprestimosAtivos = retiradas.filter(emprestimo => !this.emprestimoDevolvido(emprestimo));
    const emprestimosAtrasados = emprestimosAtivos.filter(emprestimo =>
      this.diasAtraso(emprestimo.previsaoDevolucao) > 0
    );
    const itensRegulares = Math.max(0, metricas.total - metricas.esgotados - metricas.criticos);
    return {
      totalItens: metricas.total,
      unidadesEmEstoque: itens.reduce((total, item) => total + this.quantidadeNumerica(item.quantidadeAtual), 0),
      itensRegulares,
      itensCriticos: metricas.criticos,
      itensEsgotados: metricas.esgotados,
      emprestimosAtivos: emprestimosAtivos.length,
      emprestimosAtrasados: emprestimosAtrasados.length,
      percentualAtencao: metricas.total ? Math.round(((metricas.esgotados + metricas.criticos) / metricas.total) * 100) : 0
    };
  },

  /**
   * Histórico de movimentações com filtro por tipo.
   * `opcao`: todos, entradas ou saidas (também aceita entrada/saida).
   */
  historicoMovimentacao(movimentacoes, opcao = 'todos', usuario) {
    const filtro = this.normalize(opcao).replace(/\s+/g, '');
    const dados = (Array.isArray(movimentacoes) ? movimentacoes : [])
      .filter(movimento => {
        if (!filtro || filtro === 'todos') return true;
        const tipo = this.normalize(movimento.tipo || movimento.operacao || movimento.acao || '');
        if (filtro === 'entrada' || filtro === 'entradas') return /entrada|compra|receb/.test(tipo);
        if (filtro === 'saida' || filtro === 'saidas') return /saida|retirada|baixa|consumo/.test(tipo);
        return tipo.includes(filtro);
      })
      .map(movimento => ({
        data: movimento.data || movimento.dataHora || movimento.createdAt || '',
        tipo: movimento.tipo || movimento.operacao || movimento.acao || '',
        item: movimento.itemNome || movimento.item || movimento.nome || '',
        quantidade: this.quantidadeNumerica(movimento.quantidade),
        local: movimento.local || movimento.setor || '',
        usuario: movimento.usuario || movimento.responsavel || '',
        observacao: movimento.observacao || movimento.detalhes || ''
      }))
      .sort((a, b) => String(b.data).localeCompare(String(a.data)));
    const rotulos = { entrada: 'Entradas', entradas: 'Entradas', saida: 'Saídas', saidas: 'Saídas' };
    const complemento = rotulos[filtro] ? ` — ${rotulos[filtro]}` : '';
    return this.buildReportDoc({
      aba: 'historico_movimentacoes',
      titulo: `Relatório Gerencial — Histórico de Movimentações${complemento}`,
      usuario,
      dados,
      colunas: ['data', 'tipo', 'item', 'quantidade', 'local', 'usuario', 'observacao']
    });
  },

  /* ══════════════════════════════════════════════════════════════
     RELATÓRIO PADRONIZADO + EXPORTAÇÃO pt-BR (v2.7.1 · v2.7.2: coluna ID oculta)
     Um único "documento" de relatório alimenta a prévia em tela,
     o CSV (;) e o Excel (.xlsx) — o que você vê é o que você baixa.
     Funções puras (sem DOM) — testadas em tests/run-exports.js.
     ══════════════════════════════════════════════════════════════ */

  /** Nomes amigáveis pt-BR das abas (relatórios e arquivos). */
  ROTULOS_ABAS: {
    estoque: 'Estoque', ferramentas: 'Ferramentas', emprestimos: 'Empréstimos de Ferramentas',
    movimentacoes: 'Movimentações de Estoque', historico: 'Histórico', fornecedores: 'Fornecedores',
    pedidos: 'Pedidos de Compra', usuarios: 'Usuários'
  },

  rotuloAba(aba) {
    return this.ROTULOS_ABAS[aba] || String(aba || '').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
  },

  /** Rótulos pt-BR oficiais para colunas conhecidas (relatório padronizado). */
  ROTULOS_COLUNAS: {
    id: 'ID', nome: 'Nome', codigo: 'Código', categoria: 'Categoria', descricao: 'Descrição',
    quantidadeAtual: 'Qtd. Atual', quantidadeMinima: 'Qtd. Mínima', quantidade: 'Quantidade',
    unidade: 'Unid.', local: 'Local', setor: 'Setor', data: 'Data', estado: 'Estado', status: 'Status',
    diasAtraso: 'Dias de Atraso',
    tipo: 'Tipo', item: 'Item', usuario: 'Usuário', observacao: 'Observação',
    responsavel: 'Responsável', motivo: 'Motivo', ferramentaId: 'ID Ferramenta',
    nomeFerramenta: 'Ferramenta', dataEmprestimo: 'Data Empréstimo',
    previsaoDevolucao: 'Prev. Devolução', dataDevolucao: 'Devolução',
    solicitante: 'Solicitante', localUso: 'Local de Uso', cnpj: 'CNPJ', telefone: 'Telefone', email: 'E-mail',
    contato: 'Contato', endereco: 'Endereço', valorUnitario: 'Valor Unit. (R$)',
    valorTotal: 'Valor Total (R$)', previsaoEntrega: 'Prev. Entrega',
    dataEntrega: 'Data Entrega',
    acao: 'Ação', detalhes: 'Detalhes', senha: 'Senha (hash)', nivel: 'Nível',
    createdAt: 'Criado em', updatedAt: 'Atualizado em'
  },

  /** Colunas que são texto por natureza, mesmo quando só têm dígitos (sem ponto de milhar jamais!). */
  COLUNAS_TEXTO: ['id', 'codigo', 'cnpj', 'cpf', 'cep', 'telefone', 'usuario', 'senha', 'senhaHash', 'contato', 'ferramentaId', 'unidade'],

  /** Rótulo amigável da coluna (mapa oficial; senão, "camelCase" → "Camel case"). */
  rotuloColuna(key) {
    const k = String(key || '');
    if (this.ROTULOS_COLUNAS[k]) return this.ROTULOS_COLUNAS[k];
    return k.replace(/_/g, ' ').replace(/([a-zà-ú])([A-ZÀ-Ú])/g, '$1 $2').replace(/^./, c => c.toUpperCase());
  },

  /**
   * Colunas ocultas dos relatórios (v2.7.2): identificador técnico interno —
   * não agrega informação ao documento e vaza o ID dos registros. Vale para a
   * prévia em tela, CSV, Excel e impressão (o documento é único).
   */
  COLUNAS_OCULTAS_RELATORIO: ['id'],

  /** Detecta data ISO (`2026-07-24` ou `2026-07-24T10:30[:00][.000][Z]`). */
  isDataISO(v) {
    return /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(String(v || '').trim());
  },

  /** `Date` → 'dd/mm/aaaa hh:mm' (sem depender de ICU/locale do ambiente). */
  dataHoraBR(d) {
    if (!(d instanceof Date) || isNaN(d)) return '';
    const p = n => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  },

  /** Valor de data (ISO ou Date) → pt-BR: 'dd/mm/aaaa' ou 'dd/mm/aaaa hh:mm'. */
  formatDataBR(v) {
    if (v instanceof Date) return this.dataHoraBR(v);
    const s = String(v || '').trim();
    if (!this.isDataISO(s)) return s;
    const d = new Date(s.includes('T') || s.includes(' ') ? s : s + 'T00:00:00');
    if (isNaN(d)) return s;
    const temHora = /[T ]\d{2}:\d{2}/.test(s) && !/[T ]00:00(:00(\.0{1,3})?)?$/.test(s);
    return this.dataHoraBR(d).slice(0, temHora ? 16 : 10);
  },

  /** Número cru (string ou number) com valor aritmético real? */
  ehNumeroRelatorio(v, coluna) {
    if (this.COLUNAS_TEXTO.includes(String(coluna || ''))) return false;
    if (typeof v === 'number') return isFinite(v);
    const s = String(v ?? '').trim();
    return /^-?\d+(\.\d{1,6})?$/.test(s);
  },

  /** 1234.5 → '1.234,50' (moeda, 2 casas) ou '1.234,5' (geral). Sem ICU — determinístico. */
  numeroBR(vx, forcarDecimais = null) {
    const n = typeof vx === 'number' ? vx : parseFloat(String(vx).trim());
    if (!isFinite(n)) return String(vx ?? '');
    const neg = n < 0 ? '-' : '';
    const partes = Math.abs(n).toFixed(2).split('.');
    let frac = forcarDecimais === 2 ? partes[1] : partes[1].replace(/0+$/, '');
    const inteiro = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return neg + inteiro + (frac ? ',' + frac : '');
  },

  /** Célula formatada para o padrão pt-BR: data BR, número BR, booleano Sim/Não. */
  formatCellBR(v, coluna) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
    if (this.isDataISO(v)) return this.formatDataBR(v);
    if (this.ehNumeroRelatorio(v, coluna)) {
      const moeda = /^valor/i.test(String(coluna || ''));
      return this.numeroBR(v, moeda ? 2 : null);
    }
    return String(v);
  },

  /**
   * Documento de relatório padronizado — único para prévia em tela, CSV e Excel.
   * @returns {{colunas:[{key,rotulo,numerica}], linhasBR:string[][], linhasXLSX:Array[], ...}}
   */
  buildReportDoc({ aba, titulo, usuario, dados, colunas }) {
    const cfg = (typeof CONFIG !== 'undefined') ? CONFIG : {};
    const linhas = Array.isArray(dados) ? dados : [];
    // v2.7.2: a coluna ID (identificador técnico) fica oculta em todos os relatórios
    const chaves = (colunas || (linhas.length ? Object.keys(linhas[0]) : []))
      .filter(key => !this.COLUNAS_OCULTAS_RELATORIO.includes(key));
    const cols = chaves.map(key => {
      const numerica = linhas.some(r => r[key] !== '' && r[key] !== null && r[key] !== undefined)
        && linhas.every(r => r[key] === '' || r[key] === null || r[key] === undefined || this.ehNumeroRelatorio(r[key], key));
      return { key, rotulo: this.rotuloColuna(key), numerica };
    });
    return {
      orgao: cfg.ORGAO || 'COMPLEXO PENAL DE MARÍLIA — POLÍCIA PENAL',
      sistema: 'Ferramentas & Estoque',
      equipe: cfg.EQUIPE || 'ZANONI & MARTINEZ InfraTech',
      versao: cfg.VERSAO || '',
      aba: aba || 'geral',
      titulo: titulo || this.rotuloAba(aba),
      geradoEmISO: new Date().toISOString(),
      geradoEmBR: this.dataHoraBR(new Date()),
      geradoPor: usuario || 'sistema',
      totalRegistros: linhas.length,
      colunas: cols,
      /** Valores para tela/CSV: strings pt-BR (datas dd/mm/aaaa, números com vírgula). */
      linhasBR: linhas.map(r => cols.map(c => this.formatCellBR(r[c.key], c.key))),
      /** Valores para Excel: números como Number (alinham/calculam), datas como texto pt-BR. */
      linhasXLSX: linhas.map(r => cols.map(c => {
        const v = r[c.key];
        if (this.ehNumeroRelatorio(v, c.key)) return typeof v === 'number' ? v : parseFloat(String(v));
        return this.formatCellBR(v, c.key);
      }))
    };
  },

  /** Relatório consolidado de estoque como documento padronizado. */
  docConsolidadoEstoque(estoque, usuario) {
    const resumo = this.categoriaResumo(estoque);
    return this.buildReportDoc({
      aba: 'consolidado',
      titulo: 'Relatório de Estoque — Consolidado por Categoria',
      usuario,
      dados: resumo.map(r => ({ categoria: r.categoria, itens: r.itens, qtd: r.qtdTotal, esgotados: r.esgotados })),
      colunas: ['categoria', 'itens', 'qtd', 'esgotados']
    });
  },

  /** CSV padronizado pt-BR: separador ';' (Excel abre corretamente no Brasil). */
  buildCSVBR(headers, rows) {
    return this.buildCSV(headers, rows, { sep: ';' });
  }
};

/* Exportação para testes em Node (ignorada no navegador). */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = utils;
}
