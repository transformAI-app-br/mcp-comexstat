// As cinco ferramentas: traduzem os parâmetros para a API oficial, normalizam a resposta e anotam a procedência.
import definicoes from '../ferramentas.json' with { type: 'json' };
import { API, ErroFonte } from './comexstat.js';
import { ErroEntrada, UF, municipioComexParaIbge, municipioIbgeParaComex, ufParaComex } from './codigos.js';
import { validar } from './validacao.js';

export { definicoes };

const FONTE = 'Comex Stat, Ministério do Desenvolvimento, Indústria, Comércio e Serviços (MDIC)';
const DOCUMENTACAO = `${API}/docs`;
const ESPECIFICACAO = 'https://transformai.app.br/blueprints/comercio-exterior-comexstat';
const MAX_LINHAS = 500;
// Descoberta progressiva: por padrão, as maiores categorias e o restante somado; detalhe "completo" traz tudo.
const LIMITE_RESUMO = 10;
const completo = (args) => args.detalhe === 'completo';
const TEMPO = new Set(['ano', 'mes']);

const FLUXO = { exportacao: 'export', importacao: 'import' };
const METRICA = { fob: 'metricFOB', kg: 'metricKG', quantidade: 'metricStatistic', frete: 'metricFreight', seguro: 'metricInsurance', cif: 'metricCIF' };
const SO_IMPORTACAO = ['frete', 'seguro', 'cif'];
const DETALHE_GERAL = { ncm: 'ncm', sh6: 'subHeading', sh4: 'heading', sh2: 'chapter', pais: 'country', bloco: 'economicBlock', uf: 'state', via: 'via', urf: 'urf' };
const DETALHE_MUNICIPIO = { municipio: 'city', sh4: 'heading', sh2: 'chapter', pais: 'country', bloco: 'economicBlock', uf: 'state' };

// Nomes dos campos da resposta oficial → nomes estáveis desta interface.
const CAMPO = {
  year: 'ano', monthNumber: 'mes', country: 'pais', economicBlock: 'bloco', state: 'uf', via: 'via', urf: 'urf',
  coNcm: 'ncm', ncm: 'ncm_descricao', subHeadingCode: 'sh6', subHeading: 'sh6_descricao', headingCode: 'sh4', heading: 'sh4_descricao',
  chapterCode: 'sh2', chapter: 'sh2_descricao', noMunMinsgUf: 'municipio',
  metricFOB: 'fob_usd', metricKG: 'kg', metricStatistic: 'quantidade', metricFreight: 'frete_usd', metricInsurance: 'seguro_usd', metricCIF: 'cif_usd',
};
const NUMERICOS = new Set(['fob_usd', 'kg', 'quantidade', 'frete_usd', 'seguro_usd', 'cif_usd']);

function normalizarLinha(linha) {
  const saida = {};
  for (const [k, v] of Object.entries(linha)) {
    const nome = CAMPO[k] ?? k;
    saida[nome] = NUMERICOS.has(nome) ? Number(v) : v;
  }
  return saida;
}

function somar(linhas) {
  const totais = {};
  for (const campo of NUMERICOS) {
    if (linhas.some((l) => l[campo] !== undefined)) totais[campo] = linhas.reduce((s, l) => s + (l[campo] ?? 0), 0);
  }
  return totais;
}

// Categoria = tudo o que não é tempo nem métrica (país, produto, município...). As categorias vêm da maior para
// a menor em US$ FOB no período; dentro de cada uma, as linhas em ordem cronológica. No resumo, só as maiores.
function resumir(linhas, args) {
  const categorias = new Map();
  for (const l of linhas) {
    const chave = JSON.stringify(Object.entries(l).filter(([k]) => !TEMPO.has(k) && !NUMERICOS.has(k)));
    const c = categorias.get(chave) ?? { fob: 0, linhas: [] };
    c.fob += l.fob_usd ?? 0;
    c.linhas.push(l);
    categorias.set(chave, c);
  }
  const ordem = [...categorias.values()].sort((a, b) => b.fob - a.fob);
  const cronologica = (a, b) => String(a.ano ?? '').localeCompare(String(b.ano ?? '')) || Number(a.mes ?? 0) - Number(b.mes ?? 0);
  const n = completo(args) ? ordem.length : (args.limite ?? LIMITE_RESUMO);
  const mostradas = ordem.slice(0, n).flatMap((c) => c.linhas.sort(cronologica));
  const resto = ordem.slice(n);
  const saida = {
    total_linhas: linhas.length,
    categorias: ordem.length,
    totais: somar(linhas),
    linhas: mostradas.slice(0, MAX_LINHAS),
    truncado: mostradas.length > MAX_LINHAS,
  };
  if (resto.length) {
    const linhasResto = resto.flatMap((c) => c.linhas);
    saida.outros = { categorias: resto.length, linhas: linhasResto.length, ...somar(linhasResto) };
    saida.aviso = `Resumo: as ${n} maiores categorias em US$ FOB; as outras ${resto.length} estão somadas em "outros". Para todas, peça detalhe "completo".`;
  }
  return saida;
}

