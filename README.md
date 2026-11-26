# mcp-comexstat

Servidor MCP e API REST para as **estatísticas oficiais de comércio exterior do Brasil**, do Comex Stat (MDIC). Funciona com Claude, ChatGPT e outros clientes do Model Context Protocol, e também por HTTP comum.

Cada resposta traz a procedência: a consulta exata feita à API oficial, a data de atualização dos dados e as traduções de código aplicadas. Com isso, qualquer número pode ser refeito no próprio Comex Stat.

> `comexstat @ transformAI.app.br`, mantido pela [transformAI](https://transformai.app.br/), sem vínculo com o MDIC. A fonte é a [API pública do Comex Stat](https://api-comexstat.mdic.gov.br/docs).

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

O exemplo foi encurtado: a resposta real traz as 10 maiores UFs, as outras somadas em `outros`, e o corpo completo da consulta.

### Respostas resumidas por padrão

As consultas seguem descoberta progressiva, para não encher o contexto do assistente:

- **Por padrão** (`detalhe: "resumo"`): os totais de todas as linhas, as 10 maiores categorias em US$ FOB (ou quantas pedir em `limite`) e o restante somado em `outros`. Categoria é o que foi pedido em `detalhar_por`: país, produto, UF, município. Com `por_mes`, cada categoria vem com a série inteira, em ordem cronológica.
- **Quando o usuário pede tudo** (`detalhe: "completo"`): todas as linhas, até 500, e a procedência com as instruções para refazer a consulta.

A consulta exata à API oficial vai sempre, nos dois modos. Exemplo: café não torrado exportado por MG em 2025, por país. O resumo, com 10 países, tem 1,8 KB; o completo, com 93 países, tem 7 KB. O total, US$ 11,26 bilhões, é o mesmo.

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
- **Limites:** valem os mesmos de tempo e de linhas da API oficial. No modo completo, respostas acima de 500 linhas vêm com as categorias de maior valor e `truncado: true`.

## Como funciona

Um Cloudflare Worker, sem banco nem segredos:

```
src/index.js        rotas /mcp/comexstat e /api/v1/comexstat
src/mcp.js          MCP sem estado sobre Streamable HTTP (JSON-RPC)
src/rest.js         API REST com as mesmas ferramentas
src/ferramentas.js  tradução dos parâmetros, normalização e procedência
src/codigos.js      UF e município: IBGE ↔ Comex Stat
src/comexstat.js    cliente da API oficial, com cache e cópia para indisponibilidade
ferramentas.json    definições das ferramentas (MCP e base do openapi.json)
```

As consultas ficam frescas por 6 horas, as datas de atualização por 1 hora, a tabela de municípios por 24 horas e as demais tabelas por 7 dias. Após esse prazo, o servidor tenta consultar a API oficial novamente.

Se ainda houver no cache uma resposta bem-sucedida de até 30 dias para o mesmo método, URL e corpo, a tentativa tem um limite de 15 segundos. Em caso de falha de rede, resposta HTTP fora da faixa 2xx ou estouro desse prazo, o servidor usa a cópia. A procedência do MCP e da API REST informa quais partes vieram de uma cópia e quando ela foi armazenada, em UTC. Sem uma cópia válida, a ferramenta retorna o erro da fonte como de costume. A retenção de até 30 dias vale para as respostas armazenadas a partir desta mudança.

```bash
npm test             # testes sem rede
npm run test:ao-vivo # testes contra a API oficial
npm run openapi      # regera openapi.json a partir de ferramentas.json
npm run deploy
```

## Licença

Código sob [Apache-2.0](LICENSE). Os dados são do MDIC; cite o Comex Stat como fonte.
