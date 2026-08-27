/**
 * Code.gs — Backend Google Apps Script para Ferramentas & Estoque
 * ================================================================
 * Versão: 2.5.1 — Integração real com o backend Apps Script
 * Complexo Penal de Marília — Polícia Penal
 *
 * Este script deve ser vinculado a uma planilha Google com 8 abas:
 *   estoque, ferramentas, movimentacoes, emprestimos, fornecedores,
 *   pedidos, usuarios, historico
 *
 * Contrato com o frontend (config.js):
 *   - Leitura:  GET ?aba=estoque  → retorna JSON array de objetos
 *   - Criar:    POST {action:"add", id, ...campos}
 *   - Atualizar:POST {action:"update", id, ...campos}
 *   - Excluir:  GET ?aba=X&action=delete&id=...
 *
 * O frontend envia POST com Content-Type: text/plain para evitar
 * preflight CORS (o Apps Script não responde OPTIONS). Por isso lemos
 * via e.postData.contents.
 *
 * Segurança & concorrência:
 *   - LockService.getScriptLock() em toda escrita
 *   - Respostas sempre via ContentService + JSON.stringify({success:true})
 */

// ── Configuração das abas e colunas esperadas (para criação automática) ──
var ABAS_ESPERADAS = [
  'estoque',
  'ferramentas',
  'movimentacoes',
  'emprestimos',
  'fornecedores',
  'pedidos',
  'usuarios',
  'historico'
];

var HEADERS_PADRAO = {
  estoque:       ['id','nome','categoria','quantidadeAtual','quantidadeMinima','unidade','local','data','createdAt','updatedAt'],
  ferramentas:   ['id','nome','codigo','categoria','descricao','estado','local','responsavel','createdAt','updatedAt'],
  movimentacoes: ['id','data','tipo','item','quantidade','local','usuario','observacao'],
  emprestimos:   ['id','ferramentaId','nomeFerramenta','responsavel','setor','local','quantidade','status','dataEmprestimo','previsaoDevolucao','dataDevolucao','motivo','createdAt','updatedAt'],
  fornecedores:  ['id','nome','cnpj','telefone','email','contato','categoria','endereco','status'],
  pedidos:       ['id','data','fornecedor','item','quantidade','unidade','valorUnitario','valorTotal','status','previsaoEntrega','observacao'],
  usuarios:      ['usuario','senha','nivel','nome','id','createdAt','updatedAt'],
  historico:     ['id','acao','item','detalhes','responsavel','data','createdAt','updatedAt']
};

// ── Util: resposta JSON com CORS ──
function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ── Util: pega planilha ativa ──
function getSpreadsheet_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

// ── Util: pega ou cria aba ──
function getSheet_(aba) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(aba);
  if (!sheet) {
    sheet = ss.insertSheet(aba);
    var headers = HEADERS_PADRAO[aba] || ['id'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sheet;
}

// ── Util: lê headers da primeira linha ──
function getHeaders_(sheet) {
  var lastCol = sheet.getLastColumn();
  if (lastCol === 0) return [];
  var values = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  return values.map(function(h){ return String(h).trim(); }).filter(function(h){ return h; });
}

// ── Util: garante que headers contenham todas as chaves do objeto ──
function ensureHeaders_(sheet, obj) {
  var headers = getHeaders_(sheet);
  if (headers.length === 0) {
    headers = HEADERS_PADRAO[sheet.getName()] || Object.keys(obj);
    if (headers.length) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return headers;
  }
  var newHeaders = [];
  Object.keys(obj).forEach(function(k){
    if (k === 'action') return;
    if (headers.indexOf(k) === -1) newHeaders.push(k);
  });
  if (newHeaders.length) {
    var lastCol = sheet.getLastColumn();
    sheet.getRange(1, lastCol + 1, 1, newHeaders.length).setValues([newHeaders]);
    headers = headers.concat(newHeaders);
  }
  return headers;
}

// ── Util: converte linhas em objetos ──
function sheetToObjects_(sheet) {
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol === 0) return [];
  var headers = getHeaders_(sheet);
  if (!headers.length) return [];
  var data = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  var result = [];
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    // pula linha totalmente vazia
    var empty = true;
    for (var c = 0; c < row.length; c++) { if (String(row[c]).trim() !== '') { empty = false; break; } }
    if (empty) continue;
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      obj[headers[j]] = row[j] === '' ? '' : row[j];
      // Normaliza datas ISO? Mantém como string para o frontend decidir
      if (obj[headers[j]] instanceof Date) {
        obj[headers[j]] = Utilities.formatDate(obj[headers[j]], Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss'Z'");
      }
    }
    result.push(obj);
  }
  return result;
}

