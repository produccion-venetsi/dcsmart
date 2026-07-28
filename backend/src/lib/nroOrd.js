// Parsea lo que el usuario escribe en un buscador de OPs: "101", "OP-101",
// "op 101". Devuelve null si no hay un numero adentro, para que el llamador
// distinga "no busques" de "busca el 0".
export function parseNroOrd(input) {
  if (typeof input !== 'string') return null
  const limpio = input.trim().replace(/^op[-\s]*/i, '')
  if (limpio === '') return null
  const n = parseInt(limpio, 10)
  return Number.isNaN(n) ? null : n
}
