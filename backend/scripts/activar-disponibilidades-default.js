// Activa el catálogo inicial de disponibilidades en TODOS los locales.
//
// `sembrar-disponibilidades.js` (la migración del 20/08) activó en cada local
// solo lo que ESE local ya había cargado en algún arqueo. Resultado medido en
// prod el 21/08: de 69 locales, 3 tenían algo (Local Testing 6, 878COOP 4,
// TOGNIS-PIZZA 2) y los otros 66 abrían el arqueo con la lista vacía --
// EVELIA y TOGNIS-PIZZA lo querían probar y no tenían nada que cargar.
//
// Esto es el backfill de esa decisión: las 6 del catálogo inicial (MP
// Disponible / Hoy / a Liquidar / QR, Dólares, Transferencia) quedan activas en
// todos. SUMA, no saca: lo heredado ("Mercado Pago" en 878COOP) y lo que
// alguien haya tildado a mano se conserva.
//
// No toca ningún arqueo ya cargado: cada detalle guarda su propio concepto.
//
//   LAB_URL=... node scripts/activar-disponibilidades-default.js            -> dry run
//   LAB_URL=... node scripts/activar-disponibilidades-default.js --aplicar
//   CONFIRMO_PROD=si PROD_URL=... node scripts/activar-disponibilidades-default.js --aplicar --prod

import { PrismaClient } from '@prisma/client'
import { CATALOGO_INICIAL } from '../src/lib/disponibilidades.js'
import { activarDefaultEnLocal } from '../src/lib/altaDisponibilidades.js'

const APLICAR = process.argv.includes('--aplicar')
const PROD = process.argv.includes('--prod')
const URL = PROD ? process.env.PROD_URL : process.env.LAB_URL
if (PROD) {
  if (process.env.CONFIRMO_PROD !== 'si') { console.error('Producción exige CONFIRMO_PROD=si. Abortado.'); process.exit(1) }
  if (!URL || !/\/postgres\?/.test(URL)) { console.error('PROD_URL tiene que apuntar a la base `postgres`. Abortado.'); process.exit(1) }
} else if (!URL || !/dcsmart_(test|lab)/.test(URL)) {
  console.error('LAB_URL tiene que apuntar a dcsmart_test o dcsmart_lab. Abortado.')
  process.exit(1)
}
const p = new PrismaClient({ datasources: { db: { url: URL } } })

async function main() {
  console.log(APLICAR ? `=== APLICANDO (${PROD ? 'PRODUCCIÓN' : 'lab/test'}) ===` : '=== DRY RUN ===')
  console.log(`Catálogo inicial: ${CATALOGO_INICIAL.map((c) => c.nombre).join(', ')}\n`)

  const locales = await p.local.findMany({
    select: {
      id: true, nombre: true, id_app: true,
      app: { select: { nombre: true } },
      disponibilidades: { select: { tipo: { select: { nombre: true } } } },
    },
    orderBy: [{ app: { nombre: 'asc' } }, { nombre: 'asc' }],
  })

  let tocados = 0
  let sumadas = 0
  for (const l of locales) {
    const yaTiene = new Set(l.disponibilidades.map((d) => d.tipo.nombre.toLowerCase()))
    const faltan = CATALOGO_INICIAL.filter((c) => !yaTiene.has(c.nombre.toLowerCase()))
    const etiqueta = `${l.app.nombre} / ${l.nombre}`
    if (!faltan.length) { console.log(`  = ${etiqueta}: ya tiene las ${yaTiene.size}`); continue }

    tocados++
    sumadas += faltan.length
    console.log(`  + ${etiqueta}: suma ${faltan.length} (${faltan.map((c) => c.nombre).join(', ')})` +
      (yaTiene.size ? ` · conserva ${[...yaTiene].join(', ')}` : ''))
    if (!APLICAR) continue

    const r = await activarDefaultEnLocal(p, { id_local: l.id, id_app: l.id_app })
    if (r.activadas.length !== faltan.length) {
      console.log(`      ojo: activó ${r.activadas.length} y se esperaban ${faltan.length}`)
    }
  }

  console.log(`\n${locales.length} locales · ${tocados} con faltantes · ${sumadas} activaciones${APLICAR ? ' aplicadas' : ' a aplicar'}`)
  if (!APLICAR) console.log('Para aplicarlo: --aplicar')
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => p.$disconnect())