// ── Util: encontra linha pelo id (coluna 'id' ou 'usuario') ──
function findRowIndexById_(sheet, id) {
  var headers = getHeaders_(sheet);
  var idColIdx = headers.indexOf('id');
  if (idColIdx === -1) idColIdx = headers.indexOf('usuario'); // usuarios pode usar usuario como id
  if (idColIdx === -1) idColIdx = 0; // fallback primeira coluna
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var colValues = sheet.getRange(2, idColIdx + 1, lastRow - 1, 1).getValues();
  var target = String(id).trim();
  for (var i = 0; i < colValues.length; i++) {
    if (String(colValues[i][0]).trim() === target) {
      return i + 2; // 1-based + header
    }
  }
  return -1;
}

// ── GET: leitura ou delete via querystring ──
function doGet(e) {
  try {
    var params = (e && e.parameter) || {};
    var aba = params.aba;
    var action = params.action;

    if (!aba) {
      return jsonResponse_({ success: false, error: 'Parâmetro ?aba obrigatório', abas: ABAS_ESPERADAS });
    }
    if (ABAS_ESPERADAS.indexOf(aba) === -1) {
      // Permite abas extras, mas avisa
      // return jsonResponse_({success:false, error:'Aba desconhecida: '+aba});
    }

    var sheet = getSheet_(aba);

    // DELETE via GET ?aba=X&action=delete&id=...
    if (action === 'delete') {
      var id = params.id;
      if (!id) return jsonResponse_({ success: false, error: 'Parâmetro id obrigatório para delete' });
      var lock = LockService.getScriptLock();
      try {
        lock.tryLock(10000);
        var rowIdx = findRowIndexById_(sheet, id);
        if (rowIdx === -1) {
          return jsonResponse_({ success: false, error: 'Registro não encontrado: ' + id });
        }
        sheet.deleteRow(rowIdx);
        return jsonResponse_({ success: true, message: 'Removido', id: id });
      } finally {
        try { lock.releaseLock(); } catch(err){}
      }
    }

    // Leitura padrão
    var data = sheetToObjects_(sheet);
    return jsonResponse_(data);

  } catch (err) {
    return jsonResponse_({ success: false, error: err && err.message ? err.message : String(err) });
  }
}

