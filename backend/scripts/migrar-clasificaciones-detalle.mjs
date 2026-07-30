// Reduce las clasificaciones de detalle_tipos a las tres que se usan para el
// cuadre: cobro, gasto, informativo.
//
//   node scripts/migrar-clasificaciones-detalle.mjs            -> DRY RUN
//   node scripts/migrar-clasificaciones-detalle.mjs --aplicar   -> escribe
//
// Mapeo (mismo que ROL_POR_CLASIFICACION de lib/cuadreCaja.js, para que el
// calculo de las cajas historicas no cambie con la migracion):
//   ingreso, medio_pago -> cobro         (MP Point, MP QR, Transferencia)
//   egreso              -> gasto         ("Gastos")
//   canal               -> informativo   (Delivery, Rappi, Mostrador: desglose)
//   otro, calculo       -> informativo
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const APLICAR = process.argv.includes('--aplicar')
const MAPEO = {
  ingreso: 'cobro',
  medio_pago: 'cobro',
  egreso: 'gasto',
  canal: 'informativo',
  otro: 'informativo',
  calculo: 'informativo'
}

const db = new PrismaClient()

console.log(`\n${'='.repeat(64)}`)
console.log(`CLASIFICACIONES DE DETALLE  [${APLICAR ? 'APLICANDO' : 'DRY RUN'}]`)
console.log('='.repeat(64))

const tipos = await db.detalleTipo.findMany({
  select: { id: true, nombre: true, clasificacion: true, id_app: true },
  orderBy: { nombre: 'asc' }
})

const porClasif = {}
for (const t of tipos) {
  porClasif[t.clasificacion] ??= []
  porClasif[t.clasificacion].push(t)
}

console.log('\nEstado actual y destino:')
const aCambiar = []
for (const [clasif, lista] of Object.entries(porClasif).sort((a, b) => b[1].length - a[1].length)) {
  const destino = MAPEO[clasif]
  if (!destino) {
    console.log(`  ${String(lista.length).padStart(4)}  ${clasif.padEnd(12)} -> ya esta bien, no se toca`)
    continue
  }
  console.log(`  ${String(lista.length).padStart(4)}  ${clasif.padEnd(12)} -> ${destino}`)
  aCambiar.push(...lista.map((t) => ({ ...t, destino })))
}

// Cuantos detalles de caja quedan afectados por cada cambio de rol. Solo importa
// si el ROL cambia: si un tipo pasa de "ingreso" a "cobro" el calculo es igual.
const ROL_ANTES = {
  ingreso: 'cobro', medio_pago: 'cobro', egreso: 'gasto',
  canal: 'informativo', otro: 'informativo', calculo: 'informativo',
  cobro: 'cobro', gasto: 'gasto', informativo: 'informativo'
}
const cambianDeRol = aCambiar.filter((t) => ROL_ANTES[t.clasificacion] !== t.destino)
console.log(`\nTipos a renombrar: ${aCambiar.length}`)
console.log(`De esos, cambian de ROL (afectan el calculo): ${cambianDeRol.length}`)
if (cambianDeRol.length) {
  for (const t of cambianDeRol.slice(0, 10)) {
    console.log(`  ! ${t.nombre} (${t.clasificacion} -> ${t.destino})`)
  }
}

if (!aCambiar.length) {
  console.log('\nNada que migrar.\n')
  await db.$disconnect()
  process.exit(0)
}

if (!APLICAR) {
  console.log('\nDRY RUN: no se escribio nada. Para aplicar:')
  console.log('  node scripts/migrar-clasificaciones-detalle.mjs --aplicar\n')
  await db.$disconnect()
  process.exit(0)
}

// Se agrupa por destino para hacer un updateMany por valor en vez de 372 updates
console.log('\nAplicando...')
for (const [origen, destino] of Object.entries(MAPEO)) {
  const r = await db.detalleTipo.updateMany({
    where: { clasificacion: origen },
    data: { clasificacion: destino }
  })
  if (r.count) console.log(`  ${origen} -> ${destino}: ${r.count}`)
}

console.log('\nVerificacion:')
for (const r of await db.detalleTipo.groupBy({ by: ['clasificacion'], _count: true })) {
  console.log(`  ${r.clasificacion.padEnd(12)} ${r._count}`)
}
console.log('\nLISTO.\n')
await db.$disconnect()
