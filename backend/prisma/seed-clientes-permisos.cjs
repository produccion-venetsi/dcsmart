// Crea el módulo de permisos `clientes` y le da acceso a cada rol.
//
// Existe en vez de correr `seed.js`, que es destructivo: borra y recrea usuarios
// reales (ya pasó una vez, ver el incidente de user_app_role de julio). Esto solo
// hace upsert del módulo y de los permisos, nada más.
//
// Itera sobre los roles que existen en la base en vez de una lista fija: `seed.js`
// tiene una lista hardcodeada y por eso el rol `externo` -- creado después, directo en
// la base -- quedó afuera cuando se agregó un módulo. Los roles que no estén en la
// tabla de abajo reciben solo lectura, que es lo que necesita cualquiera que cargue un
// pago (el combobox de cliente del formulario).
//
//   node prisma/seed-clientes-permisos.cjs            (simula, no escribe)
//   node prisma/seed-clientes-permisos.cjs --apply
const { PrismaClient } = require('@prisma/client')

const aplicar = process.argv.includes('--apply')
const prisma = new PrismaClient()

const MODULO = 'clientes'

// [view, create, edit, delete]. `clientes` se comporta como `proveedores`: admin no
// borra. El cajero necesita view -- sin eso el combobox del formulario de pagos le
// devuelve 403 y no puede cargar una op de cuenta corriente.
const PERMISOS = {
  super_admin: [true,  true,  true,  true ],
  dcsmart:     [true,  true,  true,  true ],
  admin:       [true,  true,  true,  false],
  externo:     [true,  true,  true,  true ],
  cajero:      [true,  false, false, false],
  data_entry:  [true,  false, false, false],
  reportes:    [false, false, false, false],
}

// Un rol nuevo que no esté en la tabla: solo lectura. Es el mínimo para que el
// formulario de pagos funcione y no le abre nada más.
const POR_DEFECTO = [true, false, false, false]

async function main() {
  console.log(aplicar ? '>>> APLICANDO\n' : '>>> simulación, nada se escribe (usar --apply)\n')

  const existente = await prisma.module.findUnique({ where: { nombre: MODULO } })
  console.log(`módulo "${MODULO}": ${existente ? 'ya existe' : 'hay que crearlo'}`)

  const modulo = aplicar
    ? await prisma.module.upsert({ where: { nombre: MODULO }, update: {}, create: { nombre: MODULO } })
    : existente

  const roles = await prisma.role.findMany({ orderBy: { nombre: 'asc' } })
  console.log(`roles en la base: ${roles.length}\n`)
  console.log('rol            | view create edit delete | de dónde sale')

  for (const rol of roles) {
    const perms = PERMISOS[rol.nombre] ?? POR_DEFECTO
    const origen = PERMISOS[rol.nombre] ? 'definido' : 'default (solo lectura)'
    const [can_view, can_create, can_edit, can_delete] = perms
    const marca = (b) => (b ? ' ✓  ' : ' ·  ')
    console.log(
      `${rol.nombre.padEnd(14)} |${marca(can_view)}${marca(can_create)}${marca(can_edit)}${marca(can_delete)}  | ${origen}`
    )

    if (!aplicar || !modulo) continue
    await prisma.rolePermission.upsert({
      where: { id_role_id_module: { id_role: rol.id, id_module: modulo.id } },
      update: { can_view, can_create, can_edit, can_delete },
      create: { id_role: rol.id, id_module: modulo.id, can_view, can_create, can_edit, can_delete },
    })
  }

  if (aplicar) {
    const n = await prisma.rolePermission.count({ where: { id_module: modulo.id } })
    console.log(`\nfilas de permisos para "${MODULO}": ${n}`)
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