// ── POST: add / update ──
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.tryLock(15000);

    var raw = '';
    if (e && e.postData && e.postData.contents) {
      raw = e.postData.contents;
    } else if (e && e.parameter) {
      // Fallback se enviado como form
      raw = JSON.stringify(e.parameter);
    }

    if (!raw) {
      return jsonResponse_({ success: false, error: 'Corpo vazio' });
    }

    var payload;
    try {
      payload = JSON.parse(raw);
    } catch (parseErr) {
      return jsonResponse_({ success: false, error: 'JSON inválido: ' + parseErr.message, raw: raw.substring(0, 500) });
    }

    var action = payload.action;
    var aba = payload.aba;

    // O frontend envia a aba via URL base? Ex: https://.../exec?aba=estoque
    // Se não vier no corpo, tenta extrair do e.parameter ou da URL
    if (!aba && e && e.parameter && e.parameter.aba) aba = e.parameter.aba;
    // Também suporta inferir pela URL? O Apps Script não passa query no POST por padrão,
    // então o frontend deve incluir aba no payload ou manter ?aba na URL do POST.
    // Para compatibilidade, se ainda não tiver aba, tenta deduzir do payload original
    // ou exige que o frontend envie para ?aba=...
    if (!aba) {
      // Tenta extrair de e.queryString se disponível (alguns runtimes)
      // Caso não, exige aba
      return jsonResponse_({ success: false, error: 'Parâmetro aba obrigatório (envie na URL ?aba=X ou no corpo {aba:X})' });
    }

    var sheet = getSheet_(aba);
    var headers = ensureHeaders_(sheet, payload);

    if (action === 'add' || !action) {
      // Garante id
      if (!payload.id && !payload.usuario) {
        payload.id = Utilities.getUuid();
      }
      if (!payload.createdAt) payload.createdAt = new Date().toISOString();
      if (!payload.updatedAt) payload.updatedAt = new Date().toISOString();

      // Monta linha na ordem dos headers
      var row = headers.map(function(h){ return payload.hasOwnProperty(h) ? payload[h] : ''; });
      sheet.appendRow(row);
      return jsonResponse_({ success: true, message: 'Adicionado', id: payload.id || payload.usuario, aba: aba });
    }

    if (action === 'update') {
      var id = payload.id || payload.usuario;
      if (!id) return jsonResponse_({ success: false, error: 'id obrigatório para update' });
      var rowIdx = findRowIndexById_(sheet, id);
      if (rowIdx === -1) {
        // Se não encontrou, faz add como fallback (upsert)
        if (!payload.createdAt) payload.createdAt = new Date().toISOString();
        payload.updatedAt = new Date().toISOString();
        var row2 = headers.map(function(h){ return payload.hasOwnProperty(h) ? payload[h] : ''; });
        sheet.appendRow(row2);
        return jsonResponse_({ success: true, message: 'Criado via update (upsert)', id: id, aba: aba });
      }
      // Atualiza: lê linha existente, mescla
      var existingRow = sheet.getRange(rowIdx, 1, 1, headers.length).getValues()[0];
      var existingObj = {};
      for (var i = 0; i < headers.length; i++) existingObj[headers[i]] = existingRow[i];
      // Mescla payload sobre existente
      Object.keys(payload).forEach(function(k){
        if (k === 'action' || k === 'aba') return;
        if (headers.indexOf(k) !== -1) existingObj[k] = payload[k];
      });
      existingObj.updatedAt = new Date().toISOString();
      // Garante headers atualizados caso payload tenha chaves novas
      headers = ensureHeaders_(sheet, existingObj);
      var updatedRow = headers.map(function(h){ return existingObj.hasOwnProperty(h) ? existingObj[h] : ''; });
      // Se headers cresceram, precisa re-escrever a linha com novo tamanho
      sheet.getRange(rowIdx, 1, 1, updatedRow.length).setValues([updatedRow]);
      return jsonResponse_({ success: true, message: 'Atualizado', id: id, aba: aba });
    }

    return jsonResponse_({ success: false, error: 'Action desconhecida: ' + action });

  } catch (err) {
    return jsonResponse_({ success: false, error: err && err.message ? err.message : String(err), stack: err && err.stack ? err.stack.substring(0, 1000) : '' });
  } finally {
    try { lock.releaseLock(); } catch(err2){}
  }
}

// ── Função auxiliar para inicializar planilha (rodar manualmente uma vez) ──
function setup_() {
  var ss = getSpreadsheet_();
  ABAS_ESPERADAS.forEach(function(aba){
    var sheet = ss.getSheetByName(aba);
    if (!sheet) {
      sheet = ss.insertSheet(aba);
    }
    var headers = getHeaders_(sheet);
    if (headers.length === 0) {
      var def = HEADERS_PADRAO[aba] || ['id'];
      sheet.getRange(1, 1, 1, def.length).setValues([def]);
    }
  });
  return 'Setup concluído: ' + ABAS_ESPERADAS.join(', ');
}

// ── Teste interno (pode rodar no editor do Apps Script) ──
function testRead_() {
  var aba = 'estoque';
  var sheet = getSheet_(aba);
  var data = sheetToObjects_(sheet);
  Logger.log(JSON.stringify(data).substring(0, 1000));
  return data;
}
