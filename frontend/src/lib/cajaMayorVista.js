// La vista de Caja Mayor partida en dos, por DIRECCIÓN de la plata.
//
// ── El error que este archivo tenía ──────────────────────────────────────────
//
// Las columnas se llamaban "Enviado" y "Recibido", que son exactamente los dos valores
// del enum `EstadoCM` (ENVIADA / RECIBIDA). Pero no mostraban el estado: mostraban la
// dirección. Resultado: en ADA, donde los 4 movimientos están RECIBIDA, dos de ellos
// aparecían bajo "enviadas a caja mayor" y se leía como un error de datos.
//
// Son dos preguntas distintas y las dos importan:
//
//   DIRECCIÓN: ¿el local depositó plata en la caja mayor, o extrajo?
//   ESTADO:    ¿la caja mayor ya confirmó la recepción, o sigue en camino?
//
// Un movimiento puede ser "depositado" Y "recibido" al mismo tiempo — de hecho es el caso
// normal. Así que las columnas ahora usan el vocabulario del propio modelo (`extrae`,
// `fecha_extraccion`): DEPOSITADO y EXTRAÍDO. Y el estado va aparte, como lo pendiente.
//
// ── La traducción cruzada, que sigue valiendo ───────────────────────────────
//
// En `MovimientoCM`, `ingreso: true` significa "entra plata a la CAJA MAYOR", y eso pasa
// cuando el LOCAL manda plata (ver `direccionCajaMayor` en el backend: un egreso del local
// es un ingreso a la caja mayor). Por eso:
//
//   ingresos de la caja mayor  ->  lo que el local DEPOSITÓ
//   egresos  de la caja mayor  ->  lo que el local EXTRAJO

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// ── Dirección ────────────────────────────────────────────────────────────────

// Lo que el local depositó en la caja mayor (entra a la caja mayor).
export const depositadoPorLocal = (s) => Math.abs(num(s?.ingresos))
// Lo que el local extrajo de la caja mayor (sale de la caja mayor).
export const extraidoPorLocal = (s) => Math.abs(num(s?.egresos))

// ── Estado ───────────────────────────────────────────────────────────────────
//
// Lo que todavía está en ENVIADA: se cargó pero la caja mayor no confirmó que lo tenga.
// El backend lo manda ya cortado por dirección (`saldosDeAgregados`).
export const pendienteDepositado = (s) => Math.abs(num(s?.pendiente_ingresos))
export const pendienteExtraido = (s) => Math.abs(num(s?.pendiente_egresos))

// ¿Este local tiene algo sin confirmar? Es lo que decide si la fila se marca.
export const tienePendiente = (s) =>
  pendienteDepositado(s) > 0 || pendienteExtraido(s) > 0 || num(s?.en_estudio) > 0

// Cómo se lee el estado de una fila. Se dice en palabras porque "2" a secas no aclara si
// son movimientos, pesos o locales.
export function textoEstado(f) {
  const ops = num(f?.sin_recibir)
  if (!ops) return 'Todo confirmado'
  return `${ops} sin confirmar`
}

// ── Las dos mitades de la vista ──────────────────────────────────────────────
//
// Los mismos locales en el mismo orden en las dos columnas: un local aparece en los dos
// lados aunque de un lado tenga cero, porque poder leer las dos columnas a la misma altura
// es lo que permite compararlas. Filtrar los ceros desalinearía las filas.
//
// El orden lo fija `depositado` de mayor a menor, con el nombre como desempate: lo que más
// se movió va arriba, que es lo que se busca al abrir la pantalla.
export function dividirPorDireccion(saldos) {
  const filas = (saldos ?? []).map((s) => ({
    id_local: s.id_local,
    local: s.local ?? '—',
    grupo: s.grupo ?? null,
    moneda: s.moneda,
    // dirección
    depositado: depositadoPorLocal(s),
    extraido: extraidoPorLocal(s),
    // estado: cuánto de lo anterior sigue sin confirmar
    pendiente_depositado: pendienteDepositado(s),
    pendiente_extraido: pendienteExtraido(s),
    ops: num(s.ops),
    ops_depositado: num(s.ops_ingresos),
    ops_extraido: num(s.ops_egresos),
    sin_recibir: num(s.en_estudio),
  }))

  const ordenadas = filas.slice().sort((a, b) =>
    b.depositado - a.depositado || String(a.local).localeCompare(String(b.local), 'es'))

  const totalDepositado = filas.reduce((acc, f) => acc + f.depositado, 0)
  const totalExtraido = filas.reduce((acc, f) => acc + f.extraido, 0)
  const totalPendiente = filas.reduce((acc, f) => acc + f.pendiente_depositado + f.pendiente_extraido, 0)

  return {
    filas: ordenadas,
    totalDepositado,
    totalExtraido,
    // El neto es lo que la caja mayor tiene de ese local: depositó menos extrajo.
    // Positivo = el local puso más de lo que sacó.
    neto: totalDepositado - totalExtraido,
    // Lo mismo pero contando SOLO lo confirmado: es "cuánto hay" en vez de "cuánto va a
    // haber". Las dos preguntas se miran y dan números distintos.
    netoConfirmado:
      (totalDepositado - filas.reduce((a, f) => a + f.pendiente_depositado, 0)) -
      (totalExtraido - filas.reduce((a, f) => a + f.pendiente_extraido, 0)),
    totalPendiente,
    locales: filas.length,
    sinRecibir: filas.reduce((acc, f) => acc + f.sin_recibir, 0),
  }
}

