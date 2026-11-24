// Testes contra a API oficial do Comex Stat (precisa de rede). Uso: npm run test:ao-vivo
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarApp } from '../src/index.js';
import { criarCliente } from '../src/comexstat.js';

const app = criarApp({ cliente: criarCliente() });
async function chamar(name, args) {
  const r = await app.fetch(new Request('https://transformai.app.br/mcp/comexstat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  }));
  const { result } = await r.json();
  assert.notEqual(result.isError, true, result.content?.[0]?.text);
  return result.structuredContent;
}

test('atualização', async () => {
  const s = await chamar('atualizacao', {});
  assert.match(s.dados_gerais.atualizado_em, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(s.dados_por_municipio.ultimo_mes, /^\d{4}-\d{2}$/);
  console.log('atualização:', JSON.stringify(s.dados_gerais), JSON.stringify(s.dados_por_municipio));
});

test('buscar produto e país', async () => {
  const p = await chamar('buscar_produto', { texto: 'café não torrado' });
  assert.ok(p.ncm.some((n) => n.ncm === '09011110'));
  assert.ok(p.sh4.some((n) => n.sh4 === '0901'));
  const c = await chamar('buscar_pais', { texto: 'China' });
  assert.ok(c.paises.some((x) => x.pais === '160'));
  const b = await chamar('buscar_pais', { texto: 'Mercosul' });
  assert.ok(b.blocos.some((x) => /Mercosul/.test(x.nome)));
});

test('café exportado por MG em 2025, por país', async () => {
  const s = await chamar('consultar_comercio', { fluxo: 'exportacao', de: '2025-01', ate: '2025-12', uf: ['MG'], sh4: ['0901'], detalhar_por: ['pais'] });
  assert.ok(s.total_linhas > 10);
  assert.ok(s.totais.fob_usd > 1e9);
  console.log('café MG 2025: US$', Math.round(s.totais.fob_usd / 1e6), 'milhões;', s.linhas.slice(0, 3).map((l) => `${l.pais} ${Math.round(l.fob_usd / 1e6)}`).join(', '));
});

test('café exportado por município de MG em 2025', async () => {
  const s = await chamar('consultar_municipios', { fluxo: 'exportacao', de: '2025-01', ate: '2025-12', uf: ['MG'], sh4: ['0901'], detalhar_por: ['municipio'] });
  assert.ok(s.linhas.every((l) => /^\d{7}$/.test(l.municipio_ibge ?? '')), 'todas as linhas com código IBGE');
  console.log('municípios:', s.linhas.slice(0, 3).map((l) => `${l.municipio} (${l.municipio_ibge}) ${Math.round(l.fob_usd / 1e6)}`).join(', '));
});

test('município de SP pelo código IBGE (o Comex Stat usa outro prefixo)', async () => {
  const s = await chamar('consultar_municipios', { fluxo: 'exportacao', de: '2025-01', ate: '2025-12', municipio_ibge: ['3550308'], detalhar_por: ['municipio'] });
  assert.equal(s.linhas[0].municipio_ibge, '3550308');
  assert.ok(s.totais.fob_usd > 0);
  assert.match(s.procedencia.traducoes[0].para, /city 3450308/);
  console.log('São Paulo 2025: US$', Math.round(s.totais.fob_usd / 1e6), 'milhões');
});
