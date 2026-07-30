// Clasificaciones de detalle de caja: definen como participa el detalle en la
// diferencia de caja (el calculo vive en lib/cuadreCaja.js).
//
// Antes eran canal/medio_pago/calculo/otro, que describian el dato pero no su
// efecto en el calculo: no habia forma de marcar un tipo como "no suma", y
// tampoco de crear uno que restara (el codigo buscaba 'egreso', que no estaba
// en la lista de validos, asi que ningun gasto restaba nunca).
//
// Viven aca y no en una ruta porque las usan dos: detalle_tipos.js (la
// clasificacion del tipo, que sirve de sugerencia) y caja_detalles.js (la
// clasificacion elegida en el detalle, que es la que manda).
export const CLASIFICACIONES = ['cobro', 'gasto', 'informativo']

// Valores anteriores: se siguen aceptando en la entrada para no romper
// integraciones ni el sync de TapTap, y se traducen al vigente antes de guardar.
export const EQUIVALENCIAS = {
  ingreso: 'cobro',
  medio_pago: 'cobro',
  egreso: 'gasto',
  canal: 'informativo',
  otro: 'informativo',
  calculo: 'informativo'
}

// Devuelve la clasificacion vigente equivalente, o null si el valor no se
// reconoce. Ojo: null significa "invalido" y tambien "no vino nada", asi que
// quien llama tiene que distinguir esos dos casos antes de rechazar.
export function normalizarClasificacion(valor) {
  if (!valor) return null
  const v = String(valor).toLowerCase()
  if (CLASIFICACIONES.includes(v)) return v
  return EQUIVALENCIAS[v] ?? null
}
