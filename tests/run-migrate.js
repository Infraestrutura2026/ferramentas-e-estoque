/** Testes do comando migrate:online (sem rede e sem banco real). */
'use strict';

const fs = require('fs');
const path = require('path');
const {
  carregarFonte,
  ident,
  normalizarBaseAPI,
  migrarDireto,
  migrarViaAPI,
  totalRegistros,
} = require('../scripts/migrate-online');
const { ABAS_VALIDAS, pkDa } = require('../api/_lib/schema');
const { MemoryStore } = require('../api/_lib/store');
const { criarSetupHandler } = require('../api/_lib/handler');

const ROOT = path.resolve(__dirname, '..');
let passed = 0;
let failed = 0;
function ok(name, condition, message = '') {
  if (condition) { console.log(`✔ ${name}`); passed++; }
  else { console.error(`✖ ${name}${message ? ': ' + message : ''}`); failed++; }
}

(async function main() {
  const fonte = carregarFonte(path.join(ROOT, 'data'));
  ok('migrate carrega os 8 CSVs', ABAS_VALIDAS.every(aba => fonte.registros[aba]));
  ok('migrate carrega 172 registros da fonte', totalRegistros(fonte.registros) === 172);
  ok('migrate valida a chave usuario da aba usuarios', fonte.registros.usuarios.every(r => r.usuario));
  ok('normaliza base sem duplicar /api', normalizarBaseAPI('https://projeto.vercel.app/') === 'https://projeto.vercel.app/api');
  ok('normaliza base que já termina em /api', normalizarBaseAPI('https://projeto.vercel.app/api/') === 'https://projeto.vercel.app/api');
  ok('identificador SQL é escapado', ident('a"b') === '"a""b"');

  // Executor mínimo em memória para validar a estratégia direta sem PostgreSQL.
  const tabelas = new Map();
  const query = async (sql, params = []) => {
    const criar = sql.match(/CREATE TABLE IF NOT EXISTS "([^"]+)"/);
    if (criar) { if (!tabelas.has(criar[1])) tabelas.set(criar[1], []); return { rows: [] }; }
    const alterar = sql.match(/ALTER TABLE "([^"]+)"/);
    if (alterar) { if (!tabelas.has(alterar[1])) tabelas.set(alterar[1], []); return { rows: [] }; }
    const selecionar = sql.match(/SELECT "([^"]+)" FROM "([^"]+)"/);
    if (selecionar) {
      const rows = tabelas.get(selecionar[2]) || [];
      return { rows: rows.map(row => [row[selecionar[1]]]) };
    }
    const inserir = sql.match(/INSERT INTO "([^"]+)"/);
    if (inserir) {
      const aba = inserir[1];
      const pk = pkDa(aba);
      const registro = { [pk]: String(params[0]) };
      const rows = tabelas.get(aba) || [];
      if (rows.some(row => row[pk] === registro[pk])) return { rows: [] };
      rows.push(registro); tabelas.set(aba, rows);
      return { rows: [[1]] };
    }
    return { rows: [] };
  };
  const pequena = Object.fromEntries(ABAS_VALIDAS.map(aba => [aba, []]));
  pequena.estoque = [{ id: 'novo-1', nome: 'Teste' }, { id: 'novo-2', nome: 'Teste 2' }];
  const primeira = await migrarDireto(query, pequena);
  const segunda = await migrarDireto(query, pequena);
  ok('migração SQL insere registros ausentes', primeira.find(r => r.aba === 'estoque').inseridos === 2);
  ok('migração SQL é idempotente', segunda.find(r => r.aba === 'estoque').inseridos === 0);
  ok('migração SQL não altera nem remove registros', [...tabelas.get('estoque')].length === 2);

  // Fetch falso: valida o contrato HTTP e que o corpo usa text/plain.
  const resposta = corpo => ({ ok: true, status: 200, text: async () => JSON.stringify(corpo) });
  const chamadas = [];
  const fetchFalso = async (url, options = {}) => {
    chamadas.push({ url, options });
    if (url.endsWith('/setup?force=1')) return resposta({ success: true });
    if (!options.method) return resposta([]);
    return resposta({ success: true, id: 'api-1' });
  };
  const apiFonte = Object.fromEntries(ABAS_VALIDAS.map(aba => [aba, []]));
  apiFonte.estoque = [{ id: 'api-1', nome: 'API' }];
  const apiResultado = await migrarViaAPI('https://projeto.vercel.app', apiFonte, fetchFalso);
  const post = chamadas.find(c => c.options.method === 'POST');
  ok('migração via API executa setup e lista as 8 abas', chamadas.some(c => c.url.endsWith('/setup?force=1')) && chamadas.filter(c => !c.options.method && !c.url.endsWith('/setup?force=1')).length === 8);
  ok('migração via API envia somente registros ausentes', apiResultado.find(r => r.aba === 'estoque').inseridos === 1);
  ok('migração via API usa POST text/plain', post && post.options.headers['Content-Type'].startsWith('text/plain') && JSON.parse(post.options.body).action === 'add');

  // A URL amigável para quem não usa terminal: /api/setup?migrate=1.
  const parcial = Object.fromEntries(ABAS_VALIDAS.map(aba => [aba, []]));
  parcial.estoque = fonte.registros.estoque.slice(0, 48);
  parcial.ferramentas = fonte.registros.ferramentas.slice(0, 50);
  parcial.usuarios = fonte.registros.usuarios.slice(0, 1);
  const storeParcial = new MemoryStore(parcial);
  await storeParcial.ensureReady();
  // Simula a versão atualizada do seed no bundle após um deploy.
  storeParcial._cargaCache = fonte.registros;
  const setupHandler = criarSetupHandler(() => storeParcial);
  const req = { method: 'GET', url: '/api/setup?migrate=1', headers: {} };
  const res = { statusCode: 0, headers: {}, corpo: '', setHeader(k, v) { this.headers[k] = v; }, end(body) { this.corpo = body; } };
  await setupHandler(req, res);
  const setupResposta = JSON.parse(res.corpo);
  ok('setup?migrate=1 retorna sucesso', setupResposta.success === true && setupResposta.message.includes('Migração'));
  ok('setup?migrate=1 completa tabelas parcialmente carregadas', setupResposta.contagens.estoque === 51 && setupResposta.contagens.ferramentas === 64 && setupResposta.contagens.usuarios === 3);

  console.log(`\n${passed} passed, ${failed} failed — total ${passed + failed}`);
  process.exit(failed ? 1 : 0);
})().catch(error => {
  console.error('✖ ERRO FATAL:', error);
  process.exit(1);
});
