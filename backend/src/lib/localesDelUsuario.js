// A qué locales puede entrar un usuario, JUNTANDO todas sus apps.
//
// Existe para los módulos globales (hoy: Caja Mayor) que no pasan por
// appContext: ahí no hay una app activa que recorte, así que el recorte sale de
// la unión de todo lo que el usuario tiene asignado. La semántica calca la de
// GET /api/auth/my-apps (routes/auth.js): filas de user_local_access de todas
// sus user_app_roles, y para admin/externo SIN filas explícitas, todos los
// locales activos de esa app.
//
// La decisión está separada del acceso a la base (resolverLocalesPermitidos es
// pura y se testea sola); localesDelUsuario es el wrapper que consulta Prisma.

// Mismo criterio que routes/auth.js y plugins/appContext.js: sin locales
// asignados, estos roles ven todos los locales de su app.
export const ROLES_TODOS_LOS_LOCALES = ['admin', 'externo']

// Roles globales: ven todo, sin recorte por local. `null` significa eso.
export const ROLES_SIN_RECORTE = ['super_admin', 'dcsmart']

// ¿Alguno de los roles del usuario lo exime del recorte?
export function sinRecorte(nombresDeRoles) {
  return nombresDeRoles.some((n) => ROLES_SIN_RECORTE.includes(n))
}

// Apps en las que hay que ir a buscar TODOS los locales activos: las que tienen
// un rol admin/externo y ninguna fila explícita en user_local_access. Se calcula
// aparte para que el wrapper consulte la base solo para esas apps.
export function appsQueVenTodosLosLocales(roles, accesos) {
  const appsConAcceso = new Set(accesos.map((a) => a.id_app))
  return [...new Set(
    roles
      .filter((r) => ROLES_TODOS_LOS_LOCALES.includes(r.rol) && !appsConAcceso.has(r.id_app))
      .map((r) => r.id_app)
      .filter(Boolean)
  )]
}

// La decisión pura. Recibe:
//   roles         [{ id_app, rol }]                — todas las user_app_roles
//   accesos       [{ id_app, id_local }]           — todas las user_local_access
//   localesPorApp { [id_app]: [id_local, ...] }    — locales activos, solo de las
//                                                    apps de appsQueVenTodosLosLocales
// Devuelve null (sin recorte) o la lista deduplicada de id_local permitidos.
export function resolverLocalesPermitidos(roles, accesos, localesPorApp = {}) {
  if (sinRecorte(roles.map((r) => r.rol))) return null

  const accesosPorApp = {}
  for (const a of accesos) {
    if (!accesosPorApp[a.id_app]) accesosPorApp[a.id_app] = []
    accesosPorApp[a.id_app].push(a.id_local)
  }

  const ids = new Set()
  for (const r of roles) {
    const asignados = accesosPorApp[r.id_app] ?? []
    if (asignados.length > 0) {
      for (const id of asignados) ids.add(id)
    } else if (ROLES_TODOS_LOS_LOCALES.includes(r.rol)) {
      for (const id of localesPorApp[r.id_app] ?? []) ids.add(id)
    }
    // cajero (u otro rol scoped) sin filas: no suma nada, igual que my-apps.
  }
  return [...ids]
}

// Wrapper con base: null = sin recorte, lista = solo esos locales.
export async function localesDelUsuario(db, userId) {
  const userRoles = await db.userAppRole.findMany({
    where: { id_user: userId },
    include: { role: { select: { nombre: true } } },
  })
  const roles = userRoles.map((r) => ({ id_app: r.id_app, rol: r.role.nombre }))
  if (sinRecorte(roles.map((r) => r.rol))) return null

  const accesos = await db.userLocalAccess.findMany({
    where: { id_user: userId },
    select: { id_app: true, id_local: true },
  })

  const necesitanTodos = appsQueVenTodosLosLocales(roles, accesos)
  const localesPorApp = {}
  if (necesitanTodos.length > 0) {
    const locales = await db.local.findMany({
      where: { id_app: { in: necesitanTodos }, activo: true },
      select: { id: true, id_app: true },
    })
    for (const l of locales) {
      if (!localesPorApp[l.id_app]) localesPorApp[l.id_app] = []
      localesPorApp[l.id_app].push(l.id)
    }
  }

  return resolverLocalesPermitidos(roles, accesos, localesPorApp)
}

// ¿Tiene el rol super_admin en alguna app? (mismo criterio que requireSuperAdmin)
export async function esSuperAdmin(db, userId) {
  const filas = await db.userAppRole.findMany({
    where: { id_user: userId },
    include: { role: { select: { nombre: true } } },
  })
  return filas.some((f) => f.role.nombre === 'super_admin')
}
