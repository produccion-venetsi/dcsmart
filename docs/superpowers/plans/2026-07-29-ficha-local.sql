-- Ficha de configuración del local — cambio de esquema
-- Branch: DEV-39 · 2026-07-29
--
-- NO APLICADO. Requiere decisión humana: no hay base de dev separada, esta
-- base es la de producción (deploy-dev.yml y deploy.yml apuntan al mismo
-- Cloud Run contra la misma Cloud SQL).
--
-- Este SQL se escribió a mano con la sintaxis exacta que genera
-- `prisma migrate diff` (verificada contra --from-empty), porque el diff
-- incremental necesita conexión a la base y el cloud-sql-proxy no estaba
-- corriendo. Antes de aplicar, correr con el proxy levantado:
--
--   cd backend
--   npx prisma migrate diff --from-schema-datasource prisma/schema.prisma \
--     --to-schema-datamodel prisma/schema.prisma --script
--
-- y comparar con lo de abajo. Si aparece cualquier DROP, o algo de la tabla
-- `multimoneda`, DETENERSE: significa que la base está desincronizada del
-- schema.prisma (CLAUDE.md avisa que MultiMoneda puede no estar aplicado) y
-- un `prisma db push` a ciegas arrastraría ese cambio también.
--
-- Todas las columnas son nullable, así que el cambio es aditivo: ningún
-- registro existente queda inválido y no hace falta backfill.

CREATE TYPE "tipo_local" AS ENUM ('Gastronomía', 'Indumentaria', 'Arquitectura', 'Inmobiliario', 'Multimedia');

ALTER TABLE "locales" ADD COLUMN "logo_url"      TEXT,
                      ADD COLUMN "maps_url"      TEXT,
                      ADD COLUMN "menu_url"      TEXT,
                      ADD COLUMN "mail_facturas" TEXT,
                      ADD COLUMN "tipo_local"    "tipo_local";
