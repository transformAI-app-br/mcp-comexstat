// Servidor MCP sem estado sobre Streamable HTTP: cada POST traz uma mensagem JSON-RPC e recebe a resposta em JSON.
// Não há sessão nem stream do servidor; por isso GET responde 405, como a especificação permite.
import { definicoes, executar } from './ferramentas.js';

export const VERSOES = ['2025-11-25', '2025-06-18', '2025-03-26'];
const SERVIDOR = {
  name: 'transformai-comexstat',
  title: 'comexstat @ transformAI.app.br',
  version: '0.2.0',
  websiteUrl: 'https://transformai.app.br/dados/',
};
const INSTRUCOES =
  'Estatísticas oficiais de comércio exterior do Brasil, do Comex Stat (MDIC), desde 1997. ' +
  'Use buscar_produto e buscar_pais para achar os códigos antes de consultar. UF vai por sigla e município pelo código IBGE. ' +
  'Valores em US$ FOB. Ao citar um número, cite também a procedência retornada (fonte, data de atualização e consulta). ' +
  'As consultas vêm resumidas por padrão (totais, maiores categorias e o restante em "outros"); peça detalhe "completo" só quando o usuário quiser a lista inteira.';

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id, MCP-Protocol-Version',
};

function json(corpo, status = 200, extra = {}) {
  return new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json', ...CORS, ...extra } });
}

const erroRpc = (id, code, message) => json({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

async function responder(msg, contexto) {
  const { id, method, params } = msg;
  switch (method) {
    case 'initialize': {
      const pedida = params?.protocolVersion;
      return { protocolVersion: VERSOES.includes(pedida) ? pedida : VERSOES[0], capabilities: { tools: { listChanged: false } }, serverInfo: SERVIDOR, instructions: INSTRUCOES };
    }
    case 'ping':
      return {};
    case 'tools/list':
      return { tools: definicoes };
    case 'tools/call': {
      const { resultado, erro } = await executar(params?.name, params?.arguments, contexto);
      if (erro) return { content: [{ type: 'text', text: erro }], isError: true };
      return { content: [{ type: 'text', text: JSON.stringify(resultado) }], structuredContent: resultado };
    }
    default:
      throw Object.assign(new Error(`Método não suportado: ${method}`), { rpc: -32601, id });
  }
}

export async function tratarMcp(req, contexto) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method === 'GET') {
    // Navegador: leva para a documentação. Cliente MCP pedindo stream: não há stream neste servidor.
    if ((req.headers.get('Accept') ?? '').includes('text/html')) return Response.redirect('https://transformai.app.br/mcp/#comexstat', 302);
    return new Response('Este servidor MCP não abre stream; use POST.', { status: 405, headers: { Allow: 'POST, OPTIONS', ...CORS } });
  }
  if (req.method !== 'POST') return new Response('Método não permitido', { status: 405, headers: { Allow: 'POST, OPTIONS', ...CORS } });

  let msg;
  try {
    msg = await req.json();
  } catch {
    return erroRpc(null, -32700, 'JSON inválido');
  }
  if (Array.isArray(msg)) return erroRpc(null, -32600, 'Lotes de mensagens não são suportados');
  if (msg?.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    // Respostas do cliente (sem method) não esperam retorno.
    if (msg && msg.method === undefined && (msg.result !== undefined || msg.error !== undefined)) return new Response(null, { status: 202, headers: CORS });
    return erroRpc(msg?.id, -32600, 'Mensagem JSON-RPC inválida');
  }
  if (msg.id === undefined) return new Response(null, { status: 202, headers: CORS }); // notificação

  try {
    return json({ jsonrpc: '2.0', id: msg.id, result: await responder(msg, contexto) });
  } catch (erro) {
    if (erro.rpc) return erroRpc(msg.id, erro.rpc, erro.message);
    console.error('erro no MCP', msg.method, String(erro));
    return erroRpc(msg.id, -32603, 'Erro interno');
  }
}
