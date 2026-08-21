// Caja Mayor: dirección de los movimientos y cálculo del saldo.
//
// Reemplaza al AppSheet DC-CAJA MAYOR. Todo lo de abajo está calibrado contra el
// export de esa app (3535 filas en CM, 217 en CM_DOLAR, nov/2024 a ago/2026), que
// vive fuera del repo en `app vieja caja mayor/`.
//
// ── Cómo llevaba el signo la app vieja ──────────────────────────────────────
// Guardaba el signo DENTRO del importe: 1940 filas negativas y 1591 positivas, y
// el saldo era la suma cruda. Se verificó que reproduce exactamente lo que la app
// muestra en pantalla: PERROS_PESOS suma -13.615.077, JD_PESOS 401.629 y TITA
// 1.543.640, los tres al peso.
//
// Acá NO se hace así: el importe es siempre positivo y la dirección va aparte, que
// es la regla del resto del sistema (ver migraciones/REGLAS_MIGRACION.md y el
// descuadre del 878, causado justamente por mezclar las dos cosas). Al migrar, el
// signo del importe viejo se traduce a `ingreso`: negativo => false.
//
// ── De dónde sale la dirección de una op de gestión ─────────────────────────
// Un Pago con id_tipo = 'CM' trae `ingresa_egreso`, que describe el efecto en la
// caja DEL LOCAL, no en la caja mayor. Un retiro del local es egreso ahí
// (`ingresa_egreso = false`) y a la vez ingreso a la caja mayor: la plata se mueve
// de un lado al otro. Por eso la regla INVIERTE el valor.
//
// La app vieja confirma la inversión con datos: de los 1122 retiros a caja mayor
// que le llegaron desde gestión (rubcat RC-206, Orden OP-), **1092 están cargados
// en positivo**. Un retiro suma a la caja mayor.
//
// Pero la regla NO es universal: entre las ops CM de gestión hay 34 Sueldos y 4
// Liquidación final, también con `ingresa_egreso = false`. Un sueldo pagado desde
// la caja mayor es un EGRESO de la caja mayor, y la regla invertida lo contaría
// como ingreso. Con un solo booleano no alcanza para distinguirlos, así que:
//
//   1. la regla propone la dirección (acierta en la gran mayoría),
//   2. el módulo la muestra siempre a la vista, y
//   3. se puede corregir a mano -- el override se guarda en
//      MovimientoCM.ingreso, con direccion_manual en true, y desde entonces
//      manda sobre la regla.
//
// Si algún día se decide que la dirección la fije la categoría del rubcat, el
// único lugar a cambiar es direccionCajaMayor().

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// Rubros/categorías cuya dirección la regla del booleano deduce mal. Son gastos
// pagados DESDE la caja mayor: la plata sale, aunque en la caja del local
// figuren como egreso igual que un retiro.
const RUBROS_QUE_SALEN_DE_CM = new Set(['Sueldos', 'Socios', 'Honorarios'])

// ¿Este movimiento entra plata a la caja mayor?
//
// `mov` es la fila de MovimientoCM (puede no existir) y `pago` la op de gestión.
// El override manual gana siempre; después la regla.
export function direccionCajaMayor(pago, mov) {
  // Corregida a mano: manda la corrección, no la regla.
  if (mov?.direccion_manual === true) return mov.ingreso === true
  if (!pago) return mov?.ingreso === true

  // Gasto pagado desde la caja mayor: sale plata.
  const rubro = pago?.rubcat?.rubro?.nombre
  if (rubro && RUBROS_QUE_SALEN_DE_CM.has(rubro)) return false

  // Regla general, invertida respecto de la caja del local. `ingresa_egreso`
  // null/undefined cuenta como egreso del local (es el default de la columna),
  // y por lo tanto como ingreso a la caja mayor.
  return pago.ingresa_egreso !== true
}

// ¿La dirección de esta fila fue corregida a mano?
export function tieneOverride(mov) {
  return mov?.direccion_manual === true
}

