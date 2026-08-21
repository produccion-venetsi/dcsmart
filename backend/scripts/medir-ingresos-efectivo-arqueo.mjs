// Cuánto cambia la comprobación de los arqueos ya cargados si se recalcula
// contando las ops de ingreso en efectivo. Solo lectura.
import { PrismaClient } from '@prisma/client'
import { calcularComprobacion, describirComprobacion, arqueoCuadra } from './src/lib/cuadreArqueo.js'
import { whereCajasCandidatas, sumarEfectivoDelPeriodo } from './src/lib/periodoArqueo.js'
import { wherePagosEfectivo, separarPagosEfectivo } from './src/lib/pagosEfectivoArqueo.js'

const p = new PrismaClient()
const met = await p.metodoPago.findFirst({ where: { nombre: { equals: 'Efectivo', mode: 'insensitive' } } })
const arqueos = await p.arqueo.findMany({ orderBy: [{ id_local: 'asc' }, { fecha: 'asc' }], include: { local: { select: { nombre: true } } } })

let cambian = 0, pasanACuadrar = 0, dejanDeCuadrar = 0
const porLocal = new Map()

for (const a of arqueos) {
  const anterior = await p.arqueo.findFirst({ where: { id_local: a.id_local, fecha: { lt: a.fecha } }, orderBy: { fecha: 'desc' } })
  const desde = anterior ? anterior.fecha : null
  const contadoAnterior = anterior ? Number(anterior.total) : 0
  const cajas = await p.caja.findMany({
    where: whereCajasCandidatas(a.id_local, desde, a.fecha),
    select: { efectivo: true, fecha_inicio: true, fecha_cierre: true },
  })
  const efectivoCajas = sumarEfectivoDelPeriodo(cajas, desde, a.fecha)
  const pagos = met ? await p.pago.findMany({
    where: wherePagosEfectivo({ id_local: a.id_local, id_metodo: met.id, desde, hasta: a.fecha }),
    select: { importe: true, ingresa_egreso: true },
  }) : []
  const { ingresos: ingPagos, egresos } = separarPagosEfectivo(pagos)

  const viejo = calcularComprobacion({ ingresos: efectivoCajas, gastos: egresos, contado: Number(a.total), contadoAnterior })
  const nuevo = calcularComprobacion({ ingresos: efectivoCajas + ingPagos, gastos: egresos, contado: Number(a.total), contadoAnterior })
  if (ingPagos === 0) continue

  cambian++
  const cuadrabaAntes = arqueoCuadra(viejo), cuadraAhora = arqueoCuadra(nuevo)
  if (!cuadrabaAntes && cuadraAhora) pasanACuadrar++
  if (cuadrabaAntes && !cuadraAhora) dejanDeCuadrar++
  const k = a.local.nombre
  if (!porLocal.has(k)) porLocal.set(k, [])
  porLocal.get(k).push({
    fecha: a.fecha.toISOString().slice(0, 16).replace('T', ' '),
    esPrimero: !anterior,
    ingPagos,
    antes: describirComprobacion(viejo, { esPrimero: !anterior }),
    despues: describirComprobacion(nuevo, { esPrimero: !anterior }),
  })
}

const f = (n) => '$' + Math.round(n).toLocaleString('es-AR')
for (const [local, filas] of porLocal) {
  console.log(`\n${local}`)
  for (const x of filas) {
    console.log(`  ${x.fecha}  ingresos-efvo ${f(x.ingPagos).padStart(14)}  ${x.antes.texto}${x.antes.monto ? ' ' + f(x.antes.monto) : ''} -> ${x.despues.texto}${x.despues.monto ? ' ' + f(x.despues.monto) : ''}${x.esPrimero ? '  (linea de base)' : ''}`)
  }
}
console.log(`\n${arqueos.length} arqueos · ${cambian} cambian de numero · ${pasanACuadrar} pasan a cuadrar · ${dejanDeCuadrar} dejan de cuadrar`)
await p.$disconnect()
