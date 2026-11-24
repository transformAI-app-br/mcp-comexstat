// Tradução de códigos entre o padrão IBGE (o que o MCP recebe) e o do Comex Stat (o que a API oficial usa).
// Conferido em 24/11/2026 contra /tables/uf e /tables/cities do Comex Stat e a API de localidades do IBGE.

// UF: o Comex Stat tem numeração própria; 15 UFs diferem do IBGE (ex.: MG é 33 no Comex Stat e 31 no IBGE).
export const UF = {
  AC: { ibge: '12', comex: '12', nome: 'Acre' },
  AL: { ibge: '27', comex: '27', nome: 'Alagoas' },
  AP: { ibge: '16', comex: '16', nome: 'Amapá' },
  AM: { ibge: '13', comex: '13', nome: 'Amazonas' },
  BA: { ibge: '29', comex: '32', nome: 'Bahia' },
  CE: { ibge: '23', comex: '23', nome: 'Ceará' },
  DF: { ibge: '53', comex: '54', nome: 'Distrito Federal' },
  ES: { ibge: '32', comex: '34', nome: 'Espírito Santo' },
  GO: { ibge: '52', comex: '53', nome: 'Goiás' },
  MA: { ibge: '21', comex: '21', nome: 'Maranhão' },
  MT: { ibge: '51', comex: '52', nome: 'Mato Grosso' },
  MS: { ibge: '50', comex: '55', nome: 'Mato Grosso do Sul' },
  MG: { ibge: '31', comex: '33', nome: 'Minas Gerais' },
  PA: { ibge: '15', comex: '15', nome: 'Pará' },
  PB: { ibge: '25', comex: '25', nome: 'Paraíba' },
  PR: { ibge: '41', comex: '42', nome: 'Paraná' },
  PE: { ibge: '26', comex: '26', nome: 'Pernambuco' },
  PI: { ibge: '22', comex: '22', nome: 'Piauí' },
  RJ: { ibge: '33', comex: '36', nome: 'Rio de Janeiro' },
  RN: { ibge: '24', comex: '24', nome: 'Rio Grande do Norte' },
  RS: { ibge: '43', comex: '45', nome: 'Rio Grande do Sul' },
  RO: { ibge: '11', comex: '11', nome: 'Rondônia' },
  RR: { ibge: '14', comex: '14', nome: 'Roraima' },
  SC: { ibge: '42', comex: '44', nome: 'Santa Catarina' },
  SP: { ibge: '35', comex: '41', nome: 'São Paulo' },
  SE: { ibge: '28', comex: '31', nome: 'Sergipe' },
  TO: { ibge: '17', comex: '17', nome: 'Tocantins' },
};

// Município: o código do Comex Stat é o do IBGE, exceto em GO, MS, SP e DF, onde só o prefixo de 2 dígitos muda.
// A regra cobre os 5.568 municípios da tabela do Comex Stat.
const PREFIXO_IBGE_PARA_COMEX = { 52: '53', 50: '52', 35: '34', 53: '54' };
const PREFIXO_COMEX_PARA_IBGE = { 53: '52', 52: '50', 34: '35', 54: '53' };

export function ufParaComex(sigla) {
  const uf = UF[String(sigla).toUpperCase()];
  if (!uf) throw new ErroEntrada(`UF desconhecida: ${sigla}. Use a sigla, como MG.`);
  return uf.comex;
}

export function municipioIbgeParaComex(codigo) {
  const c = String(codigo);
  if (!/^[0-9]{7}$/.test(c)) throw new ErroEntrada(`Código de município inválido: ${codigo}. Use o código IBGE de 7 dígitos.`);
  const p = PREFIXO_IBGE_PARA_COMEX[c.slice(0, 2)];
  return p ? p + c.slice(2) : c;
}

export function municipioComexParaIbge(codigo) {
  const c = String(codigo);
  const p = PREFIXO_COMEX_PARA_IBGE[c.slice(0, 2)];
  return p ? p + c.slice(2) : c;
}

export class ErroEntrada extends Error {}
