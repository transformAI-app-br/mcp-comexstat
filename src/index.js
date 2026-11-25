// Worker do MCP e da API do Comex Stat: comexstat @ transformAI.app.br.
//   /mcp/comexstat           servidor MCP (Streamable HTTP, sem estado)
//   /api/v1/comexstat/...    API REST com as mesmas ferramentas (OpenAPI em /api/v1/comexstat/openapi.json)
import { criarCliente } from './comexstat.js';
import { tratarMcp } from './mcp.js';
import { tratarRest } from './rest.js';

export function criarApp(deps = {}) {
  return {
    async fetch(req) {
      const url = new URL(req.url);
      const cliente = deps.cliente ?? criarCliente({ cache: typeof caches !== 'undefined' ? caches.default : null });
      const contexto = { cliente };
      if (url.pathname === '/mcp/comexstat' || url.pathname === '/mcp/comexstat/') return tratarMcp(req, contexto);
      if (url.pathname.startsWith('/api/v1/comexstat')) return tratarRest(req, contexto);
      return new Response('Não encontrado', { status: 404 });
    },
  };
}

export default criarApp();