// Los datos con los que se copia un Pago de tipo CM a la caja mayor. Es una
// función pura para poder testear qué se copia sin tocar la base; quien escribe
// es copiarPagoACajaMayor() en routes/pagos.js.
//
// El estado arranca en ENVIADA: la op existe porque el local mandó la plata, y el
// CM todavía tiene que confirmar que llegó.
export function datosCopiaDePago(pago) {
  return {
    id_pago: pago.id,
    id_local: pago.id_local,
    origen: 'PAGO',
    moneda: 'ARS', // gestión carga los pagos en pesos
    fecha: pago.fecha ?? null,
    importe: Math.abs(num(pago.importe)),
    ingreso: direccionCajaMayor(pago, null),
    estado: 'ENVIADA',
    observaciones: pago.observaciones ?? null,
  }
}

// Qué actualizar en la copia cuando el pago cambió en gestión. Deliberadamente NO
// toca el estado ni los campos que se cargan en el módulo (recibe, extrae,
// fecha_extraccion): corregir el importe de una op no puede deshacer que alguien
// ya confirmó que la plata llegó.
//
// La dirección se recalcula salvo que se haya corregido a mano -- si no, el
// próximo cambio de importe en gestión pisaría la corrección.
export function datosSincroDePago(pago, mov) {
  return {
    fecha: pago.fecha ?? null,
    importe: Math.abs(num(pago.importe)),
    id_local: pago.id_local,
    observaciones: pago.observaciones ?? null,
    ...(mov?.direccion_manual ? {} : { ingreso: direccionCajaMayor(pago, null) }),
  }
}

// ¿Esta op tiene que estar en la caja mayor? Un solo lugar para la pregunta, así
// el alta y la edición no pueden discrepar. Sin local no se puede copiar: el
// movimiento necesita saber a qué caja mayor va.
export function vaACajaMayor(pago) {
  return pago?.id_tipo === 'CM' && Boolean(pago?.id_local)
}

// Largos máximos de los campos de texto. El frontend los muestra como contador
// (ver CampoTexto), pero el límite tiene que estar acá para que sea una garantía:
// `maxLength` del navegador solo frena el tipeo, no un pegado por código ni un
// pedido armado a mano contra la API.
//
// 500 para observaciones es holgado: en los 3766 movimientos migrados la más larga
// tiene 183 caracteres y el promedio es 32.
export const LARGOS = { observaciones: 500, recibe: 60, extrae: 60 }

// Devuelve el mensaje del primer campo que se pasa de largo, o null si están bien.
export function validarLargos(campos) {
  for (const [campo, max] of Object.entries(LARGOS)) {
    const v = campos?.[campo]
    if (typeof v === 'string' && v.length > max) {
      return `${campo} no puede tener más de ${max} caracteres (tiene ${v.length})`
    }
  }
  return null
}

// Importe siempre positivo: si viene un negativo se toma el valor absoluto, porque
// el signo lo lleva la dirección y nunca el monto (ver REGLAS_MIGRACION.md, y el
// descuadre del 878 que salió de mezclarlos).
export function importeMovimiento(fila) {
  return Math.abs(num(fila?.importe))
}

