/**
 * scripts/migrate-online.js — leva os dados de data/*.csv para o ambiente online
 * ============================================================================
 *
 * Modos de destino:
 *   DATABASE_URL=postgresql://... npm run migrate:online
 *   MIGRATE_API_BASE=https://projeto.vercel.app npm run migrate:online
 *
 * A migração é deliberadamente não destrutiva: cria/evolui o schema e insere
 * somente chaves primárias que ainda não existem. Nunca apaga nem sobrescreve
 * registros online. Use DRY_RUN=1 para revisar a carga sem conectar ao destino.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { ABAS_VALIDAS, colunasDa, pkDa } = require('../api/_lib/schema');
const { parseCSV } = require('../api/_lib/csv');

const ROOT = path.join(__dirname, '..');
const DEFAULT_DATA_DIR = path.join(ROOT, 'data');
const TRUTHY = new Set(['1', 'true', 'yes', 'sim']);

function estaAtivo(value) {
  return TRUTHY.has(String(value || '').trim().toLowerCase());
}

function ident(nome) {
  return '"' + String(nome).replace(/"/g, '""') + '"';
}

function texto(value) {
  return value === null || value === undefined ? '' : String(value);
}

function carregarFonte(dataDir = process.env.DATA_DIR || DEFAULT_DATA_DIR) {
  const registros = {};
  const erros = [];

  for (const aba of ABAS_VALIDAS) {
    const arquivo = path.join(dataDir, aba + '.csv');
    if (!fs.existsSync(arquivo)) {
      erros.push(`arquivo ausente: ${path.relative(ROOT, arquivo)}`);
      continue;
    }

    let linhas;
    try {
      linhas = parseCSV(fs.readFileSync(arquivo, 'utf8'));
    } catch (e) {
      erros.push(`${aba}.csv: não foi possível ler (${e.message})`);
      continue;
    }

    const pk = pkDa(aba);
    const vistos = new Set();
    const saida = [];
    for (const [indice, linha] of linhas.entries()) {
      const chave = texto(linha[pk]).trim();
      if (!chave) {
        erros.push(`${aba}.csv linha ${indice + 2}: chave "${pk}" vazia`);
        continue;
      }
      if (vistos.has(chave)) {
        erros.push(`${aba}.csv linha ${indice + 2}: chave duplicada "${chave}"`);
        continue;
      }
      vistos.add(chave);

      // O arquivo pode ter colunas extras, mas só o schema conhecido é enviado.
      const registro = {};
      for (const coluna of colunasDa(aba)) registro[coluna] = texto(linha[coluna]);
      saida.push(registro);
    }
    registros[aba] = saida;
  }

  if (erros.length) {
    throw new Error('Fonte CSV inválida:\n- ' + erros.join('\n- '));
  }
  return { dataDir, registros };
}

function totalRegistros(registros) {
  return ABAS_VALIDAS.reduce((total, aba) => total + (registros[aba] || []).length, 0);
}

function planoDaFonte(registros) {
  return ABAS_VALIDAS.map(aba => ({
    aba,
    pk: pkDa(aba),
    fonte: (registros[aba] || []).length,
  }));
}

function resumoTabela(aba, pk, fonte, existentes, inseridos, modo) {
  return { aba, pk, fonte, existentes, faltantes: Math.max(0, fonte - existentes), inseridos, modo };
}

function chavesDosRegistros(registros, aba) {
  const pk = pkDa(aba);
  return new Set((registros[aba] || []).map(registro => texto(registro[pk])));
}

function resultadoRows(resultado) {
  return resultado && Array.isArray(resultado.rows) ? resultado.rows : [];
}

async function consultarChaves(query, aba) {
  const pk = pkDa(aba);
  const resultado = await query(`SELECT ${ident(pk)} FROM ${ident(aba)}`);
  return new Set(resultadoRows(resultado).map(linha => texto(Array.isArray(linha) ? linha[0] : linha[pk])));
}

function sqlCriarTabela(aba) {
  const pk = pkDa(aba);
  const defs = colunasDa(aba).map(coluna =>
    coluna === pk
      ? `${ident(coluna)} TEXT PRIMARY KEY`
      : `${ident(coluna)} TEXT NOT NULL DEFAULT ''`
  );
  defs.push(`${ident('_seq')} BIGSERIAL`);
  return `CREATE TABLE IF NOT EXISTS ${ident(aba)} (${defs.join(', ')})`;
}

async function garantirSchema(query) {
  for (const aba of ABAS_VALIDAS) {
    await query(sqlCriarTabela(aba));
    const colunasExtras = colunasDa(aba).filter(coluna => coluna !== pkDa(aba));
    if (colunasExtras.length > 0) {
      const alters = colunasExtras.map(
        coluna => `ADD COLUMN IF NOT EXISTS ${ident(coluna)} TEXT NOT NULL DEFAULT ''`
      );
      await query(`ALTER TABLE ${ident(aba)} ${alters.join(', ')}`);
    }
    // Bancos criados antes do _seq precisam dele para a ordenação da API.
    await query(
      `ALTER TABLE ${ident(aba)} ADD COLUMN IF NOT EXISTS ${ident('_seq')} BIGSERIAL`
    );
  }
  await query(`CREATE TABLE IF NOT EXISTS ${ident('_setup')} ("key" TEXT PRIMARY KEY, "value" TEXT NOT NULL DEFAULT '')`);
}

async function inserirEmLote(query, aba, registros, tamanhoLote = 50) {
  const colunas = colunasDa(aba);
  const pk = pkDa(aba);
  const validos = (registros || []).filter(r => texto(r[pk]).trim() !== '');
  if (!validos.length) return 0;

  let totalInseridos = 0;
  for (let i = 0; i < validos.length; i += tamanhoLote) {
    const lote = validos.slice(i, i + tamanhoLote);
    const linhasPlaceholders = [];
    const valores = [];

    for (let rIdx = 0; rIdx < lote.length; rIdx++) {
      const reg = lote[rIdx];
      const phs = [];
      for (let cIdx = 0; cIdx < colunas.length; cIdx++) {
        phs.push(`$${valores.length + 1}`);
        valores.push(texto(reg[colunas[cIdx]]));
      }
      linhasPlaceholders.push(`(${phs.join(', ')})`);
    }

    const resultado = await query(
      `INSERT INTO ${ident(aba)} (${colunas.map(ident).join(', ')})\n` +
      `VALUES\n  ${linhasPlaceholders.join(',\n  ')}\n` +
      `ON CONFLICT (${ident(pk)}) DO NOTHING\n` +
      `RETURNING 1`,
      valores
    );
    totalInseridos += resultadoRows(resultado).length;
  }
  return totalInseridos;
}

async function inserir(query, aba, registro) {
  return inserirEmLote(query, aba, [registro]);
}

/**
 * Migra por SQL em lotes. O objeto query recebe (sql, parâmetros), assim como o
 * executor do NeonStore; isso também mantém a rotina fácil de testar sem rede.
 */