function conferirPeriodo({ de, ate }) {
  if (de > ate) throw new ErroEntrada(`O mês inicial (${de}) é depois do final (${ate}).`);
}

function metricasDe(args, permitidas) {
  const pedidas = args.metricas?.length ? args.metricas : ['fob', 'kg'];
  for (const m of pedidas) {
    if (!permitidas.includes(m)) throw new ErroEntrada(`Métrica "${m}" não existe nesta consulta.`);
    if (SO_IMPORTACAO.includes(m) && args.fluxo !== 'importacao') throw new ErroEntrada(`A métrica "${m}" só existe na importação.`);
  }
  return pedidas.map((m) => METRICA[m]);
}

async function atualizacaoDe(cliente, base) {
  const r = await cliente.obter(`/${base}/dates/updated?language=pt`, { ttl: 3600 });
  return { atualizado_em: r.data.updated, ultimo_mes: `${r.data.year}-${String(r.data.monthNumber).padStart(2, '0')}` };
}

// A consulta exata à API oficial vai sempre (é o que permite refazer o número); o resto, só no completo.
function procedencia({ caminho, corpo, atualizacao, traducoes = [], observacoes = [] }, args) {
  const base = {
    fonte: FONTE,
    consulta: { endpoint: `POST ${API}${caminho}`, corpo },
    dados_atualizados_em: atualizacao.atualizado_em,
    ultimo_mes_disponivel: atualizacao.ultimo_mes,
    consultado_em: new Date().toISOString(),
    ...(traducoes.length ? { traducoes } : {}),
    observacoes,
  };
  if (!completo(args)) return base;
  return { ...base, traducoes, como_refazer: `Envie o mesmo corpo para o endpoint acima. Documentação oficial: ${DOCUMENTACAO}`, especificacao: ESPECIFICACAO };
}

function filtrosUf(siglas, traducoes) {
  return siglas.map((s) => {
    const sigla = s.toUpperCase();
    const comex = ufParaComex(sigla);
    traducoes.push({ campo: 'uf', de: `${sigla} (IBGE ${UF[sigla].ibge})`, para: `state ${comex} (código do Comex Stat)` });
    return comex;
  });
}

let mapaCidades = null; // "Nome - UF" → código IBGE, montado a partir de /tables/cities
async function cidadesPorNome(cliente) {
  if (mapaCidades) return mapaCidades;
  const r = await cliente.obter('/tables/cities?language=pt&page=1&perPage=10000', { ttl: 24 * 3600 });
  mapaCidades = new Map(r.data.map((c) => [c.text, municipioComexParaIbge(c.id)]));
  return mapaCidades;
}

