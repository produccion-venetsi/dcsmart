# Favoritos / más usados en el selector de apps (Bloque 6, ítem 21)

**Fecha:** 2026-07-04
**Estado:** Aprobado, pendiente de implementación
**Rama:** `DEV-08-production-goal`

## Contexto

Ver `docs/superpowers/plans/backlog-produccion.md` — Bloque 6, ítem 21: para el usuario que tiene muchas apps/grupos asignados, ordenar el selector de apps (`AppSelector.jsx`) para que las que usa habitualmente aparezcan primero, en vez del orden alfabético actual.

## Objetivo

Ordenar automáticamente el selector de apps por la última vez que el usuario entró a cada una (más reciente primero), sin ninguna acción manual de su parte (no hay "marcar como favorito").

## Por qué una tabla nueva

Los permisos de un usuario (`UserAppRole`) no sirven para guardar "última vez usada por app": para un `super_admin`/`dcsmart`, el acceso es un único registro global (`id_app: null`, acceso a todas las apps) — no hay un registro por app donde anotar la fecha. Se necesita un registro separado, exclusivamente para esta métrica de uso, sin tocar el modelo de permisos existente.

## 1. Modelo nuevo: `UserAppUsage`

**Archivo:** `backend/prisma/schema.prisma`

```prisma
model UserAppUsage {
  id_user      String
  id_app       String
  last_used_at DateTime @default(now())

  user User @relation(fields: [id_user], references: [id])
  app  App  @relation(fields: [id_app], references: [id])

  @@id([id_user, id_app])
  @@map("user_app_usage")
}
```

Se agrega la relación inversa `app_usage UserAppUsage[]` en `model User` y `usage UserAppUsage[]` en `model App`. Requiere `npx prisma db push` contra la base real — se corre con confirmación explícita del usuario antes de tocar el esquema de producción, mismo criterio que cualquier cambio de este tipo en este proyecto.

## 2. Backend

**Archivo:** `backend/src/routes/auth.js`

- **`GET /api/auth/my-apps`** (ya existente, se modifica): después de armar la lista de apps (tanto la rama de `super_admin`/`dcsmart` con acceso global, como la rama de usuario normal con `UserAppRole`/`UserLocalAccess`), se hace una consulta adicional a `UserAppUsage` filtrada por `id_user: request.user.id`, se arma un mapa `id_app → last_used_at`, y se ordena el array final: primero las apps con `last_used_at` (de más reciente a más antigua), después las que nunca se usaron (mismo orden alfabético que ya traían).
- **`POST /api/auth/my-apps/:appId/touch`** (nuevo): protegido por `fastify.authenticate`. Hace un `upsert` sobre `UserAppUsage` con `where: { id_user_id_app: { id_user: request.user.id, id_app: request.params.appId } }`, seteando `last_used_at: new Date()` tanto en `create` como en `update`. No valida que el usuario tenga acceso a esa app específica (si no tiene acceso, el `appId` simplemente no va a aparecer nunca en su propio `GET /my-apps`, así que no hay superficie de exposición de datos — es solo una fecha, no información sensible).

## 3. Frontend

**Archivo:** `frontend/src/pages/AppSelector.jsx`

- Se agrega `authApi.touchApp(appId)` a `frontend/src/api/auth.js` (`client.post('/auth/my-apps/${appId}/touch')`).
- En `handleSelect(item)`, además de la navegación ya existente, se dispara `authApi.touchApp(item.app.id)` sin esperar la respuesta (`.catch(() => {})`, no bloquea ni afecta la navegación si falla).
- No hay ningún cambio visual: el orden de las cards ya viene resuelto por el backend en `GET /my-apps`, el `.map(...)` que renderiza la grilla no cambia.

## Fuera de alcance

- Favoritos manuales (marcar con estrella) — se descartó a favor del ordenamiento automático puro.
- Cualquier cambio al selector de locales dentro de una app — el alcance es solo el selector de apps.
- Un límite de "top N" apps recientes — se ordena la lista completa, no se recorta.

## Testing / verificación

- Con un usuario que tenga 3+ apps asignadas, entrar a una que no sea la primera alfabéticamente, volver al selector (logout/login o botón de cambiar de app) y confirmar que esa app ahora aparece primera.
- Entrar a una segunda app y confirmar que pasa a ser la primera, quedando la anterior segunda.
- Confirmar que un usuario que nunca usó ninguna app ve el orden alfabético de siempre (comportamiento actual, sin regresión).
- Confirmar que la búsqueda (cuando hay 5+ apps) sigue funcionando igual sobre la lista ya reordenada.
