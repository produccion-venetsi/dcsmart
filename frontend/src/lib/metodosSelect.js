// Options para los selects de método de pago.

// Los métodos que se ofrecen al CARGAR una op, en este orden (definido por el
// usuario, 2026-08-21). El catálogo de la base tiene 63 métodos: la mayoría son
// nombres que trajeron las integraciones y las migraciones, y al crear una op
// aparecían todos mezclados.
//
// Esto filtra la lista del formulario y NADA más: no renombra ni fusiona nada
// en la base, y los nombres de detalle de las cajas (que salen del mismo
// catálogo en los syncs) quedan intactos. Una op vieja con otro método sigue
// mostrando el suyo -- de eso se encarga opcionesMetodos.
//
// Cada entrada lista los nombres con que ese método puede estar guardado: la
// base dice "Mercado Pago" donde el equipo dice "MP", y "Cuenta Cte." donde
// dice "Cta. Cte.".
export const METODOS_OP = [
  { etiqueta: 'Efectivo',            nombres: ['Efectivo'] },
  { etiqueta: 'Tarjeta de Credito',  nombres: ['Tarjeta de Credito', 'Tarjeta crédito', 'Tarjeta credito'] },
  { etiqueta: 'Tarjeta de Debito',   nombres: ['Tarjeta de Debito', 'Tarjeta débito', 'Tarjeta debito'] },
  { etiqueta: 'Transferencia',       nombres: ['Transferencia'] },
  { etiqueta: 'MP',                  nombres: ['MP', 'Mercado Pago'] },
  { etiqueta: 'Echeq',               nombres: ['Echeq', 'E-Cheque'] },
  { etiqueta: 'Cta. Cte.',           nombres: ['Cta. Cte.', 'Cuenta Cte.'] },
  { etiqueta: 'Debito Automatico',   nombres: ['Debito Automatico', 'Débito Automático'] },
]

// Mismo criterio de comparación que usan los syncs (jobs/*/metodos.js): sin
// acentos, sin mayúsculas y sin puntuación, porque el mismo método está escrito
// de tres formas distintas según quién lo cargó.
const normalizar = (s) =>
  String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')

const ORDEN = new Map()
METODOS_OP.forEach((m, i) => m.nombres.forEach((n) => ORDEN.set(normalizar(n), i)))

// El catálogo recortado a lo que se ofrece al cargar una op, en el orden de
// METODOS_OP. Un método que la base no tiene simplemente no aparece: no se
// inventa una option sin id, que no se podría guardar.
export function metodosParaOp(metodos) {
  return (metodos ?? [])
    .filter((m) => ORDEN.has(normalizar(m?.nombre)))
    .sort((a, b) => ORDEN.get(normalizar(a.nombre)) - ORDEN.get(normalizar(b.nombre)))
}
// El catálogo que sirve el backend trae solo los métodos activos, y encima la
// lista de una op va filtrada por metodosParaOp. Un pago existente puede tener
// un método que no está en esa lista (desactivado después de cargarlo, o de los
// que ya no se ofrecen). Si el value del <select> no está entre las options,
// React lo muestra EN BLANCO y parece que el dato se perdió: acá se antepone
// una option con el método guardado para que siempre se vea lo que hay.
//
// `catalogo` es la lista completa que llegó del backend, y sirve para no
// mentir en el rótulo: un método que sigue activo pero ya no se ofrece al
// cargar no es un método "inactivo".
export function opcionesMetodos(metodos, idSeleccionado, nombreSeleccionado, catalogo) {
  const lista = metodos ?? []
  if (idSeleccionado && !lista.some((m) => m.id === idSeleccionado)) {
    const sigueActivo = (catalogo ?? []).some((m) => m.id === idSeleccionado)
    const nombre = nombreSeleccionado
      ? `${nombreSeleccionado}${sigueActivo ? '' : ' (inactivo)'}`
      : '(método actual)'
    return [{ id: idSeleccionado, nombre }, ...lista]
  }
  return lista
}
