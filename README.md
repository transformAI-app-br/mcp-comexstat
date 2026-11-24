# mcp-comexstat

Servidor MCP para consultar as **estatísticas oficiais de comércio exterior do Brasil**, do Comex Stat (MDIC), a partir de assistentes de IA: Claude, ChatGPT e outros clientes do Model Context Protocol. Cada resposta traz a procedência: a consulta exata feita à API oficial e a data de atualização dos dados. Assim, qualquer número pode ser refeito no próprio Comex Stat.

> **Serviço não oficial.** Mantido pela [Transformaí](https://transformai.app.br/), sem vínculo com o MDIC. A fonte é a [API pública do Comex Stat](https://api-comexstat.mdic.gov.br/docs).
>
> **Rascunho.** O servidor ainda não está no ar. Este repositório publica, por enquanto, a interface proposta (ferramentas e registro).

- **Endereço:** `https://transformai.app.br/mcp/comexstat` (Streamable HTTP, sem autenticação)
- **Registro oficial MCP:** `br.app.transformai/comexstat` (ver [`server.json`](server.json))
- **Ferramentas:** [`ferramentas.json`](ferramentas.json)

## Conectar

**Claude Code**

```bash
claude mcp add --transport http comexstat https://transformai.app.br/mcp/comexstat
```

**Claude (app e web):** Configurações → Conectores → Adicionar conector personalizado → `https://transformai.app.br/mcp/comexstat`.

## Ferramentas

Todas são só de leitura.

| Ferramenta | Entrada | Retorno |
|---|---|---|
| `atualizacao` | nenhuma | data da última atualização e último mês disponível |
| `buscar_produto` | `texto` | códigos NCM e SH com descrição |
| `buscar_pais` | `texto` | códigos de países e blocos |
| `consultar_comercio` | `fluxo`, `de`, `ate`, filtros e detalhamentos | US$ FOB, kg e quantidade, desde 1997 |
| `consultar_municipios` | `fluxo`, `de`, `ate`, município, UF, SH4, país | US$ FOB e kg por município |

Toda resposta inclui o bloco `procedencia`:

```json
{
  "procedencia": {
    "fonte": "Comex Stat, Ministério do Desenvolvimento, Indústria, Comércio e Serviços",
    "consulta": { "endpoint": "POST https://api-comexstat.mdic.gov.br/general", "corpo": { "…": "…" } },
    "dados_atualizados_em": "AAAA-MM-DD",
    "consultado_em": "AAAA-MM-DDThh:mm:ssZ"
  }
}
```

## O que saber sobre os dados

- **Período:** dados mensais desde 1997, até o último mês completo. De 1989 a 1996 a metodologia é outra (NBM) e esses anos ficam fora deste servidor.
- **Município:** os dados por município saem mais agregados (produto em SH4) e usam o município do declarante da operação, não necessariamente o do produtor ou do comprador.
- **Limites:** a API oficial tem os mesmos limites de tempo e de linhas das telas do Comex Stat. Para recortes muito grandes, o próprio MDIC recomenda a base de dados bruta.

## Como funciona

O servidor roda num Cloudflare Worker e consulta a API oficial do Comex Stat a cada pergunta. As tabelas de códigos (NCM, SH, países) e as respostas recentes ficam em cache, para não sobrecarregar o serviço público. Os parâmetros das ferramentas são traduzidos para os da API oficial: `fluxo` vira `flow`, `de` e `ate` viram `period` e `detalhar_por` vira `details`.

## Registro oficial

1. Provar a posse do domínio `transformai.app.br` por DNS ou HTTP, como pede o [registro oficial](https://modelcontextprotocol.io/registry/about).
2. `mcp-publisher validate`.
3. `mcp-publisher publish`.

## Licença

A definir.
