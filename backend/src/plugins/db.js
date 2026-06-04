import fp from 'fastify-plugin'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function dbPlugin(fastify) {
  await prisma.$connect()
  fastify.decorate('db', prisma)
  fastify.addHook('onClose', async () => {
    await prisma.$disconnect()
  })
}

export default fp(dbPlugin)
