// La vista de Caja Mayor partida en dos: lo que cada local ENVIÓ y lo que RECIBIÓ.
//
// El dato viene con la dirección tomada desde la CAJA MAYOR, no desde el local. En
// `MovimientoCM`, `ingreso: true` significa "entra plata a la caja mayor", y eso pasa
// justamente cuando el LOCAL manda plata (ver la nota de `direccionCajaMayor` en el
// backend: un egreso del local es un ingreso a la caja mayor).
//
// O sea que la traducción es cruzada, y es la razón por la que este archivo existe:
//
//   ingresos de la caja mayor  ->  lo que el local ENVIÓ
//   egresos  de la caja mayor  ->  lo que el local RECIBIÓ
//
// La pantalla venía mostrando las columnas como "Ingresos" y "Egresos", que son los
// nombres correctos desde la caja mayor pero se leen al revés cuando uno está mirando
// la fila de un local.

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// Lo que el local mandó a la caja mayor.
export const enviadoPorLocal = (s) => Math.abs(num(s?.ingresos))
// Lo que el local recibió de la caja mayor.
export const recibidoPorLocal = (s) => Math.abs(num(s?.egresos))

// Las dos mitades de la vista, con los mismos locales en el mismo orden en las dos.
//
// Un local aparece en los dos lados aunque de un lado tenga cero: poder leer las dos
// columnas a la misma altura es lo que permite comparar. Filtrar los ceros
// desalinearía las filas y habría que buscar el local en la otra lista.
//
// El orden lo fija `enviado` de mayor a menor, con el nombre como desempate: lo que
// más se movió va arriba, que es lo que se busca al abrir la pantalla.
export function dividirPorDireccion(saldos) {
  const filas = (saldos ?? []).map((s) => ({
    id_local: s.id_local,
    local: s.local ?? '—',
    grupo: s.grupo ?? null,
    moneda: s.moneda,
    enviado: enviadoPorLocal(s),
    recibido: recibidoPorLocal(s),
    ops: num(s.ops),
    sin_recibir: num(s.en_estudio),
  }))

  const ordenadas = filas.slice().sort((a, b) =>
    b.enviado - a.enviado || String(a.local).localeCompare(String(b.local), 'es'))

  const totalEnviado = filas.reduce((acc, f) => acc + f.enviado, 0)
  const totalRecibido = filas.reduce((acc, f) => acc + f.recibido, 0)

  return {
    filas: ordenadas,
    totalEnviado,
    totalRecibido,
    // El neto es lo que la caja mayor tiene de ese local: envió menos recibió.
    // Positivo = el local puso más de lo que sacó.
    neto: totalEnviado - totalRecibido,
    locales: filas.length,
    sinRecibir: filas.reduce((acc, f) => acc + f.sin_recibir, 0),
  }
}

// El neto de una fila, con el mismo criterio que el total.
export const netoDeFila = (f) => num(f?.enviado) - num(f?.recibido)

// Cuánto pesa un local dentro de su columna, para la barra de proporción. Sin esto,
// una lista de números no dice quién mueve la caja: hay que compararlos de memoria.
export function proporcion(monto, total) {
  const t = num(total)
  if (!t) return 0
  return Math.min(100, (Math.abs(num(monto)) / t) * 100)
}
