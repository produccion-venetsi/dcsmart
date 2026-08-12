import bcrypt from 'bcryptjs'
import { OAuth2Client } from 'google-auth-library'
import jwt from 'jsonwebtoken'
import { normalizarPassword, verificarPassword } from '../lib/password.js'
import { DIAS_INACTIVIDAD, requiereResetPorInactividad, diasDesdeUltimoLogin } from '../lib/inactividad.js'

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)

// Cuánto vive el token de sesión. Antes no se pasaba NADA acá, así que los
// tokens salían sin `exp` y no caducaban nunca: una sesión abierta en 2026
// seguía sirviendo para siempre, aunque la persona no volviera a entrar.
const VENCIMIENTO_TOKEN = process.env.JWT_EXPIRES_IN || '7d'

// Mismo criterio que plugins/appContext.js: sin locales asignados, estos
// roles ven todos los locales de la app.
const ROLES_TODOS_LOS_LOCALES = ['admin', 'externo']

// Firma el token de sesión. Todo el auth pasa por acá para que ninguno se
// escape sin vencimiento, que es exactamente lo que había pasado.
function firmarToken(fastify, user) {
  return fastify.jwt.sign({ id: user.id, email: user.email }, { expiresIn: VENCIMIENTO_TOKEN })
}

// Deja registrado el ingreso. No se hace await en el camino del login: si esto
// falla, la persona igual tiene que poder entrar.
function registrarLogin(fastify, userId) {
  fastify.db.user
    .update({ where: { id: userId }, data: { last_login: new Date() } })
    .catch((err) => fastify.log.error({ err }, `No se pudo registrar last_login de ${userId}`))
}

