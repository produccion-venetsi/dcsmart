import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import cookie from '@fastify/cookie'
import 'dotenv/config'

import dbPlugin from './plugins/db.js'
import permissionsPlugin from './plugins/permissions.js'
import appContextPlugin from './plugins/appContext.js'
import authRoutes from './routes/auth.js'
import appsRoutes from './routes/apps.js'
import localesRoutes from './routes/locales.js'
import usersRoutes from './routes/users.js'
import cajaRoutes from './routes/caja.js'
import cajaMoveRoutes from './routes/caja_movimientos.js'
import pagosRoutes from './routes/pagos.js'
import proveedoresRoutes from './routes/proveedores.js'
import rubcatRoutes from './routes/rubcat.js'
import metodosRoutes from './routes/metodos_pago.js'
import rolesRoutes from './routes/roles.js'
import impuestosRoutes from './routes/impuestos.js'

// Serializar BigInt como string en JSON (para columnas como pagos.nro con IDs de MP)
BigInt.prototype.toJSON = function () { return this.toString() }

const app = Fastify({ logger: true })

await app.register(cors, {
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
})

await app.register(jwt, {
  secret: process.env.JWT_SECRET,
  cookie: { cookieName: 'token', signed: false }
})

await app.register(cookie)
await app.register(dbPlugin)
await app.register(permissionsPlugin)
await app.register(appContextPlugin)

app.decorate('authenticate', async (request, reply) => {
  try {
    await request.jwtVerify()
  } catch (err) {
    reply.code(401).send({ error: 'Unauthorized' })
  }
})

await app.register(authRoutes, { prefix: '/api/auth' })
await app.register(appsRoutes, { prefix: '/api/apps' })
await app.register(localesRoutes, { prefix: '/api/locales' })
await app.register(usersRoutes, { prefix: '/api/users' })
await app.register(cajaRoutes, { prefix: '/api/cajas' })
await app.register(cajaMoveRoutes, { prefix: '/api/caja-movimientos' })
await app.register(pagosRoutes, { prefix: '/api/pagos' })
await app.register(proveedoresRoutes, { prefix: '/api/proveedores' })
await app.register(rubcatRoutes,    { prefix: '/api/rubcat' })
await app.register(metodosRoutes,  { prefix: '/api/metodos-pago' })
await app.register(rolesRoutes,    { prefix: '/api/roles' })
await app.register(impuestosRoutes,{ prefix: '/api/impuestos' })

app.get('/health', async () => ({ status: 'ok' }))

try {
  await app.listen({ port: Number(process.env.PORT) || 3000, host: '0.0.0.0' })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
