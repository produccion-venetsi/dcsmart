// Alta del módulo `caja_mayor` en producción, SIN correr seed.js (que arrasa
// con los usuarios reales — ver el incidente de julio). Mismo patrón que
// fix-permisos-externo.cjs: idempotente, dry-run por defecto, toca solo lo suyo.
//
// Crea:
//   - Module `caja_mayor` (si no existe)
//   - RolePermission por cada rol conocido: super_admin todo en true, el resto
//     todo en false. Nadie gana Caja Mayor por rol: se concede por usuario con
//     el checkbox de Admin → Usuarios (UserPermission), que can() prioriza.
//
// Uso: node prisma/fix-modulo-caja-mayor.cjs [--apply]
'use strict'
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')

async function main() {
  console.log(APPLY ? '=== APLICANDO ===' : '=== DRY RUN (sin --apply) ===')

  let mod = await prisma.module.findUnique({ where: { nombre: 'caja_mayor' } })
  if (mod) console.log(`Módulo caja_mayor ya existe (${mod.id})`)
  else if (APPLY) {
    mod = await prisma.module.create({ data: { nombre: 'caja_mayor' } })
    console.log(`Módulo caja_mayor creado (${mod.id})`)
  } else console.log('Se crearía el módulo caja_mayor')

  const roles = await prisma.role.findMany({ select: { id: true, nombre: true } })
  for (const rol of roles) {
    const esSuper = rol.nombre === 'super_admin'
    const permisos = { can_view: esSuper, can_create: esSuper, can_edit: esSuper, can_delete: esSuper }
    const existente = mod
      ? await prisma.rolePermission.findUnique({
          where: { id_role_id_module: { id_role: rol.id, id_module: mod.id } }
        })
      : null
    if (existente) {
      console.log(`  ${rol.nombre}: ya tiene fila (view=${existente.can_view}) -- no se toca`)
      continue
    }
    console.log(`  ${rol.nombre}: ${APPLY ? 'creada' : 'se crearía'} con view=${esSuper}`)
    if (APPLY && mod) {
      await prisma.rolePermission.create({ data: { id_role: rol.id, id_module: mod.id, ...permisos } })
    }
  }
  await prisma.$disconnect()
}
main().catch(async (e) => { console.error('ERROR:', e.message); process.exitCode = 1; await prisma.$disconnect() })
