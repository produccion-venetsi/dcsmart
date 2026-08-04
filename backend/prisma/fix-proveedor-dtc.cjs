// Corrige la confusión entre "Distribuidora Todo Carne S.A." y "Distribuidora
// DTC S.A." (nombre de fantasía: Fura), y unifica las dos fichas duplicadas de
// esta última.
//
// EL PROBLEMA
// Son dos empresas distintas, verificado contra las facturas escaneadas:
//
//   PV 4  Distribuidora Todo Carne S.A.  CUIT 30-71172714-7  Adolfo Alsina 1441
//         (facturas hasta el 29/10/2025)
//   PV 2  Distribuidora DTC S.A. / Fura  CUIT 30-71836236-5  Paraná 567
//         (facturas desde el 31/10/2025)
//
// En octubre de 2025 el proveedor pasó a facturar con la sociedad nueva, pero
// en el sistema anterior se siguió cargando con la ficha vieja. La migración de
// agosto no lo causó: el CSV traía el id de Todo Carnes explícito en cada fila.
//
// La numeración lo confirma: hay una factura de DTC nº 4741 y una de "Todo
// Carnes" nº 4742, del mismo día y del mismo punto de venta. Dos empresas no
// emiten comprobantes consecutivos en el mismo PV.
//
// QUÉ HACE
//   1. Reasigna a DTC los pagos con PV 2 que hoy apuntan a Todo Carnes.
//   2. Mueve el único pago de la ficha DTC duplicada a la que se conserva.
//   3. Deja la ficha que se conserva con nombre de fantasía "Fura" y razón
//      social "Distribuidora DTC SA" (hoy están al revés).
//   4. Desactiva la ficha duplicada.
//
// El corte es por PUNTO DE VENTA, no por fecha: es el dato que separa las dos
// series sin ambigüedad, y quedó verificado con factura de los dos lados.
//
// Idempotente. Antes de tocar nada guarda los ids afectados en un JSON para
// poder revertir.
//
// Uso:
//   node prisma/fix-proveedor-dtc.cjs           → muestra qué haría
//   node prisma/fix-proveedor-dtc.cjs --apply   → lo aplica

const fs = require('fs')
const path = require('path')
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const APLICAR = process.argv.includes('--apply')

const TODO_CARNES = 'cfb8df65'                                  // Distribuidora Todo Carnes (CUIT 30711727147)
const DTC_CONSERVAR = 'b704e291-bcdb-42b7-a8ed-2ff4082d30b3'    // la que ya tiene 13 pagos
const DTC_DUPLICADA = '0eefa9d4-c532-499d-a264-d588d423dd9f'    // 1 pago, mismo CUIT
const PV_DTC = 2

const NOMBRE_FANTASIA = 'Fura'
const RAZON_SOCIAL = 'Distribuidora DTC SA'
const CUIT = '30718362365'

