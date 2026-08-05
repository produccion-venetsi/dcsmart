// Da de alta el rol `data_entry` y sus permisos. Idempotente: se puede correr dos
// veces sin duplicar nada. NO toca usuarios ni ningun otro rol.
//
// NUNCA usar seed.js para esto: borra TODOS los usuarios reales.
//
// Correr con el proxy de Cloud SQL levantado:
//   node scripts/crear-rol-data-entry.cjs
//
// Solo `create` en los modulos de carga, y `view` en los catalogos que alimentan
// los combos del formulario. Sin `view` en pagos ni caja, GET /api/pagos responde
// 403 por si solo (ver plugins/permissions.js): la tabla queda inaccesible aunque
// se fuerce la llamada desde afuera.
//
// No lleva `edit`: con los permisos por modulo (no por fila) que tiene el sistema,
// editar exige `view`, y `view` muestra la tabla -- que es justo lo que este perfil
// no tiene que ver. Data Entry carga y no corrige.
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

const PERMISOS = {
  pagos:            { can_view: false, can_create: true,  can_edit: false, can_delete: false },
  caja:             { can_view: false, can_create: true,  can_edit: false, can_delete: false },
  caja_movimientos: { can_view: false, can_create: true,  can_edit: false, can_delete: false },
  proveedores:      { can_view: true,  can_create: false, can_edit: false, can_delete: false },
  rubros:           { can_view: true,  can_create: false, can_edit: false, can_delete: false },
  categorias:       { can_view: true,  can_create: false, can_edit: false, can_delete: false },
  metodos_pago:     { can_view: true,  can_create: false, can_edit: false, can_delete: false },
}

async function main() {
  const rol = await db.role.upsert({
    where:  { nombre: 'data_entry' },
    update: {},
    create: {
      nombre: 'data_entry',
      descripcion: 'Solo carga de datos: ve los formularios de alta, no las tablas ni los reportes',
    },
  })
  console.log(`rol: ${rol.nombre} (${rol.id})`)

  for (const [modulo, perms] of Object.entries(PERMISOS)) {
    const m = await db.module.findUnique({ where: { nombre: modulo } })
    if (!m) {
      console.error(`FALTA el modulo "${modulo}" en la tabla modules -- abortando sin tocar nada mas`)
      process.exit(1)
    }
    await db.rolePermission.upsert({
      where:  { id_role_id_module: { id_role: rol.id, id_module: m.id } },
      update: perms,
      create: { id_role: rol.id, id_module: m.id, ...perms },
    })
    const flags = `${perms.can_view ? 'V' : '-'}${perms.can_create ? 'C' : '-'}${perms.can_edit ? 'E' : '-'}${perms.can_delete ? 'D' : '-'}`
    console.log(`  ${modulo.padEnd(18)} ${flags}`)
  }

  // Verificacion: que quede exactamente lo declarado y nada mas.
  const filas = await db.rolePermission.findMany({
    where: { id_role: rol.id },
    include: { module: { select: { nombre: true } } },
  })
  const sobrantes = filas.filter(f => !PERMISOS[f.module.nombre])
  if (sobrantes.length) {
    console.warn(`\nATENCION: el rol tiene ${sobrantes.length} permiso(s) que este script no declara: ` +
      sobrantes.map(f => f.module.nombre).join(', '))
  }
  console.log(`\n${filas.length} modulos configurados para data_entry`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
