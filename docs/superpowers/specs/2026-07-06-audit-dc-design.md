# Auditoría DC (doble validación) — Diseño

## Contexto

Hoy, tanto Pagos como Cajas tienen un único circuito de auditoría, modelado
en la tabla genérica `audits` (`tabla`, `id_registro`, `tipo`, `accion`,
`vigente`, historial append-only). Cualquier usuario con permiso de edición
sobre el módulo (`admin`, `super_admin`, `dcsmart`) puede auditar/desauditar.

Se necesita un segundo circuito de auditoría, exclusivo para los roles
`super_admin` y `dcsmart` ("audit dc"), que funcione como una doble
validación corporativa: cuando DCSmart audita (o desaudita) vía "audit dc",
el estado de auditoría normal se actualiza automáticamente para reflejar la
misma acción. Los roles `admin` y `cajero` no deben saber que este segundo
circuito existe: para ellos solo existe "Auditado" (que puede aparecer ya
en `true` por la cascada del DC, sin ninguna pista de por qué).

## Bug existente a corregir

Las queries actuales de auditoría normal (`getAuditedSet`,
`buildAuditFilter`, `PATCH /:id/audit` en `pagos.js` y `caja.js`) filtran
por `tabla + id_registro + vigente`, sin distinguir el circuito. Al agregar
un segundo circuito concurrente, el toggle normal marcaría por error la fila
DC vigente como `vigente: false` (o la contaría como estado normal). Se
corrige agregando la nueva columna al filtro (ver más abajo).

## 1. Schema

Agregar a `model Audit` en `backend/prisma/schema.prisma`:

```prisma
audit_dc Boolean @default(false)
```

- `audit_dc: false` (default) = fila del circuito normal, como hoy.
- `audit_dc: true` = fila del circuito DC.
- `tipo` no cambia de significado: sigue siendo `'auditoria_pago'` /
  `'auditoria_caja'` en ambos circuitos. La columna `audit_dc` es la que
  distingue el circuito, no el `tipo`.
- Migración aditiva (`ALTER TABLE audits ADD COLUMN audit_dc BOOLEAN DEFAULT false`)
  contra la base de Cloud SQL compartida por `dev` y `master`. No es
  destructiva ni afecta filas existentes (todas quedan `audit_dc: false`,
  que es el comportamiento actual).

## 2. Backend

### 2.1 Corrección de scope en el circuito normal

En `pagos.js` (`getAuditedSet`, `buildAuditFilter`) y `caja.js`
(`getAuditedCajaSet`, `buildCajaAuditFilter`): agregar `audit_dc: false` al
`where` de las queries que leen el estado vigente.

En `PATCH /:id/audit` (ambos routers): agregar `audit_dc: false` tanto al
`findFirst` que busca la fila vigente actual como al `updateMany` que la
cierra, para no tocar ninguna fila del circuito DC.

### 2.2 Nuevo decorator `requireDc`

En `backend/src/plugins/permissions.js`, agregar:

```js
fastify.decorate('requireDc', async (request, reply) => {
  if (!['super_admin', 'dcsmart'].includes(request.activeRole)) {
    return reply.code(403).send({ error: 'Solo DCSmart puede realizar esta acción' })
  }
})
```

Depende de `request.activeRole`, que ya calcula `appContext` — por lo tanto
`requireDc` debe usarse siempre después de `fastify.appContext` en la cadena
de `preHandler`.

### 2.3 Nuevo endpoint `PATCH /:id/audit-dc`

En `pagos.js` y `caja.js`, mismo mecanismo append-only que el endpoint
normal, con `preHandler: [fastify.authenticate, fastify.appContext, fastify.requireDc]`:

1. Busca la fila vigente del circuito DC (`audit_dc: true`, `vigente: true`).
2. Cierra esa fila (`vigente: false`) y crea una nueva con la acción
   invertida (`auditado` ↔ `desauditado`), `audit_dc: true`.
3. **Cascada**: lee la fila vigente del circuito normal (`audit_dc: false`).
   Si su `accion` no coincide con la nueva acción del DC, la cierra y crea
   una nueva fila normal (`audit_dc: false`) con la acción del DC, mismo
   `id_user` que hizo la acción DC, `observaciones: null` (sin texto que
   revele el origen). Si ya coincide, no se toca (evita filas de historial
   redundantes).
4. Devuelve `{ ok: true, audit: boolean, audit_dc: boolean }` con ambos
   estados resultantes.

Todo dentro de una única `$transaction`.

### 2.4 Filtrado de `GET /:id/audit-history`

Si `request.activeRole` no es `super_admin` ni `dcsmart`, excluir del
resultado las filas con `audit_dc: true` antes de devolver la lista. Así
`admin`/`cajero` nunca ven evidencia del circuito DC, ni siquiera en el
historial.

## 3. Frontend

### 3.1 Pagos (`PagoDetailPanel` en `PagoList.jsx`)

- `canAuditDc = ['super_admin', 'dcsmart'].includes(role)` (mismo patrón que
  `canEdit`/`canDelete`, ya derivados de `activeApp.role`).
- Nuevo estado `auditedDc` (inicializado desde `pago.audit_dc`, análogo a
  `audited`).
- Botón "Audit DC" junto al botón "Auditar" existente, visible solo si
  `canAuditDc`. Llama a `pagosApi.auditDc(pago.id, opts)` (nuevo método en
  `api/pagos.js` que pega a `PATCH /:id/audit-dc`), y actualiza tanto
  `audited` como `auditedDc` con la respuesta `{ audit, audit_dc }`.
- Nueva fila en `infoRows`, `['Audit DC', auditedDc ? 'Sí' : 'No']`,
  agregada condicionalmente solo si `canAuditDc` (no se agrega al array para
  otros roles).
- Sin cambios para `admin`/`cajero`: sigue existiendo un único "Auditado".

### 3.2 Cajas (`CajaDetail.jsx`)

Mismo patrón: `canAuditDc` derivado del rol activo, botón "Audit DC" junto
al botón "Auditar" existente, fila "Audit DC" condicional en `infoRows`,
nuevo método `cajasApi.auditDc(id, opts)`.

## Fuera de alcance

- No se agrega ningún filtro de listado (`audit_dc=true/false`) en
  `GET /pagos` ni `GET /cajas` — no fue pedido y el circuito normal
  (potencialmente cascadeado) ya cubre el filtro `audit` existente.
- No se bloquea el auditado normal si el DC ya auditó — el admin/cajero
  puede seguir tocando el auditado normal libremente después de la cascada
  inicial (confirmado con el usuario).
- No aplica a ningún otro módulo con auditoría — solo Pagos y Cajas, que ya
  comparten la tabla genérica `audits`.