// Normaliza una fila de movimientos_cm a la forma que consume el frontend. El
// `pago` incluido es solo para trazabilidad (nro de OP, rubro, adjuntos): los
// datos del movimiento salen de la fila, que es la copia.
export function normalizarMovimiento(fila) {
  const pago = fila?.pago ?? null
  const ingreso = fila?.ingreso === true
  const importe = importeMovimiento(fila)

  return {
    id: fila.id ?? null,
    id_pago: fila.id_pago ?? null,
    origen: fila.origen,
    id_local: fila.id_local ?? null,
    local: fila.local?.nombre ?? null,
    grupo: fila.local?.app?.nombre ?? null,
    moneda: fila.moneda ?? 'ARS',
    fecha: fila.fecha ?? null,
    importe,
    ingreso,
    // Lo que se suma al saldo. Se manda calculado para que la tabla y el total
    // no puedan discrepar.
    efecto: ingreso ? importe : -importe,
    direccion_corregida: tieneOverride(fila),
    estado: fila.estado ?? 'ENVIADA',
    recibe: fila.recibe ?? null,
    extrae: fila.extrae ?? null,
    fecha_extraccion: fila.fecha_extraccion ?? null,
    observaciones: fila.observaciones ?? null,
    recibida_at: fila.recibida_at ?? null,
    recibida_por: fila.receptor?.nombre ?? null,
    // De la op original, para poder rastrearla hasta gestión
    nro_ord: pago?.nro_ord ?? null,
    rubro: pago?.rubcat?.rubro?.nombre ?? null,
    categoria: pago?.rubcat?.categoria?.nombre ?? null,
    foto_url: pago?.foto_url ?? null,
    pdf_url: pago?.pdf_url ?? null,
    // Si el pago cambió en gestión y la copia no se sincronizó, se ve acá en vez
    // de que el saldo mienta en silencio.
    desfasado: pago != null && Math.abs(num(pago.importe)) !== importe,
    // Una op de gestión se corrige en Pagos; acá solo se gestiona su estado.
    editable: fila.origen !== 'PAGO',
    // El ciclo enviada/recibida es de las ops que llegan de gestión: a un ajuste
    // que cargó el propio CM no lo envía nadie.
    tiene_ciclo: fila.origen === 'PAGO',
  }
}

// Saldo a partir de las sumas agregadas que devuelve la base, en vez de recorrer
// las filas. Con 3766 movimientos, traerlas todas para sumarlas costaba 2 MB de
// payload y ~2 s por pedido; agrupando en SQL son cuatro números.
//
// `grupos` es el resultado de un groupBy por (ingreso, estado) con _sum.importe.
export function saldoDeAgregados(grupos) {
  let ingresos = 0, egresos = 0, pendiente = 0
  let ingresosRecibidos = 0, egresosRecibidos = 0
  for (const g of grupos ?? []) {
    const monto = Math.abs(num(g._sum?.importe))
    const esIngreso = g.ingreso === true
    const recibida = g.estado === 'RECIBIDA'

    if (esIngreso) ingresos += monto; else egresos += monto
    if (recibida) {
      if (esIngreso) ingresosRecibidos += monto; else egresosRecibidos += monto
    } else {
      pendiente += esIngreso ? monto : -monto
    }
  }
  return {
    // Los dos números, y la pantalla muestra `saldo_recibido` como EL saldo: el
    // saldo de un local en la caja mayor es lo RECIBIDO, ingresos menos egresos
    // (definición del usuario, 2026-08-21). `saldo` cuenta además lo que sigue
    // en ENVIADA, que es plata en camino: sirve para decir "cuánto va a haber",
    // no "cuánto hay".
    saldo: { ingresos, egresos, saldo: ingresos - egresos, pendiente },
    // Lo que hay confirmado en la caja, sin contar lo que todavía viaja.
    saldo_recibido: {
      ingresos: ingresosRecibidos,
      egresos: egresosRecibidos,
      saldo: ingresosRecibidos - egresosRecibidos,
      pendiente,
    },
  }
}

