/**
 * api/_lib/store.js — Camada de dados PostgreSQL (Neon) + store em memória
 * =========================================================================
 * Duas implementações, mesma interface:
 *
 *   • NeonStore    → usado na Vercel (driver HTTP @neondatabase/serverless).
 *                    O executor SQL é INJETÁVEL, o que permite testar o SQL
 *                    exato gerado sem rede (tests/run-neon.js).
 *   • MemoryStore  → usado no servidor de desenvolvimento (dev/server.js) e
 *                    nos testes de contrato. Mesmo seed, mesmo comportamento.
 *
 * Contrato (idêntico ao Apps Script em apps-script/Code.gs):
 *   list(aba)            → [{...}]                (ordem de inserção)
 *   add(aba, obj)        → {ok, id}               (gera id/createdAt)
 *   update(aba, obj)     → {ok, id, upserted}     (mescla; cria se não existir)
 *   remove(aba, id)      → {ok, id}               (ou lança 'não encontrado')
 *   ensureReady()        → cria tabelas + seed dos CSVs (idempotente)
 */

'use strict';

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { abaValida, colunasDa, pkDa, ABAS_VALIDAS } = require('./schema');
const { parseCSV } = require('./csv');

/* ── Utilidades SQL ─────────────────────────────────────────────── */

