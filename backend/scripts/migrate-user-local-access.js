// backend/scripts/migrate-user-local-access.js
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const rows = await prisma.$queryRaw`
    SELECT id_user, id_app, id_local
    FROM user_app_roles
    WHERE id_local IS NOT NULL
  `

  console.log(`Encontrados ${rows.length} registros con id_local en user_app_roles`)

  let creados = 0
  for (const row of rows) {
    await prisma.$executeRaw`
      INSERT INTO user_local_access (id, id_user, id_app, id_local)
      VALUES (gen_random_uuid(), ${row.id_user}, ${row.id_app}, ${row.id_local})
      ON CONFLICT (id_user, id_app, id_local) DO NOTHING
    `
    creados++
  }

  console.log(`Migrados: ${creados} registros a user_local_access`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
