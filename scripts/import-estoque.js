/**
 * scripts/import-estoque.js — importa uma lista de itens para data/estoque.csv
 * =============================================================================
 * Aceita texto colado (uma linha por item) ou CSV/TSV com cabeçalho. Formatos
 * suportados em texto livre:
 *
 *   Tomada 20A, Elétrica, 40
 *   Tomada 20A | 40 un | Elétrica
 *   Disjuntor bipolar 40A	35	10	Elétrica	 Almoxarifado
 *
 * Regras aplicadas (definidas com o solicitante em 2026-09-10):
 *   - item que já existe (mesmo nome normalizado) → SOMA a quantidade;
 *   - campo que veio vazio → fica vazio (não inventa categoria/local/mínimo);
 *   - duplicatas dentro do próprio arquivo também são somadas.
 *
 * Uso:
 *   node scripts/import-estoque.js --arquivo data/importar.txt              (prévia)
 *   node scripts/import-estoque.js --arquivo data/importar.txt --gravar     (grava)
 *   cat lista.txt | node scripts/import-estoque.js --gravar                 (stdin)
 *
 * Opções:
 *   --arquivo <caminho>   arquivo de entrada (padrão: data/importar.txt)
 *   --gravar              escreve em data/estoque.csv (sem isso, só mostra a prévia)
 *   --duplicados <modo>   somar | novo | parar   (padrão: somar)
 *   --min-padrao <n>      quantidade mínima para itens sem mínimo (padrão: vazio)
 *   --sem-gen             não regenera api/_lib/seed-data.js após gravar
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { parseCSV, parseCSVLine } = require('../api/_lib/csv');
const { colunasDa } = require('../api/_lib/schema');

const ROOT = path.join(__dirname, '..');
const COLUNAS = colunasDa('estoque');

/** Categorias já usadas no estoque — usadas para reconhecer e padronizar grafia */
const CATEGORIAS_CONHECIDAS = ['Elétrica', 'Hidráulica', 'Construção', 'Automotivo', 'Segurança/Elétrica'];
const UNIDADES_CONHECIDAS = ['un', 'cx', 'kg', 'm', 'm²', 'm2', 'pc', 'pç', 'jg', 'lt', 'l', 'rl', 'mt'];

/** Aliases de cabeçalho aceitos quando a entrada vem em CSV/TSV com título */
const ALIASES = {
  nome: ['nome', 'item', 'produto', 'descrição', 'descricao', 'material'],
  categoria: ['categoria', 'grupo', 'tipo', 'classe'],
  quantidadeAtual: ['quantidadeatual', 'quantidade', 'qtd', 'qtde', 'estoque', 'saldo', 'entrada'],
  quantidadeMinima: ['quantidademinima', 'minimo', 'mínimo', 'min', 'estoqueminimo', 'reposicao', 'reposição'],
  unidade: ['unidade', 'unid', 'um'],
  local: ['local', 'localizacao', 'localização', 'almoxarifado', 'setor'],
};

/* ------------------------------------------------------------------ utilidades */

