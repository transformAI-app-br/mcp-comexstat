// Validação mínima de JSON Schema, só com o que as ferramentas usam.
import { ErroEntrada } from './codigos.js';

export function validar(esquema, valor, caminho = 'entrada') {
  if (esquema.type === 'object') {
    if (valor === undefined || valor === null) valor = {};
    if (typeof valor !== 'object' || Array.isArray(valor)) throw new ErroEntrada(`${caminho} deve ser um objeto.`);
    for (const campo of esquema.required ?? []) {
      if (valor[campo] === undefined) throw new ErroEntrada(`Falta o campo obrigatório "${campo}".`);
    }
    if (esquema.additionalProperties === false) {
      for (const campo of Object.keys(valor)) {
        if (!(campo in (esquema.properties ?? {}))) throw new ErroEntrada(`Campo desconhecido: "${campo}".`);
      }
    }
    for (const [campo, sub] of Object.entries(esquema.properties ?? {})) {
      if (valor[campo] !== undefined) validar(sub, valor[campo], campo);
    }
    return valor;
  }
  if (esquema.type === 'array') {
    if (!Array.isArray(valor)) throw new ErroEntrada(`"${caminho}" deve ser uma lista.`);
    if (esquema.maxItems !== undefined && valor.length > esquema.maxItems) throw new ErroEntrada(`"${caminho}" aceita no máximo ${esquema.maxItems} itens.`);
    if (esquema.minItems !== undefined && valor.length < esquema.minItems) throw new ErroEntrada(`"${caminho}" precisa de pelo menos ${esquema.minItems} item.`);
    valor.forEach((item, i) => validar(esquema.items, item, `${caminho}[${i}]`));
    return valor;
  }
  if (esquema.type === 'string') {
    if (typeof valor !== 'string') throw new ErroEntrada(`"${caminho}" deve ser texto.`);
    if (esquema.enum && !esquema.enum.includes(valor)) throw new ErroEntrada(`"${caminho}" deve ser um de: ${esquema.enum.join(', ')}.`);
    if (esquema.pattern && !new RegExp(esquema.pattern).test(valor)) throw new ErroEntrada(`"${caminho}" com formato inválido: ${valor}.`);
    if (esquema.minLength !== undefined && valor.length < esquema.minLength) throw new ErroEntrada(`"${caminho}" muito curto.`);
    if (esquema.maxLength !== undefined && valor.length > esquema.maxLength) throw new ErroEntrada(`"${caminho}" muito longo.`);
    return valor;
  }
  if (esquema.type === 'boolean') {
    if (typeof valor !== 'boolean') throw new ErroEntrada(`"${caminho}" deve ser true ou false.`);
    return valor;
  }
  return valor;
}
