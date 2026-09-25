/**
 * tests/run-neon.js — Testes da integração Vercel + Neon (v2.6.0)
 * ==================================================================
 * Cobertura:
 *   1. SQL gerado pelo NeonStore (executor falso → valida SQL exato + params)
 *   2. Segurança (injeção por nome de coluna/aba; valores sempre parametrizados)
 *   3. Contrato HTTP via handler (MemoryStore) — igual ao Apps Script
 *   4. Integração real via dev/server.js (HTTP de verdade)
 *   5. Frontend (config.js com detecção de backend)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const { NeonStore, MemoryStore } = require('../api/_lib/store');
const { criarHandler, criarHealthHandler } = require('../api/_lib/handler');
const { parseCSV } = require('../api/_lib/csv');
const seedData = require('../api/_lib/seed-data');

// O seed é gerado de data/*.csv (scripts/gen-seed.js). Os testes comparam os dois
// em vez de fixar um número, para não quebrar a cada importação de itens — e para
// pegar o caso de alguém editar o CSV e esquecer de regenerar o seed.
const ESTOQUE_CSV = parseCSV(fs.readFileSync(path.join(ROOT, 'data', 'estoque.csv'), 'utf8'));
const ESTOQUE_ESPERADO = ESTOQUE_CSV.length;

let passed = 0;
let failed = 0;
function ok(name, cond, msg = '') {
  if (cond) { console.log(`✔ ${name}`); passed++; }
  else { console.error(`✖ ${name}${msg ? ': ' + msg : ''}`); failed++; }
}

/* ── Executor falso: registra (sql, params) e responde tabelas em memória ── */
function criarExecutorFalso() {
  const log = [];
  const tabelas = {}; // nome → { colunas, pk, rows: Map<seq, obj> }
  let seq = 0;

  function garantirTabela(nome) {
    if (!tabelas[nome]) {
      if (nome === '_setup') {
        // tabela interna de marcadores: chave/valor (sem schema de aba)
        tabelas._setup = { colunas: ['key', 'value'], pk: 'key', rows: new Map() };
        return tabelas._setup;
      }
      const { colunasDa, pkDa } = require('../api/_lib/schema');
      tabelas[nome] = { colunas: colunasDa(nome), pk: pkDa(nome), rows: new Map() };
    }
    return tabelas[nome];
  }

  const exec = async (sql, params) => {
    log.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
    const s = sql.trim().toUpperCase();

    if (s.startsWith('CREATE TABLE IF NOT EXISTS')) {
      const m = sql.match(/CREATE TABLE IF NOT EXISTS "([a-z_]+)"/i);
      if (m) garantirTabela(m[1]);
      return { rows: [] };
    }
    if (s.startsWith('ALTER TABLE')) return { rows: [] };
    if (s.startsWith('INSERT INTO "_SETUP"') || s.startsWith('INSERT INTO "_setup"')) {
      // INSERT ... ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value"
      const t = garantirTabela('_setup');
      const [chave, valor] = params.map(String);
      for (const obj of t.rows.values()) { if (obj.key === chave) { obj.value = valor; return { rows: [] }; } }
      t.rows.set(++seq, { key: chave, value: valor });
      return { rows: [] };
    }

    if (s.startsWith('SELECT COUNT(*)')) {
      const m = sql.match(/FROM "([a-z_]+)"/i);
      const t = garantirTabela(m[1]);
      return { rows: [[t.rows.size]] };
    }

    if (s.startsWith('SELECT')) {
      const m = sql.match(/FROM "([a-z_]+)"/i);
      const t = garantirTabela(m[1]);
      let linhas = [...t.rows.entries()].sort((a, b) => a[0] - b[0]).map(e => e[1]);
      const mWhere = sql.match(/WHERE "([a-z_]+)" = \$1/i);
      if (mWhere) {
        const col = mWhere[1], val = String(params[0]);
        linhas = linhas.filter(o => String(o[col]) === val);
      }
      return { rows: linhas.map(obj => t.colunas.map(c => obj[c] === undefined ? null : obj[c])) };
    }

    if (s.startsWith('DELETE')) {
      const mNome = sql.match(/DELETE FROM "([a-z_]+)"/i);
      const t = garantirTabela(mNome[1]);
      const chave = params[0];
      let n = 0;
      for (const [k, obj] of [...t.rows]) {
        if (String(obj[t.pk]) === String(chave)) { t.rows.delete(k); n++; }
      }
      return { rows: Array(n).fill([1]) };
    }

    if (s.startsWith('INSERT INTO')) {
      const mNome = sql.match(/^[\s]*INSERT INTO "([a-z_]+)"/i);
      const t = garantirTabela(mNome[1]);
      const onConflict = /ON CONFLICT/i.test(sql);
      const k = (t.colunas && t.colunas.length) || 1;
      const numLinhas = Math.max(1, Math.floor(params.length / k));
      let inseridos = 0;
      for (let r = 0; r < numLinhas; r++) {
        const obj = {};
        t.colunas.forEach((c, i) => {
          const val = params[r * k + i];
          obj[c] = val === undefined ? '' : String(val);
        });
        const jaExiste = [...t.rows.values()].some(row => String(row[t.pk]) === String(obj[t.pk]));
        if (onConflict && jaExiste) continue; // DO NOTHING
        t.rows.set(++seq, obj);
        inseridos++;
      }
      return /RETURNING/i.test(sql) ? { rows: Array(inseridos).fill([1]) } : { rows: [] };
    }

    if (s.startsWith('UPDATE')) {
      const mNome = sql.match(/UPDATE "([a-z_]+)"/i);
      const t = garantirTabela(mNome[1]);
      const obj = {};
      t.colunas.forEach((c, i) => { obj[c] = params[i] === undefined ? '' : String(params[i]); });
      const chave = params[t.colunas.length];
      for (const [k, r] of [...t.rows]) {
        if (String(r[t.pk]) === String(chave)) { t.rows.set(k, Object.assign({}, r, obj, { [t.pk]: r[t.pk] })); break; }
      }
      return { rows: [] };
    }

    if (sql.trim() === 'SELECT 1') return { rows: [[1]] };
    throw new Error('SQL não tratado pelo executor falso: ' + sql.slice(0, 80));
  };

  return { exec, log, tabelas };
}

