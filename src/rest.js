// API REST com as mesmas ferramentas do MCP, descrita em OpenAPI 3.1 (openapi.json, servido em /api/v1/comexstat/openapi.json).
import openapi from '../openapi.json' with { type: 'json' };
import { executar } from './ferramentas.js';
import { CORS } from './mcp.js';

const BASE = '/api/v1/comexstat';
const ROTAS = {
  'GET /atualizacao': ['atualizacao', () => ({})],
  'GET /produtos': ['buscar_produto', (url) => ({ texto: url.searchParams.get('texto') ?? undefined })],
  'GET /paises': ['buscar_pais', (url) => ({ texto: url.searchParams.get('texto') ?? undefined })],
  'POST /comercio': ['consultar_comercio', null],
  'POST /municipios': ['consultar_municipios', null],
};

function json(corpo, status = 200, extra = {}) {
  return new Response(JSON.stringify(corpo, null, 2), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS, ...extra } });
}

export async function tratarRest(req, contexto) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url);
  const sub = url.pathname.slice(BASE.length).replace(/\/$/, '') || '/';
  if (req.method === 'GET' && sub === '/openapi.json') return json(openapi, 200, { 'Cache-Control': 'public, max-age=3600' });
  if (req.method === 'GET' && sub === '/') return Response.redirect('https://transformai.app.br/api/#comexstat', 302);

  const rota = ROTAS[`${req.method} ${sub}`];
  if (!rota) return json({ erro: 'Rota não encontrada. Veja /api/v1/comexstat/openapi.json.' }, 404);
  const [ferramenta, deUrl] = rota;

  let args;
  if (deUrl) {
    args = Object.fromEntries(Object.entries(deUrl(url)).filter(([, v]) => v !== undefined));
  } else {
    try {
      args = await req.json();
    } catch {
      return json({ erro: 'Corpo JSON inválido.' }, 400);
    }
  }
  const { resultado, erro, tipo } = await executar(ferramenta, args, contexto);
  if (erro) return json({ erro }, tipo === 'fonte' ? 502 : 400);
  return json(resultado);
}