const executores = {
  async atualizacao(_args, { cliente }) {
    const [geral, municipios] = await Promise.all([atualizacaoDe(cliente, 'general'), atualizacaoDe(cliente, 'cities')]);
    return { dados_gerais: geral, dados_por_municipio: municipios, fonte: FONTE, documentacao: DOCUMENTACAO };
  },

  async buscar_produto(args, { cliente }) {
    const { texto } = args;
    const limite = completo(args) ? 30 : LIMITE_RESUMO;
    const q = encodeURIComponent(texto);
    const [ncm, sh] = await Promise.all([
      cliente.obter(`/tables/ncm?language=pt&search=${q}&page=1&perPage=30`, { ttl: 7 * 24 * 3600 }),
      cliente.obter(`/tables/hs?language=pt&search=${q}&page=1&perPage=30`, { ttl: 7 * 24 * 3600 }),
    ]);
    const sh4 = new Map();
    const sh2 = new Map();
    for (const l of sh.data.list) {
      sh4.set(l.headingCode, l.heading);
      sh2.set(l.chapterCode, l.chapter);
    }
    const cortado = ncm.data.list.length > limite || sh.data.list.length > limite;
    return {
      ncm: ncm.data.list.slice(0, limite).map((l) => ({ ncm: l.coNcm, descricao: l.noNCM, unidade: l.unit })),
      sh6: sh.data.list.slice(0, limite).map((l) => ({ sh6: l.subHeadingCode, descricao: l.subHeading })),
      ...(cortado ? { aviso: `Mostrando até ${limite} códigos por nível. Refine o texto ou peça detalhe "completo".` } : {}),
      sh4: [...sh4].map(([codigo, descricao]) => ({ sh4: codigo, descricao })),
      sh2: [...sh2].map(([codigo, descricao]) => ({ sh2: codigo, descricao })),
      fonte: `${FONTE}, tabelas NCM e SH`,
    };
  },

  async buscar_pais({ texto }, { cliente }) {
    const [paises, blocos] = await Promise.all([
      cliente.obter(`/tables/countries?language=pt&search=${encodeURIComponent(texto)}`, { ttl: 7 * 24 * 3600 }),
      cliente.obter('/tables/economic-blocks?language=pt', { ttl: 7 * 24 * 3600 }),
    ]);
    const alvo = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const casa = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(alvo);
    return {
      paises: paises.data.list.map((p) => ({ pais: p.id, nome: p.text })),
      blocos: blocos.data.list.filter((b) => casa(b.text)).map((b) => ({ bloco: b.id, nome: b.text })),
      fonte: `${FONTE}, tabelas de países e blocos`,
    };
  },

  async consultar_comercio(args, { cliente }) {
    conferirPeriodo(args);
    const traducoes = [];
    const filtros = [];
    const adiciona = (filter, values) => values?.length && filtros.push({ filter, values });
    adiciona('ncm', args.ncm);
    adiciona('subHeading', args.sh6);
    adiciona('heading', args.sh4);
    adiciona('chapter', args.sh2);
    adiciona('country', args.pais);
    adiciona('economicBlock', args.bloco);
    if (args.uf?.length) adiciona('state', filtrosUf(args.uf, traducoes));
    adiciona('via', args.via);

    const corpo = {
      flow: FLUXO[args.fluxo],
      monthDetail: Boolean(args.por_mes),
      period: { from: args.de, to: args.ate },
      filters: filtros,
      details: (args.detalhar_por ?? []).map((d) => DETALHE_GERAL[d]),
      metrics: metricasDe(args, Object.keys(METRICA)),
    };
    const caminho = '/general?language=pt';
    const [r, atualizacao] = await Promise.all([cliente.obter(caminho, { corpo }), atualizacaoDe(cliente, 'general')]);
    const observacoes = ['Valores em dólares americanos (US$), sem correção pela inflação.'];
    if (args.uf?.length) observacoes.push('UF do produto: de origem na exportação e de destino na importação.');
    return { ...resumir(r.data.list.map(normalizarLinha), args), procedencia: procedencia({ caminho, corpo, atualizacao, traducoes, observacoes }, args) };
  },

  async consultar_municipios(args, { cliente }) {
    conferirPeriodo(args);
    const traducoes = [];
    const filtros = [];
    const adiciona = (filter, values) => values?.length && filtros.push({ filter, values });
    if (args.municipio_ibge?.length) {
      adiciona('city', args.municipio_ibge.map((c) => {
        const comex = municipioIbgeParaComex(c);
        if (comex !== c) traducoes.push({ campo: 'municipio_ibge', de: `${c} (IBGE)`, para: `city ${comex} (código do Comex Stat)` });
        return comex;
      }));
    }
    if (args.uf?.length) adiciona('state', filtrosUf(args.uf, traducoes));
    adiciona('heading', args.sh4);
    adiciona('chapter', args.sh2);
    adiciona('country', args.pais);

    const corpo = {
      flow: FLUXO[args.fluxo],
      monthDetail: Boolean(args.por_mes),
      period: { from: args.de, to: args.ate },
      filters: filtros,
      details: (args.detalhar_por ?? []).map((d) => DETALHE_MUNICIPIO[d]),
      metrics: metricasDe(args, ['fob', 'kg']),
    };
    const caminho = '/cities?language=pt';
    const [r, atualizacao, cidades] = await Promise.all([
      cliente.obter(caminho, { corpo }),
      atualizacaoDe(cliente, 'cities'),
      (args.detalhar_por ?? []).includes('municipio') ? cidadesPorNome(cliente) : null,
    ]);
    const linhas = r.data.list.map((l) => {
      const n = normalizarLinha(l);
      if (cidades && n.municipio) n.municipio_ibge = cidades.get(n.municipio) ?? null;
      return n;
    });
    const observacoes = [
      'O município é o do declarante da operação, não necessariamente o do produtor ou do comprador.',
      'Valores em dólares americanos (US$), sem correção pela inflação.',
    ];
    return { ...resumir(linhas, args), procedencia: procedencia({ caminho, corpo, atualizacao, traducoes, observacoes }, args) };
  },
};

/** Executa uma ferramenta. Erros de entrada e da fonte viram resultado com isError, não exceção. */
export async function executar(nome, args, contexto) {
  const definicao = definicoes.find((d) => d.name === nome);
  if (!definicao) return { erro: `Ferramenta desconhecida: ${nome}.`, tipo: 'entrada' };
  try {
    const validos = validar(definicao.inputSchema, args ?? {});
    return { resultado: await executores[nome](validos, contexto) };
  } catch (erro) {
    if (erro instanceof ErroEntrada) return { erro: erro.message, tipo: 'entrada' };
    if (erro instanceof ErroFonte) return { erro: erro.message, tipo: 'fonte' };
    throw erro;
  }
}