function ident(nome) {
  return '"' + String(nome).replace(/"/g, '""') + '"';
}

function agoraISO() {
  return new Date().toISOString();
}

function gerarId() {
  return (crypto.randomUUID && crypto.randomUUID()) ||
    ('id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10));
}

/** Normaliza valores para TEXT (null → '') — paridade com Sheets/CSV */
function texto(v) {
  if (v === null || v === undefined) return '';
  return String(v);
}

/* ════════════════════════════════════════════════════════════════
   NeonStore — PostgreSQL via executor injetável
   ════════════════════════════════════════════════════════════════ */

class NeonStore {
  /**
   * @param {function(string, any[]): Promise<{rows: any[][]}>} exec
   *        Executor SQL: recebe (texto, params) e resolve {rows}.
   *        Na Vercel: (text, params) => neonClient.query(text, params)
   */
  constructor(exec) {
    this.exec = exec;
    this._pronto = null; // promise de ensureReady (cache por instância fria)
  }

  query(texto, params) {
    return this.exec(texto, params || []);
  }

  /* ── Setup: DDL + seed ── */
  async ensureReady(opcoes) {
    const forcar = opcoes && opcoes.force;
    const mesclar = opcoes && opcoes.merge;
    if (!forcar && !mesclar && this._pronto) return this._pronto;
    this._pronto = this._setup({ merge: mesclar }).catch (e => { this._pronto = null; throw e; });
    return this._pronto;
  }

  async _setup(opcoes) {
    const mesclar = !!(opcoes && opcoes.merge);
    // 1) Tabelas (IF NOT EXISTS + ADD COLUMN IF NOT EXISTS p/ evolução segura)
    for (const aba of ABAS_VALIDAS) {
      const pk = pkDa(aba);
      const colunas = colunasDa(aba);
      const defs = colunas.map(c =>
        c === pk ? `${ident(c)} TEXT PRIMARY KEY` : `${ident(c)} TEXT NOT NULL DEFAULT ''`
      );
      defs.push('_seq BIGSERIAL'); // coluna interna: preserva ordem de inserção (oculta na API)
      await this.query(`CREATE TABLE IF NOT EXISTS ${ident(aba)} (${defs.join(', ')})`);
      const colunasExtras = colunas.filter(c => c !== pk);
      if (colunasExtras.length > 0) {
        const alters = colunasExtras.map(c => `ADD COLUMN IF NOT EXISTS ${ident(c)} TEXT NOT NULL DEFAULT ''`);
        await this.query(`ALTER TABLE ${ident(aba)} ${alters.join(', ')}`);
      }
    }
    await this.query(`CREATE TABLE IF NOT EXISTS "_setup" ("key" TEXT PRIMARY KEY, "value" TEXT NOT NULL DEFAULT '')`);

    // 2) Seed: apenas tabelas vazias ou merge em lotes (idempotente; ON CONFLICT protege de corridas)
    const carga = this._cargaInicial();
    const resumo = {};
    for (const aba of ABAS_VALIDAS) {
      const { rows } = await this.query(`SELECT COUNT(*)::int AS n FROM ${ident(aba)}`);
      const existentes = (rows[0] && rows[0][0]) || 0;
      if (existentes > 0 && !mesclar) { resumo[aba] = { existentes, inseridos: 0 }; continue; }
      const registros = carga[aba] || [];
      const inseridos = await this._inserirEmLote(aba, registros);
      resumo[aba] = { existentes, inseridos };
    }
    await this.query(
      `INSERT INTO "_setup" ("key", "value") VALUES ('seeded_at', $1)
       ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value"`,
      [agoraISO()]
    );
    return resumo;
  }

  /** INSERT multi-row em lote ... ON CONFLICT DO NOTHING → retorna total inserido */
  async _inserirEmLote(aba, registros, tamanhoLote = 50) {
    const pk = pkDa(aba);
    const colunas = colunasDa(aba);
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

      const sqlTxt = `INSERT INTO ${ident(aba)} (${colunas.map(ident).join(', ')})\n` +
                     `VALUES\n  ${linhasPlaceholders.join(',\n  ')}\n` +
                     `ON CONFLICT (${ident(pk)}) DO NOTHING\n` +
                     `RETURNING 1`;
      const { rows } = await this.query(sqlTxt, valores);
      totalInseridos += (rows && rows.length) || 0;
    }
    return totalInseridos;
  }

  /** Compatibilidade: insere 1 registro se ausente */
  async _inserirSeAusente(aba, registro) {
    return this._inserirEmLote(aba, [registro]);
  }

  /** Carga inicial: tenta CSVs do bundle; senão usa seed-data.js embutido */
  _cargaInicial() {
    const candidatos = [
      path.join(process.cwd(), 'data'),
      path.join(__dirname, '..', '..', 'data'),
      path.join(__dirname, '..', 'data'),
      '/var/task/data',
    ];
    if (process.env.DATA_DIR) candidatos.unshift(process.env.DATA_DIR);
    for (const dir of candidatos) {
      try {
        const temTodos = ABAS_VALIDAS.every(aba => fs.existsSync(path.join(dir, aba + '.csv')));
        if (temTodos) {
          const carga = {};
          for (const aba of ABAS_VALIDAS) {
            carga[aba] = parseCSV(fs.readFileSync(path.join(dir, aba + '.csv'), 'utf8'));
          }
          return carga;
        }
      } catch (e) { /* tenta próximo candidato */ }
    }
    // Fallback determinístico: carga embutida (api/_lib/seed-data.js)
    return require('./seed-data');
  }

  /* ── CRUD ── */

  async list(aba) {
    this._exigirAba(aba);
    await this.ensureReady();
    const colunas = colunasDa(aba);
    const { rows } = await this.query(
      `SELECT ${colunas.map(ident).join(', ')} FROM ${ident(aba)} ORDER BY _seq ASC`
    );
    return rows.map(linha => {
      const obj = {};
      colunas.forEach((c, i) => { obj[c] = linha[i] === null ? '' : String(linha[i]); });
      return obj;
    });
  }

  async add(aba, payload) {
    this._exigirAba(aba);
    await this.ensureReady();
    const pk = pkDa(aba);
    const colunas = colunasDa(aba);
    const registro = {};
    colunas.forEach(c => { registro[c] = texto(payload[c]); });

    if (!texto(registro[pk])) registro[pk] = pk === 'usuario' ? gerarUsuario() : gerarId();
    if (colunas.includes('createdAt') && !registro.createdAt) registro.createdAt = agoraISO();
    if (colunas.includes('updatedAt') && !registro.updatedAt) registro.updatedAt = registro.createdAt || agoraISO();

    const placeholders = colunas.map((_, i) => `$${i + 1}`).join(', ');
    await this.query(
      `INSERT INTO ${ident(aba)} (${colunas.map(ident).join(', ')}) VALUES (${placeholders})
       ON CONFLICT (${ident(pk)}) DO NOTHING`,
      colunas.map(c => registro[c])
    );
    return { ok: true, id: registro[pk] };
  }

  async update(aba, payload) {
    this._exigirAba(aba);
    await this.ensureReady();
    const pk = pkDa(aba);
    const colunas = colunasDa(aba);
    const chave = texto(payload[pk]);
    if (!chave) { const e = new Error('id obrigatório para update'); e.status = 400; throw e; }

    // Lê linha atual e mescla (mesma semântica do Apps Script)
    const sel = `SELECT ${colunas.map(ident).join(', ')} FROM ${ident(aba)} WHERE ${ident(pk)} = $1`;
    const { rows } = await this.query(sel, [chave]);
    if (!rows.length) {
      // Upsert: cria se não existir (paridade com o Code.gs)
      const registro = {};
      colunas.forEach(c => { registro[c] = texto(payload[c]); });
      registro[pk] = chave;
      if (colunas.includes('createdAt') && !registro.createdAt) registro.createdAt = agoraISO();
      if (colunas.includes('updatedAt')) registro.updatedAt = agoraISO();
      const placeholders = colunas.map((_, i) => `$${i + 1}`).join(', ');
      await this.query(
        `INSERT INTO ${ident(aba)} (${colunas.map(ident).join(', ')}) VALUES (${placeholders})
         ON CONFLICT (${ident(pk)}) DO NOTHING`,
        colunas.map(c => registro[c])
      );
      return { ok: true, id: chave, upserted: true };
    }

    const atual = {};
    colunas.forEach((c, i) => { atual[c] = rows[0][i] === null ? '' : String(rows[0][i]); });
    colunas.forEach(c => {
      if (c !== pk && payload[c] !== undefined) atual[c] = texto(payload[c]);
    });
    if (colunas.includes('updatedAt')) atual.updatedAt = agoraISO();

    const sets = colunas.map((c, i) => `${ident(c)} = $${i + 1}`).join(', ');
    await this.query(
      `UPDATE ${ident(aba)} SET ${sets} WHERE ${ident(pk)} = $${colunas.length + 1}`,
      colunas.map(c => atual[c]).concat([chave])
    );
    return { ok: true, id: chave, upserted: false };
  }

  async remove(aba, id) {
    this._exigirAba(aba);
    await this.ensureReady();
    const pk = pkDa(aba);
    const chave = texto(id);
    if (!chave) { const e = new Error('Parâmetro id obrigatório para delete'); e.status = 400; throw e; }
    const { rows } = await this.query(`DELETE FROM ${ident(aba)} WHERE ${ident(pk)} = $1 RETURNING 1`, [chave]);
    return { ok: true, removidos: rows.length, id: chave };
  }

  async health() {
    try {
      await this.query('SELECT 1');
      const contagens = {};
      for (const aba of ABAS_VALIDAS) {
        try {
          const { rows } = await this.query(`SELECT COUNT(*)::int AS n FROM ${ident(aba)}`);
          contagens[aba] = (rows[0] && rows[0][0]) || 0;
        } catch (e) { contagens[aba] = -1; }
      }
      return { ok: true, backend: 'neon-postgres', contagens };
    } catch (e) {
      return { ok: false, backend: 'neon-postgres', error: e.message };
    }
  }

  _exigirAba(aba) {
    if (!abaValida(aba)) {
      const e = new Error('Aba desconhecida: ' + aba);
      e.status = 400;
      throw e;
    }
  }
}

function gerarUsuario() {
  return 'u-' + Math.random().toString(36).slice(2, 8);
}

/* ════════════════════════════════════════════════════════════════
   MemoryStore — desenvolvimento/testes (sem banco, sem rede)
   ════════════════════════════════════════════════════════════════ */

class MemoryStore {
  constructor(cargaInicial) {
    this._dados = {};
    this._setupFeito = false;
    this._cargaInicial = cargaInicial || null;
    this._cargaCache = null;
  }

  _carga() {
    if (!this._cargaCache) {
      this._cargaCache = this._cargaInicial || require('./seed-data');
    }
    return this._cargaCache;
  }

  async ensureReady(opcoes) {
    const mesclar = !!(opcoes && opcoes.merge);
    if (this._setupFeito && !(opcoes && opcoes.force) && !mesclar) return {};
    const carga = this._carga();
    const resumo = {};
    for (const aba of ABAS_VALIDAS) {
      const atuais = this._dados[aba] || [];
      const registros = carga[aba] || [];
      if (mesclar && atuais.length) {
        const pk = pkDa(aba);
        const chaves = new Set(atuais.map(r => texto(r[pk])));
        let inseridos = 0;
        for (const registro of registros) {
          const chave = texto(registro[pk]);
          if (chaves.has(chave)) continue;
          atuais.push(Object.assign({}, registro));
          chaves.add(chave);
          inseridos++;
        }
        this._dados[aba] = atuais;
        resumo[aba] = { existentes: atuais.length - inseridos, inseridos };
      } else if (!atuais.length) {
        this._dados[aba] = registros.map(r => Object.assign({}, r));
        resumo[aba] = { existentes: 0, inseridos: this._dados[aba].length };
      } else {
        this._dados[aba] = atuais;
        resumo[aba] = { existentes: atuais.length, inseridos: 0 };
      }
    }
    this._setupFeito = true;
    return resumo;
  }

  async list(aba) {
    if (!abaValida(aba)) { const e = new Error('Aba desconhecida: ' + aba); e.status = 400; throw e; }
    await this.ensureReady();
    return (this._dados[aba] || []).map(r => Object.assign({}, r));
  }

  async add(aba, payload) {
    if (!abaValida(aba)) { const e = new Error('Aba desconhecida: ' + aba); e.status = 400; throw e; }
    await this.ensureReady();
    const pk = pkDa(aba);
    const colunas = colunasDa(aba);
    const registro = {};
    colunas.forEach(c => { registro[c] = texto(payload[c]); });
    if (!texto(registro[pk])) registro[pk] = pk === 'usuario' ? gerarUsuario() : gerarId();
    if (colunas.includes('createdAt') && !registro.createdAt) registro.createdAt = agoraISO();
    if (colunas.includes('updatedAt') && !registro.updatedAt) registro.updatedAt = registro.createdAt || agoraISO();
    this._dados[aba].push(registro);
    return { ok: true, id: registro[pk] };
  }

  async update(aba, payload) {
    if (!abaValida(aba)) { const e = new Error('Aba desconhecida: ' + aba); e.status = 400; throw e; }
    await this.ensureReady();
    const pk = pkDa(aba);
    const chave = texto(payload[pk]);
    if (!chave) { const e = new Error('id obrigatório para update'); e.status = 400; throw e; }
    const idx = (this._dados[aba] || []).findIndex(r => texto(r[pk]) === chave);
    if (idx === -1) {
      const r = await this.add(aba, Object.assign({}, payload, { [pk]: chave }));
      return { ok: true, id: chave, upserted: true };
    }
    const atual = this._dados[aba][idx];
    Object.keys(payload).forEach(k => {
      if (k !== pk && k !== 'action' && k !== 'aba' && atual.hasOwnProperty(k)) atual[k] = texto(payload[k]);
    });
    if (atual.hasOwnProperty('updatedAt')) atual.updatedAt = agoraISO();
    return { ok: true, id: chave, upserted: false };
  }

  async remove(aba, id) {
    if (!abaValida(aba)) { const e = new Error('Aba desconhecida: ' + aba); e.status = 400; throw e; }
    await this.ensureReady();
    const pk = pkDa(aba);
    const chave = texto(id);
    if (!chave) { const e = new Error('Parâmetro id obrigatório para delete'); e.status = 400; throw e; }
    const antes = this._dados[aba].length;
    this._dados[aba] = this._dados[aba].filter(r => texto(r[pk]) !== chave);
    return { ok: true, removidos: antes - this._dados[aba].length, id: chave };
  }

  async health() {
    await this.ensureReady();
    const contagens = {};
    for (const aba of ABAS_VALIDAS) contagens[aba] = (this._dados[aba] || []).length;
    return { ok: true, backend: 'memory-dev', contagens };
  }
}

/* ── Fábrica usada pela função na Vercel ── */

let _storeSingleton = null;

/** Store do Neon (singleton por instância fria da função) */
function getNeonStore() {
  if (_storeSingleton) return _storeSingleton;
  const conn = process.env.DATABASE_URL;
  if (!conn) {
    throw new Error('DATABASE_URL não configurada (defina na Vercel: Settings → Environment Variables)');
  }
  // require tardio: dev/testes não precisam do driver
  const { neon } = require('@neondatabase/serverless');
  // arrayMode: linhas chegam como ARRAYS (mesmo formato que o NeonStore espera)
  const client = neon(conn, { fullResults: true, arrayMode: true });
  const exec = (texto, params) => client.query(texto, params);
  _storeSingleton = new NeonStore(exec);
  return _storeSingleton;
}

module.exports = { NeonStore, MemoryStore, getNeonStore, ident, texto, gerarId };