(async function main() {
  console.log('\n━━━ 1. NeonStore — SQL gerado ━━━');

  // 1.1 ensureReady cria as 8 tabelas + _setup e popula seed nas vazias
  const fx = criarExecutorFalso();
  const store = new NeonStore(fx.exec);
  const resumo = await store.ensureReady();
  const creates = fx.log.filter(l => l.sql.startsWith('CREATE TABLE IF NOT EXISTS'));
  ok('ensureReady cria 9 tabelas (8 abas + _setup)', creates.length === 9, 'criou ' + creates.length);
  const createEstoque = creates.find(c => c.sql.includes('"estoque"'));
  ok('tabela estoque tem id como PRIMARY KEY', createEstoque && /"id" TEXT PRIMARY KEY/.test(createEstoque.sql));
  const createUsuarios = creates.find(c => c.sql.includes('"usuarios"'));
  ok('tabela usuarios tem usuario como PRIMARY KEY', createUsuarios && /"usuario" TEXT PRIMARY KEY/.test(createUsuarios.sql));
  ok('seed insere todo o estoque do CSV (via ON CONFLICT DO NOTHING)', resumo.estoque.inseridos === ESTOQUE_ESPERADO, JSON.stringify(resumo.estoque));
  ok('seed-data.js está em dia com data/estoque.csv', seedData.estoque.length === ESTOQUE_ESPERADO, `seed=${seedData.estoque.length} csv=${ESTOQUE_ESPERADO}`);
  ok('seed insere 3 usuários', resumo.usuarios.inseridos === 3);
  const insertsSeed = fx.log.filter(l => l.sql.startsWith('INSERT INTO "estoque"') && /ON CONFLICT \("id"\) DO NOTHING/.test(l.sql));
  ok('INSERT de seed usa ON CONFLICT (pk) DO NOTHING', insertsSeed.length >= 1);
  ok('INSERT de seed é parametrizado em lote', insertsSeed[0] && insertsSeed[0].params.length >= 10);

  // 1.2 ensureReady de novo não repete seed (cache por instância)
  const antes = fx.log.length;
  await store.ensureReady();
  ok('ensureReady é cacheado (sem queries repetidas)', fx.log.length === antes);

  // 1.3 add() gera id + createdAt e parametriza
  const fx2 = criarExecutorFalso();
  const store2 = new NeonStore(fx2.exec);
  await store2.ensureReady();
  fx2.log.length = 0;
  const rAdd = await store2.add('ferramentas', { nome: 'Chave inglesa 12"', categoria: 'manual' });
  const ins = fx2.log.find(l => l.sql.startsWith('INSERT INTO "ferramentas"'));
  ok('add() retorna id gerado', rAdd.ok && typeof rAdd.id === 'string' && rAdd.id.length > 10);
  const colsFerr = require('../api/_lib/schema').colunasDa('ferramentas');
  ok('add() parametriza TODAS as colunas (sem concatenação)', ins && ins.params.length === colsFerr.length,
    'esperado ' + colsFerr.length + ', veio ' + (ins ? ins.params.length : 'nada'));
  ok('add() define createdAt/updatedAt ISO', ins &&
    /^\d{4}-\d{2}-\d{2}T/.test(ins.params[colsFerr.indexOf('createdAt')]) &&
    /^\d{4}-\d{2}-\d{2}T/.test(ins.params[colsFerr.indexOf('updatedAt')]));
  ok('aspas no valor viajam como parâmetro (não quebram SQL)', ins && ins.params[1] === 'Chave inglesa 12"');

  // 1.4 add em usuarios usa chave usuario (não gera id)
  const rUsu = await store2.add('usuarios', { usuario: 'novo', senha: 'abc', nivel: 'operador' });
  ok('add(usuarios) respeita usuario como chave', rUsu.id === 'novo');

  // 1.5 update mescla e preserva campos não enviados
  await store2.add('estoque', { id: 'est-x', nome: 'Parafuso', quantidadeAtual: '10' });
  fx2.log.length = 0;
  await store2.update('estoque', { id: 'est-x', quantidadeAtual: '25' });
  const upd = fx2.log.find(l => l.sql.startsWith('UPDATE "estoque"'));
  const colsEstoque = require('../api/_lib/schema').colunasDa('estoque');
  ok('update() gera UPDATE parametrizado com todas as colunas',
    upd && upd.params.length === colsEstoque.length + 1,
    'esperado ' + (colsEstoque.length + 1) + ', veio ' + (upd ? upd.params.length : 'nada'));
  const selUpd = fx2.log.find(l => l.sql.startsWith('SELECT') && /WHERE "id" = \$1/.test(l.sql));
  ok('update() lê a linha atual antes de mesclar', !!selUpd);

  // 1.6 update de id inexistente → upsert (INSERT)
  fx2.log.length = 0;
  const rUps = await store2.update('estoque', { id: 'est-nao-existe', nome: 'Novo via upsert' });
  const insUps = fx2.log.find(l => l.sql.startsWith('INSERT INTO "estoque"'));
  ok('update() de id inexistente faz upsert (paridade Code.gs)', rUps.upserted === true && !!insUps);

  // 1.7 remove() com RETURNING
  fx2.log.length = 0;
  const rDel = await store2.remove('estoque', 'est-x');
  const del = fx2.log.find(l => l.sql.startsWith('DELETE FROM "estoque"'));
  ok('remove() gera DELETE ... WHERE "id" = $1 RETURNING 1', del && del.params[0] === 'est-x' && /RETURNING 1/.test(del.sql));
  ok('remove() reporta 1 removido', rDel.removidos === 1);

  // 1.8 list() ordena por _seq e converte null→''
  const lista = await store2.list('estoque');
  ok('list() retorna objetos com colunas do schema', lista.length > 0 && lista[0].nome !== undefined && typeof lista[0].nome === 'string');
  ok('list() usa ORDER BY _seq ASC (ordem de inserção)', fx2.log.some(l => /ORDER BY _seq ASC/.test(l.sql)));

  // 1.9 ensureReady com merge=true faz inserção em lotes de registros ausentes
  const fxMerge = criarExecutorFalso();
  const storeMerge = new NeonStore(fxMerge.exec);
  await storeMerge.ensureReady();
  const resumoMerge = await storeMerge.ensureReady({ merge: true });
  ok('ensureReady com merge=true não duplica registros existentes', resumoMerge.estoque.existentes === ESTOQUE_ESPERADO && resumoMerge.estoque.inseridos === 0);

  // 1.10 _inserirEmLote divide em lotes e ignora registros sem chave primária
  const fxLote = criarExecutorFalso();
  const storeLote = new NeonStore(fxLote.exec);
  await storeLote.ensureReady();
  fxLote.log.length = 0;
  const registrosLote = [
    { id: 'lote-1', nome: 'Item 1' },
    { id: '', nome: 'Sem ID' },
    { id: 'lote-2', nome: 'Item 2' },
    { id: 'lote-3', nome: 'Item 3' },
  ];
  const inseridosLote = await storeLote._inserirEmLote('estoque', registrosLote, 2);
  ok('_inserirEmLote insere registros válidos respeitando tamanhoLote', inseridosLote === 3);
  const sqlInsLote = fxLote.log.filter(l => l.sql.startsWith('INSERT INTO "estoque"'));
  ok('_inserirEmLote dividiu 3 itens válidos em 2 queries com tamanhoLote=2', sqlInsLote.length === 2);
  ok('_inserirEmLote retorna 0 para lista vazia', (await storeLote._inserirEmLote('estoque', [])) === 0);

  /* ── 1.11 REGRESSÃO: esvaziar uma tela não faz o seed "ressuscitar" registros ──
   * O seed do bundle era reinserido sempre que a tabela aparecia vazia. Como a
   * exclusão em massa deixa a tabela vazia, os 10 fornecedores de demonstração
   * voltavam no primeiro cold start seguinte (relato: "já excluí todos, mas está
   * atualizando e voltando"). A carga inicial passa a ser uma vez só por aba.
   */
  const fxRess = criarExecutorFalso();
  const storeRess = new NeonStore(fxRess.exec);
  await storeRess.ensureReady();
  const antesDaLimpeza = await storeRess.list('historico');
  for (const r of antesDaLimpeza) await storeRess.remove('historico', r.id);
  ok('limpeza real esvaziou a aba de exemplo', (await storeRess.list('historico')).length === 0 && antesDaLimpeza.length > 0);

  const storeRessFria = new NeonStore(fxRess.exec); // instância fria = novo cold start
  ok('tabela esvaziada permanece vazia após cold start (seed não repete)',
    (await storeRessFria.list('historico')).length === 0);
  ok('seed marca as abas semeadas em _setup', fxRess.log.some(l =>
    l.sql.includes('INSERT INTO "_setup"') && l.params[0] === 'seed:abas'));

  const resumoForcado = await storeRessFria.ensureReady({ force: true });
  ok('?force=1 continua capaz de repopular aba vazia (recuperação manual)',
    resumoForcado.historico.inseridos === antesDaLimpeza.length,
    JSON.stringify(resumoForcado.historico));

  // Cadastro novo em aba vazia (o caso do usuário) entra e permanece.
  const rFornNovo = await storeRessFria.add('fornecedores', { nome: 'Ferragens Marília', cnpj: '11.111.111/0001-11' });
  const listaForn = await storeRessFria.list('fornecedores');
  ok('novo fornecedor é gravado em cadastro vazio', listaForn.length === 1 && listaForn[0].nome === 'Ferragens Marília');
  ok('add() devolve o id do registro criado', rFornNovo.ok && typeof rFornNovo.id === 'string' && rFornNovo.id.length > 0);

  /* ── 1.12 REGRESSÃO: id repetido não descarta o cadastro ──
   * O frontend usava `length + 1` como id; com o banco já contendo aquela
   * chave, o INSERT `ON CONFLICT DO NOTHING` não gravava nada e a resposta
   * continuava success:true — o cadastro sumia ao sincronizar.
   */
  const fxColisao = criarExecutorFalso();
  const storeColisao = new NeonStore(fxColisao.exec);
  await storeColisao.ensureReady();
  await storeColisao.add('fornecedores', { id: '1', nome: 'Fornecedor Antigo' });
  const rColisao = await storeColisao.add('fornecedores', { id: '1', nome: 'Fornecedor Novo' });
  const listaColisao = await storeColisao.list('fornecedores');
  ok('add com chave repetida ganha id novo em vez de perder o registro',
    rColisao.idRegenerado === true && rColisao.id !== '1' && listaColisao.length === 2,
    JSON.stringify({ id: rColisao.id, total: listaColisao.length }));
  ok('nenhum registro existente é sobrescrito na colisão',
    listaColisao.some(f => f.nome === 'Fornecedor Antigo') && listaColisao.some(f => f.nome === 'Fornecedor Novo'));

  let usuarioDuplicado = null;
  try { await storeColisao.add('usuarios', { usuario: 'admin', senha: 'x', nivel: 'admin', nome: 'Clone' }); }
  catch (e) { usuarioDuplicado = e.message; }
  ok('login duplicado é recusado com mensagem clara (não cria usuário fantasma)',
    /já existe um usuário/i.test(String(usuarioDuplicado)), String(usuarioDuplicado));

  // MemoryStore tem de responder igual (dev/server.js e testes de contrato).
  const memColisao = new MemoryStore({});
  await memColisao.add('fornecedores', { id: '1', nome: 'A' });
  const rMem = await memColisao.add('fornecedores', { id: '1', nome: 'B' });
  ok('MemoryStore segue a mesma regra de colisão (paridade com o Neon)',
    rMem.idRegenerado === true && (await memColisao.list('fornecedores')).length === 2);

  /* ── 1.13 Estoque: fornecedor + valor unitário no cadastro do produto ── */
  const colsEstoqueSchema = require('../api/_lib/schema').colunasDa('estoque');
  ok('schema de estoque traz fornecedor e valorUnitario',
    ['fornecedor', 'valorUnitario'].every(c => colsEstoqueSchema.includes(c)), colsEstoqueSchema.join(','));
  ok('CSV do estoque e seed têm as duas colunas novas',
    Object.keys(ESTOQUE_CSV[0]).includes('fornecedor') && Object.keys(ESTOQUE_CSV[0]).includes('valorUnitario') &&
    Object.keys(seedData.estoque[0]).includes('fornecedor'),
    Object.keys(ESTOQUE_CSV[0]).join(','));

  const rEst = await storeColisao.add('estoque', {
    id: 'est-forn', nome: 'Cimento 50kg', categoria: 'Construção',
    quantidadeAtual: '10', quantidadeMinima: '4', unidade: 'sc',
    fornecedor: 'Casa do Construtor', valorUnitario: '45,90',
  });
  const estSalvo = (await storeColisao.list('estoque')).find(e => e.id === rEst.id) || {};
  ok('estoque persiste fornecedor e valor unitário informados',
    estSalvo.fornecedor === 'Casa do Construtor' && estSalvo.valorUnitario === '45,90',
    JSON.stringify({ fornecedor: estSalvo.fornecedor, valorUnitario: estSalvo.valorUnitario }));

  await storeColisao.update('estoque', { id: rEst.id, quantidadeAtual: '8' });
  const estEditado = (await storeColisao.list('estoque')).find(e => e.id === rEst.id) || {};
  ok('editar item não apaga fornecedor nem valor unitário',
    estEditado.fornecedor === 'Casa do Construtor' && estEditado.valorUnitario === '45,90',
    JSON.stringify({ fornecedor: estEditado.fornecedor, valorUnitario: estEditado.valorUnitario }));

  /* ── 1.14 Seed de fornecedores começa limpo (sem demonstração) ── */
  ok('seed não traz fornecedores de demonstração', (seedData.fornecedores || []).length === 0);
  ok('data/fornecedores.csv tem só o cabeçalho (nada a semear)',
    parseCSV(fs.readFileSync(path.join(ROOT, 'data', 'fornecedores.csv'), 'utf8')).length === 0);

  console.log('\n━━━ 2. Segurança ━━━');

  // 2.1 aba inválida nunca chega ao SQL
  const fx3 = criarExecutorFalso();
  const store3 = new NeonStore(fx3.exec);
  await store3.ensureReady();
  fx3.log.length = 0;
  let lancou = false;
  try { await store3.list('estoque; DROP TABLE usuarios; --'); } catch (e) { lancou = true; }
  ok('aba maliciosa é rejeitada antes do SQL', lancou && fx3.log.length === 0);

  // 2.2 chaves fora do schema não entram no SQL (add)
  fx3.log.length = 0;
  await store3.add('ferramentas', { nome: 'ok', evil: 'x', '"; DROP': 'y' });
  const insEvil = fx3.log.find(l => l.sql.startsWith('INSERT INTO "ferramentas"'));
  ok('colunas fora do schema não aparecem no SQL', insEvil && !insEvil.sql.includes('evil') && !insEvil.sql.includes('DROP'));

  // 2.3 valores perigosos sempre como parâmetro
  await store3.add('ferramentas', { nome: "'; DROP TABLE ferramentas; --" });
  const insDan = fx3.log.filter(l => l.sql.startsWith('INSERT INTO "ferramentas"')).pop();
  ok('payload de injeção viaja como parâmetro ($n)', insDan && insDan.params[1] === "'; DROP TABLE ferramentas; --" && !/(?:'[^']*\')\s*;/.test(insDan.sql));

  // 2.4 usuarios nao expõe hash em list? (paridade: expõe — mas API é same-origin/CORS *)
  // (documentado em DEPLOY-VERCEL.md como próximo passo de hardening)

  console.log('\n━━━ 3. Contrato HTTP (handler + MemoryStore) ━━━');

  const storeM = new MemoryStore();
  const handler = criarHandler(() => storeM);

  function reqFalso(metodo, query, corpo) {
    return new Promise(async (resolve) => {
      const chunks = corpo !== undefined ? [Buffer.from(JSON.stringify(corpo))] : [];
      const req = new (require('stream').Readable)({ read() { chunks.forEach(c => this.push(c)); this.push(null); } });
      req.method = metodo;
      req.url = '/api/' + (query.aba || '') + (query.action ? `?action=${query.action}&id=${query.id || ''}` : '');
      req.headers = { host: 'localhost' };
      req.query = query;
      const res = {
        statusCode: 0, headers: {}, corpo: '',
        setHeader(k, v) { this.headers[k] = v; },
        end(txt) { this.corpo = String(txt || ''); resolve(this); },
      };
      await handler(req, res);
    });
  }

  // 3.1 GET lista → array com seed
  const r1 = await reqFalso('GET', { aba: 'estoque' });
  const d1 = JSON.parse(r1.corpo);
  ok('GET /api/estoque → array JSON', r1.statusCode === 200 && Array.isArray(d1));
  ok('GET /api/estoque traz o estoque do seed', d1.length === ESTOQUE_ESPERADO, 'veio ' + d1.length);
  ok('resposta tem CORS habilitado', r1.headers['Access-Control-Allow-Origin'] === '*');

  // 3.2 POST add → {success:true, id, aba}
  const r2 = await reqFalso('POST', { aba: 'emprestimos' }, { action: 'add', aba: 'emprestimos', ferramentaId: 'f1', nomeFerramenta: 'Martelo', responsavel: 'Agente Silva', status: 'ativo' });
  const d2 = JSON.parse(r2.corpo);
  ok('POST add → success:true com id gerado', d2.success === true && !!d2.id);

  // 3.3 o registro aparece na lista
  const r3 = await reqFalso('GET', { aba: 'emprestimos' });
  const d3 = JSON.parse(r3.corpo);
  ok('registro adicionado aparece na listagem', d3.length === 1 && d3[0].nomeFerramenta === 'Martelo');

  // 3.4 POST update mescla
  const r4 = await reqFalso('POST', { aba: 'emprestimos' }, { action: 'update', aba: 'emprestimos', id: d2.id, status: 'devolvido', dataDevolucao: '2026-08-29' });
  const d4 = JSON.parse(r4.corpo);
  const r5 = await reqFalso('GET', { aba: 'emprestimos' });
  const d5 = JSON.parse(r5.corpo);
  ok('POST update → success:true + mensagem', d4.success === true && d4.message === 'Atualizado');
  ok('update preserva campos não enviados (mescla)', d5[0].responsavel === 'Agente Silva' && d5[0].status === 'devolvido');

  // 3.5 GET action=delete remove
  const r6 = await reqFalso('GET', { aba: 'emprestimos', action: 'delete', id: d2.id });
  const d6 = JSON.parse(r6.corpo);
  const r7 = await reqFalso('GET', { aba: 'emprestimos' });
  ok('GET ?action=delete remove o registro', d6.success === true && JSON.parse(r7.corpo).length === 0);

  // 3.6 delete de id inexistente → success:false com mensagem
  const r8 = await reqFalso('GET', { aba: 'emprestimos', action: 'delete', id: 'fantasma' });
  ok('delete de id inexistente → success:false (mensagem)', JSON.parse(r8.corpo).success === false);

  // 3.7 aba inválida → success:false
  const r9 = await reqFalso('GET', { aba: 'xyz' });
  ok('aba inválida → success:false', JSON.parse(r9.corpo).success === false);

  /* ── 3.7b REGRESSÃO: quantidade/setor do empréstimo persistem (bug v2.7.5) ──
   * O schema de `emprestimos` não tinha as colunas `quantidade`, `setor` e
   * `updatedAt`, que o frontend (app.js → emprestimosModule.salvar) envia. Como
   * o store filtra o payload por colunasDa(aba), esses campos eram DESCARTADOS
   * silenciosamente: a tela sempre exibia "1" (fallback `e.quantidade || '1'`).
   */
  const rq = await reqFalso('POST', { aba: 'emprestimos' }, {
    action: 'add', aba: 'emprestimos', nomeFerramenta: 'Furadeira',
    responsavel: 'Agente Souza', setor: 'Manutenção', quantidade: '7', status: 'Ativo',
  });
  const dq = JSON.parse(rq.corpo);
  const rqL = JSON.parse((await reqFalso('GET', { aba: 'emprestimos' })).corpo);
  const emp = rqL.find(x => x.id === dq.id) || {};
  ok('empréstimo persiste quantidade informada (não vira 1)', emp.quantidade === '7', 'veio ' + JSON.stringify(emp.quantidade));
  ok('empréstimo persiste setor informado', emp.setor === 'Manutenção', 'veio ' + JSON.stringify(emp.setor));

  // update parcial não zera a quantidade já gravada
  await reqFalso('POST', { aba: 'emprestimos' }, { action: 'update', aba: 'emprestimos', id: dq.id, status: 'Devolvido' });
  const rqL2 = JSON.parse((await reqFalso('GET', { aba: 'emprestimos' })).corpo);
  const emp2 = rqL2.find(x => x.id === dq.id) || {};
  ok('devolução preserva a quantidade do empréstimo', emp2.quantidade === '7' && emp2.status === 'Devolvido', 'veio ' + JSON.stringify(emp2.quantidade));
  await reqFalso('GET', { aba: 'emprestimos', action: 'delete', id: dq.id });

  // 3.8 health
  const h = criarHealthHandler(() => storeM);
  const healthRes = await new Promise(async (resolve) => {
    const req = { method: 'GET', url: '/api/health', headers: {} };
    const res = { statusCode: 0, headers: {}, corpo: '', setHeader(k, v) { this.headers[k] = v; }, end(t) { this.corpo = t; resolve(this); } };
    await h(req, res);
  });
  const hd = JSON.parse(healthRes.corpo);
  ok('/api/health → ok com contagens por tabela', hd.ok === true && hd.contagens && hd.contagens.estoque === ESTOQUE_ESPERADO);

  console.log('\n━━━ 4. Integração via dev/server.js (HTTP real) ━━━');

  process.env.PORT = '0';
  const servidor = require('../dev/server.js');
  await new Promise(r => servidor.listen(0, '127.0.0.1', r));
  const porta = servidor.address().port;
  const base = `http://127.0.0.1:${porta}`;

  const gEstoque = await (await fetch(`${base}/api/estoque`)).json();
  ok('HTTP GET /api/estoque → registros do seed', Array.isArray(gEstoque) && gEstoque.length === ESTOQUE_ESPERADO);
  const gHealth = await (await fetch(`${base}/api/health`)).json();
  ok('HTTP GET /api/health → ok', gHealth.ok === true && gHealth.backend === 'memory-dev');
  const pAdd = await (await fetch(`${base}/api/fornecedores`, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'add', aba: 'fornecedores', nome: 'Loja do Parafuso', cnpj: '12.345.678/0001-90' }) })).json();
  ok('HTTP POST text/plain (mesmo Content-Type do frontend) → add OK', pAdd.success === true);
  const gForn = await (await fetch(`${base}/api/fornecedores`)).json();
  const seedForn = (seedData.fornecedores || []).length;
  ok(`fornecedor novo aparece no fim da lista (seed ${seedForn} + 1)`,
    gForn.length === seedForn + 1 && gForn[gForn.length - 1].nome === 'Loja do Parafuso',
    'veio ' + JSON.stringify(gForn.map(f => f.nome)));
  // Excluir tudo tem de permanecer vazio (contrato delete → list)
  await fetch(`${base}/api/fornecedores?action=delete&id=${encodeURIComponent(gForn[gForn.length - 1].id)}`);
  const gFornVazio = await (await fetch(`${base}/api/fornecedores`)).json();
  ok('após excluir os fornecedores restantes a lista fica vazia de fato',
    Array.isArray(gFornVazio) && gFornVazio.length === seedForn, 'veio ' + gFornVazio.length);
  const gIndex = await fetch(`${base}/`);
  ok('frontend é servido (index.html 200 + text/html)', gIndex.status === 200 && (gIndex.headers.get('content-type') || '').includes('text/html'));
  const gConfig = await (await fetch(`${base}/config.js`)).text();
  ok('config.js served contém detecção de backend API', gConfig.includes('.github.io') && gConfig.includes('/api/'));
  servidor.close();

  console.log('\n━━━ 5. Frontend — detecção de backend ━━━');

  const cfg = fs.readFileSync(path.join(ROOT, 'config.js'), 'utf8');
  ok('config.js usa API /api fora do GitHub Pages (inclui Vercel)', /\.github\.io/.test(cfg) && /!host\.endsWith\('\.github\.io'\)/.test(cfg));
  ok('config.js mantém Apps Script para GitHub Pages', /URL_BASE_APPS_SCRIPT\s*=\s*'https:\/\/script\.google\.com/.test(cfg));
  ok('config.js versão 3.0.0', /VERSAO:\s*'3\.0\.0'/.test(cfg));
  ok('config.js expõe CONFIG.BACKEND', /BACKEND:\s*neon\s*\?\s*'neon'\s*:\s*'appsscript'/.test(cfg));
  const appJs = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  ok('app.js extrai aba de /api/<aba>', appJs.includes('([a-z]+)') && /_extractAbaFromUrl/.test(appJs));

  console.log('\n━━━ 6. CSV parser (seed) ━━━');
  const comAspas = parseCSV('id,nome,obs\n1,"Martelo, cabo de madeira","altura: 12"""\n2,Chave,simples');
  ok('parser CSV trata vírgulas entre aspas', comAspas[0].nome === 'Martelo, cabo de madeira');
  ok('parser CSV trata aspas escapadas (")', comAspas[0].obs === 'altura: 12"');
  ok('seed-data embutido cobre as 8 abas', Object.keys(seedData).length === 8);
  ok('seed-data não vaza senha em claro (hashes SHA-256)', seedData.usuarios.every(u => /^[a-f0-9]{64}$/.test(u.senha || '')));

  /* ── Resultado ── */
  console.log(`\n${'█'.repeat(46)}`);
  console.log(`  NEON: ${passed} passaram, ${failed} falharam (${passed + failed} total)`);
  console.log('█'.repeat(46));
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('✖ ERRO FATAL:', e); process.exit(1); });
