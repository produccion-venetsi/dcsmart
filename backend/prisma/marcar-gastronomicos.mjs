// Marca como GASTRONOMIA los proveedores y los rubros/categorías que existen hoy.
//
// El negocio es gastronómico: 43 de los 50 locales con tipo cargado son GASTRONOMIA. Los
// catálogos se armaron para eso, así que lo que ya está cargado es gastronómico por
// definición — lo que venga después de otro rubro se marca al crearlo.
//
// `tipos_afines` NUNCA filtra: solo ordena el buscador para que aparezcan primero los que
// el local usa (ver lib/afinidadProveedor.js). Marcar de más no esconde nada.
//
// Solo toca las filas que están SIN clasificar. Las que ya tienen algo cargado se dejan:
// alguien las clasificó a mano y esto no viene a pisarlo.
//
//   node prisma/marcar-gastronomicos.mjs             # muestra qué haría
//   node prisma/marcar-gastronomicos.mjs --aplicar

import { PrismaClient } from '@prisma/client'
import 'dotenv/config'
import { writeFileSync } from 'node:fs'

const db = new PrismaClient()
const APLICAR = process.argv.includes('--aplicar')
const TIPO = 'GASTRONOMIA'

// ── qué se va a tocar ───────────────────────────────────────────────────────

const provSinClasificar = await db.proveedor.findMany({
  where: { tipos_afines: { isEmpty: true } },
  select: { id: true, nombre: true, tipo_local: true },
})
const provYaClasificados = await db.proveedor.count({
  where: { NOT: { tipos_afines: { isEmpty: true } } },
})

const rubSinClasificar = await db.rubCat.findMany({
  where: { tipos_afines: { isEmpty: true } },
  select: { id: true, rubro: { select: { nombre: true } }, categoria: { select: { nombre: true } } },
})
const rubYaClasificados = await db.rubCat.count({
  where: { NOT: { tipos_afines: { isEmpty: true } } },
})

console.log('PROVEEDORES')
console.log(`  sin clasificar (se marcan) : ${provSinClasificar.length}`)
console.log(`  ya clasificados (se dejan) : ${provYaClasificados}`)
console.log('RUBROS / CATEGORIAS')
console.log(`  sin clasificar (se marcan) : ${rubSinClasificar.length}`)
console.log(`  ya clasificados (se dejan) : ${rubYaClasificados}`)

// El campo viejo `tipo_local` es texto libre y dice qué se cargó en su momento. Sirve como
// control: si casi todos dicen GASTRONOMICO, marcar el resto igual es lo esperable.
const porViejo = new Map()
for (const p of provSinClasificar) {
  const k = p.tipo_local ?? '(null)'
  porViejo.set(k, (porViejo.get(k) ?? 0) + 1)
}
console.log('\n  el campo viejo `tipo_local` de los que se van a marcar:')
for (const [k, n] of [...porViejo.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${String(n).padStart(5)}  ${k}`)
}

// Los que el campo viejo dice que NO son gastronómicos: hay que mirarlos aparte, porque
// marcarlos igual sería contradecir un dato que alguien cargó.
const contradicen = provSinClasificar.filter(p => {
  const v = String(p.tipo_local ?? '').trim().toUpperCase()
  return v && !v.startsWith('GASTRO')
})
if (contradicen.length) {
  console.log(`\n  ⚠ ${contradicen.length} proveedores tienen un tipo_local viejo que NO es gastronómico:`)
  for (const p of contradicen.slice(0, 10)) console.log(`      "${p.nombre}" -> ${p.tipo_local}`)
  console.log('    Se marcan igual (tipos_afines no filtra, solo ordena), pero conviene revisarlos.')
}

if (!APLICAR) {
  console.log('\nNada se escribió. Correr con --aplicar para hacerlo.')
  await db.$disconnect()
  process.exit(0)
}

// ── respaldo y escritura ────────────────────────────────────────────────────

const sello = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
const ruta = `C:/Users/agusl/Repos/dcsmart-apps/migraciones/respaldo-gastronomicos-${sello}.json`
writeFileSync(ruta, JSON.stringify({
  cuando: new Date().toISOString(),
  que: 'ids que tenian tipos_afines VACIO antes de marcarlos GASTRONOMIA (para revertir)',
  proveedores: provSinClasificar.map(p => p.id),
  rubcat: rubSinClasificar.map(r => r.id),
}, null, 2))
console.log(`\nrespaldo: ${ruta}`)

// updateMany con el mismo where: no se pasa la lista de ids porque son 5000 y Prisma tiene
// un techo de bind variables (P2035/P2029, ya pasó en este proyecto).
const p = await db.proveedor.updateMany({
  where: { tipos_afines: { isEmpty: true } },
  data: { tipos_afines: [TIPO] },
})
console.log(`✓ proveedores marcados: ${p.count}`)

const r = await db.rubCat.updateMany({
  where: { tipos_afines: { isEmpty: true } },
  data: { tipos_afines: [TIPO] },
})
console.log(`✓ rubros/categorías marcados: ${r.count}`)

// ── verificación ────────────────────────────────────────────────────────────

const provOk = await db.proveedor.count({ where: { tipos_afines: { has: TIPO } } })
const provTotal = await db.proveedor.count()
const rubOk = await db.rubCat.count({ where: { tipos_afines: { has: TIPO } } })
const rubTotal = await db.rubCat.count()
const provVacios = await db.proveedor.count({ where: { tipos_afines: { isEmpty: true } } })
const rubVacios = await db.rubCat.count({ where: { tipos_afines: { isEmpty: true } } })
console.log(`\nproveedores con ${TIPO}: ${provOk}/${provTotal} | sin clasificar: ${provVacios}`)
console.log(`rubcat con ${TIPO}     : ${rubOk}/${rubTotal} | sin clasificar: ${rubVacios}`)

await db.$disconnect()