async function migrarDireto(query, registros, tamanhoLote = 50) {
  await garantirSchema(query);
  const resultado = [];

  for (const aba of ABAS_VALIDAS) {
    const fonte = registros[aba] || [];
    const pk = pkDa(aba);
    const existentesSet = await consultarChaves(query, aba);
    const existentes = fonte.filter(registro => existentesSet.has(texto(registro[pk]))).length;
    const faltantes = fonte.filter(registro => !existentesSet.has(texto(registro[pk])));

    const inseridos = await inserirEmLote(query, aba, faltantes, tamanhoLote);
    resultado.push(resumoTabela(aba, pk, fonte.length, existentes, inseridos, 'database'));
  }
  return resultado;
}

function normalizarBaseAPI(base) {
  let url;
  try {
    url = new URL(String(base || '').trim());
  } catch (e) {
    throw new Error('MIGRATE_API_BASE deve ser uma URL http(s) válida');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('MIGRATE_API_BASE deve usar http:// ou https://');
  }
  const pathname = url.pathname.replace(/\/+$/, '');
  const caminho = pathname === '/api' || pathname.endsWith('/api')
    ? pathname
    : (pathname + '/api');
  url.pathname = caminho || '/api';
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

async function requisitarJSON(url, opcoes = {}, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('Este comando requer Node.js 18 ou mais recente (fetch não encontrado)');
  }
  const controlador = new AbortController();
  const timeout = setTimeout(() => controlador.abort(), Number(process.env.MIGRATE_TIMEOUT_MS || 30000));
  try {
    const resposta = await fetchImpl(url, Object.assign({}, opcoes, { signal: controlador.signal }));
    const bruto = await resposta.text();
    let corpo;
    try { corpo = bruto ? JSON.parse(bruto) : null; } catch (e) {
      throw new Error(`resposta não-JSON de ${url} (HTTP ${resposta.status})`);
    }
    if (!resposta.ok) {
      const detalhe = corpo && (corpo.error || corpo.message) ? `: ${corpo.error || corpo.message}` : '';
      throw new Error(`HTTP ${resposta.status} em ${url}${detalhe}`);
    }
    return corpo;
  } finally {
    clearTimeout(timeout);
  }
}

function dadosDaResposta(corpo, aba) {
  if (Array.isArray(corpo)) return corpo;
  if (corpo && Array.isArray(corpo.data)) return corpo.data;
  if (corpo && Array.isArray(corpo.rows)) return corpo.rows;
  throw new Error(`resposta inválida ao listar ${aba}: esperava um array de registros`);
}

function exigirSucesso(corpo, operacao) {
  if (!corpo || corpo.success !== true) {
    const erro = corpo && corpo.error ? corpo.error : 'resposta sem success:true';
    throw new Error(`${operacao}: ${erro}`);
  }
}

