/**
 * api/_lib/csv.js — Parser CSV com suporte a aspas/vírgulas embutidas
 * ==================================================================
 * Parser compatível com RFC 4180 (mesma semântica que o frontend usa em
 * app.js::_parseCSV, mas com tratamento correto de campos entre aspas).
 */

'use strict';

/** Parsea UMA linha CSV respeitando aspas duplas e separador vírgula */
function parseCSVLine(linha) {
  const out = [];
  let cur = '';
  let emAspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (emAspas) {
      if (c === '"') {
        if (linha[i + 1] === '"') { cur += '"'; i++; }
        else emAspas = false;
      } else cur += c;
    } else if (c === '"') {
      emAspas = true;
    } else if (c === ',') {
      out.push(cur); cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out.map(v => v.trim());
}

/** Parsea um CSV completo (header + linhas) → array de objetos */
function parseCSV(texto) {
  const linhas = String(texto || '').replace(/\r\n?/g, '\n').split('\n');
  // Junta linhas "quebradas" dentro de aspas (campo multilinha)
  const fisicas = [];
  let buffer = null;
  for (const l of linhas) {
    const aspas = (l.match(/"/g) || []).length;
    if (buffer === null) buffer = l;
    else buffer += '\n' + l;
    if (aspas % 2 === 0) { fisicas.push(buffer); buffer = null; }
  }
  if (buffer !== null && buffer.trim()) fisicas.push(buffer);

  if (!fisicas.length || !fisicas[0].trim()) return [];
  const headers = parseCSVLine(fisicas[0]).filter(h => h !== '');
  const resultado = [];
  for (let i = 1; i < fisicas.length; i++) {
    if (!fisicas[i].trim()) continue;
    const valores = parseCSVLine(fisicas[i]);
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = valores[idx] !== undefined ? valores[idx] : ''; });
    resultado.push(obj);
  }
  return resultado;
}

module.exports = { parseCSV, parseCSVLine };
