/**
 * api/_lib/schema.js — Definição das 8 "abas" como tabelas PostgreSQL (Neon)
 * ===========================================================================
 * Paridade 1:1 com o Apps Script (apps-script/Code.gs) e com os CSVs de
 * data/*.csv. Todas as colunas são TEXT para manter o comportamento idêntico
 * ao Sheets/CSV (o frontend já faz as conversões onde precisa).
 *
 * A tabela `usuarios` usa `usuario` como chave primária; as demais usam `id`.
 */

'use strict';

const ABAS = {
  estoque: {
    pk: 'id',
    colunas: ['id', 'nome', 'categoria', 'quantidadeAtual', 'quantidadeMinima', 'unidade', 'local', 'data', 'createdAt', 'updatedAt'],
  },
  ferramentas: {
    pk: 'id',
    colunas: ['id', 'nome', 'codigo', 'categoria', 'descricao', 'estado', 'local', 'responsavel', 'createdAt', 'updatedAt'],
  },
  movimentacoes: {
    pk: 'id',
    colunas: ['id', 'data', 'tipo', 'item', 'quantidade', 'local', 'usuario', 'observacao'],
  },
  emprestimos: {
    pk: 'id',
    colunas: ['id', 'ferramentaId', 'nomeFerramenta', 'responsavel', 'setor', 'local', 'quantidade', 'status', 'dataEmprestimo', 'previsaoDevolucao', 'dataDevolucao', 'motivo', 'createdAt', 'updatedAt'],
  },
  fornecedores: {
    pk: 'id',
    colunas: ['id', 'nome', 'cnpj', 'telefone', 'email', 'contato', 'categoria', 'endereco', 'status'],
  },
  pedidos: {
    pk: 'id',
    colunas: ['id', 'data', 'fornecedor', 'item', 'quantidade', 'unidade', 'valorUnitario', 'valorTotal', 'status', 'previsaoEntrega', 'observacao'],
  },
  usuarios: {
    pk: 'usuario',
    colunas: ['usuario', 'senha', 'nivel', 'nome', 'id', 'createdAt', 'updatedAt'],
  },
  historico: {
    pk: 'id',
    colunas: ['id', 'acao', 'item', 'detalhes', 'responsavel', 'data', 'createdAt', 'updatedAt'],
  },
};

const ABAS_VALIDAS = Object.keys(ABAS);

/** Valida nome de aba (evita SQL injection por nome de tabela) */
function abaValida(aba) {
  return Object.prototype.hasOwnProperty.call(ABAS, String(aba || ''));
}

/** Colunas válidas da aba */
function colunasDa(aba) {
  return abaValida(aba) ? ABAS[aba].colunas.slice() : [];
}

/** Chave primária da aba */
function pkDa(aba) {
  return abaValida(aba) ? ABAS[aba].pk : 'id';
}

module.exports = { ABAS, ABAS_VALIDAS, abaValida, colunasDa, pkDa };
