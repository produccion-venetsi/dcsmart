// Crea el módulo `documentos` y sus permisos por rol.
//
// Existe porque `prisma/seed.js` NO se puede correr contra producción: además de los
// módulos, recrea usuarios de prueba y en el camino borró el rol, la app y el local de
// los 60 usuarios reales (incidente de julio de 2026). Este script toca dos tablas y
// nada más: `modules` y `role_permissions`.
//
// Es idempotente: se puede correr de nuevo sin duplicar nada.
//
//   node prisma/permisos-documentos.mjs           # muestra qué haría
//   node prisma/permisos-documentos.mjs --aplicar # lo aplica
//
// Los valores tienen que quedar iguales a la MATRIZ de seed.js. `data_entry` no está en
// ese archivo (el rol se creó directo en la base), así que su fila se define acá.

import { PrismaClient } from '@prisma/client'
import 'dotenv/config'

const db = new PrismaClient()
const APLICAR = process.argv.includes('--aplicar')
const MODULO = 'documentos'

const T = true, F = false

// [view, create, edit, delete]
const PERMISOS = {
  super_admin: [T, T, T, T],
  dcsmart:     [T, T, T, T],
  // Como en el resto de los módulos: administra pero no borra.
  admin:       [T, T, T, F],
  // Es un admin que además borra.
  externo:     [T, T, T, T],
  // Solo ve, y solo los marcados como visibles para todos (filtroVisibilidad en
  // lib/documentos.js). Carga plata; un contrato de alquiler no es asunto suyo.
  cajero:      [T, F, F, F],
  // Rol restringido a Reportes.
  reportes:    [F, F, F, F],
  // Carga documentos, no los edita ni los borra: no hay forma de distinguir "los
  // propios" de los de otros, así que corregir queda en admin.
  data_entry:  [T, T, F, F],
}

const modulo = await db.module.findUnique({ where: { nombre: MODULO } })
console.log(modulo ? `módulo "${MODULO}": ya existe` : `módulo "${MODULO}": hay que crearlo`)

const roles = await db.role.findMany({ select: { id: true, nombre: true } })
const sinDefinir = roles.filter(r => !PERMISOS[r.nombre]).map(r => r.nombre)
if (sinDefinir.length) {
  // Un rol sin fila queda sin permiso (el chequeo es "si no hay fila, no puede"), así
  // que no es peligroso, pero conviene saberlo.
  console.log(`⚠ roles sin permisos definidos acá: ${sinDefinir.join(', ')}`)
}

if (!APLICAR) {
  console.log('\nSe aplicaría:')
  for (const r of roles) {
    const p = PERMISOS[r.nombre]
    if (p) console.log(`  ${r.nombre.padEnd(12)} view=${p[0]} create=${p[1]} edit=${p[2]} delete=${p[3]}`)
  }
  console.log('\nNada se escribió. Correr con --aplicar para hacerlo.')
  await db.$disconnect()
  process.exit(0)
}

const mod = await db.module.upsert({
  where: { nombre: MODULO },
  update: {},
  create: { nombre: MODULO },
})

let escritos = 0
for (const rol of roles) {
  const p = PERMISOS[rol.nombre]
  if (!p) continue
  const [can_view, can_create, can_edit, can_delete] = p
  await db.rolePermission.upsert({
    where: { id_role_id_module: { id_role: rol.id, id_module: mod.id } },
    update: { can_view, can_create, can_edit, can_delete },
    create: { id_role: rol.id, id_module: mod.id, can_view, can_create, can_edit, can_delete },
  })
  escritos++
  console.log(`✓ ${rol.nombre}`)
}

console.log(`\nListo: módulo "${MODULO}" y ${escritos} filas de permisos.`)
await db.$disconnect()
