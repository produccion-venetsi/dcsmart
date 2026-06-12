import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  // ─── MÓDULOS ─────────────────────────────────────────────────────────
  const moduleNames = [
    'caja', 'caja_movimientos', 'pagos', 'proveedores',
    'rubros', 'categorias', 'usuarios', 'apps', 'locales'
  ]

  const modules = {}
  for (const nombre of moduleNames) {
    const m = await prisma.module.upsert({
      where: { nombre },
      update: {},
      create: { nombre }
    })
    modules[nombre] = m
  }
  console.log('✓ Módulos creados')

  // ─── ROLES ───────────────────────────────────────────────────────────
  const superAdminRole = await prisma.role.upsert({
    where: { nombre: 'super_admin' },
    update: {},
    create: { nombre: 'super_admin', descripcion: 'Acceso total al sistema' }
  })

  const adminRole = await prisma.role.upsert({
    where: { nombre: 'admin' },
    update: {},
    create: { nombre: 'admin', descripcion: 'Administrador de app y local' }
  })

  const cajeroRole = await prisma.role.upsert({
    where: { nombre: 'cajero' },
    update: {},
    create: { nombre: 'cajero', descripcion: 'Operador de caja' }
  })
  console.log('✓ Roles creados')

  // ─── PERMISOS POR ROL ─────────────────────────────────────────────────
  for (const m of Object.values(modules)) {
    await prisma.rolePermission.upsert({
      where: { id_role_id_module: { id_role: superAdminRole.id, id_module: m.id } },
      update: {},
      create: {
        id_role: superAdminRole.id,
        id_module: m.id,
        can_view: true, can_create: true, can_edit: true, can_delete: true
      }
    })
  }

  const adminDeleteModules = ['caja', 'caja_movimientos']
  for (const [name, m] of Object.entries(modules)) {
    await prisma.rolePermission.upsert({
      where: { id_role_id_module: { id_role: adminRole.id, id_module: m.id } },
      update: {},
      create: {
        id_role: adminRole.id,
        id_module: m.id,
        can_view: true,
        can_create: true,
        can_edit: true,
        can_delete: adminDeleteModules.includes(name)
      }
    })
  }

  const cajeroModules = ['caja', 'caja_movimientos']
  for (const [name, m] of Object.entries(modules)) {
    const isCajero = cajeroModules.includes(name)
    await prisma.rolePermission.upsert({
      where: { id_role_id_module: { id_role: cajeroRole.id, id_module: m.id } },
      update: {},
      create: {
        id_role: cajeroRole.id,
        id_module: m.id,
        can_view: isCajero,
        can_create: isCajero,
        can_edit: false,
        can_delete: false
      }
    })
  }
  console.log('✓ Permisos de roles creados')

  // ─── MÉTODOS DE PAGO ──────────────────────────────────────────────────
  const metodos = [
    'Efectivo', 'Tarjeta débito', 'Tarjeta crédito',
    'Transferencia', 'Mercado Pago', 'Cheque'
  ]
  for (const nombre of metodos) {
    await prisma.metodoPago.upsert({
      where: { nombre },
      update: {},
      create: { nombre }
    })
  }
  console.log('✓ Métodos de pago creados')

  // ─── USUARIO SUPER ADMIN ──────────────────────────────────────────────
  const password_hash = await bcrypt.hash('Admin2024!', 12)
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@dcsmart.com' },
    update: {},
    create: {
      email: 'admin@dcsmart.com',
      nombre: 'Super Admin',
      password_hash
    }
  })

  // ─── APP Y LOCAL DE DEMOSTRACIÓN ──────────────────────────────────────
  const demoApp = await prisma.app.upsert({
    where: { slug: 'demo' },
    update: {},
    create: { nombre: 'DCSmart Demo', slug: 'demo' }
  })

  let demoLocal = await prisma.local.findFirst({
    where: { nombre: 'Local Central', id_app: demoApp.id }
  })
  if (!demoLocal) {
    demoLocal = await prisma.local.create({
      data: { nombre: 'Local Central', id_app: demoApp.id }
    })
  }

  await prisma.userAppRole.upsert({
    where: { id_user_id_app: { id_user: adminUser.id, id_app: demoApp.id } },
    update: {},
    create: {
      id_user: adminUser.id,
      id_app: demoApp.id,
      id_role: superAdminRole.id
    }
  })

  // ─── DETALLE TIPOS POR DEFECTO ────────────────────────────────────────
  const tiposDefault = [
    { nombre: 'Total Digitales', clasificacion: 'calculo' },
    { nombre: 'MP Total',        clasificacion: 'medio_pago' },
    { nombre: 'MP QR',           clasificacion: 'medio_pago' }
  ]
  for (const { nombre, clasificacion } of tiposDefault) {
    await prisma.detalleTipo.upsert({
      where: { nombre_id_app: { nombre, id_app: demoApp.id } },
      create: { nombre, clasificacion, id_app: demoApp.id, id_local: null, activo: true },
      update: { clasificacion }
    })
  }
  console.log('✓ DetalleTipos por defecto creados')

  console.log('✓ Usuario admin@dcsmart.com creado (password: Admin2024!)')
  console.log('✓ App y Local demo creados')
  console.log('\nSeed completado exitosamente.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