/** Migra usando somente o contrato HTTP público da API Vercel. */
async function migrarViaAPI(base, registros, fetchImpl = globalThis.fetch) {
  const api = normalizarBaseAPI(base);
  const setup = await requisitarJSON(`${api}/setup?force=1`, {}, fetchImpl);
  exigirSucesso(setup, 'setup da API');

  const atuais = {};
  for (const aba of ABAS_VALIDAS) {
    const corpo = await requisitarJSON(`${api}/${aba}`, {}, fetchImpl);
    atuais[aba] = dadosDaResposta(corpo, aba);
  }

  const resultado = [];
  for (const aba of ABAS_VALIDAS) {
    const fonte = registros[aba] || [];
    const pk = pkDa(aba);
    const existentesSet = new Set(atuais[aba].map(registro => texto(registro && registro[pk])));
    const existentes = fonte.filter(registro => existentesSet.has(texto(registro[pk]))).length;
    let inseridos = 0;

    for (const registro of fonte) {
      const chave = texto(registro[pk]);
      if (existentesSet.has(chave)) continue;
      const corpo = await requisitarJSON(`${api}/${aba}`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({ action: 'add' }, registro)),
      }, fetchImpl);
      exigirSucesso(corpo, `inserção ${aba}/${chave}`);
      inseridos++;
      existentesSet.add(chave);
    }
    resultado.push(resumoTabela(aba, pk, fonte.length, existentes, inseridos, 'api'));
  }
  return resultado;
}

function imprimirFonte(fonte) {
  console.log(`Origem: ${path.relative(ROOT, fonte.dataDir) || fonte.dataDir}`);
  console.log('Modo: DRY_RUN — nenhuma conexão ou alteração será feita.\n');
  for (const item of planoDaFonte(fonte.registros)) {
    console.log(`  ${item.aba.padEnd(14)} ${String(item.fonte).padStart(4)} registros · chave ${item.pk} · inserir ausentes`);
  }
  console.log(`\nTotal planejado: ${totalRegistros(fonte.registros)} registros`);
}

function imprimirResultado(resultado, destino) {
  console.log(`Destino: ${destino}`);
  console.log('Estratégia: schema idempotente + INSERT somente de chaves ausentes (sem DELETE/UPDATE).\n');
  for (const item of resultado) {
    console.log(
      `  ${item.aba.padEnd(14)} fonte ${String(item.fonte).padStart(4)} · ` +
      `já existentes ${String(item.existentes).padStart(4)} · ` +
      `inseridos ${String(item.inseridos).padStart(4)}`
    );
  }
  const total = resultado.reduce((soma, item) => soma + item.inseridos, 0);
  console.log(`\nMigração concluída: ${total} registros novos.`);
}

function uso() {
  return [
    'Uso:',
    '  DATABASE_URL=postgresql://... npm run migrate:online',
    '  MIGRATE_API_BASE=https://projeto.vercel.app npm run migrate:online',
    '',
    'Opções:',
    '  DRY_RUN=1       mostra a carga sem conectar nem alterar o destino',
    '  DATA_DIR=./dir  usa outra pasta com os 8 arquivos CSV',
    '  --help          mostra esta ajuda',
  ].join('\n');
}

async function main(env = process.env) {
  if (env.MIGRATE_HELP || process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(uso());
    return;
  }

  const fonte = carregarFonte(env.DATA_DIR || DEFAULT_DATA_DIR);
  // O modo de conferência é intencionalmente independente do destino: assim
  // `DRY_RUN=1 npm run migrate:online` funciona sem pedir credenciais.
  if (estaAtivo(env.DRY_RUN)) {
    imprimirFonte(fonte);
    return;
  }

  const temBanco = Boolean(String(env.DATABASE_URL || '').trim());
  const temAPI = Boolean(String(env.MIGRATE_API_BASE || '').trim());
  if (temBanco === temAPI) {
    throw new Error('Defina exatamente uma destas variáveis: DATABASE_URL ou MIGRATE_API_BASE\n\n' + uso());
  }

  if (temAPI) {
    const resultado = await migrarViaAPI(env.MIGRATE_API_BASE, fonte.registros);
    imprimirResultado(resultado, normalizarBaseAPI(env.MIGRATE_API_BASE));
    return;
  }

  const { neon } = require('@neondatabase/serverless');
  const cliente = neon(env.DATABASE_URL, { fullResults: true, arrayMode: true });
  const resultado = await migrarDireto((sql, params) => cliente.query(sql, params), fonte.registros);
  imprimirResultado(resultado, 'DATABASE_URL (PostgreSQL/Neon)');
}

if (require.main === module) {
  main().catch(erro => {
    console.error(`\n✖ Migração não executada: ${erro.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  carregarFonte,
  estaAtivo,
  ident,
  planoDaFonte,
  normalizarBaseAPI,
  sqlCriarTabela,
  garantirSchema,
  inserir,
  inserirEmLote,
  migrarDireto,
  migrarViaAPI,
  totalRegistros,
};