async function main() {
  const aReasignar = await prisma.pago.findMany({
    where: { id_proveedor: TODO_CARNES, pv: PV_DTC },
    select: { id: true, nro_ord: true, id_local: true, importe: true },
  })
  const deDuplicada = await prisma.pago.findMany({
    where: { id_proveedor: DTC_DUPLICADA },
    select: { id: true, nro_ord: true },
  })
  const conservar = await prisma.proveedor.findUnique({ where: { id: DTC_CONSERVAR } })
  const duplicada = await prisma.proveedor.findUnique({ where: { id: DTC_DUPLICADA } })

  // Desglose por local, para que el número sea revisable y no un total ciego.
  const porLocal = new Map()
  for (const p of aReasignar) porLocal.set(p.id_local, (porLocal.get(p.id_local) || 0) + 1)
  const nombresLocal = new Map()
  for (const idLocal of porLocal.keys()) {
    const l = await prisma.local.findUnique({ where: { id: idLocal }, select: { nombre: true } })
    nombresLocal.set(idLocal, l?.nombre ?? idLocal)
  }

  const total = aReasignar.reduce((s, p) => s + Number(p.importe ?? 0), 0)
  console.log('=== Pagos a reasignar (PV 2, hoy en Todo Carnes) ===')
  for (const [idLocal, n] of porLocal) console.log(`  ${nombresLocal.get(idLocal)}: ${n}`)
  console.log(`  TOTAL: ${aReasignar.length} pagos  $${total.toLocaleString('es-AR')}`)

  console.log('\n=== Fichas de proveedor ===')
  console.log(`  conservar (${DTC_CONSERVAR}):`)
  console.log(`    nombre="${conservar?.nombre}" razon_social="${conservar?.razon_social}" cuit=${conservar?.cuit} activo=${conservar?.activo}`)
  console.log(`    -> quedará: nombre="${NOMBRE_FANTASIA}" razon_social="${RAZON_SOCIAL}" cuit=${CUIT}`)
  console.log(`  duplicada (${DTC_DUPLICADA}):`)
  console.log(`    nombre="${duplicada?.nombre}" razon_social="${duplicada?.razon_social}" activo=${duplicada?.activo}`)
  console.log(`    -> se le mueven ${deDuplicada.length} pago(s) y se desactiva`)

  if (!aReasignar.length && !deDuplicada.length && conservar?.nombre === NOMBRE_FANTASIA && duplicada?.activo === false) {
    console.log('\nYa está aplicado, no hay nada que hacer.')
    return
  }
  if (!APLICAR) { console.log('\n(dry-run: volvé a correr con --apply para aplicarlo)'); return }

  // Respaldo antes de tocar: con esto se puede volver atrás pago por pago.
  const backup = {
    generado: new Date().toISOString(),
    criterio: `id_proveedor=${TODO_CARNES} AND pv=${PV_DTC}`,
    reasignados: aReasignar.map((p) => ({ id: p.id, nro_ord: p.nro_ord, id_local: p.id_local, de: TODO_CARNES, a: DTC_CONSERVAR })),
    movidos: deDuplicada.map((p) => ({ id: p.id, nro_ord: p.nro_ord, de: DTC_DUPLICADA, a: DTC_CONSERVAR })),
    proveedorAntes: { conservar, duplicada },
  }
  const rutaBackup = path.join(__dirname, `backup-dtc-${Date.now()}.json`)
  fs.writeFileSync(rutaBackup, JSON.stringify(backup, null, 2))
  console.log(`\nRespaldo: ${rutaBackup}`)

  await prisma.$transaction([
    prisma.pago.updateMany({
      where: { id_proveedor: TODO_CARNES, pv: PV_DTC },
      data: { id_proveedor: DTC_CONSERVAR },
    }),
    prisma.pago.updateMany({
      where: { id_proveedor: DTC_DUPLICADA },
      data: { id_proveedor: DTC_CONSERVAR },
    }),
    prisma.proveedor.update({
      where: { id: DTC_CONSERVAR },
      data: { nombre: NOMBRE_FANTASIA, razon_social: RAZON_SOCIAL, cuit: CUIT },
    }),
    prisma.proveedor.update({
      where: { id: DTC_DUPLICADA },
      data: { activo: false },
    }),
  ])

  const quedan = await prisma.pago.count({ where: { id_proveedor: TODO_CARNES, pv: PV_DTC } })
  const ahoraDtc = await prisma.pago.count({ where: { id_proveedor: DTC_CONSERVAR } })
  const enDup = await prisma.pago.count({ where: { id_proveedor: DTC_DUPLICADA } })
  const tcQuedan = await prisma.pago.count({ where: { id_proveedor: TODO_CARNES } })
  console.log(`\n✓ aplicado`)
  console.log(`  pagos PV2 que siguen en Todo Carnes: ${quedan} (debe ser 0)`)
  console.log(`  pagos en la ficha DTC/Fura         : ${ahoraDtc}`)
  console.log(`  pagos en la ficha duplicada        : ${enDup} (debe ser 0)`)
  console.log(`  pagos que quedan en Todo Carnes    : ${tcQuedan} (los de PV 4, que sí son de esa empresa)`)
}

main().catch((e) => { console.error(e.message); process.exitCode = 1 }).finally(() => prisma.$disconnect())
