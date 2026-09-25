/**
 * tests/run-cadastro.js — Cadastros na tela: Fornecedores e Estoque
 * ==================================================================
 * Executa `estoque.js` e `cadastros.js` num sandbox (o mesmo código enviado ao
 * navegador) com um `app` falso, e confere:
 *   1. Fornecedores: id único no cadastro novo (nada de "length + 1"), id
 *      devolvido pelo servidor é o que fica, e o "Limpar cadastro" exclui tudo
 *      um a um pelo contrato delete + re-sincroniza no fim.
 *   2. Estoque: cadastro (novo e edição) com Fornecedor + Valor Unitário,
 *      colunas na tabela, filtro por fornecedor e busca que alcança o fornecedor.
 *   3. Contrato com o backend: os campos novos vão no payload do POST.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;
function ok(name, cond, msg = '') {
  if (cond) { console.log(`✔ ${name}`); passed++; }
  else { console.error(`✖ ${name}${msg ? ': ' + msg : ''}`); failed++; }
}

function read(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }

/* ── DOM mínimo: elementos registrados por id, como o navegador devolve ── */
function criarCampo(valor = '') {
  return {
    value: valor,
    listeners: {},
    classList: { toggle() {}, add() {}, remove() {} },
    setAttribute() {},
    addEventListener(tipo, fn) { (this.listeners[tipo] = this.listeners[tipo] || []).push(fn); },
    dispara(tipo) { (this.listeners[tipo] || []).forEach(fn => fn({ target: this })); }
  };
}

