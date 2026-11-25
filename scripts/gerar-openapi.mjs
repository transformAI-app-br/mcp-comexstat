// Gera openapi.json a partir de ferramentas.json: a API REST e o MCP usam as mesmas definições.
// Uso: npm run openapi
import { readFileSync, writeFileSync } from 'node:fs';

const ferramentas = JSON.parse(readFileSync(new URL('../ferramentas.json', import.meta.url), 'utf8'));
const f = Object.fromEntries(ferramentas.map((t) => [t.name, t]));
const ref = (n) => ({ $ref: `#/components/schemas/${n}` });
const ok = (schema, descricao) => ({ description: descricao, content: { 'application/json': { schema } } });
const erros = { 400: { $ref: '#/components/responses/EntradaInvalida' }, 502: { $ref: '#/components/responses/FonteIndisponivel' } };
const texto = (t) => ({ name: 'texto', in: 'query', required: true, schema: t.inputSchema.properties.texto, description: t.inputSchema.properties.texto.description });

const spec = {
  openapi: '3.1.0',
  info: {
    title: 'comexstat @ transformAI.app.br',
    version: '0.2.0',
    summary: 'Estatísticas de comércio exterior do Brasil, com a procedência de cada resposta.',
    description:
      'Consulta a API pública do Comex Stat, traduz códigos do padrão IBGE para os próprios do Comex Stat e devolve, junto com os dados, a consulta exata feita à fonte e a data de atualização. As mesmas operações existem como ferramentas MCP em https://transformai.app.br/mcp/comexstat. A fonte é o MDIC, sem vínculo com a transformAI.',
    contact: { name: 'transformAI', url: 'https://transformai.app.br/' },
    license: { name: 'Apache-2.0 (código); dados de origem do MDIC', identifier: 'Apache-2.0' },
  },
  externalDocs: { description: 'Especificação TAI-BP-002', url: 'https://transformai.app.br/blueprints/comercio-exterior-comexstat' },
  servers: [{ url: 'https://transformai.app.br/api/v1/comexstat' }],
  tags: [{ name: 'Tabelas', description: 'Códigos de produtos, países e blocos.' }, { name: 'Consultas', description: 'Exportações e importações com procedência.' }],
  paths: {
    '/atualizacao': { get: { tags: ['Tabelas'], operationId: 'atualizacao', summary: f.atualizacao.title, description: f.atualizacao.description, responses: { 200: ok(ref('Atualizacao'), 'Datas de atualização'), 502: erros[502] } } },
    '/produtos': { get: { tags: ['Tabelas'], operationId: 'buscarProduto', summary: f.buscar_produto.title, description: f.buscar_produto.description, parameters: [texto(f.buscar_produto), { name: 'detalhe', in: 'query', required: false, schema: f.buscar_produto.inputSchema.properties.detalhe }], responses: { 200: ok({ type: 'object' }, 'Produtos encontrados'), ...erros } } },
    '/paises': { get: { tags: ['Tabelas'], operationId: 'buscarPais', summary: f.buscar_pais.title, description: f.buscar_pais.description, parameters: [texto(f.buscar_pais)], responses: { 200: ok({ type: 'object' }, 'Países e blocos encontrados'), ...erros } } },
    '/comercio': { post: { tags: ['Consultas'], operationId: 'consultarComercio', summary: f.consultar_comercio.title, description: f.consultar_comercio.description,
      requestBody: { required: true, content: { 'application/json': { schema: f.consultar_comercio.inputSchema, examples: { cafe_mg: { summary: 'Café (SH4 0901) exportado por MG em 2025, por país', value: { fluxo: 'exportacao', de: '2025-01', ate: '2025-12', uf: ['MG'], sh4: ['0901'], detalhar_por: ['pais'] } } } } } },
      responses: { 200: ok(ref('Resultado'), 'Linhas, totais e procedência'), ...erros } } },
    '/municipios': { post: { tags: ['Consultas'], operationId: 'consultarMunicipios', summary: f.consultar_municipios.title, description: f.consultar_municipios.description,
      requestBody: { required: true, content: { 'application/json': { schema: f.consultar_municipios.inputSchema, examples: { cafe_mg_municipios: { summary: 'Café exportado por município de MG em 2025', value: { fluxo: 'exportacao', de: '2025-01', ate: '2025-12', uf: ['MG'], sh4: ['0901'], detalhar_por: ['municipio'] } } } } } },
      responses: { 200: ok(ref('Resultado'), 'Linhas, totais e procedência'), ...erros } } },
    '/openapi.json': { get: { tags: ['Tabelas'], operationId: 'openapi', summary: 'Esta descrição', responses: { 200: ok({ type: 'object' }, 'OpenAPI 3.1') } } },
  },
  components: {
    responses: {
      EntradaInvalida: ok(ref('Erro'), 'Parâmetro inválido'),
      FonteIndisponivel: ok(ref('Erro'), 'O Comex Stat não respondeu ou recusou a consulta'),
    },
    schemas: {
      Erro: { type: 'object', required: ['erro'], properties: { erro: { type: 'string' } } },
      Atualizacao: { type: 'object', properties: {
        dados_gerais: { type: 'object', properties: { atualizado_em: { type: 'string', format: 'date' }, ultimo_mes: { type: 'string' } } },
        dados_por_municipio: { type: 'object', properties: { atualizado_em: { type: 'string', format: 'date' }, ultimo_mes: { type: 'string' } } },
        fonte: { type: 'string' }, documentacao: { type: 'string', format: 'uri' } } },
      Resultado: { type: 'object', required: ['total_linhas', 'categorias', 'truncado', 'totais', 'linhas', 'procedencia'], properties: {
        total_linhas: { type: 'integer', description: 'Linhas devolvidas pela fonte.' },
        categorias: { type: 'integer', description: 'Categorias distintas (país, produto, município...), sem contar o tempo.' },
        truncado: { type: 'boolean', description: 'Verdadeiro se as linhas mostradas passariam de 500.' },
        outros: { type: 'object', description: 'No resumo: as categorias não mostradas, somadas.', additionalProperties: { type: 'number' } },
        aviso: { type: 'string' },
        totais: { type: 'object', additionalProperties: { type: 'number' } },
        linhas: { type: 'array', items: { type: 'object', additionalProperties: true, properties: {
          ano: { type: 'string' }, mes: { type: 'string' }, pais: { type: 'string' }, uf: { type: 'string' }, municipio: { type: 'string' }, municipio_ibge: { type: ['string', 'null'] },
          fob_usd: { type: 'number' }, kg: { type: 'number' }, quantidade: { type: 'number' }, frete_usd: { type: 'number' }, seguro_usd: { type: 'number' }, cif_usd: { type: 'number' } } } },
        procedencia: ref('Procedencia') } },
      Procedencia: { type: 'object', required: ['fonte', 'consulta', 'dados_atualizados_em', 'consultado_em'], properties: {
        fonte: { type: 'string' },
        consulta: { type: 'object', properties: { endpoint: { type: 'string' }, corpo: { type: 'object' } }, description: 'A consulta exata enviada à API oficial.' },
        dados_atualizados_em: { type: 'string', format: 'date' },
        ultimo_mes_disponivel: { type: 'string' },
        consultado_em: { type: 'string', format: 'date-time' },
        traducoes: { type: 'array', items: { type: 'object', properties: { campo: { type: 'string' }, de: { type: 'string' }, para: { type: 'string' } } } },
        observacoes: { type: 'array', items: { type: 'string' } },
        como_refazer: { type: 'string' },
        especificacao: { type: 'string', format: 'uri' } } },
    },
  },
};
writeFileSync(new URL('../openapi.json', import.meta.url), `${JSON.stringify(spec, null, 2)}\n`);
console.log('openapi.json gerado:', Object.keys(spec.paths).length, 'caminhos');
