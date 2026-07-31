// Una factura está "fuera de término" si se cargó en un mes posterior al mes de
// su período: pertenece a un mes que probablemente ya se reportó al cliente, y
// por eso los números del informe enviado dejan de coincidir con la app.
//
// Es el problema que Anaxi describió el 31/07/2026: los administrativos cargan
// facturas tarde y el informe de un mes cerrado cambia después de mandado.
//
// Se compara MES contra MES, no día contra día. El período representa un mes
// (el 97,8% de los pagos con período tienen día 1), así que el día es ruido.
// Cargar el 31 de agosto una factura de agosto está en término; cargar el 1 de
// septiembre esa misma factura, no.
//
// Ojo con la zona horaria: `created_at` es un instante real y se guarda en UTC.
// Un pago cargado el 31/08 a las 22hs de Argentina es el 01/09 en UTC, y sin
// corregir eso quedaría marcado como fuera de término sin serlo. Por eso se
// pasa a hora de Argentina antes de sacar el mes.
const OFFSET_ARG_MS = 3 * 60 * 60 * 1000

// Un valor es un INSTANTE (y hay que pasarlo a hora de Argentina) si trae hora:
// un Date, o un ISO con 'T12:34'. Un 'YYYY-MM-DD' pelado es un día calendario y
// se toma tal cual — restarle 3hs lo correría al mes anterior, que es
// justamente el error que este módulo trata de evitar.
function esInstante(valor) {
  return valor instanceof Date || /T\d{2}:/.test(String(valor))
}

// Número de mes absoluto (año * 12 + mes) o null si no se entiende el valor.
function mesAbsoluto(valor, puedeSerInstante) {
  if (!valor) return null
  const d = valor instanceof Date ? valor : new Date(valor)
  if (Number.isNaN(d.getTime())) return null

  const corregir = puedeSerInstante && esInstante(valor)
  const enZona = new Date(corregir ? d.getTime() - OFFSET_ARG_MS : d.getTime())
  return enZona.getUTCFullYear() * 12 + enZona.getUTCMonth()
}

export function esFueraDeTermino(periodo, createdAt) {
  // El período es siempre un día calendario a medianoche UTC.
  const mesPeriodo = mesAbsoluto(periodo, false)
  // created_at desde la base es un instante real: se lleva a hora de Argentina.
  const mesCarga = mesAbsoluto(createdAt, true)

  if (mesPeriodo === null || mesCarga === null) return false
  return mesPeriodo < mesCarga
}
