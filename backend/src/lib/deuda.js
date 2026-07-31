// La deuda es la suma de los EGRESOS impagos menos la suma de los INGRESOS
// impagos. La dirección la da `ingresa_egreso`, no el tipo de comprobante.
//
// Por qué no se excluyen NCA/NCB por tipo: en este proyecto los montos son
// siempre positivos y la dirección vive en un campo aparte (verificado: cero
// filas con importe < 0 en las 28.920 de pagos). Una nota de crédito cargada
// como ingreso resta sola, sin que el código tenga que saber que es una nota
// de crédito. Eso también cubre cualquier otro ingreso impago.
//
// El bug que esto arregla: `total_adeudado` sumaba TODOS los impagos sin mirar
// la dirección, así que los ingresos impagos inflaban la deuda en el doble de
// su valor. Medido el 31/07/2026: 152.453.997,74 informado contra 145.313.028,26
// real, o sea 7.140.969,48 de más.
//
// Límite conocido: 8 notas de crédito están cargadas como egreso en vez de
// ingreso (2 impagas por 451.238,33). En la base son indistinguibles de una
// factura, así que siguen sumando. Se decidió no corregir el dato ni agregar
// excepciones por tipo.

// Parte un `where` de Prisma en los dos que hacen falta para la deuda. El
// filtro de la deuda manda sobre lo que venga del where base: la deuda es por
// definición lo impago, aunque el usuario esté mirando los pagos ya pagados.
export function wheresDeuda(whereBase = {}) {
  return {
    egresos:  { ...whereBase, pagado: false, ingresa_egreso: false },
    ingresos: { ...whereBase, pagado: false, ingresa_egreso: true }
  }
}

// Puede dar negativo: significa saldo a favor del local. No se recorta a cero
// a propósito, un cero escondería el saldo real.
export function deudaNeta(sumaEgresos, sumaIngresos) {
  return Number(sumaEgresos ?? 0) - Number(sumaIngresos ?? 0)
}
