// Cuenta corriente de un cliente.
//
// Un "cliente" es con quién el local abre una cuenta. Sus movimientos NO son una
// entidad nueva: son los `Pago` que tienen `id_cliente`.
//
// Hay DOS ejes, y los dos importan. La cuenta corriente no es un solo número: son
// cuatro baldes, y pagar mueve plata de un balde al de al lado.
//
//                          sin pagar              pagado
//   egreso (false)   Gastos pendientes    ->    Gastos
//   ingreso (true)   A cobrar             ->    Ingresos
//
//   - Egreso sin pagar = el local se comprometió a un gasto a nombre del cliente y
//     todavía no lo pagó. Es un gasto pendiente. Cuando se paga, pasa a Gastos.
//   - Ingreso sin pagar = el cliente le debe esa plata al local. Es lo que hay a
//     cobrar. Cuando se cobra, pasa a Ingresos.
//
// Los cuatro totales cuentan SIEMPRE, pagados y sin pagar. Marcar un pago como pagado
// no agrega ni saca plata de la cuenta: la mueve de un balde al otro, así que los
// totales se recalculan entre sí.
//
// La dirección la da `ingresa_egreso`, el mismo campo y la misma convención que usan
// deuda.js y direccionPagos.js -- no se inventa nada acá:
//
//   ingresa_egreso = false  ->  egreso
//   ingresa_egreso = true   ->  ingreso
//
// No se extiende deuda.js: `wheresDeuda` hardcodea `pagado: false` porque responde
// "cuánto le debemos a proveedores todavía sin pagar", una pregunta distinta.

const esIngreso = (p) => p?.ingresa_egreso === true

// `pagado` es el campo autoritativo. `fecha_pago` acompaña pero no decide: hay pagos
// marcados como pagados sin fecha cargada, y tomarlos como pendientes por eso los
// haría figurar como plata a cobrar que ya se cobró.
const estaPagado = (p) => p?.pagado === true

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// El monto siempre en positivo: la dirección la lleva `ingresa_egreso`, no el signo
// del importe. Es la misma convención que el resto del proyecto (ver la nota de
// signos en las migraciones: montos positivos, dirección aparte).
const monto = (p) => Math.abs(num(p?.importe))

export const CUADRANTES = {
  GASTOS_PENDIENTES: 'gastos_pendientes',
  GASTOS: 'gastos',
  A_COBRAR: 'a_cobrar',
  INGRESOS: 'ingresos',
}

// En qué balde cae un movimiento. Una sola función para que la pantalla, los totales
// y los tests clasifiquen igual.
export function cuadranteDe(pago) {
  if (esIngreso(pago)) {
    return estaPagado(pago) ? CUADRANTES.INGRESOS : CUADRANTES.A_COBRAR
  }
  return estaPagado(pago) ? CUADRANTES.GASTOS : CUADRANTES.GASTOS_PENDIENTES
}

// Los cuatro totales, más los dos números que se leen arriba de la ficha.
//
// No hay un "saldo" con dirección: no existe un solo número que resuma esta cuenta.
// Lo que el cliente debe y lo que el local le falta pagar son dos cosas distintas y
// van por separado (ver la nota de `debe_cliente` más abajo).
export function totalesCuentaCorriente(pagos) {
  const t = {
    [CUADRANTES.GASTOS_PENDIENTES]: 0,
    [CUADRANTES.GASTOS]: 0,
    [CUADRANTES.A_COBRAR]: 0,
    [CUADRANTES.INGRESOS]: 0,
  }
  const cantidad = { ...t }

  for (const p of pagos ?? []) {
    const c = cuadranteDe(p)
    t[c] += monto(p)
    cantidad[c] += 1
  }

  const egresos = t[CUADRANTES.GASTOS] + t[CUADRANTES.GASTOS_PENDIENTES]
  const ingresos = t[CUADRANTES.INGRESOS] + t[CUADRANTES.A_COBRAR]

  return {
    // Los cuatro tags.
    gastos_pendientes: t[CUADRANTES.GASTOS_PENDIENTES],
    gastos: t[CUADRANTES.GASTOS],
    a_cobrar: t[CUADRANTES.A_COBRAR],
    ingresos: t[CUADRANTES.INGRESOS],
    cantidad,

    // ── Los dos números que la pantalla muestra en grande ──────────────────
    //
    // `debe_cliente` es lo que el cliente debe HOY: los ingresos que todavía no
    // pagó. Es la definición del negocio -- "si un cliente crea una op ingreso para
    // el local, el cliente le está debiendo".
    //
    // Ojo con la tentación de calcularlo como `egresos - ingresos`: eso da el signo
    // AL REVÉS. Un cliente con un ingreso sin cobrar de 1.000.000 y ningún egreso
    // daría -1.000.000, o sea "a favor 1.000.000" para alguien que debe un millón.
    // Pasó en pruebas con datos reales.
    debe_cliente: t[CUADRANTES.A_COBRAR],
    // Lo que el local todavía tiene que pagar de esa cuenta.
    falta_pagar: t[CUADRANTES.GASTOS_PENDIENTES],

    // Los netos por eje, informativos: cuánto movió esta cuenta en cada dirección
    // contando pagado y sin pagar. NO son un saldo y no llevan dirección.
    total_egresos: egresos,
    total_ingresos: ingresos,
    // Lo que falta mover de cuadrante: cuánto de la cuenta está sin cerrar.
    total_pendiente: t[CUADRANTES.GASTOS_PENDIENTES] + t[CUADRANTES.A_COBRAR],
  }
}

