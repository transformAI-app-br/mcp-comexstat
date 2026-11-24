# mcp-comexstat

Servidor MCP e API REST para as **estatísticas oficiais de comércio exterior do Brasil**, do Comex Stat (MDIC). Funciona com Claude, ChatGPT e outros clientes do Model Context Protocol, e também por HTTP comum.

Cada resposta traz a procedência: a consulta exata feita à API oficial, a data de atualização dos dados e as traduções de código aplicadas. Com isso, qualquer número pode ser refeito no próprio Comex Stat.

> **Serviço não oficial.** Mantido pela [Transformaí](https://transformai.app.br/dados/), sem vínculo com o MDIC. A fonte é a [API pública do Comex Stat](https://api-comexstat.mdic.gov.br/docs).

| | |
|---|---|
| MCP | `https://transformai.app.br/mcp/comexstat` (Streamable HTTP, sem autenticação) |
| API REST | `https://transformai.app.br/api/v1/comexstat`, descrita em [`openapi.json`](openapi.json) |
| Registro oficial MCP | `br.app.transformai/comexstat` (ver [`server.json`](server.json)) |
| Especificação | [TAI-BP-002](https://transformai.app.br/blueprints/comercio-exterior-comexstat) |
| Status | no ar, versão 0.1.0 |

## Conectar

**Claude Code**

```bash
claude mcp add --transport http comexstat https://transformai.app.br/mcp/comexstat
```

**Claude (app e web):** Configurações → Conectores → Adicionar conector personalizado → `https://transformai.app.br/mcp/comexstat`.

**Outros clientes MCP:** o mesmo endereço, com transporte Streamable HTTP.

**HTTP:**

```bash
curl -X POST https://transformai.app.br/api/v1/comexstat/comercio \
  -H "Content-Type: application/json" \
  -d '{"fluxo":"exportacao","de":"2025-01","ate":"2025-12","sh4":["2601"],"pais":["160"],"detalhar_por":["uf"]}'
```

## Ferramentas

Todas são só de leitura. As definições completas estão em [`ferramentas.json`](ferramentas.json).

| MCP | REST | O que faz |
|---|---|---|
| `atualizacao` | `GET /atualizacao` | data da última atualização e último mês disponível |
| `buscar_produto` | `GET /produtos?texto=` | códigos NCM, SH6, SH4 e SH2 pela descrição |
| `buscar_pais` | `GET /paises?texto=` | códigos de países e blocos econômicos |
| `consultar_comercio` | `POST /comercio` | exportações ou importações desde 1997, por produto, país, bloco, UF, via e URF |
| `consultar_municipios` | `POST /municipios` | exportações ou importações por município, com produto até SH4 |

Exemplo real, minério de ferro (SH4 2601) exportado para a China em 2025, por UF. Dados atualizados pelo MDIC em 6/11/2026:

```json
{
  "total_linhas": 13,
  "totais": { "fob_usd": 19581100549, "kg": 294508180764 },
  "linhas": [
    { "ano": "2025", "uf": "Minas Gerais", "fob_usd": 9872808657, "kg": 151660632577 },
    { "ano": "2025", "uf": "Pará", "fob_usd": 8380100392, "kg": 122169375967 },
    "… 11 linhas"
  ],
  "procedencia": {
    "fonte": "Comex Stat, Ministério do Desenvolvimento, Indústria, Comércio e Serviços (MDIC)",
    "consulta": { "endpoint": "POST https://api-comexstat.mdic.gov.br/general?language=pt", "corpo": { "flow": "export", "…": "…" } },
    "dados_atualizados_em": "2026-11-06",
    "ultimo_mes_disponivel": "2026-10",
    "traducoes": [],
    "observacoes": ["Valores em dólares americanos (US$), sem correção pela inflação."]
  }
}
```

O exemplo foi encurtado: a resposta real traz as 13 linhas e o corpo completo da consulta.

## O que este servidor resolve por você

A API oficial tem armadilhas que este servidor trata e registra na procedência:

- **UF:** o Comex Stat tem numeração própria, e 13 UFs diferem do IBGE. MG é 33 no Comex Stat e 31 no IBGE; Sergipe é 31 no Comex Stat. Aqui a UF vai sempre pela sigla.
- **Município:** o código é o do IBGE, exceto em GO, MS, SP e DF, onde o prefixo muda. São Paulo (capital) é 3550308 no IBGE e 3450308 no Comex Stat. Aqui o município vai sempre pelo código IBGE, que também volta em cada linha.
- **SH4:** precisa ir como texto com zero à esquerda (`"0901"`). Enviado como número, a consulta volta vazia, sem erro.
- **Métricas:** frete, seguro e CIF só existem na importação. Pedidos inválidos são recusados com mensagem clara, antes de chegar à fonte.

## O que saber sobre os dados

- **Período:** dados mensais desde 1997, até o último mês fechado. De 1989 a 1996 a metodologia é outra (NBM), e esses anos ficam fora deste servidor.
- **Dados por município:** são mais agregados (produto até SH4) e usam o município do declarante da operação, que não é necessariamente o do produtor ou do comprador.
- **Municípios novos:** três municípios do IBGE ainda não existem na tabela do Comex Stat. São Aroeiras do Itaim (PI), Figueirão (MS) e Boa Esperança do Norte (MT).
- **Limites:** valem os mesmos de tempo e de linhas da API oficial. Respostas acima de 500 linhas vêm com as 500 de maior valor e `truncado: true`.

## Como funciona

Um Cloudflare Worker, sem banco nem segredos:

```
src/index.js        rotas /mcp/comexstat e /api/v1/comexstat
src/mcp.js          MCP sem estado sobre Streamable HTTP (JSON-RPC)
src/rest.js         API REST com as mesmas ferramentas
src/ferramentas.js  tradução dos parâmetros, normalização e procedência
src/codigos.js      UF e município: IBGE ↔ Comex Stat
src/comexstat.js    cliente da API oficial, com cache (6 h para consultas, 7 dias para tabelas)
ferramentas.json    definições das ferramentas (MCP e base do openapi.json)
```

```bash
npm test             # testes sem rede
npm run test:ao-vivo # testes contra a API oficial
npm run openapi      # regera openapi.json a partir de ferramentas.json
npm run deploy
```

## Licença

Código sob [Apache-2.0](LICENSE). Os dados são do MDIC; cite o Comex Stat como fonte.