// El neto de una fila, con el mismo criterio que el total.
export const netoDeFila = (f) => num(f?.depositado) - num(f?.extraido)

// Cuánto pesa un local dentro de su columna, para la barra de proporción. Sin esto, una
// lista de números no dice quién mueve la caja: hay que compararlos de memoria.
export function proporcion(monto, total) {
  const t = num(total)
  if (!t) return 0
  return Math.min(100, (Math.abs(num(monto)) / t) * 100)
}

// ── División por ESTADO ──────────────────────────────────────────────────────
//
// La partición que pidió el dueño del producto (Trello "CM. Estado"): el primer
// corte es enviada/recibida — ¿la caja mayor ya confirmó la plata o sigue en
// camino? — y la dirección (depositado/extraído) va ADENTRO de cada lado. Es la
// inversa de dividirPorDireccion, que queda para los totales del encabezado.
export function dividirPorEstado(saldos) {
  const base = dividirPorDireccion(saldos)
  const filas = base.filas.map((f) => {
    const enviadaDep = f.pendiente_depositado
    const enviadaExt = f.pendiente_extraido
    const recibidaDep = f.depositado - enviadaDep
    const recibidaExt = f.extraido - enviadaExt
    return {
      ...f,
      enviada_depositado: enviadaDep,
      enviada_extraido: enviadaExt,
      enviada_total: enviadaDep + enviadaExt,
      ops_enviada: f.sin_recibir,
      recibida_depositado: recibidaDep,
      recibida_extraido: recibidaExt,
      recibida_total: recibidaDep + recibidaExt,
      // El SALDO de cada lado: depositado menos extraído. `recibida_saldo` es
      // lo que la caja mayor efectivamente TIENE de ese local (confirmado);
      // el total del movimiento (dep+ext) dice cuánto se movió, no cuánto hay.
      enviada_saldo: enviadaDep - enviadaExt,
      recibida_saldo: recibidaDep - recibidaExt,
      ops_recibida: f.ops - f.sin_recibir,
    }
  })
  return {
    ...base,
    filas,
    totalEnviada: filas.reduce((a, f) => a + f.enviada_total, 0),
    totalRecibida: filas.reduce((a, f) => a + f.recibida_total, 0),
    saldoEnviada: filas.reduce((a, f) => a + f.enviada_saldo, 0),
    saldoRecibida: filas.reduce((a, f) => a + f.recibida_saldo, 0),
  }
}

// Las filas agrupadas por grupo (la app del local), con subtotales por lado:
// la lista plana mezclaba PERROS con JD y el subtotal del grupo se hacía a ojo.
// El orden de los grupos lo fija su movimiento total (los grandes arriba), y
// adentro las filas conservan el orden que ya traían.
export function agruparPorGrupo(filas) {
  const grupos = new Map()
  for (const f of filas ?? []) {
    const clave = f.grupo ?? 'Sin grupo'
    if (!grupos.has(clave)) {
      grupos.set(clave, {
        grupo: clave, filas: [],
        enviada_total: 0, recibida_total: 0, enviada_saldo: 0, recibida_saldo: 0,
      })
    }
    const g = grupos.get(clave)
    g.filas.push(f)
    g.enviada_total += num(f.enviada_total)
    g.recibida_total += num(f.recibida_total)
    g.enviada_saldo += num(f.enviada_saldo)
    g.recibida_saldo += num(f.recibida_saldo)
  }
  return [...grupos.values()].sort(
    (a, b) => (b.enviada_total + b.recibida_total) - (a.enviada_total + a.recibida_total)
  )
}
