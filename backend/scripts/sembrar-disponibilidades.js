// Siembra el catálogo de disponibilidades y activa en cada local las que ya
// venía cargando en sus arqueos.
//
// Sin esto el cambio arrancaría de cero: los locales que hoy cargan "MP Hoy" y
// "MP a Liquidar" abrirían el arqueo con la lista vacía y habría que
// reconfigurarlos a mano uno por uno.
//
// QUÉ HACE, por grupo:
//   1. Crea el catálogo inicial (MP Disponible/Hoy/a Liquidar/QR, Dólares,
//      Transferencia) si no está.
//   2. Suma al catálogo los conceptos que ese grupo YA usó como disponibilidad
//      en algún arqueo -- salvo los que son de otra cosa (Salón, Rappi, Online
//      son canales de venta que se colaron por usar el catálogo de cajas).
//   3. Activa en cada local los conceptos que ESE local usó.
//
// No toca ningún arqueo ya cargado: guardan su propio detalle.
//
//   LAB_URL=... node scripts/sembrar-disponibilidades.js            -> dry run
//   LAB_URL=... node scripts/sembrar-disponibilidades.js --aplicar
//   CONFIRMO_PROD=si PROD_URL=... node ... --aplicar --prod

import { PrismaClient } from '@prisma/client'
import { CATALOGO_INICIAL } from '../src/lib/disponibilidades.js'

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

// Lo que se cargó como disponibilidad pero es de otra cosa: son canales de
// venta del catálogo de cajas, que el combo viejo ofrecía por error. No se
// suman al catálogo nuevo -- los arqueos viejos que los tienen no se tocan.
const NO_SON_DISPONIBILIDAD = /^(sal[oó]n|rappi|online|delivery|takeaway|mostrador|web|tarjetas?|cta ?cte)$/i

// A qué familia va un concepto heredado, por su nombre.
function familiaDe(nombre) {
  if (/^mp\b|mercado ?pago/i.test(nombre)) return 'mp'
  if (/d[oó]lar|usd|real|euro/i.test(nombre)) return 'moneda'
  if (/transferencia|banco|bbva|galicia|santander|naci[oó]n|macro|brubank|uala/i.test(nombre)) return 'banco'
  return 'otro'
}

async function main() {
  console.log(APLICAR ? `=== SEMBRANDO (${PROD ? 'PRODUCCIÓN' : 'lab/test'}) ===` : '=== DRY RUN ===')

  const apps = await p.app.findMany({ select: { id: true, nombre: true } })

  for (const app of apps) {
    // Lo que este grupo ya usó como disponibilidad, y en qué locales.
    const usados = await p.$queryRawUnsafe(`
      SELECT TRIM(COALESCE(dt.nombre, ad.nombre)) concepto, a.id_local
      FROM arqueo_detalles ad
      JOIN arqueos a ON a.id = ad.id_arqueo
      JOIN locales l ON l.id = a.id_local AND l.id_app = $1
      LEFT JOIN detalle_tipos dt ON dt.id = ad.id_tipo
      WHERE COALESCE(dt.nombre, ad.nombre) IS NOT NULL`, app.id)

    const heredados = [...new Set(usados.map((u) => u.concepto))].filter((c) => !NO_SON_DISPONIBILIDAD.test(c))
    const descartados = [...new Set(usados.map((u) => u.concepto))].filter((c) => NO_SON_DISPONIBILIDAD.test(c))

    const aCrear = [
      ...CATALOGO_INICIAL,
      ...heredados
        .filter((n) => !CATALOGO_INICIAL.some((c) => c.nombre.toLowerCase() === n.toLowerCase()))
        .map((n) => ({ nombre: n, familia: familiaDe(n), orden: 200 })),
    ]

    console.log(`\n[${app.nombre}] catálogo: ${aCrear.length} conceptos` +
      (heredados.length ? ` (${heredados.length} heredados de arqueos)` : '') +
      (descartados.length ? ` · descartados por no ser disponibilidad: ${descartados.join(', ')}` : ''))

    if (!APLICAR) continue

    const porNombre = new Map()
    for (const c of aCrear) {
      const tipo = await p.disponibilidadTipo.upsert({
        where: { nombre_id_app: { nombre: c.nombre, id_app: app.id } },
        create: { id_app: app.id, nombre: c.nombre, familia: c.familia, orden: c.orden },
        update: {}, // no pisa lo que alguien haya ajustado a mano
        select: { id: true, nombre: true },
      })
      porNombre.set(tipo.nombre.toLowerCase(), tipo.id)
    }

    // Activar en cada local lo que ESE local venía usando.
    const porLocal = new Map()
    for (const u of usados) {
      if (NO_SON_DISPONIBILIDAD.test(u.concepto)) continue
      if (!porLocal.has(u.id_local)) porLocal.set(u.id_local, new Set())
      porLocal.get(u.id_local).add(u.concepto.toLowerCase())
    }
    for (const [id_local, conceptos] of porLocal) {
      for (const c of conceptos) {
        const id_tipo = porNombre.get(c)
        if (!id_tipo) continue
        await p.localDisponibilidad.upsert({
          where: { id_local_id_tipo: { id_local, id_tipo } },
          create: { id_local, id_tipo },
          update: {},
        })
      }
      console.log(`    ${id_local}: ${conceptos.size} activadas`)
    }
  }

  if (!APLICAR) console.log('\nPara aplicarlo: --aplicar')
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => p.$disconnect())
