// Le da al rol `externo` el permiso de borrar movimientos de caja, y actualiza
// su descripción.
//
// Por qué existe este archivo en vez de correr el seed: seed.js recrea usuarios
// y arrasa con datos reales (ver el aviso adentro). Esto toca UNA fila de
// role_permissions y UNA de roles, nada más.
//
// El rol ya podía borrar pagos (y sus impuestos, que van por pagos.delete) y
// cajas (y sus detalles, por caja.delete). Faltaba caja_movimientos, que tiene
// módulo propio: el usuario externo veía el botón de borrar movimiento y le
// respondía 403.
//
// Idempotente: si ya está aplicado, no hace nada.
//
// Uso:
//   node prisma/fix-permisos-externo.cjs           → muestra qué haría
//   node prisma/fix-permisos-externo.cjs --apply   → lo aplica

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const APLICAR = process.argv.includes('--apply')
const DESCRIPCION = 'Como admin, pero puede borrar pagos, cajas y sus movimientos, detalles e impuestos'

async function main() {
  const rol = await prisma.role.findUnique({ where: { nombre: 'externo' } })
  if (!rol) throw new Error('No existe el rol `externo`')

  const modulo = await prisma.module.findFirst({ where: { nombre: 'caja_movimientos' } })
  if (!modulo) throw new Error('No existe el módulo `caja_movimientos`')

  const permiso = await prisma.rolePermission.findUnique({
    where: { id_role_id_module: { id_role: rol.id, id_module: modulo.id } },
  })
  if (!permiso) throw new Error('El rol `externo` no tiene fila para `caja_movimientos`')

  console.log('Estado actual del rol externo:')
  console.log(`  descripcion: ${JSON.stringify(rol.descripcion)}`)
  console.log(`  caja_movimientos: view=${permiso.can_view} create=${permiso.can_create} edit=${permiso.can_edit} delete=${permiso.can_delete}`)

  const faltaDelete = !permiso.can_delete
  const faltaDesc = rol.descripcion !== DESCRIPCION
  if (!faltaDelete && !faltaDesc) { console.log('\nYa está aplicado, no hay nada que hacer.'); return }

  console.log('\nCambios a aplicar:')
  if (faltaDelete) console.log('  caja_movimientos.can_delete: false → true')
  if (faltaDesc)   console.log(`  descripcion → ${JSON.stringify(DESCRIPCION)}`)

  if (!APLICAR) { console.log('\n(dry-run: volvé a correr con --apply para aplicarlo)'); return }

  await prisma.$transaction([
    prisma.rolePermission.update({
      where: { id_role_id_module: { id_role: rol.id, id_module: modulo.id } },
      data: { can_delete: true },
    }),
    prisma.role.update({ where: { id: rol.id }, data: { descripcion: DESCRIPCION } }),
  ])

  const verif = await prisma.rolePermission.findUnique({
    where: { id_role_id_module: { id_role: rol.id, id_module: modulo.id } },
  })
  console.log(`\n✓ aplicado. caja_movimientos.can_delete = ${verif.can_delete}`)
}

main().catch((e) => { console.error(e.message); process.exitCode = 1 }).finally(() => prisma.$disconnect())