function normalizarChave(t) {
  return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function limparTexto(t) {
  return String(t === null || t === undefined ? '' : t).replace(/\s+/g, ' ').trim();
}

/** Idêntico ao utils.generateId() do frontend, para manter o mesmo padrão de chave */
function gerarId() {
  return 'id_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
}

function hojeISO() {
  return new Date().toISOString().split('T')[0];
}

function ehNumero(t) {
  const s = limparTexto(t);
  if (!s) return false;
  return /^[+-]?(\d{1,3}(\.\d{3})+|\d+)([.,]\d+)?$/.test(s) || /^[+-]?\d+([.,]\d+)?$/.test(s);
}

function paraNumero(t) {
  const n = parseFloat(limparTexto(t).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function formatoNumero(n) {
  if (n === null || n === undefined || n === '') return '';
  const num = Number(n);
  if (!Number.isFinite(num)) return '';
  return Number.isInteger(num) ? String(num) : String(num);
}

function categoriaCanonica(texto) {
  const alvo = normalizarChave(texto);
  if (!alvo) return '';
  const achou = CATEGORIAS_CONHECIDAS.find(c => normalizarChave(c) === alvo);
  if (achou) return achou;
  // prefixo: "eletrica" bate com "Elétrica"; "seguranca" não casa com nada conhecido
  const porPrefixo = CATEGORIAS_CONHECIDAS.find(c => normalizarChave(c).startsWith(alvo) || alvo.startsWith(normalizarChave(c)));
  return porPrefixo || limparTexto(texto);
}

function ehUnidade(texto) {
  const alvo = normalizarChave(texto);
  return UNIDADES_CONHECIDAS.includes(alvo);
}

/**
 * Separa uma linha em campos. Tab, ; e | são separadores inequívocos e são
 * respeitados primeiro — assim "Cabo 2,5mm\t50" não vira "Cabo 2" + "5mm".
 * Só quando a linha usa vírgula é que o parser RFC4180 (aspas) entra em ação.
 */
function dividirLinha(linha) {
  const bruta = String(linha);
  for (const sep of ['\t', ';', '|']) {
    if (bruta.includes(sep)) return bruta.split(sep).map(s => limparTexto(s));
  }
  return parseCSVLine(bruta).map(limparTexto);
}

/** "12 un", "40un.", "2,5 kg" → { valor, unidade }; senão null */
function parseQuantidadeComUnidade(texto) {
  const m = /^([+-]?[\d.]*\d(?:[.,]\d+)?)\s*([A-Za-z²2]+)\.?$/.exec(limparTexto(texto));
  if (!m) return null;
  if (!ehUnidade(m[2])) return null;
  return { valor: paraNumero(m[1]), unidade: m[2].toLowerCase() };
}

/* -------------------------------------------------------------------- leitura */

function mapearCabecalho(headers) {
  const mapa = {};
  headers.forEach((h, i) => {
    const k = normalizarChave(h);
    for (const campo of Object.keys(ALIASES)) {
      if (ALIASES[campo].includes(k)) { mapa[campo] = i; break; }
    }
  });
  return mapa;
}

/** Reconhece o formato da entrada: CSV com cabeçalho conhecido ou texto livre */
function interpretar(texto) {
  const linhas = String(texto || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'));
  if (!linhas.length) return { itens: [], avisos: ['Arquivo de entrada vazio.'], modo: 'vazio' };

  const SEPARADORES = ['\t', ';', '|', ','];
  const sep = SEPARADORES.find(s => linhas[0].includes(s)) || ',';
  const cabecalho = (sep === ',' ? parseCSVLine(linhas[0]) : linhas[0].split(sep)).map(limparTexto);
  const mapa = mapearCabecalho(cabecalho.map(normalizarChave));
  const comCabecalho = mapa.nome !== undefined;

  const itens = [];
  const avisos = [];

  if (comCabecalho) {
    // vírgula → parser RFC4180 (aspas + campos multilinha); demais → split direto
    const corpo = sep === ','
      ? parseCSV(linhas.join('\n')).map(obj => cabecalho.map(h => obj[h]))
      : linhas.slice(1).map(l => l.split(sep).map(v => limparTexto(v).replace(/^"(.*)"$/, '$1').replace(/""/g, '"')));

    corpo.forEach((valores, i) => {
      const get = (campo) => {
        const idx = mapa[campo];
        return idx === undefined ? '' : limparTexto(valores[idx]);
      };
      // listas coladas costumam repetir o cabeçalho entre blocos — pula essas linhas
      const celulaNome = get('nome');
      if (celulaNome && normalizarChave(celulaNome) === normalizarChave(cabecalho[mapa.nome])) {
        avisos.push(`Linha ${i + 2}: cabeçalho repetido — ignorado.`);
        return;
      }
      const nome = celulaNome;
      if (!nome) { avisos.push(`Linha ${i + 2}: sem nome — ignorada.`); return; }
      itens.push({
        linha: i + 2,
        nome,
        categoria: categoriaCanonica(get('categoria')),
        quantidadeAtual: paraNumero(get('quantidadeAtual')),
        quantidadeMinima: paraNumero(get('quantidadeMinima')),
        unidade: get('unidade').toLowerCase(),
        local: get('local'),
      });
    });
    return { itens, avisos, modo: `csv (${sep === '\t' ? 'tab' : sep})` };
  }

  linhas.forEach((linha, i) => {
    const partes = dividirLinha(linha).filter(p => p !== '');
    if (!partes.length) return;
    const nomePartes = [];
    let categoria = '', unidade = '', local = '';
    const numeros = [];
    for (const p of partes) {
      if (ehNumero(p)) { numeros.push(paraNumero(p)); continue; }
      const comUnidade = parseQuantidadeComUnidade(p);
      if (comUnidade) { numeros.push(comUnidade.valor); unidade = unidade || comUnidade.unidade; continue; }
      if (ehUnidade(p)) { unidade = unidade || p.toLowerCase(); continue; }
      const cat = CATEGORIAS_CONHECIDAS.find(c => normalizarChave(c) === normalizarChave(p));
      if (cat) { categoria = cat; continue; }
      if (!nomePartes.length) nomePartes.push(p);
      else if (!categoria) {
        // segundo bloco de texto depois do nome: tratado como categoria informada
        categoria = limparTexto(p);
      } else local = local ? `${local} ${p}` : p;
    }
    const nome = nomePartes.join(' ');
    if (!nome) { avisos.push(`Linha ${i + 1}: não consegui identificar o nome — ignorada.`); return; }
    if (numeros.length > 2) avisos.push(`Linha ${i + 1} ("${nome}"): ${numeros.length} números na linha — usei os 2 primeiros.`);
    itens.push({
      linha: i + 1,
      nome,
      categoria,
      quantidadeAtual: numeros[0] === undefined ? null : numeros[0],
      quantidadeMinima: numeros[1] === undefined ? null : numeros[1],
      unidade,
      local,
    });
  });
  return { itens, avisos, modo: 'texto livre' };
}

/* ------------------------------------------------------------------- merge */

function chaveDeDuplicata(nome) {
  return normalizarChave(nome).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function mesclar(registros, novos, opcoes) {
  const indice = new Map();
  registros.forEach(r => indice.set(chaveDeDuplicata(r.nome), r));

  const criados = [];
  const atualizados = [];
  const pulados = [];

  for (const item of novos) {
    const chave = chaveDeDuplicata(item.nome);
    const existente = indice.get(chave);

    if (existente) {
      const antes = parseFloat(existente.quantidadeAtual) || 0;
      const recebido = item.quantidadeAtual === null ? 0 : item.quantidadeAtual;
      if (opcoes.duplicados === 'novo') {
        const registro = montarRegistro(item, opcoes);
        registros.push(registro);
        indice.set(chave + ' ' + registro.id, registro);
        criados.push({ ...registro, motivo: 'duplicado mantido separado' });
        continue;
      }
      if (opcoes.duplicados === 'parar') { pulados.push({ nome: item.nome, motivo: `já existe (qtd ${antes})` }); continue; }
      existente.quantidadeAtual = formatoNumero(antes + recebido);
      if (item.quantidadeMinima !== null && !String(existente.quantidadeMinima || '').trim()) {
        existente.quantidadeMinima = formatoNumero(item.quantidadeMinima);
      }
      if (!String(existente.local || '').trim() && item.local) existente.local = item.local;
      if (!String(existente.categoria || '').trim() && item.categoria) existente.categoria = item.categoria;
      existente.updatedAt = hojeISO();
      atualizados.push({ nome: existente.nome, antes, recebido, depois: parseFloat(existente.quantidadeAtual) });
      continue;
    }

    const registro = montarRegistro(item, opcoes);
    registros.push(registro);
    indice.set(chave, registro);
    criados.push(registro);
  }

  return { criados, atualizados, pulados };
}

function montarRegistro(item, opcoes) {
  const data = hojeISO();
  const minimo = item.quantidadeMinima === null ? opcoes.minPadrao : item.quantidadeMinima;
  return {
    id: gerarId(),
    nome: item.nome,
    categoria: item.categoria || '',
    quantidadeAtual: item.quantidadeAtual === null ? '' : formatoNumero(item.quantidadeAtual),
    quantidadeMinima: minimo === '' || minimo === null ? '' : formatoNumero(minimo),
    unidade: item.unidade || '',
    local: item.local || '',
    data,
    createdAt: data,
    updatedAt: data,
  };
}

/* --------------------------------------------------------------- serialização */

function escaparCampo(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function paraCSV(registros) {
  const linhas = [COLUNAS.join(',')];
  for (const r of registros) linhas.push(COLUNAS.map(c => escaparCampo(r[c])).join(','));
  return linhas.join('\n') + '\n';
}

/* --------------------------------------------------------------------- CLI */

function lerOpcoes(argv) {
  const opcoes = {
    arquivo: path.join(ROOT, 'data', 'importar.txt'),
    arquivoExplicito: false,
    gravar: false,
    duplicados: 'somar',
    minPadrao: '',
    gerarSeed: true,
    destino: path.join(ROOT, 'data', 'estoque.csv'),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--arquivo' || a === '-f') { opcoes.arquivo = path.resolve(argv[++i]); opcoes.arquivoExplicito = true; }
    else if (a === '--gravar' || a === '--write') opcoes.gravar = true;
    else if (a === '--duplicados') opcoes.duplicados = String(argv[++i]).toLowerCase();
    else if (a === '--min-padrao') opcoes.minPadrao = argv[++i];
    else if (a === '--sem-gen') opcoes.gerarSeed = false;
    else if (a === '--destino') opcoes.destino = path.resolve(argv[++i]);
    else if (a === '--help' || a === '-h') { opcoes.ajuda = true; }
  }
  return opcoes;
}

function rodar(textoEntrada, opcoes) {
  const atuais = fs.existsSync(opcoes.destino) ? parseCSV(fs.readFileSync(opcoes.destino, 'utf8')) : [];
  const { itens, avisos, modo } = interpretar(textoEntrada);

  // duplicatas dentro do próprio arquivo
  const consolidados = [];
  const dentroDoArquivo = new Map();
  for (const it of itens) {
    const k = chaveDeDuplicata(it.nome);
    if (dentroDoArquivo.has(k)) {
      const alvo = dentroDoArquivo.get(k);
      alvo.quantidadeAtual = (alvo.quantidadeAtual || 0) + (it.quantidadeAtual || 0);
      if (alvo.quantidadeMinima === null && it.quantidadeMinima !== null) alvo.quantidadeMinima = it.quantidadeMinima;
      avisos.push(`Linhas repetidas no arquivo para "${it.nome}" — somadas em um único lançamento.`);
      continue;
    }
    const copia = { ...it };
    dentroDoArquivo.set(k, copia);
    consolidados.push(copia);
  }

  const antes = atuais.length;
  const resultado = mesclar(atuais, consolidados, opcoes);
  const incompletos = resultado.criados.filter(r => !r.categoria || r.quantidadeMinima === '' || !r.local || !r.unidade);

  const conhecidas = new Set(CATEGORIAS_CONHECIDAS.map(normalizarChave));
  const novas = [...new Set(consolidados.map(i => i.categoria).filter(c => c && !conhecidas.has(normalizarChave(c))))];
  if (novas.length) avisos.push(`Categorias novas (não existiam no estoque): ${novas.join(', ')}`);
  const semQuantidade = consolidados.filter(i => i.quantidadeAtual === null).map(i => i.nome);
  if (semQuantidade.length) avisos.push(`Sem quantidade informada (ficou 0): ${semQuantidade.join('; ')}`);

  const resumo = {
    modo,
    avisos,
    lidos: itens.length,
    noEstoqueAntes: antes,
    noEstoqueDepois: atuais.length,
    criados: resultado.criados,
    atualizados: resultado.atualizados,
    pulados: resultado.pulados,
    incompletos,
    registros: atuais,
  };

  if (opcoes.gravar) {
    fs.writeFileSync(opcoes.destino, paraCSV(atuais), 'utf8');
    resumo.gravadoEm = opcoes.destino;
  }
  return resumo;
}

function imprimir(res, opcoes) {
  const L = [];
  L.push(`Formato detectado: ${res.modo} · linhas lidas: ${res.lidos}`);
  L.push(`Estoque: ${res.noEstoqueAntes} → ${res.noEstoqueDepois} itens`);
  L.push('');
  if (res.criados.length) {
    L.push(`NOVOS ITENS (${res.criados.length}):`);
    res.criados.forEach(r => L.push(`  + ${r.nome} | ${r.categoria || '(sem categoria)'} | qtd ${r.quantidadeAtual || 0} ${r.unidade || ''} | mín ${r.quantidadeMinima || '—'} | ${r.local || '(sem local)'}`));
  }
  if (res.atualizados.length) {
    L.push('');
    L.push(`QUANTIDADES SOMADAS (${res.atualizados.length}):`);
    res.atualizados.forEach(a => L.push(`  ~ ${a.nome}: ${a.antes} + ${a.recebido} = ${a.depois}`));
  }
  if (res.pulados.length) {
    L.push('');
    L.push(`NÃO IMPORTADOS (${res.pulados.length}):`);
    res.pulados.forEach(p => L.push(`  ! ${p.nome} — ${p.motivo}`));
  }
  if (res.incompletos.length) {
    L.push('');
    L.push(`ITENS COM CAMPO VAZIO (${res.incompletos.length}) — conforme combinado, nada foi inventado:`);
    res.incompletos.forEach(r => {
      const faltam = [];
      if (!r.categoria) faltam.push('categoria');
      if (r.quantidadeMinima === '') faltam.push('mínimo');
      if (!r.unidade) faltam.push('unidade');
      if (!r.local) faltam.push('local');
      L.push(`  · ${r.nome} → falta: ${faltam.join(', ')}`);
    });
  }
  if (res.avisos.length) {
    L.push('');
    L.push('AVISOS:');
    res.avisos.forEach(a => L.push(`  - ${a}`));
  }
  L.push('');
  L.push(res.gravadoEm ? `✔ Gravado em ${path.relative(ROOT, res.gravadoEm)}` : '⚠ PRÉVIA — nada foi gravado (use --gravar para escrever).');
  process.stdout.write(L.join('\n') + '\n');
}

function main() {
  const opcoes = lerOpcoes(process.argv.slice(2));
  if (opcoes.ajuda) {
    process.stdout.write(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace(/^\/\*\*/, '') + '\n');
    return;
  }
  let texto;
  const usarArquivo = opcoes.arquivoExplicito || fs.existsSync(opcoes.arquivo);
  if (usarArquivo) {
    if (!fs.existsSync(opcoes.arquivo)) {
      process.stderr.write(`Arquivo não encontrado: ${opcoes.arquivo}\n`);
      process.exit(1);
    }
    texto = fs.readFileSync(opcoes.arquivo, 'utf8');
  } else {
    // sem --arquivo e sem data/importar.txt → lê a lista colada no stdin
    texto = fs.readFileSync(0, 'utf8');
    if (!texto.trim()) {
      process.stderr.write('Nada para importar: informe --arquivo <caminho> ou envie a lista pelo stdin.\n');
      process.exit(1);
    }
  }
  const res = rodar(texto, opcoes);
  imprimir(res, opcoes);

  if (opcoes.gravar && opcoes.gerarSeed) {
    const { execFileSync } = require('child_process');
    execFileSync(process.execPath, [path.join(__dirname, 'gen-seed.js')], { stdio: 'inherit' });
  }
}

if (require.main === module) main();

module.exports = { interpretar, mesclar, rodar, paraCSV, chaveDeDuplicata, categoriaCanonica, dividirLinha };
