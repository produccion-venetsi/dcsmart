import bcrypt from 'bcryptjs'
import { OAuth2Client } from 'google-auth-library'
import jwt from 'jsonwebtoken'

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)

export default async function authRoutes(fastify) {
  // POST /api/auth/register
  fastify.post('/register', async (request, reply) => {
    const { nombre, password } = request.body
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

    const token = fastify.jwt.sign({ id: user.id, email: user.email })
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
    const { password } = request.body
    const email = request.body.email?.trim().toLowerCase()

    if (!email || !password) {
      return reply.code(400).send({ error: 'email y password son requeridos' })
    }

    const user = await fastify.db.user.findUnique({ where: { email } })
    if (!user || !user.password_hash) {
      return reply.code(401).send({ error: 'Credenciales inválidas' })
    }

    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
      return reply.code(401).send({ error: 'Credenciales inválidas' })
    }

    if (!user.activo) {
      return reply.code(403).send({ error: 'Usuario inactivo' })
    }

    const token = fastify.jwt.sign({ id: user.id, email: user.email })
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

    const token = fastify.jwt.sign({ id: user.id, email: user.email })
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
    const isSuperAdmin = userRoles.some(r => r.role.nombre === 'super_admin')
    const isDcsmart    = !isSuperAdmin && userRoles.some(r => r.role.nombre === 'dcsmart')
    if (isSuperAdmin || isDcsmart) {
      const allApps = await fastify.db.app.findMany({
        where: { activo: true },
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

      // admin / cajero: locales asignados en user_local_access.
      // Excepción: admin sin filas explícitas = acceso a TODOS los locales activos de la app.
      result = []
      for (const r of userRoles) {
        const assigned = accessByApp[r.id_app] ?? []
        let locales = assigned
        if (r.role.nombre === 'admin' && assigned.length === 0) {
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
}