export default async function authRoutes(fastify) {
  // POST /api/auth/register
  fastify.post('/register', async (request, reply) => {
    const { nombre } = request.body
    const password = normalizarPassword(request.body.password)
    const email = request.body.email?.trim().toLowerCase()

    if (!email || !nombre || !password) {
      return reply.code(400).send({ error: 'email, nombre y password son requeridos' })
    }

    const existing = await fastify.db.user.findUnique({ where: { email } })
    if (existing) {
      return reply.code(409).send({ error: 'El email ya está registrado' })
    }

    const password_hash = await bcrypt.hash(password, 12)

    const user = await fastify.db.user.create({
      data: { email, nombre, password_hash },
      select: { id: true, email: true, nombre: true, avatar_url: true, created_at: true }
    })

    registrarLogin(fastify, user.id)
    const token = firmarToken(fastify, user)
    reply.setCookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/'
    })

    return reply.code(201).send({ user, token })
  })

  // POST /api/auth/login
  fastify.post('/login', async (request, reply) => {
    // Se normaliza igual que el email: los teclados de celular agregan un
    // espacio invisible que hacia fallar el login sin explicacion. Ver
    // lib/password.js.
    const password = normalizarPassword(request.body.password)
    const email = request.body.email?.trim().toLowerCase()

    if (!email || !password) {
      return reply.code(400).send({ error: 'email y password son requeridos' })
    }

    const user = await fastify.db.user.findUnique({ where: { email } })
    if (!user || !user.password_hash) {
      return reply.code(401).send({ error: 'Credenciales inválidas' })
    }

    // Se le pasa la contraseña CRUDA, no la normalizada: verificarPassword
    // prueba la normalizada y, si no da, la cruda, para no dejar afuera a los
    // hashes que se guardaron antes de que existiera el trim (ver lib/password.js).
    const valid = await verificarPassword(request.body.password, user.password_hash)
    if (!valid) {
      return reply.code(401).send({ error: 'Credenciales inválidas' })
    }

    if (!user.activo) {
      return reply.code(403).send({ error: 'Usuario inactivo' })
    }

    // Se chequea DESPUÉS de validar la contraseña a propósito: antes, cualquiera
    // podría averiguar qué cuentas están sin uso probando mails.
    if (requiereResetPorInactividad(user.last_login)) {
      const dias = diasDesdeUltimoLogin(user.last_login)
      return reply.code(403).send({
        error: `Hace ${dias} días que no entrás y por seguridad la contraseña dejó de servir. `
             + 'Pedí a un administrador que te la resetee para volver a entrar.',
        motivo: 'inactividad'
      })
    }

    registrarLogin(fastify, user.id)
    const token = firmarToken(fastify, user)
    reply.setCookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/'
    })

    const fullUser = await fastify.db.user.findUnique({
      where: { id: user.id },
      select: {
        id: true, email: true, nombre: true, avatar_url: true,
        activo: true, created_at: true,
        user_app_roles: { include: { app: true, role: true } }
      }
    })
    return { user: fullUser, token }
  })

  // POST /api/auth/google
  fastify.post('/google', async (request, reply) => {
    const { credential } = request.body

    if (!credential) {
      return reply.code(400).send({ error: 'credential de Google es requerido' })
    }

    let payload
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID
      })
      payload = ticket.getPayload()
    } catch {
      return reply.code(401).send({ error: 'Token de Google inválido' })
    }

    const { sub: google_id, name: nombre, picture: avatar_url } = payload
    const email = payload.email?.trim().toLowerCase()

    let user = await fastify.db.user.findUnique({ where: { google_id } })

    if (!user) {
      const existingByEmail = await fastify.db.user.findUnique({ where: { email } })
      if (existingByEmail) {
        user = await fastify.db.user.update({
          where: { email },
          data: { google_id, avatar_url: avatar_url || existingByEmail.avatar_url }
        })
      } else {
        user = await fastify.db.user.create({
          data: { email, nombre, google_id, avatar_url }
        })
      }
    }

    if (!user.activo) {
      return reply.code(403).send({ error: 'Usuario inactivo' })
    }

    // Google no pasa por el corte de inactividad: la cuenta la valida Google en
    // el momento, que es la garantía que el corte busca dar cuando la única
    // prueba es una contraseña vieja. Igual queda registrado el ingreso.
    registrarLogin(fastify, user.id)
    const token = firmarToken(fastify, user)
    reply.setCookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/'
    })

    const fullUser = await fastify.db.user.findUnique({
      where: { id: user.id },
      select: {
        id: true, email: true, nombre: true, avatar_url: true,
        activo: true, created_at: true,
        user_app_roles: { include: { app: true, role: true } }
      }
    })
    return { user: fullUser, token }
  })

  // GET /api/auth/me
  fastify.get('/me', { preHandler: [fastify.authenticate] }, async (request) => {
    const user = await fastify.db.user.findUnique({
      where: { id: request.user.id },
      select: {
        id: true, email: true, nombre: true, avatar_url: true,
        activo: true, created_at: true,
        user_app_roles: {
          include: { app: true, role: true }
        }
      }
    })
    if (!user) return { error: 'Usuario no encontrado' }
    return user
  })

  // GET /api/auth/my-apps
  fastify.get('/my-apps', { preHandler: [fastify.authenticate] }, async (request) => {
    const userRoles = await fastify.db.userAppRole.findMany({
      where: { id_user: request.user.id },
      include: {
        app: {
          include: {
            locales: { where: { activo: true }, orderBy: { nombre: 'asc' } }
          }
        },
        role: true
      }
    })

    let result

    // super_admin / dcsmart: acceso a TODAS las apps y a todos sus locales.
    // Excepción: apps con solo_super_admin=true son invisibles incluso para
    // dcsmart (ver spec del grupo de testing) -- solo super_admin las ve.
    const isSuperAdmin = userRoles.some(r => r.role.nombre === 'super_admin')
    const isDcsmart    = !isSuperAdmin && userRoles.some(r => r.role.nombre === 'dcsmart')
    if (isSuperAdmin || isDcsmart) {
      const allApps = await fastify.db.app.findMany({
        where: { activo: true, ...(isSuperAdmin ? {} : { solo_super_admin: false }) },
        include: { locales: { where: { activo: true }, orderBy: { nombre: 'asc' } } },
        orderBy: { nombre: 'asc' }
      })
      result = allApps.map(a => ({
        app:     { id: a.id, nombre: a.nombre, slug: a.slug },
        role:    isSuperAdmin ? 'super_admin' : 'dcsmart',
        locales: a.locales.map(l => ({ id: l.id, nombre: l.nombre }))
      }))
    } else {
      // Para usuarios normales: resolver locales permitidos desde user_local_access
      const localAccesses = await fastify.db.userLocalAccess.findMany({
        where: { id_user: request.user.id },
        include: { local: { select: { id: true, nombre: true } } }
      })

      // Agrupar por app
      const accessByApp = {}
      for (const la of localAccesses) {
        if (!accessByApp[la.id_app]) accessByApp[la.id_app] = []
        accessByApp[la.id_app].push({ id: la.local.id, nombre: la.local.nombre })
      }

      // admin / externo / cajero: locales asignados en user_local_access.
      // Excepción: admin y externo sin filas explícitas = acceso a TODOS los
      // locales activos de la app (ver ROLES_TODOS_LOS_LOCALES).
      result = []
      for (const r of userRoles) {
        const assigned = accessByApp[r.id_app] ?? []
        let locales = assigned
        if (ROLES_TODOS_LOS_LOCALES.includes(r.role.nombre) && assigned.length === 0) {
          const allLocales = await fastify.db.local.findMany({
            where: { id_app: r.id_app, activo: true },
            select: { id: true, nombre: true },
            orderBy: { nombre: 'asc' }
          })
          locales = allLocales
        }
        result.push({
          app:    { id: r.app.id, nombre: r.app.nombre, slug: r.app.slug },
          role:   r.role.nombre,
          locales
        })
      }
    }

    // Ordenar por uso: las apps usadas más recientemente primero; las nunca
    // usadas quedan al final, en el orden que ya traían (alfabético).
    const usage = await fastify.db.userAppUsage.findMany({
      where: { id_user: request.user.id }
    })
    const lastUsedByApp = {}
    for (const u of usage) lastUsedByApp[u.id_app] = u.last_used_at

    result.sort((a, b) => {
      const ta = lastUsedByApp[a.app.id]
      const tb = lastUsedByApp[b.app.id]
      if (ta && tb) return new Date(tb) - new Date(ta)
      if (ta) return -1
      if (tb) return 1
      return 0
    })

    // Resolver si el usuario puede ver Reportes — misma lógica de precedencia
    // que fastify.can(): override individual (UserPermission) manda si existe;
    // si no, el permiso del rol (super_admin bypasea todo).
    const reportesModule = await fastify.db.module.findUnique({ where: { nombre: 'reportes' } })
    const userReportesPerm = reportesModule
      ? await fastify.db.userPermission.findUnique({
          where: { id_user_id_module: { id_user: request.user.id, id_module: reportesModule.id } }
        })
      : null

    let reportesRolePermByRole = {}
    if (reportesModule && !isSuperAdmin) {
      const roleIds = [...new Set(result.map(r => {
        const match = userRoles.find(ur => ur.app?.id === r.app.id)
          ?? userRoles.find(ur => ur.id_app === null)
        return match?.id_role
      }).filter(Boolean))]
      const rolePerms = await fastify.db.rolePermission.findMany({
        where: { id_role: { in: roleIds }, id_module: reportesModule.id }
      })
      reportesRolePermByRole = Object.fromEntries(rolePerms.map(rp => [rp.id_role, rp.can_view]))
    }

    for (const entry of result) {
      if (isSuperAdmin) { entry.can_reportes = true; continue }
      if (userReportesPerm) { entry.can_reportes = !!userReportesPerm.can_view; continue }
      const roleMatch = userRoles.find(ur => ur.app?.id === entry.app.id) ?? userRoles.find(ur => ur.id_app === null)
      entry.can_reportes = !!reportesRolePermByRole[roleMatch?.id_role]
    }

    return result
  })

  // POST /api/auth/my-apps/:appId/touch
  fastify.post('/my-apps/:appId/touch', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { appId } = request.params
    try {
      await fastify.db.userAppUsage.upsert({
        where: { id_user_id_app: { id_user: request.user.id, id_app: appId } },
        create: { id_user: request.user.id, id_app: appId },
        update: { last_used_at: new Date() }
      })
    } catch (err) {
      if (err.code === 'P2003') return reply.code(404).send({ error: 'App no encontrada' })
      throw err
    }
    return { ok: true }
  })

  // POST /api/auth/logout
  fastify.post('/logout', async (request, reply) => {
    reply.clearCookie('token', { path: '/' })
    return { message: 'Sesión cerrada' }
  })

  // POST /api/auth/analytics-ticket
  // Firma un ticket cortísimo (60s, un solo viaje) con el email del usuario
  // logueado, para que dcsmart-analisis lo canjee por una sesión propia sin
  // pedir credenciales de nuevo (SSO). No comparte JWT_SECRET ni cookies.
  fastify.post('/analytics-ticket', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (!process.env.INTERNAL_SHARED_SECRET) {
      return reply.code(500).send({ error: 'Integración con Analytics no configurada' })
    }
    const ticket = jwt.sign({ email: request.user.email }, process.env.INTERNAL_SHARED_SECRET, {
      expiresIn: '60s', issuer: 'dcsmart-gestion', audience: 'dcsmart-analytics'
    })
    return { ticket }
  })

  // POST /api/auth/tareas-ticket
  // Igual que /analytics-ticket, pero ademas lleva el departamento (texto
  // validado contra lib/datosUsuario.js) y si el usuario es super_admin --
  // DC-PLATAFORMA no tiene tabla de departamentos propia del lado de
  // dcsmart, interpreta ese string contra su propio catalogo.
  fastify.post('/tareas-ticket', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (!process.env.INTERNAL_SHARED_SECRET) {
      return reply.code(500).send({ error: 'Integración con Tareas no configurada' })
    }

    const user = await fastify.db.user.findUnique({
      where: { id: request.user.id },
      select: { email: true, nombre: true, departamento: true }
    })
    if (!user) return reply.code(404).send({ error: 'Usuario no encontrado' })

    const esSuperAdmin = await fastify.db.userAppRole.findFirst({
      where: { id_user: request.user.id, role: { nombre: 'super_admin' } }
    })

    const ticket = jwt.sign(
      { email: user.email, nombre: user.nombre, departamento: user.departamento, es_super_admin: !!esSuperAdmin },
      process.env.INTERNAL_SHARED_SECRET,
      { expiresIn: '60s', issuer: 'dcsmart-gestion', audience: 'dc-plataforma' }
    )
    return { ticket }
  })

  // POST /api/auth/costos-ticket
  // Igual que /analytics-ticket pero ademas lleva los locales permitidos y el
  // rol: Costos no lee las tablas de permisos de gestion, confia en el ticket.
  // La resolucion de locales calca la de /my-apps (lineas 159-225 de este
  // archivo), solo que aplanada a una lista unica en vez de agrupada por app,
  // porque Costos no distingue apps: solo necesita saber a que locales entra.
  fastify.post('/costos-ticket', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (!process.env.INTERNAL_SHARED_SECRET) {
      return reply.code(500).send({ error: 'Integración con Costos no configurada' })
    }

    const userRoles = await fastify.db.userAppRole.findMany({
      where: { id_user: request.user.id },
      include: { app: true, role: true },
      orderBy: { app: { nombre: 'asc' } }
    })

    // super_admin gana siempre; dcsmart solo si no es super_admin (igual que
    // /my-apps). Si no tiene ninguno de los dos, el rol es el del primer
    // UserAppRole ordenado por nombre de app, para que sea determinístico.
    const isSuperAdmin = userRoles.some(r => r.role.nombre === 'super_admin')
    const isDcsmart    = !isSuperAdmin && userRoles.some(r => r.role.nombre === 'dcsmart')
    const rol = isSuperAdmin ? 'super_admin' : isDcsmart ? 'dcsmart' : (userRoles[0]?.role.nombre ?? null)

    const localesById = new Map()

    // super_admin / dcsmart: acceso a todos los locales activos de todas las
    // apps activas. Excepcion: apps con solo_super_admin=true son invisibles
    // incluso para dcsmart -- solo super_admin las ve (igual que /my-apps).
    if (isSuperAdmin || isDcsmart) {
      const allApps = await fastify.db.app.findMany({
        where: { activo: true, ...(isSuperAdmin ? {} : { solo_super_admin: false }) },
        include: { locales: { where: { activo: true }, select: { id: true, nombre: true } } }
      })
      // El grupo (App.nombre) viaja plano dentro de cada local: Costos no
      // agrupa por app, pero necesita mostrar de que grupo es cada local.
      for (const a of allApps) {
        for (const l of a.locales) localesById.set(l.id, { id: l.id, nombre: l.nombre, grupo: a.nombre })
      }
    } else {
      // Para usuarios normales: resolver locales permitidos desde user_local_access.
      // El nombre de la app viene anidado para no consultarlo aparte por local.
      const localAccesses = await fastify.db.userLocalAccess.findMany({
        where: { id_user: request.user.id },
        include: { local: { select: { id: true, nombre: true, app: { select: { nombre: true } } } } }
      })

      // Agrupar por app
      const accessByApp = {}
      for (const la of localAccesses) {
        if (!accessByApp[la.id_app]) accessByApp[la.id_app] = []
        accessByApp[la.id_app].push({ id: la.local.id, nombre: la.local.nombre, grupo: la.local.app.nombre })
      }

      // admin / cajero: locales asignados en user_local_access.
      // Excepcion: admin sin filas explicitas = acceso a TODOS los locales activos de la app.
      for (const r of userRoles) {
        const assigned = accessByApp[r.id_app] ?? []
        let localesForApp = assigned
        if (ROLES_TODOS_LOS_LOCALES.includes(r.role.nombre) && assigned.length === 0) {
          const todosLosLocales = await fastify.db.local.findMany({
            where: { id_app: r.id_app, activo: true },
            select: { id: true, nombre: true }
          })
          // r.app ya viene del include de userRoles, asi que el nombre del grupo
          // esta en memoria: no hace falta pedirlo de nuevo en este findMany.
          localesForApp = todosLosLocales.map(l => ({ id: l.id, nombre: l.nombre, grupo: r.app.nombre }))
        }
        for (const l of localesForApp) localesById.set(l.id, l)
      }
    }

    // Aplanar y dedupear por id de local (un mismo local puede llegar por
    // mas de una app/rol), ordenado por nombre para que el resultado sea estable.
    const locales = [...localesById.values()].sort((a, b) => a.nombre.localeCompare(b.nombre))
    if (locales.length === 0) return reply.code(403).send({ error: 'No tenés locales asignados' })

    // Local desde el que se apreto "Costos": viaja firmado para que Costos abra
    // en el mismo local en el que se estaba trabajando, en vez de pedirlo de
    // nuevo. Se valida contra los locales permitidos: un id arbitrario en el
    // body no puede dar acceso a un local que el usuario no tiene.
    const idLocalPedido = String(request.body?.id_local ?? '')
    const localActivo = locales.find(l => l.id === idLocalPedido) ?? null

    const ticket = jwt.sign(
      { email: request.user.email, rol, locales, ...(localActivo ? { local_activo: localActivo } : {}) },
      process.env.INTERNAL_SHARED_SECRET,
      { expiresIn: '60s', issuer: 'dcsmart-gestion', audience: 'dcsmart-costos' }
    )
    return { ticket }
  })
}
