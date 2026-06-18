import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

// ─── MATRIZ DE PERMISOS ──────────────────────────────────────────────────────
// [view, create, edit, delete] por rol y módulo.
const T = true, F = false

const MODULES = [
  'caja', 'caja_movimientos', 'pagos', 'proveedores',
  'rubros', 'categorias', 'metodos_pago', 'usuarios', 'apps', 'locales'
]

const MATRIX = {
  super_admin: {
    caja: [T,T,T,T], caja_movimientos: [T,T,T,T], pagos: [T,T,T,T],
    proveedores: [T,T,T,T], rubros: [T,T,T,T], categorias: [T,T,T,T],
    metodos_pago: [T,T,T,T], usuarios: [T,T,T,T], apps: [T,T,T,T], locales: [T,T,T,T],
  },
  dcsmart: {
    // Operación total — gestiona datos de todos los grupos pero NO administra la estructura
    // (no crea/edita/borra apps ni locales, eso es responsabilidad del super_admin)
    caja: [T,T,T,T], caja_movimientos: [T,T,T,T], pagos: [T,T,T,T],
    proveedores: [T,T,T,T], rubros: [T,F,F,F], categorias: [T,F,F,F],
    metodos_pago: [T,T,T,T], usuarios: [F,F,F,F], apps: [T,F,F,F], locales: [T,F,F,F],
  },
  admin: {
    caja: [T,T,T,F], caja_movimientos: [T,T,T,F], pagos: [T,T,T,F],
    proveedores: [T,T,T,F], rubros: [T,F,F,F], categorias: [T,F,F,F],
    metodos_pago: [T,F,F,F], usuarios: [F,F,F,F], apps: [F,F,F,F], locales: [F,F,F,F],
  },
  cajero: {
    caja: [T,T,F,F], caja_movimientos: [T,T,F,F], pagos: [T,T,F,F],
    proveedores: [T,F,F,F], rubros: [T,F,F,F], categorias: [T,F,F,F],
    metodos_pago: [T,F,F,F], usuarios: [F,F,F,F], apps: [F,F,F,F], locales: [F,F,F,F],
  },
}

const ROLE_DESC = {
  super_admin: 'Acceso total al sistema',
  dcsmart:     'Operación total salvo gestión de usuarios y tabla rubcat',
  admin:       'Crea y edita datos operativos (sin borrar) de su app/locales',
  cajero:      'Ve y crea cajas y pagos de un local',
}

const TEST_PASSWORD = 'Dcsmart2026!'

