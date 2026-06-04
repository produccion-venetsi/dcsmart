import bcrypt from 'bcryptjs'
import { OAuth2Client } from 'google-auth-library'

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)

export default async function authRoutes(fastify) {
  // POST /api/auth/register
  fastify.post('/register', async (request, reply) => {
    const { email, nombre, password } = request.body

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
    const { email, password } = request.body

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

    const { password_hash, ...safeUser } = user
    return { user: safeUser, token }
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

    const { sub: google_id, email, name: nombre, picture: avatar_url } = payload

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

    const { password_hash, ...safeUser } = user
    return { user: safeUser, token }
  })

  // GET /api/auth/me
  fastify.get('/me', { preHandler: [fastify.authenticate] }, async (request) => {
    const user = await fastify.db.user.findUnique({
      where: { id: request.user.id },
      select: {
        id: true, email: true, nombre: true, avatar_url: true,
        activo: true, created_at: true,
        user_app_roles: {
          include: { app: true, role: true, local: true }
        }
      }
    })
    if (!user) return { error: 'Usuario no encontrado' }
    return user
  })

  // POST /api/auth/logout
  fastify.post('/logout', async (request, reply) => {
    reply.clearCookie('token', { path: '/' })
    return { message: 'Sesión cerrada' }
  })
}