// Saldos por local y moneda desde un groupBy por (id_local, moneda, ingreso,
// estado). `nombres` mapea id_local -> { local, grupo }.
//
// Devuelve las DOS dimensiones separadas, porque son dos preguntas distintas y hasta
// ahora se confundían:
//
//   dirección (`ingreso`) -> ¿la plata entró a la caja mayor o salió?
//   estado                -> ¿ya se confirmó la recepción o sigue en camino?
//
// Un movimiento con `ingreso: true` y `estado: RECIBIDA` es plata que el local depositó Y
// que la caja mayor ya confirmó: las dos cosas a la vez. La pantalla mostraba la dirección
// con las palabras "enviado/recibido", que son justo los dos valores del estado, así que
// una fila RECIBIDA aparecía bajo "enviadas" y se leía como un error de datos.
//
// Por eso ahora los importes vienen cortados por estado además de por dirección:
// `pendiente_*` es lo que todavía no se confirmó.
export function saldosDeAgregados(grupos, nombres) {
  const porClave = new Map()
  for (const g of grupos ?? []) {
    const clave = `${g.id_local}|${g.moneda}`
    if (!porClave.has(clave)) {
      const n = nombres.get(g.id_local) ?? {}
      porClave.set(clave, {
        id_local: g.id_local, moneda: g.moneda,
        local: n.local ?? null, grupo: n.grupo ?? null,
        ingresos: 0, egresos: 0, ops: 0, en_estudio: 0,
        // Importes de lo que sigue en estado ENVIADA, por dirección.
        pendiente_ingresos: 0, pendiente_egresos: 0,
        // Cantidad de movimientos por dirección: sirve para decir "2 de 4" sin tener que
        // pedir las filas.
        ops_ingresos: 0, ops_egresos: 0,
      })
    }
    const acc = porClave.get(clave)
    const monto = Math.abs(num(g._sum?.importe))
    const cuantas = g._count?._all ?? 0
    const esIngreso = g.ingreso === true
    const recibida = g.estado === 'RECIBIDA'

    if (esIngreso) { acc.ingresos += monto; acc.ops_ingresos += cuantas }
    else { acc.egresos += monto; acc.ops_egresos += cuantas }

    acc.ops += cuantas
    if (!recibida) {
      acc.en_estudio += cuantas
      if (esIngreso) acc.pendiente_ingresos += monto
      else acc.pendiente_egresos += monto
    }
  }
  return [...porClave.values()]
    .map(a => ({
      ...a,
      saldo: a.ingresos - a.egresos,
      // Lo confirmado, que es "cuánta plata hay de verdad" (distinto de "cuánta va a haber").
      recibido_ingresos: a.ingresos - a.pendiente_ingresos,
      recibido_egresos: a.egresos - a.pendiente_egresos,
    }))
    .sort((a, b) =>
      (a.grupo ?? '').localeCompare(b.grupo ?? '') || (a.local ?? '').localeCompare(b.local ?? ''))
}

// Saldo de una lista ya normalizada. `soloRecibidas` responde la pregunta
// "cuánta plata hay realmente en la caja mayor" (lo ENVIADA se
// espera pero todavía no llegó).
export function calcularSaldo(movimientos, { soloRecibidas = false } = {}) {
  let ingresos = 0, egresos = 0, pendientes = 0
  for (const m of movimientos ?? []) {
    if (m.estado !== 'RECIBIDA') {
      pendientes += m.efecto
      if (soloRecibidas) continue
    }
    if (m.ingreso) ingresos += m.importe
    else egresos += m.importe
  }
  return {
    ingresos,
    egresos,
    saldo: ingresos - egresos,
    // Lo que entraría/saldría cuando se confirme lo que está ENVIADA.
    pendiente: pendientes,
  }
}

// Agrupa por local para la vista consolidada de todos los grupos, que es como
// se entra al módulo (igual que la pantalla CM GENERAL de AppSheet).
export function saldosPorLocal(movimientos, opts) {
  const porLocal = new Map()
  for (const m of movimientos ?? []) {
    const clave = `${m.id_local}|${m.moneda}`
    if (!porLocal.has(clave)) {
      porLocal.set(clave, { id_local: m.id_local, local: m.local, grupo: m.grupo, moneda: m.moneda, movimientos: [] })
    }
    porLocal.get(clave).movimientos.push(m)
  }
  return [...porLocal.values()]
    .map(({ movimientos: movs, ...resto }) => ({
      ...resto,
      ops: movs.length,
      en_estudio: movs.filter(m => m.estado !== 'RECIBIDA').length,
      ...calcularSaldo(movs, opts),
    }))
    .sort((a, b) => (a.grupo ?? '').localeCompare(b.grupo ?? '') || (a.local ?? '').localeCompare(b.local ?? ''))
}
