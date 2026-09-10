/**
 * Testes do importador de estoque (scripts/import-estoque.js).
 * Nada é gravado em data/ — as gravações vão para um destino temporário.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { interpretar, rodar, paraCSV, chaveDeDuplicata } = require('../scripts/import-estoque');
const { parseCSV } = require('../api/_lib/csv');
const { colunasDa } = require('../api/_lib/schema');

const ROOT = path.resolve(__dirname, '..');
const ORIGEM = path.join(ROOT, 'data', 'importar-2026-09-10.txt');
let passed = 0;
let failed = 0;
function ok(name, condition, message = '') {
  if (condition) { console.log(`✔ ${name}`); passed++; }
  else { console.error(`✖ ${name}${message ? ': ' + message : ''}`); failed++; }
}

/** Extrai o parser CSV real do app.js (o espelho offline usa ele) e o devolve executável. */
function parserDoApp() {
  const src = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const trecho = src.match(/_parseCSVLine\(line\) \{[\s\S]*?\n {2}\},/);
  if (!trecho) throw new Error('_parseCSVLine não encontrado no app.js');
  return new Function(`return {${trecho[0].replace(/,$/, '')}}`)()._parseCSVLine;
}

(function main() {
  /* ── leitura de texto livre ── */
  const tab = interpretar('Cabo flexível 2,5mm\t50\t5\tElétrica\tGaragem');
  ok('tab não quebra nome com vírgula decimal', tab.itens[0].nome === 'Cabo flexível 2,5mm', tab.itens[0].nome);
  ok('tab lê quantidade e mínimo', tab.itens[0].quantidadeAtual === 50 && tab.itens[0].quantidadeMinima === 5);
  ok('tab lê categoria e local', tab.itens[0].categoria === 'Elétrica' && tab.itens[0].local === 'Garagem');

  const barra = interpretar('Registro esfera 3/4 | 12 un | Hidráulica');
  ok('pipe lê nome com fração intacto', barra.itens[0].nome === 'Registro esfera 3/4', barra.itens[0].nome);
  ok('"12 un" vira quantidade + unidade', barra.itens[0].quantidadeAtual === 12 && barra.itens[0].unidade === 'un');

  const livre = interpretar('Cadeado 40mm, 15');
  ok('campo ausente fica nulo (não inventa)', livre.itens[0].quantidadeMinima === null && livre.itens[0].categoria === '');

  /* ── cabeçalho e delimitadores ── */
  const colada = interpretar(['Quantidade\tUnidade\tDescrição', '5\tUN\tLuva 25 mm', 'Quantidade\tUnidade\tDescrição', '2\tUN\tNiple 1/2"'].join('\n'));
  ok('cabeçalho repetido no meio da lista é ignorado', colada.itens.length === 2, `itens=${colada.itens.length}`);
  ok('cabeçalho repetido gera aviso', colada.avisos.some(a => a.includes('cabeçalho repetido')));
  ok('coluna mapeada por cabeçalho', colada.itens[0].nome === 'Luva 25 mm' && colada.itens[0].quantidadeAtual === 5);
  ok('unidade do cabeçalho normalizada para minúscula', colada.itens[0].unidade === 'un');

  const semi = interpretar('Nome;Categoria;Quantidade\nFio 4mm²;Elétrica;120');
  ok('CSV com ponto e vírgula é reconhecido', semi.modo.includes(';') && semi.itens[0].categoria === 'Elétrica');

  const virgula = interpretar('nome,categoria,quantidade\n"Cabo PP 2x2,5mm",Elétrica,25');
  ok('CSV com vírgula respeita aspas do campo', virgula.itens[0].nome === 'Cabo PP 2x2,5mm', virgula.itens[0].nome);

  /* ── mesclagem ── */
  ok('chave de duplicata ignora caixa, acentos e travessão', chaveDeDuplicata('Registro de esfera 50 mm – metal') === chaveDeDuplicata('registro de esfera 50 mm - metal'));
  ok('chave de duplicata não confunde "50 mm" com "50mm" (sem merge automático de variantes)', chaveDeDuplicata('Luva 25 mm marrom') !== chaveDeDuplicata('Luva 25mm'));

  // Cenário isolado: estoque de partida com 1 item que colide com a lista (qtd 1).
  const alvo = path.join(os.tmpdir(), `estoque-teste-${process.pid}-${Date.now()}.csv`);
  fs.writeFileSync(alvo, 'id,nome,categoria,quantidadeAtual,quantidadeMinima,unidade,local,data,createdAt,updatedAt\n' +
    'ea3ce453-900d-4046-a,Registro de gaveta 80 mm – metal,Hidráulica,1,10,un,,2026-07-24,2026-07-24,2026-07-24\n', 'utf8');

  try {
    const antes = parseCSV(fs.readFileSync(alvo, 'utf8')).length;
    const res = rodar(fs.readFileSync(ORIGEM, 'utf8'), { destino: alvo, duplicados: 'somar', minPadrao: '', gravar: true });

    ok('lista de 2026-09-10 é reconhecida como csv com tab', res.modo.includes('tab'));
    ok('86 linhas lidas da lista', res.lidos === 86, `lidos=${res.lidos}`);
    ok('item já existente é somado, não duplicado', res.atualizados.length === 1 && res.atualizados[0].depois === 2, JSON.stringify(res.atualizados));
    ok('id do item existente é preservado', res.registros.find(r => r.nome === 'Registro de gaveta 80 mm – metal').id === 'ea3ce453-900d-4046-a');
    ok('duplicadas da lista somadas em 83 itens novos', res.criados.length === 83, `criados=${res.criados.length}`);
    ok('"Registro de esfera 50 mm – metal" somado (3+6=9)', res.criados.find(r => r.nome === 'Registro de esfera 50 mm – metal').quantidadeAtual === '9');
    ok('"Cotovelo 22 mm branco" somado (1+1=2)', res.criados.find(r => r.nome === 'Cotovelo 22 mm branco').quantidadeAtual === '2');
    ok('soma dos 83 criados é 998 (999 menos o item já existente)', res.criados.reduce((s, r) => s + Number(r.quantidadeAtual), 0) === 998);
    ok('soma final do estoque é 1000 (1 anterior + 999 importados)', res.registros.reduce((s, r) => s + Number(r.quantidadeAtual), 0) === 1000);
    ok('nenhum item foi descartado', res.pulados.length === 0);
    ok('estoque cresce de 1 para 84', antes === 1 && res.noEstoqueDepois === 84, `${antes} → ${res.noEstoqueDepois}`);
    ok('itens sem categoria/local/mínimo permanecem vazios', res.criados.every(r => r.categoria === '' && r.local === '' && r.quantidadeMinima === ''));
    ok('unidades PCT/ROLOS/TUBOS preservadas', ['pct', 'rolos', 'tubos'].every(u => res.criados.some(r => r.unidade === u)));
    ok('ids novos seguem o padrão do frontend', res.criados.every(r => /^id_[a-z0-9]+_\d+$/.test(r.id)));

    // Importar a mesma lista de novo soma outra vez (comportamento documentado).
    const deNovo = rodar(fs.readFileSync(ORIGEM, 'utf8'), { destino: alvo, duplicados: 'somar', minPadrao: '', gravar: false });
    ok('reimportar soma de novo (não é idempotente)', deNovo.criados.length === 0 && deNovo.atualizados.length === 84, `criados=${deNovo.criados.length}`);

    /* ── round-trip do arquivo gravado, pelos dois parsers do projeto ── */
    const texto = fs.readFileSync(alvo, 'utf8');
    const viaApi = parseCSV(texto);
    const linhas = texto.replace(/\r\n?/g, '\n').trim().split('\n');
    const fnApp = parserDoApp();
    const cabecalho = fnApp(linhas[0]);
    const viaApp = linhas.slice(1).map(l => {
      const v = fnApp(l);
      const o = {};
      cabecalho.forEach((h, i) => { o[h] = v[i] || ''; });
      return o;
    });

    ok('parser da API e parser do app.js contam o mesmo', viaApi.length === 84 && viaApp.length === 84, `${viaApi.length}/${viaApp.length}`);
    ok('os dois parsers divergem em 0 campos', viaApi.every((r, i) => colunasDa('estoque').every(c => r[c] === viaApp[i][c])));
    ok('aspas de polegada sobrevivem ao escape RFC4180', viaApp.some(r => r.nome === 'Cotovelo 22 mm x 1/2" com rosca branco'));
    ok('20 itens com aspas de polegada', viaApi.filter(r => r.nome.includes('"')).length === 20);
    ok('CSV gerado mantém a ordem de colunas do schema', linhas[0] === colunasDa('estoque').join(','));
    ok('paraCSV escapa aspas internas', paraCSV([{ id: 'x', nome: 'Luva 1/2"' }]).includes('"Luva 1/2"""'));
  } finally {
    fs.rmSync(alvo, { force: true });
  }

  /* ── estado real do repositório (sem números fixos: tudo derivado dos arquivos) ── */
  const real = parseCSV(fs.readFileSync(path.join(ROOT, 'data', 'estoque.csv'), 'utf8'));
  const antigos = real.filter(r => !/^id_/.test(r.id));
  const importados = real.filter(r => /^id_[a-z0-9]+_\d+$/.test(r.id) && r.data === '2026-09-10');
  // Tamanho esperado do lote derivado da própria fonte: re-simula a importação
  // sobre um estoque vazio (sem gravar) e conta quantos nomes únicos a lista gera.
  const simulado = rodar(fs.readFileSync(ORIGEM, 'utf8'), {
    destino: path.join(os.tmpdir(), `estoque-vazio-${process.pid}-${Date.now()}.csv`),
    duplicados: 'somar', minPadrao: '', gravar: false,
  });
  const loteEsperado = simulado.criados.length;
  ok('lote importado está completo (derivado da fonte)', importados.length === loteEsperado, `${importados.length}/${loteEsperado}`);
  ok('data/estoque.csv = antigos + lote importado', real.length === antigos.length + importados.length, `itens=${real.length} antigos=${antigos.length} importados=${importados.length}`);
  ok('ids únicos em data/estoque.csv', new Set(real.map(r => r.id)).size === real.length);
  const seedData = require('../api/_lib/seed-data');
  ok('seed regenerado acompanha o estoque', seedData.estoque.length === real.length && seedData.estoque.some(r => r.nome === 'Registro de gaveta 80 mm – metal'), `seed=${seedData.estoque.length} csv=${real.length}`);

  // Regressão da limpeza de 2026-09-10: as 24 duplicatas removidas não voltam
  // ao CSV nem ao seed (senão um futuro /api/setup?migrate=1 as re-insere online).
  // Inclui eadb5aa2 (linha obsoleta "Disjuntor 10A"): o registro online divergiu
  // ("Disjuntor unipolar 10A", qtd 30) e foi mantido por decisão — o seed não
  // deve carregar sombra obsoleta dele, e o migrate só insere chaves ausentes.
  const DUPLICATAS_REMOVIDAS = [
    '0d26f7f8-8ffb-4922-bf07-a7075d79868f', '434573aa-6669-477e-9a71-d16536a24f61',
    'bbdfec97-fc09-4525-8e57-855be71659b1', '096a9b33-a67b-42af-82f5-42ae45e38920',
    'e35f293b-b34c-45e5-b9f0-613b81aa5663', '09ec42d3-91e9-4076-93be-57594c9e80e4',
    '8210a6ca-244f-4edd-9683-9b734518cf1f', '3f205877-3d91-43ae-b263-93273d4bb395',
    'e1fc6d9c-0418-4490-9232-c196f888568c', '3a353ec2-f157-420e-a2ba-fb6f16bd6e7b',
    'bd398ad7-0a17-4953-a4e2-99aad1298e44', 'ff7946da-215d-42d1-ad48-d85b7db059a2',
    'd042a1d1-b2f1-4e69-9dfa-d383074105f4', '4552dffe-a9f7-4a31-a',
    'eadb5aa2-e22a-42a5-a', '11a090e7-13e7-4621-b1b3-0afcb37407e5',
    '988d47ab-d75e-40fa-8112-d1fd079041b8', '62780823-4a26-4951-be80-f76e321db78c',
    '1be252a7-7804-438c-9240-403cdf3e83fe', '1c3f9c89-b7f7-4be8-9326-de8222097efe',
    'db1af47f-1993-48fe-9231-7c8b7ed72f80', '508bbee4-aa10-4705-9396-3d51d1c6515c',
    '4ced635a-0403-47be-ab86-6f3eeef2c3ca', 'b832e72f-52a7-4092-b261-f7fd86130e0b',
  ];
  ok('24 duplicatas removidas não estão no CSV', DUPLICATAS_REMOVIDAS.every(id => !real.some(r => r.id === id)));
  ok('24 duplicatas removidas não estão no seed', DUPLICATAS_REMOVIDAS.every(id => !seedData.estoque.some(r => r.id === id)));

  ok('itens importados estão categorizados', importados.every(r => r.categoria), `sem categoria=${importados.filter(r => !r.categoria).length}`);
  ok('82 itens classificados como Hidráulica', importados.filter(r => r.categoria === 'Hidráulica').length === 82);
  ok('2 itens classificados como Construção (prego e arame)', importados.filter(r => r.categoria === 'Construção').map(r => r.nome).sort().join('|') === 'Arame recozido – 2 kg|Prego 18 x 24');
  ok('itens antigos sem categoria não foram alterados', real.filter(r => !r.categoria).length === 3);

  console.log(`\n${passed} passed, ${failed} failed — total ${passed + failed}`);
  process.exit(failed ? 1 : 0);
})()
