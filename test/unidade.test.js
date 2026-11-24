// Testes sem rede: o cliente do Comex Stat é falso. Uso: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarApp } from '../src/index.js';
import { municipioComexParaIbge, municipioIbgeParaComex, ufParaComex } from '../src/codigos.js';

function clienteFalso() {
  const chamadas = [];
  return {
    chamadas,
    async obter(caminho, { corpo = null } = {}) {
      chamadas.push({ caminho, corpo });
      if (caminho.includes('/dates/updated')) return { success: true, data: { updated: '2026-11-06', year: '2026', monthNumber: '10' } };
      if (caminho.startsWith('/tables/cities')) return { success: true, data: [{ id: '3170701', text: 'Varginha - MG' }, { id: '3450308', text: 'São Paulo - SP' }] };
      if (caminho.startsWith('/general')) return { success: true, data: { list: [
        { year: '2025', country: 'Estados Unidos', metricFOB: '150', metricKG: '10' },
        { year: '2025', country: 'Alemanha', metricFOB: '300', metricKG: '20' },
      ] } };
      if (caminho.startsWith('/cities')) return { success: true, data: { list: [
        { year: '2025', noMunMinsgUf: 'São Paulo - SP', metricFOB: '5', metricKG: '1' },
        { year: '2025', noMunMinsgUf: 'Varginha - MG', metricFOB: '9', metricKG: '2' },
      ] } };
      throw new Error(`caminho inesperado: ${caminho}`);
    },
  };
}

async function rpc(app, mensagem, cabecalhos = {}) {
  const r = await app.fetch(new Request('https://transformai.app.br/mcp/comexstat', {
    method: 'POST', body: JSON.stringify(mensagem), headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...cabecalhos },
  }));
  return { status: r.status, corpo: r.status === 202 ? null : await r.json() };
}

test('códigos: UF e município do IBGE para o Comex Stat e de volta', () => {
  assert.equal(ufParaComex('MG'), '33');
  assert.equal(ufParaComex('sp'), '41');
  assert.equal(ufParaComex('AC'), '12');
  assert.equal(municipioIbgeParaComex('3550308'), '3450308'); // São Paulo
  assert.equal(municipioIbgeParaComex('5208707'), '5308707'); // Goiânia
  assert.equal(municipioIbgeParaComex('5300108'), '5400108'); // Brasília
  assert.equal(municipioIbgeParaComex('3170701'), '3170701'); // Varginha (MG não muda)
  assert.equal(municipioComexParaIbge('3450308'), '3550308');
  assert.equal(municipioComexParaIbge('5308707'), '5208707');
  assert.equal(municipioComexParaIbge('5400108'), '5300108');
});

test('MCP: initialize negocia a versão e lista as cinco ferramentas', async () => {
  const app = criarApp({ cliente: clienteFalso() });
  const ini = await rpc(app, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
  assert.equal(ini.corpo.result.protocolVersion, '2025-06-18');
  assert.equal(ini.corpo.result.serverInfo.name, 'transformai-comexstat');
  assert.ok(ini.corpo.result.capabilities.tools);
  const desconhecida = await rpc(app, { jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } });
  assert.equal(desconhecida.corpo.result.protocolVersion, '2025-11-25');
  assert.equal((await rpc(app, { jsonrpc: '2.0', method: 'notifications/initialized' })).status, 202);
  const lista = await rpc(app, { jsonrpc: '2.0', id: 3, method: 'tools/list' });
  assert.deepEqual(lista.corpo.result.tools.map((t) => t.name), ['atualizacao', 'buscar_produto', 'buscar_pais', 'consultar_comercio', 'consultar_municipios']);
  assert.equal((await rpc(app, { jsonrpc: '2.0', id: 4, method: 'resources/list' })).corpo.error.code, -32601);
});

test('consultar_comercio: traduz UF, manda SH4 como texto e devolve procedência', async () => {
  const cliente = clienteFalso();
  const app = criarApp({ cliente });
  const r = await rpc(app, { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'consultar_comercio', arguments: { fluxo: 'exportacao', de: '2025-01', ate: '2025-12', uf: ['MG'], sh4: ['0901'], detalhar_por: ['pais'] } } });
  const res = r.corpo.result;
  assert.notEqual(res.isError, true);
  const enviado = cliente.chamadas.find((c) => c.caminho.startsWith('/general?')).corpo;
  assert.deepEqual(enviado, { flow: 'export', monthDetail: false, period: { from: '2025-01', to: '2025-12' }, filters: [{ filter: 'heading', values: ['0901'] }, { filter: 'state', values: ['33'] }], details: ['country'], metrics: ['metricFOB', 'metricKG'] });
  const s = res.structuredContent;
  assert.equal(s.linhas[0].pais, 'Alemanha', 'ordenado por FOB');
  assert.equal(s.linhas[0].fob_usd, 300);
  assert.equal(s.totais.fob_usd, 450);
  assert.equal(s.procedencia.dados_atualizados_em, '2026-11-06');
  assert.equal(s.procedencia.ultimo_mes_disponivel, '2026-10');
  assert.deepEqual(s.procedencia.consulta.corpo, enviado);
  assert.match(s.procedencia.traducoes[0].para, /state 33/);
  assert.equal(JSON.parse(res.content[0].text).totais.fob_usd, 450);
});

