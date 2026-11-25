// Cliente da API pública do Comex Stat (MDIC), com cache para não sobrecarregar o serviço oficial.
export const API = 'https://api-comexstat.mdic.gov.br';
const AGENTE = 'transformai-mcp-comexstat/0.1 (+https://transformai.app.br/)';

export class ErroFonte extends Error {}

async function sha256(texto) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * @param {{fetch?: typeof fetch, cache?: Cache | null}} deps  cache: o caches.default do Worker (null nos testes)
 */
export function criarCliente({ fetch: fetchFn = (...a) => fetch(...a), cache = null } = {}) {
  async function obter(caminho, { corpo = null, ttl = 6 * 3600 } = {}) {
    const metodo = corpo ? 'POST' : 'GET';
    const url = `${API}${caminho}`;
    const chave = cache ? new Request(`https://cache.transformai.app.br/comexstat/${await sha256(`${metodo} ${url} ${JSON.stringify(corpo)}`)}`) : null;
    if (chave) {
      const guardada = await cache.match(chave);
      if (guardada) return guardada.json();
    }

    let resposta;
    try {
      resposta = await fetchFn(url, {
        method: metodo,
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': AGENTE },
        body: corpo ? JSON.stringify(corpo) : undefined,
      });
    } catch (erro) {
      throw new ErroFonte(`Não foi possível falar com o Comex Stat: ${erro?.message ?? erro}`);
    }
    if (!resposta.ok) throw new ErroFonte(`O Comex Stat respondeu ${resposta.status} para ${metodo} ${caminho}.`);
    const json = await resposta.json();
    if (json?.success === false) throw new ErroFonte(`O Comex Stat recusou a consulta: ${json.message ?? 'sem mensagem'}.`);

    if (chave) {
      await cache.put(chave, new Response(JSON.stringify(json), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${ttl}` } }));
    }
    return json;
  }

  return { obter };
}