async function main() {
  // ─── MÓDULOS ─────────────────────────────────────────────────────────
  const modules = {}
  for (const nombre of MODULES) {
    modules[nombre] = await prisma.module.upsert({
      where: { nombre }, update: {}, create: { nombre }
    })
  }
  console.log('✓ Módulos:', MODULES.join(', '))

  // ─── ROLES + PERMISOS (autoritativo: setea en create Y update) ─────────
  const roles = {}
  for (const nombre of Object.keys(MATRIX)) {
    const role = await prisma.role.upsert({
      where: { nombre },
      update: { descripcion: ROLE_DESC[nombre] },
      create: { nombre, descripcion: ROLE_DESC[nombre] }
    })
    roles[nombre] = role

    for (const moduleName of MODULES) {
      const [can_view, can_create, can_edit, can_delete] = MATRIX[nombre][moduleName]
      const perm = { can_view, can_create, can_edit, can_delete }
      await prisma.rolePermission.upsert({
        where: { id_role_id_module: { id_role: role.id, id_module: modules[moduleName].id } },
        update: perm,
        create: { id_role: role.id, id_module: modules[moduleName].id, ...perm }
      })
    }
  }
  console.log('✓ Roles y permisos aplicados (super_admin, dcsmart, admin, cajero)')

  // ─── MÉTODOS DE PAGO ──────────────────────────────────────────────────
  const metodos = [
    'Efectivo', 'Tarjeta débito', 'Tarjeta crédito',
    'Transferencia', 'Mercado Pago', 'Cheque'
  ]
  for (const nombre of metodos) {
    await prisma.metodoPago.upsert({ where: { nombre }, update: {}, create: { nombre } })
  }
  console.log('✓ Métodos de pago')

  // ─── APPS DE REFERENCIA PARA USUARIOS DE PRUEBA ──────────────────────
  // Usamos grupos reales ya existentes en la DB.
  // Si no existen (DB vacía), se crean como placeholder.
  const rvlrApp = await prisma.app.upsert({
    where: { slug: 'grupo-rvlr' }, update: {},
    create: { nombre: 'GRUPO RVLR', slug: 'grupo-rvlr' }
  })
  const aldosApp = await prisma.app.upsert({
    where: { slug: 'grupo-aldos' }, update: {},
    create: { nombre: 'GRUPO ALDOS', slug: 'grupo-aldos' }
  })

  // Locales: leemos los existentes; si la app acaba de crearse (DB vacía) creamos placeholders
  async function getOrCreateLocal(nombre, id_app) {
    const found = await prisma.local.findFirst({ where: { nombre, id_app, activo: true } })
    return found ?? prisma.local.create({ data: { nombre, id_app } })
  }

  // RVLR — locales reales: PALERMO, REVOLVER, MALABIA, LOMITAS (usamos los primeros 4 para test)
  const rvlrPalermo  = await getOrCreateLocal('PALERMO',  rvlrApp.id)
  const rvlrRevolver = await getOrCreateLocal('REVOLVER', rvlrApp.id)
  const rvlrMalabia  = await getOrCreateLocal('MALABIA',  rvlrApp.id)
  const rvlrLomitas  = await getOrCreateLocal('LOMITAS',  rvlrApp.id)

  // ALDOS — locales reales: ALDOS, BEBOP, ROA, PICSA
  const aldosAldos = await getOrCreateLocal('ALDOS',  aldosApp.id)
  const aldosBebop = await getOrCreateLocal('BEBOP',  aldosApp.id)
  const aldosRoa   = await getOrCreateLocal('ROA',    aldosApp.id)
  const aldosPicsa = await getOrCreateLocal('PICSA',  aldosApp.id)

  console.log('✓ Apps de referencia: GRUPO RVLR, GRUPO ALDOS')

  // ─── DETALLE TIPOS POR DEFECTO (en GRUPO RVLR) ───────────────────────
  const tiposDefault = [
    { nombre: 'Total Digitales', clasificacion: 'calculo' },
    { nombre: 'MP Total',        clasificacion: 'medio_pago' },
    { nombre: 'MP QR',           clasificacion: 'medio_pago' }
  ]
  for (const { nombre, clasificacion } of tiposDefault) {
    await prisma.detalleTipo.upsert({
      where: { nombre_id_app: { nombre, id_app: rvlrApp.id } },
      create: { nombre, clasificacion, id_app: rvlrApp.id, id_local: null, activo: true },
      update: { clasificacion }
    })
  }
  console.log('✓ DetalleTipos por defecto')

  // ─── BORRAR USUARIOS EXISTENTES ───────────────────────────────────────
  // (nulea referencias created_by y limpia roles/accesos/overrides antes de borrar)
  await prisma.caja.updateMany({ where: { created_by: { not: null } }, data: { created_by: null } })
  await prisma.pago.updateMany({ where: { created_by: { not: null } }, data: { created_by: null } })
  await prisma.userPermission.deleteMany({})
  await prisma.userLocalAccess.deleteMany({})
  await prisma.userAppRole.deleteMany({})
  const deleted = await prisma.user.deleteMany({})
  console.log(`✓ Usuarios anteriores eliminados (${deleted.count})`)

  // ─── USUARIOS DE PRUEBA (8 — 2 por rol) ───────────────────────────────
  const password_hash = await bcrypt.hash(TEST_PASSWORD, 12)

  async function createUser(email, nombre) {
    return prisma.user.create({ data: { email, nombre, password_hash, activo: true } })
  }
  async function assignRole(userId, appId, roleId) {
    return prisma.userAppRole.create({ data: { id_user: userId, id_app: appId, id_role: roleId } })
  }
  async function grantLocal(userId, appId, localId) {
    return prisma.userLocalAccess.create({ data: { id_user: userId, id_app: appId, id_local: localId } })
  }

  // super_admin — acceso global a todos los grupos (no requiere local_access)
  for (const [email, nombre] of [['super1@dcsmart.com', 'Super Admin 1'], ['super2@dcsmart.com', 'Super Admin 2']]) {
    const u = await createUser(email, nombre)
    await assignRole(u.id, rvlrApp.id, roles.super_admin.id)
  }

  // dcsmart — acceso global a todos los grupos (no requiere local_access)
  for (const [email, nombre] of [['dc1@dcsmart.com', 'DC Operaciones 1'], ['dc2@dcsmart.com', 'DC Operaciones 2']]) {
    const u = await createUser(email, nombre)
    await assignRole(u.id, rvlrApp.id, roles.dcsmart.id)
  }

  // admin — 2 grupos con varios locales cada uno
  const adminUsers = [
    ['admin1@dcsmart.com', 'Admin RVLR'],
    ['admin2@dcsmart.com', 'Admin ALDOS'],
  ]
  const [adminRvlr, adminAldos] = await Promise.all(adminUsers.map(([e, n]) => createUser(e, n)))

  // admin1: GRUPO RVLR → Palermo + Revolver + Malabia
  await assignRole(adminRvlr.id, rvlrApp.id, roles.admin.id)
  await grantLocal(adminRvlr.id, rvlrApp.id, rvlrPalermo.id)
  await grantLocal(adminRvlr.id, rvlrApp.id, rvlrRevolver.id)
  await grantLocal(adminRvlr.id, rvlrApp.id, rvlrMalabia.id)

  // admin2: GRUPO ALDOS → Aldos + Bebop + Roa + Picsa
  await assignRole(adminAldos.id, aldosApp.id, roles.admin.id)
  await grantLocal(adminAldos.id, aldosApp.id, aldosAldos.id)
  await grantLocal(adminAldos.id, aldosApp.id, aldosBebop.id)
  await grantLocal(adminAldos.id, aldosApp.id, aldosRoa.id)
  await grantLocal(adminAldos.id, aldosApp.id, aldosPicsa.id)

  // cajero — 1 grupo, 1 local cada uno
  const cajeroUsers = [
    ['cajero1@dcsmart.com', 'Cajero PALERMO'],
    ['cajero2@dcsmart.com', 'Cajero ALDOS'],
  ]
  const [cajeroRvlr, cajeroAldos] = await Promise.all(cajeroUsers.map(([e, n]) => createUser(e, n)))

  await assignRole(cajeroRvlr.id,  rvlrApp.id,  roles.cajero.id)
  await grantLocal(cajeroRvlr.id,  rvlrApp.id,  rvlrPalermo.id)

  await assignRole(cajeroAldos.id, aldosApp.id, roles.cajero.id)
  await grantLocal(cajeroAldos.id, aldosApp.id, aldosAldos.id)

  console.log('✓ 8 usuarios de prueba creados (password común:', TEST_PASSWORD + ')')
  console.log('  super1@/super2@  → acceso global')
  console.log('  dc1@/dc2@        → acceso global (sin gestión de estructura)')
  console.log('  admin1@          → GRUPO RVLR  (PALERMO, REVOLVER, MALABIA)')
  console.log('  admin2@          → GRUPO ALDOS (ALDOS, BEBOP, ROA, PICSA)')
  console.log('  cajero1@         → GRUPO RVLR  (solo PALERMO)')
  console.log('  cajero2@         → GRUPO ALDOS (solo ALDOS)')
  console.log('  (todos @dcsmart.com)')
  console.log('\nSeed completado exitosamente.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