test('consultar_municipios: traduz município e devolve o código IBGE de cada linha', async () => {
  const cliente = clienteFalso();
  const app = criarApp({ cliente });
  const r = await rpc(app, { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'consultar_municipios', arguments: { fluxo: 'exportacao', de: '2025-01', ate: '2025-12', municipio_ibge: ['3550308', '3170701'], detalhar_por: ['municipio'] } } });
  const s = r.corpo.result.structuredContent;
  const enviado = cliente.chamadas.find((c) => c.caminho.startsWith('/cities?')).corpo;
  assert.deepEqual(enviado.filters, [{ filter: 'city', values: ['3450308', '3170701'] }]);
  assert.deepEqual(s.linhas.map((l) => [l.municipio, l.municipio_ibge]), [['Varginha - MG', '3170701'], ['São Paulo - SP', '3550308']]);
  assert.equal(s.procedencia.traducoes.length, 1, 'só São Paulo muda de código');
  assert.match(s.procedencia.observacoes[0], /declarante/);
});

test('entrada inválida vira isError, sem chamar a fonte', async () => {
  const cliente = clienteFalso();
  const app = criarApp({ cliente });
  const casos = [
    [{ fluxo: 'exportacao', de: '2025-01', ate: '2025-12', sh4: ['901'] }, /formato inválido/],
    [{ fluxo: 'exportacao', de: '2025-12', ate: '2025-01' }, /depois do final/],
    [{ fluxo: 'exportacao', de: '2025-01', ate: '2025-12', metricas: ['cif'] }, /só existe na importação/],
    [{ fluxo: 'exportacao', de: '2025-01', ate: '2025-12', uf: ['XX'] }, /UF desconhecida/],
    [{ fluxo: 'exportacao', de: '2025-01', ate: '2025-12', estado: 'MG' }, /Campo desconhecido/],
    [{ fluxo: 'exportacao', de: '1990-01', ate: '1995-12' }, /formato inválido/],
  ];
  for (const [args, esperado] of casos) {
    const r = await rpc(app, { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'consultar_comercio', arguments: args } });
    assert.equal(r.corpo.result.isError, true, JSON.stringify(args));
    assert.match(r.corpo.result.content[0].text, esperado);
  }
  assert.equal(cliente.chamadas.length, 0);
});

test('HTTP: GET de navegador vai para a documentação, GET de cliente recebe 405, CORS no OPTIONS', async () => {
  const app = criarApp({ cliente: clienteFalso() });
  const nav = await app.fetch(new Request('https://transformai.app.br/mcp/comexstat', { headers: { Accept: 'text/html' } }));
  assert.equal(nav.status, 302);
  const sse = await app.fetch(new Request('https://transformai.app.br/mcp/comexstat', { headers: { Accept: 'text/event-stream' } }));
  assert.equal(sse.status, 405);
  const pre = await app.fetch(new Request('https://transformai.app.br/mcp/comexstat', { method: 'OPTIONS' }));
  assert.equal(pre.headers.get('Access-Control-Allow-Origin'), '*');
});

test('REST: mesma ferramenta, OpenAPI servido e erros com status', async () => {
  const app = criarApp({ cliente: clienteFalso() });
  const ok = await app.fetch(new Request('https://transformai.app.br/api/v1/comexstat/comercio', { method: 'POST', body: JSON.stringify({ fluxo: 'exportacao', de: '2025-01', ate: '2025-12' }) }));
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).totais.fob_usd, 450);
  const spec = await app.fetch(new Request('https://transformai.app.br/api/v1/comexstat/openapi.json'));
  assert.equal((await spec.json()).openapi, '3.1.0');
  const ruim = await app.fetch(new Request('https://transformai.app.br/api/v1/comexstat/comercio', { method: 'POST', body: JSON.stringify({ fluxo: 'x' }) }));
  assert.equal(ruim.status, 400);
  const at = await app.fetch(new Request('https://transformai.app.br/api/v1/comexstat/atualizacao'));
  assert.equal((await at.json()).dados_gerais.ultimo_mes, '2026-10');
  assert.equal((await app.fetch(new Request('https://transformai.app.br/api/v1/comexstat/nada'))).status, 404);
});
