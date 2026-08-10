// Textos de ayuda de los campos de una caja.
//
// Viven acá y no en cada pantalla porque el mismo campo se carga en DOS formularios
// —el alta (CajaCreatePanel) y la edición (CajaEditPanel)— y una ayuda copiada en dos
// lugares se corrige en uno solo.

// El efectivo declarado de la caja no es un dato informativo: entra en dos cuentas, y
// quien lo carga no tiene por qué saberlo.
//
//   1. El ARQUEO del local lo suma como el ingreso en efectivo del período
//      (`calcularIngresos` en backend/src/routes/arqueo.js suma exactamente
//      `caja.efectivo` de las cajas del rango).
//   2. El CUADRE de la propia caja lo usa como punto de partida:
//      esperado = efectivo + cobros − gastos (backend/src/lib/cuadreCaja.js).
//
// Se nombra solo el arqueo porque es el que sorprende: que el número afecte al cuadre
// de su propia caja es esperable, que se arrastre al arqueo del local no.
export const AYUDA_EFECTIVO = 'Este campo afecta al arqueo: se suma como el efectivo que ingresó en el período.'
