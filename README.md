# DCSmart

Super app para gestión de restaurantes y administración de grupos gastronómicos.

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | Vite + React (PWA) |
| Backend | Node.js + Fastify |
| Base de datos | PostgreSQL (Google Cloud SQL) |
| ORM | Prisma |
| Auth | Google OAuth + Email/Password + JWT |

## Arrancar con Claude Code

Abrí este proyecto en Claude Code y decile:

> "Seguí el CLAUDE.md y construí el proyecto completo desde el paso 1"

Claude Code va a leer el `CLAUDE.md` y ejecutar todos los pasos en orden.

## Setup manual

### Prerequisitos

- Node.js 20+
- npm 10+
- Acceso a Google Cloud (para Cloud SQL)

### 1. Variables de entorno

```bash
cp .env.example .env
# Editar .env con tus valores reales
```

### 2. Backend

```bash
cd backend
npm install
npx prisma generate
npx prisma migrate dev --name init
npx prisma db seed
npm run dev
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

### 4. Cloud SQL Auth Proxy (cuando tengas la instancia)

```bash
# Descargar proxy
curl -o cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.6.1/cloud-sql-proxy.linux.amd64
chmod +x cloud-sql-proxy

# Ejecutar (reemplazar con tu instancia)
./cloud-sql-proxy TU_PROYECTO:REGION:INSTANCIA --port 5432
```

## Estructura de permisos

| Rol | Ver | Crear | Editar | Eliminar |
|-----|-----|-------|--------|----------|
| super_admin | ✅ todo | ✅ todo | ✅ todo | ✅ todo |
| admin | ✅ todo | ✅ todo | ✅ todo* | ❌ |
| cajero | ✅ caja/pagos | ❌ | ❌ | ❌ |

*Los admins no pueden editar rubros, categorias (solo lectura).

Los permisos son configurables por usuario mediante `user_permissions`.

## Crear instancia Cloud SQL

```bash
gcloud sql instances create dcsmart-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=us-central1

gcloud sql databases create dcsmart --instance=dcsmart-db

gcloud sql users create dcsmart_user \
  --instance=dcsmart-db \
  --password=TU_PASSWORD
```