function criarSandbox(dadosIniciais = {}) {
  const campos = new Map();
  const chamadas = { post: [], get: [], toast: [], refresh: [] };
  const modal = { aberto: null, confirmacoes: new Map() };

  const documentFake = {
    getElementById(id) { return campos.get(id) || null; },
    querySelectorAll() { return []; },
    createElement() { return { style: {}, classList: { add() {}, remove() {} }, setAttribute() {}, appendChild() {} }; },
    addEventListener() {},
    body: { appendChild() {}, removeChild() {} },
    readyState: 'complete'
  };

  const app = {
    data: JSON.parse(JSON.stringify(dadosIniciais)),
    isSheetsConfigured: () => true,
    openModal(title, html, onConfirm) {
      modal.aberto = { title, html };
      this._confirmacao = onConfirm;
    },
    closeModal() { modal.aberto = null; },
    showToast(msg, tipo) { chamadas.toast.push({ msg, tipo }); },
    async post(url, action, payload) {
      chamadas.post.push({ url, action, payload: JSON.parse(JSON.stringify(payload)) });
      const id = payload.id || ('servidor-' + chamadas.post.length);
      return { success: true, message: action === 'add' ? 'Adicionado' : 'Atualizado', id };
    },
    async get(url, action, params) {
      chamadas.get.push({ url, action, params });
      return { success: true, message: 'Removido', id: params.id };
    },
    async refreshAba(aba) { chamadas.refresh.push(aba); },
  };

  const sandbox = {
    console,
    app,
    CONFIG: {
      SHEETS: { estoque: '/api/estoque', fornecedores: '/api/fornecedores', pedidos: '/api/pedidos', usuarios: '/api/usuarios' },
      CSV_FALLBACK: {}
    },
    document: documentFake,
    window: { addEventListener() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    fetch: () => Promise.reject(new Error('offline no teste')),
    confirm: () => true,
    alert: () => {},
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
    AbortController, URLSearchParams, TextEncoder, Date, Math, JSON, Promise,
  };
  vm.createContext(sandbox);
  // utils.js também roda dentro do sandbox: é assim que readForm()/formHtml()
  // encontram o mesmo `document` falso que os módulos de tela usam.
  vm.runInContext(
    read('utils.js') + '\n' + read('estoque.js') + '\n' + read('cadastros.js') +
    '\n;this.utils = utils; this.estoqueModule = estoqueModule; this.fornecedoresModule = fornecedoresModule;',
    sandbox, { filename: 'tela-cadastro.js' });

  return {
    sandbox, app, chamadas, modal, campos,
    estoqueModule: sandbox.estoqueModule,
    fornecedoresModule: sandbox.fornecedoresModule,
    set(id, valor) { campos.set(id, criarCampo(valor)); },
  };
}

(async function main() {
  console.log('\n━━━ 1. Fornecedores: cadastro novo ━━━');

  const est = criarSandbox({
    fornecedores: [{ id: '9', nome: 'Fornecedor Antigo', status: 'Ativo' }],
    estoque: []
  });
  const forn = est.fornecedoresModule;

  const html = (() => {
    let out = '';
    const alvo = { innerHTML: '' };
    forn.render(alvo);
    out = alvo.innerHTML;
    return out;
  })();
  ok('tabela de fornecedores lista o cadastro existente', /Fornecedor Antigo/.test(html));
  ok('ação "Limpar cadastro" aparece quando há fornecedores', /limparTudo\(\)/.test(html));
  ok('contador da tela bate com o cadastro', /1 cadastrado\(s\)/.test(html));

  // Modal novo → campos e payload
  est.set('fld_nome', 'Eletrorocha Materiais Elétricos');
  est.set('fld_cnpj', '98.765.432/0001-21');
  est.set('fld_categoria', 'Elétrica');
  est.set('fld_contato', 'Ana Paula');
  est.set('fld_telefone', '(14) 3433-4455');
  est.set('fld_email', 'ana@eletrorocha.com.br');
  est.set('fld_endereco', 'Av. das Esmeraldas 850');
  est.set('fld_status', 'Ativo');

  const fields = forn._fields({});
  await forn.salvar(fields, null);

  const post = est.chamadas.post[0] || {};
  ok('POST add de fornecedor enviado para /api/fornecedores',
    post.action === 'add' && /fornecedores/.test(String(post.url)), JSON.stringify(post.url));
  ok('campos do formulário vão no payload',
    post.payload && post.payload.nome === 'Eletrorocha Materiais Elétricos' && post.payload.cnpj === '98.765.432/0001-21',
    JSON.stringify(post.payload && { nome: post.payload.nome, cnpj: post.payload.cnpj }));
  ok('id do fornecedor novo é único (não é "length + 1")',
    typeof post.payload.id === 'string' && post.payload.id.length > 8 && !/^\d+$/.test(post.payload.id),
    'id enviado: ' + post.payload.id);
  ok('aba é re-sincronizada depois de salvar', est.chamadas.refresh.includes('fornecedores'));
  ok('modal fecha ao salvar com sucesso', est.modal.aberto === null);

  // Dois cadastros seguidos não podem colidir entre si
  est.chamadas.post.length = 0;
  await forn.salvar(forn._fields({}), null);
  const segundoId = est.chamadas.post[0].payload.id;
  ok('cadastros consecutivos recebem ids diferentes',
    segundoId !== post.payload.id && !/^\d+$/.test(segundoId), 'id: ' + segundoId);

  ok('fornecedor permanece listado na tela após salvar',
    (est.app.data.fornecedores || []).some(f => f.nome === 'Eletrorocha Materiais Elétricos'));

  console.log('\n━━━ 2. Fornecedores: limpar o cadastro ━━━');
  const limpa = criarSandbox({
    fornecedores: [
      { id: '1', nome: 'Leroy Merlin', status: 'Ativo' },
      { id: '2', nome: 'Makita do Brasil', status: 'Ativo' },
      { id: '3', nome: 'Bosch Ferramentas', status: 'Ativo' },
    ],
    estoque: []
  });
  limpa.chamadas.get.length = 0;
  await limpa.fornecedoresModule.limparTudo();
  const idsExcluidos = limpa.chamadas.get.map(c => c.params && String(c.params.id));
  ok('limparTudo usa o contrato delete registro a registro',
    limpa.chamadas.get.length === 3 && limpa.chamadas.get.every(c => c.action === 'delete'),
    JSON.stringify(limpa.chamadas.get.map(c => c.action)));
  ok('todas as chaves do cadastro foram para a exclusão',
    ['1', '2', '3'].every(id => idsExcluidos.includes(id)), idsExcluidos.join(','));
  ok('lista local fica vazia e a aba é relida do servidor',
    (limpa.app.data.fornecedores || []).length === 0 && limpa.chamadas.refresh.includes('fornecedores'));
  ok('aviso confirma a limpeza', /removidos/.test((limpa.chamadas.toast[0] || {}).msg || ''),
    JSON.stringify(limpa.chamadas.toast));

  // Cadastro vazio: sem botão de limpeza e sem exclusões
  const vazio = criarSandbox({ fornecedores: [], estoque: [] });
  const alvoVazio = { innerHTML: '' };
  vazio.fornecedoresModule.render(alvoVazio);
  ok('sem fornecedores não há botão de limpeza nem lista antiga',
    !/limparTudo\(\)/.test(alvoVazio.innerHTML) && /Nenhum fornecedor/i.test(alvoVazio.innerHTML));
  vazio.chamadas.get.length = 0;
  await vazio.fornecedoresModule.limparTudo();
  ok('limparTudo em cadastro vazio não chama a API', vazio.chamadas.get.length === 0);

  // Recusa do servidor mantém o modal aberto (não perde o que foi digitado)
  const recusado = criarSandbox({ fornecedores: [], estoque: [] });
  recusado.app.post = async () => ({ success: false, error: 'Registro inválido' });
  recusado.fornecedoresModule.abrirModal();          // abre o modal de cadastro
  recusado.set('fld_nome', 'Sem Nome');
  await recusado.fornecedoresModule.salvar(recusado.fornecedoresModule._fields({}), null);
  ok('recusa do servidor mantém o modal aberto e avisa o motivo',
    recusado.modal.aberto !== null && /Registro inválido/.test((recusado.chamadas.toast[0] || {}).msg || ''),
    JSON.stringify(recusado.chamadas.toast));
  ok('recusa do servidor não infla a lista local', (recusado.app.data.fornecedores || []).length === 0);

  console.log('\n━━━ 3. Estoque: fornecedor e valor unitário no cadastro ━━━');
  const eq = criarSandbox({
    fornecedores: [{ id: '1', nome: 'Casa do Construtor' }, { id: '2', nome: 'Eletrorocha Materiais Elétricos' }],
    estoque: [
      { id: 'e1', nome: 'Cimento CP-II 50kg', categoria: 'Construção', quantidadeAtual: '10', quantidadeMinima: '4', unidade: 'sc', local: 'Depósito', fornecedor: 'Casa do Construtor', valorUnitario: '48,90' },
      { id: 'e2', nome: 'Sifão pia 70 cm', categoria: 'Hidráulica', quantidadeAtual: '0', quantidadeMinima: '10', unidade: 'un', local: '' }
    ]
  });
  const estoque = eq.estoqueModule;

  const alvoEstoque = { innerHTML: '' };
  estoque.render(alvoEstoque);
  ok('tabela do estoque traz as colunas Fornecedor e Valor Unit.',
    /Fornecedor/.test(alvoEstoque.innerHTML) && /Valor Unit/.test(alvoEstoque.innerHTML));
  ok('fornecedor do item aparece na linha', /Casa do Construtor/.test(alvoEstoque.innerHTML));
  ok('valor unitário sai formatado em R$ pt-BR', /R\$\s?48,90/.test(alvoEstoque.innerHTML),
    (alvoEstoque.innerHTML.match(/R\$\s?[\d.,]+/) || ['nada']).join('|'));
  ok('item sem valor unitário e sem fornecedor mostra "—" (nada é inventado)',
    (estoque.renderRows([eq.app.data.estoque[1]].map(i => ({ ...i, fornecedor: '', valorUnitario: '' }))))
      .replace(/\s+/g, ' ').includes('<td class="px-4 py-3 text-slate-600">—</td> <td class="px-4 py-3 text-right whitespace-nowrap text-slate-700">—</td>'));
  ok('linha com valor unitário traz o saldo do item como dica (qtd × valor)',
    /title="Saldo do item: 10 × R\$ 48,90 = R\$ 489,00"/.test(estoque.renderRows([eq.app.data.estoque[0]])));
  ok('cabeçalho e estado vazio têm as mesmas 9 colunas',
    (alvoEstoque.innerHTML.match(/<th /g) || []).length === 9 && /colspan="9"/.test(estoque.renderRows([])));
  ok('filtro por fornecedor é oferecido com os nomes cadastrados',
    /estoqueFiltroFornecedor/.test(alvoEstoque.innerHTML) && /Todos os fornecedores/.test(alvoEstoque.innerHTML));

  // modal de inclusão
  eq.set('inpNome', 'Tubo PVC 25mm');
  eq.set('inpCategoria', 'Hidráulica');
  eq.set('inpLocal', 'Almoxarifado');
  eq.set('inpQtd', '30');
  eq.set('inpMin', '5');
  eq.set('inpUnidade', 'm');
  eq.set('inpFornecedor', 'Casa do Construtor');
  eq.set('inpValorUnitario', '12,35');
  estoque.abrirModalAdicionar();
  ok('modal "Novo Item" tem os campos fornecedor e valor unitário',
    /id="inpFornecedor"/.test(eq.modal.aberto.html) && /id="inpValorUnitario"/.test(eq.modal.aberto.html));
  ok('campo de valor aceita vírgula (type=text + inputmode=decimal, não type=number)',
    /id="inpValorUnitario" type="text" inputmode="decimal"/.test(eq.modal.aberto.html));
  ok('campo fornecedor é alimentado pelos fornecedores cadastrados',
    /dlFornecedoresNovo/.test(eq.modal.aberto.html) && /Eletrorocha Materiais Elétricos/.test(eq.modal.aberto.html));

  await estoque.salvar();
  const payloadNovo = eq.chamadas.post[eq.chamadas.post.length - 1].payload;
  ok('novo item de estoque grava fornecedor e valor unitário',
    payloadNovo.fornecedor === 'Casa do Construtor' && payloadNovo.valorUnitario === '12.35',
    JSON.stringify({ fornecedor: payloadNovo.fornecedor, valorUnitario: payloadNovo.valorUnitario }));
  ok('id do item de estoque continua único', /^id_/.test(payloadNovo.id) || payloadNovo.id.length > 8, payloadNovo.id);

  // edição preserva/limpa os campos
  eq.chamadas.post.length = 0;
  estoque.editar('e1');
  ok('modal de edição traz fornecedor e valor unitário preenchidos',
    /id="editFornecedor"/.test(eq.modal.aberto.html) && /value="48,90"/.test(eq.modal.aberto.html),
    'modal sem os campos esperados');
  eq.set('editId', 'e1');
  eq.set('editNome', 'Cimento CP-II 50kg');
  eq.set('editCategoria', 'Construção');
  eq.set('editLocal', 'Depósito');
  eq.set('editQtd', '8');
  eq.set('editMin', '4');
  eq.set('editUnidade', 'sc');
  await estoque.atualizar();
  const payloadEdicao = eq.chamadas.post[0].payload;
  {
    // o banco guarda '12.50' (ponto) — a tela precisa apresentar '12,50'
    eq.app.data.estoque[0].valorUnitario = '12.50';
    eq.estoqueModule.editar('e1');
    const htmlEdicao = eq.modal.aberto.html;
    ok('valor unitário vindo do banco é mostrado em padrão pt-BR no formulário',
      /value="12,50"/.test(htmlEdicao), (htmlEdicao.match(/id="editValorUnitario"[^>]*/) || ['—'])[0]);
    eq.app.data.estoque[0].valorUnitario = '48,90';
    eq.estoqueModule.editar('e1');
  }

  ok('editar quantidade não apaga fornecedor nem valor unitário',
    payloadEdicao.fornecedor === 'Casa do Construtor' && payloadEdicao.valorUnitario === '48,90' && String(payloadEdicao.quantidadeAtual) === '8',
    JSON.stringify({ forn: payloadEdicao.fornecedor, valor: payloadEdicao.valorUnitario, qtd: payloadEdicao.quantidadeAtual }));

  // zerando o valor unitário no formulário, o item fica sem valor (não herda o antigo)
  eq.chamadas.post.length = 0;
  eq.set('editValorUnitario', '');
  eq.set('editFornecedor', '');
  await estoque.atualizar();
  ok('limpar os campos no formulário limpa o valor gravado',
    eq.chamadas.post[0].payload.valorUnitario === '' && eq.chamadas.post[0].payload.fornecedor === '',
    JSON.stringify(eq.chamadas.post[0].payload));

  // busca e filtro
  const filtravel = criarSandbox({
    fornecedores: [{ id: '1', nome: 'Soldatudo Equipamentos' }],
    estoque: [
      { id: 'a', nome: 'Tijolo baiano', categoria: 'Construção', quantidadeAtual: '100', quantidadeMinima: '0', fornecedor: 'Soldatudo Equipamentos' },
      { id: 'b', nome: 'Cimento', categoria: 'Construção', quantidadeAtual: '100', quantidadeMinima: '0', fornecedor: 'Casa do Construtor' }
    ]
  });
  const alvoF = { innerHTML: '' };
  filtravel.estoqueModule.render(alvoF);
  filtravel.set('estoqueSearch', 'soldatudo');
  filtravel.set('estoqueFiltroCategoria', '');
  filtravel.set('estoqueFiltroStatus', '');
  filtravel.set('estoqueFiltroFornecedor', '');
  filtravel.campos.set('estoqueTableBody', Object.assign(criarCampo(), { innerHTML: '' }));
  filtravel.campos.set('estoqueEmpty', Object.assign(criarCampo(), { innerHTML: '' }));
  filtravel.estoqueModule.filtrar();
  const corpo = filtravel.campos.get('estoqueTableBody').innerHTML;
  ok('buscar por fornecedor encontra o item dele', /Tijolo baiano/.test(corpo) && !/Cimento/.test(corpo), corpo.slice(0, 120));

  filtravel.campos.get('estoqueSearch').value = '';
  filtravel.campos.get('estoqueFiltroFornecedor').value = 'Casa do Construtor';
  filtravel.estoqueModule.filtrar();
  const corpoFiltrado = filtravel.campos.get('estoqueTableBody').innerHTML;
  ok('filtro por fornecedor mostra só os itens daquele fornecedor',
    /Cimento/.test(corpoFiltrado) && !/Tijolo baiano/.test(corpoFiltrado));

  console.log('\n━━━ 4. Contrato com o backend (schema ↔ telas) ━━━');
  const { colunasDa } = require('../api/_lib/schema');
  const cols = colunasDa('estoque');
  const payloadChaves = Object.keys(payloadNovo);
  ok('todo campo enviado pelo cadastro do estoque existe no schema do banco',
    payloadChaves.every(k => k === 'item' || cols.includes(k)), 'fora do schema: ' + payloadChaves.filter(k => k !== 'item' && !cols.includes(k)).join(','));
  ok('Apps Script espelha as colunas novas do estoque',
    read('apps-script/Code.gs').includes("['id','nome','categoria','quantidadeAtual','quantidadeMinima','unidade','local','data','createdAt','updatedAt','fornecedor','valorUnitario']"));
  const csvEstoque = read('data/estoque.csv').split('\n')[0].split(',');
  ok('data/estoque.csv tem as colunas na mesma ordem do schema',
    csvEstoque.join(',') === cols.join(','), csvEstoque.join(','));
  const csvForn = read('data/fornecedores.csv').trim().split('\n');
  ok('data/fornecedores.csv ficou só com o cabeçalho (cadastro limpo)', csvForn.length === 1, 'linhas: ' + csvForn.length);

  console.log(`\n${'█'.repeat(46)}`);
  console.log(`  CADASTROS: ${passed} passaram, ${failed} falharam (${passed + failed} total)`);
  console.log('█'.repeat(46));
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('✖ ERRO FATAL:', e); process.exit(1); });