// Los mismos totales pero armados desde un groupBy de Prisma, para el listado de
// clientes: traer todos los pagos de todos los clientes para sumarlos en JS es
// traerse la tabla entera. Cada fila es
// { id_cliente, ingresa_egreso, pagado, _sum: { importe } }.
//
// Reusa `cuadranteDe` a propósito: si la clasificación viviera dos veces, el tag del
// listado y el de la ficha podrían decir cosas distintas del mismo cliente.
export function totalesPorCliente(filas) {
  const porCliente = new Map()
  for (const f of filas ?? []) {
    if (!f?.id_cliente) continue
    if (!porCliente.has(f.id_cliente)) porCliente.set(f.id_cliente, [])
    porCliente.get(f.id_cliente).push({
      ingresa_egreso: f.ingresa_egreso,
      pagado: f.pagado,
      importe: f._sum?.importe ?? 0,
    })
  }
  const out = {}
  for (const [id, movs] of porCliente) out[id] = totalesCuentaCorriente(movs)
  return out
}

// El filtro con el que se traen los movimientos de un cliente.
//
// SIN filtro por `pagado`: los cuatro cuadrantes cuentan, y un pago sin pagar es
// justamente el que hay que ver (gasto pendiente o plata a cobrar). Antes esto
// filtraba `pagado: true` y la cuenta mostraba solo la mitad cerrada, que es lo que
// se vino a corregir.
//
// `estado_op` queda como filtro defensivo: el backend ya exige CTA_CTE_CLI para poder
// guardar un id_cliente, así que no debería haber otros, pero si aparece uno no se
// cuela a los totales.
export function whereMovimientosCliente(idCliente) {
  return {
    id_cliente: idCliente,
    estado_op: 'CTA_CTE_CLI',
  }
}

// Cliente y estado_op van juntos en las dos direcciones. Vive acá y no en la ruta
// porque es lo que sostiene la cuenta, y la cuenta se arma con
// `whereMovimientosCliente` de más arriba: las dos reglas tienen que contar lo mismo.
//
//   - Cliente con otro estado: el pago no entra en `whereMovimientosCliente`, así que
//     la deuda queda contada en ningún lado.
//   - CTA_CTE_CLI sin cliente: es una deuda a nombre de nadie. Tampoco entra en
//     ninguna cuenta corriente y no hay forma de encontrarla después salvo mirando
//     los pagos uno por uno.
//
// Devuelve el mensaje de error, o null si está bien.
export function validarClienteYEstado(id_cliente, estado_op) {
  if (id_cliente && estado_op !== 'CTA_CTE_CLI') {
    return 'Para asignar un cliente, el estado de la op tiene que ser CTA CTE CLI'
  }
  if (!id_cliente && estado_op === 'CTA_CTE_CLI') {
    return 'Con estado CTA CTE CLI hay que elegir el cliente de la cuenta corriente'
  }
  return null
}
