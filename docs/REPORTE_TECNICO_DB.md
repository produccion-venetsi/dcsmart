# DCSmart — Reporte Técnico de Base de Datos y Lógica de Aplicación

**Fecha:** 2026-06-23  
**Alcance:** Análisis completo del schema Prisma, relaciones, lógica de negocio y scripts de migración.

---

## 1. Arquitectura General

| Capa | Tecnología |
|------|-----------|
| Frontend | Vite + React (PWA), Zustand |
| Backend | Node.js + Fastify |
| ORM | Prisma |
| Base de datos | PostgreSQL (Google Cloud SQL) |
| Auth | JWT + Google OAuth |
| Storage | Google Cloud Storage (fotos/PDFs de pagos) |

---

## 2. Modelo de Datos — Tablas y Relaciones

### 2.1 Diagrama de Relaciones (ASCII)

```
                    ┌──────────┐
                    │   App    │
                    │  (apps)  │
                    └────┬─────┘
           ┌─────────────┼────────────────┬───────────────┐
           │             │                │               │
           ▼             ▼                ▼               ▼
      ┌─────────┐  ┌──────────┐   ┌─────────────┐  ┌──────────────┐
      │  Local   │  │UserAppRole│   │ DetalleTipo │  │UserLocalAccess│
      │(locales) │  │          │   │             │  │              │
      └────┬─────┘  └──────────┘   └──────┬──────┘  └──────────────┘
           │                               │
     ┌─────┼──────────┐                    │
     │     │          │                    │
     ▼     ▼          ▼                    ▼
  ┌──────┐ ┌──────┐ ┌──────────────┐  ┌───────────┐
  │ Caja │ │ Pago │ │UserLocalAccess│  │CajaDetalle│
  │      │ │      │ │              │  │           │
  └──┬───┘ └──┬───┘ └──────────────┘  └───────────┘
     │        │
     ▼        ▼
┌──────────┐ ┌──────────┐
│CajaMovim.│ │ Impuesto │
└──────────┘ └──────────┘

     ┌─────────┐     ┌──────────┐     ┌─────────┐
     │  Rubro  │────▶│  RubCat  │◀────│Categoria│
     └─────────┘     └────┬─────┘     └─────────┘
                          │
                    ┌─────┼─────┐
                    ▼           ▼
              ┌──────────┐ ┌─────────┐
              │Proveedor │ │  Pago   │
              └──────────┘ └─────────┘

     ┌──────┐     ┌──────────────┐     ┌────────┐
     │ User │────▶│ UserAppRole  │◀────│  Role  │
     └──┬───┘     └──────────────┘     └────┬───┘
        │                                   │
        ▼                                   ▼
  ┌──────────────┐                  ┌───────────────┐
  │UserPermission│                  │RolePermission │
  └──────────────┘                  └───────────────┘
        │                                   │
        └──────────┐       ┌────────────────┘
                   ▼       ▼
                ┌──────────┐
                │  Module  │
                └──────────┘

     ┌───────────┐
     │MetodoPago │─────▶ CajaMovimiento, Pago
     └───────────┘

     ┌───────────┐
     │   Audit   │ (tabla genérica, no FK)
     └───────────┘
```

### 2.2 Detalle de Cada Tabla

#### **App** (`apps`) — Grupo económico / empresa
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUID PK | |
| nombre | String | "GRUPO RVLR" |
| slug | String UNIQUE | "grupo-rvlr" |
| activo | Boolean | Soft delete |

**Relaciones:** → locales[], user_app_roles[], detalle_tipos[], user_local_access[]

**Ejemplo:**
```
GRUPO RVLR (grupo-rvlr)
  ├── Local: PALERMO
  ├── Local: MALABIA
  ├── Local: REVOLVER
  └── Local: LOMITAS
```

---

#### **Local** (`locales`) — Sucursal/local de un grupo
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUID PK | |
| nombre | String | "PALERMO" |
| direccion | String? | |
| id_app | FK → App | Grupo al que pertenece |

**Relaciones:** → cajas[], pagos[], user_local_access[], detalle_tipos[]

**Ejemplo:**
```
Local "PALERMO" pertenece a App "GRUPO RVLR"
  → Tiene 150 cajas registradas
  → Tiene 3000 pagos registrados
```

---

#### **User** (`users`) — Usuario del sistema
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUID PK | |
| email | String UNIQUE | |
| nombre | String | |
| password_hash | String? | null si usa solo Google OAuth |
| google_id | String? UNIQUE | ID de Google |
| activo | Boolean | Soft delete |

**Relaciones:** → user_app_roles[], user_permissions[], cajas_creadas[], pagos_creados[], user_local_access[]

---

#### **Role** (`roles`) — 4 roles del sistema
Roles existentes: `super_admin`, `dcsmart`, `admin`, `cajero`

| Rol | Descripción | Alcance |
|-----|-------------|---------|
| super_admin | Acceso total | Global (id_app = null) |
| dcsmart | Operaciones completas | Global (id_app = null) |
| admin | CRUD sin delete en su grupo | Scoped a una App |
| cajero | Ve y crea en un local | Scoped a una App + Local |

---

#### **UserAppRole** (`user_app_roles`) — Asignación usuario↔app↔rol
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id_user | FK → User | |
| id_app | FK → App? | **null = acceso global** |
| id_role | FK → Role | |

**Constraint:** `@@unique([id_user, id_app])`

**Ejemplo:**
```
super1@dcsmart.com → { id_app: null, rol: super_admin }  // acceso global
admin1@dcsmart.com → { id_app: GRUPO_RVLR, rol: admin }  // solo RVLR
cajero1@dcsmart.com → { id_app: GRUPO_RVLR, rol: cajero } // solo RVLR + locales asignados
```

---

#### **UserLocalAccess** (`user_local_access`) — Restricción a locales específicos
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id_user | FK → User | |
| id_app | FK → App | |
| id_local | FK → Local | |

**Constraint:** `@@unique([id_user, id_app, id_local])`

**Ejemplo:**
```
cajero1@dcsmart.com tiene acceso a:
  → GRUPO RVLR > PALERMO (y nada más)

admin1@dcsmart.com tiene acceso a:
  → GRUPO RVLR > PALERMO
  → GRUPO RVLR > REVOLVER
  → GRUPO RVLR > MALABIA
```

---

#### **Module** (`modules`) — Módulos del sistema para permisos
Módulos: `caja`, `caja_movimientos`, `pagos`, `proveedores`, `rubros`, `categorias`, `metodos_pago`, `usuarios`, `apps`, `locales`

#### **RolePermission** (`role_permissions`) — Permisos por defecto de cada rol
Cada combinación rol+módulo define: `can_view`, `can_create`, `can_edit`, `can_delete`

**Ejemplo (seed):**
```
super_admin + pagos → [view✓, create✓, edit✓, delete✓]
admin + pagos       → [view✓, create✓, edit✓, delete✗]
cajero + pagos      → [view✓, create✓, edit✗, delete✗]
```

#### **UserPermission** (`user_permissions`) — Override por usuario
Sobrescribe los permisos del rol para un usuario específico en un módulo.

---

#### **Rubro** (`rubros`) — Rubro contable
| Campo | Tipo | Descripción |
|-------|------|-------------|
| nombre | String UNIQUE | "CMV Alimentos", "Sueldos", etc. |

#### **Categoria** (`categorias`) — Categoría contable
| Campo | Tipo | Descripción |
|-------|------|-------------|
| nombre | String UNIQUE | "Carnes", "Vinos", "Alquiler", etc. |

#### **RubCat** (`rubcat`) — Combinación Rubro + Categoría
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id_cat | FK → Categoria | |
| id_rub | FK → Rubro | |
| cuenta | String? | Tipo de cuenta contable ("Resultados", "Mercaderias", etc.) |
| tipo | String? | |
| costo | String? | |
| clasificacion | String? | |

**Constraint:** `@@unique([id_cat, id_rub])`

**Ejemplo:**
```
Rubro: "CMV Alimentos" + Categoria: "Carnes" → RubCat RC-0007 (cuenta: Mercaderias)
Rubro: "Fijos/Variables" + Categoria: "Alquiler" → RubCat RC-0033 (cuenta: Resultados)
```

---

#### **Proveedor** (`proveedores`)
| Campo | Tipo | Descripción |
|-------|------|-------------|
| nombre | String? | ⚠️ Nullable (ver problemas) |
| razon_social | String? | |
| cuit | String? | |
| banco, cbu, alias | String? | Datos bancarios |
| id_rubcat | FK → RubCat? | RubCat default del proveedor |
| plazo | Int? | Plazo de pago en días |

**Ejemplo:**
```
Proveedor: "El Criollo" (CUIT: 30708879017)
  → RubCat: null (sin rubro default)
  → Se usa en pagos de "CMV Alimentos > Carnes"
```

---

#### **MetodoPago** (`metodos_pago`)
Valores: Efectivo, Tarjeta débito, Tarjeta crédito, Transferencia, Mercado Pago, Cheque

---

#### **Caja** (`cajas`) — Turno de caja de un local
| Campo | Tipo | Descripción |
|-------|------|-------------|
| nro_turno | String? | |
| fecha_inicio | DateTime | Obligatorio |
| fecha_cierre | DateTime? | |
| id_local | FK → Local | Obligatorio |
| cajero | String? | Nombre del cajero (texto libre) |
| total | Decimal(12,2)? | Total recaudado |
| efectivo | Decimal(12,2)? | Subtotal en efectivo |
| fiscal | Decimal(12,2)? | Total fiscal |
| comensales, tickets | Int? | Métricas |
| foto_url | String? | URL de foto del cierre |
| origin | Enum(DCSMART/TAPTAP/FFUDO) | Origen de los datos |
| created_by | FK → User? | |

**Relaciones:** → movimientos[], detalles[]

**Ejemplo:**
```
Caja #1 — PALERMO — 2026-06-20
  Turno: 1, Cajero: "Martín"
  Total: $850,000.00, Efectivo: $320,000.00
  Movimientos:
    - ingreso_efectivo: $320,000.00 (Efectivo)
    - ingreso_tarjeta: $250,000.00 (Tarjeta débito)
    - ingreso_mp: $280,000.00 (Mercado Pago)
  Detalles:
    - "Salon": $500,000.00 (tipo: canal)
    - "Delivery": $200,000.00 (tipo: canal)
    - "MP Total": $280,000.00 (tipo: medio_pago)
```

---

#### **CajaMovimiento** (`caja_movimientos`) — Línea de movimiento dentro de una caja
| Campo | Tipo | Descripción |
|-------|------|-------------|
| tipo | String | "ingreso_efectivo", "egreso", etc. (texto libre) |
| id_metodo | FK → MetodoPago? | |
| monto | Decimal(12,2) | |
| id_caja | FK → Caja | |
| cantidad | Int? | |

---

#### **DetalleTipo** (`detalle_tipos`) — Catálogo de tipos de detalle por app/local
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id_app | FK → App | |
| id_local | FK → Local? | null = aplica a toda la app |
| nombre | String | "Salon", "Delivery", "MP Total" |
| clasificacion | String | "canal", "medio_pago", "calculo", "otro" |

**Constraint:** `@@unique([nombre, id_app])`

#### **CajaDetalle** (`caja_detalles`) — Detalle puntual de una caja
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id_caja | FK → Caja | |
| id_tipo | FK → DetalleTipo? | Referencia al catálogo |
| tipo | String? | Clasificación copiada del catálogo |
| nombre | String? | Nombre copiado del catálogo |
| monto | Decimal(12,2) | |

---

#### **Pago** (`pagos`) — Factura/comprobante de pago
| Campo | Tipo | Descripción |
|-------|------|-------------|
| nro_ord | Int? | Número de orden |
| fecha | DateTime? | Fecha de factura |
| id_proveedor | FK → Proveedor? | |
| id_rubcat | FK → RubCat? | |
| id_tipo | Enum TipoPago? | A, B, C, CM, DC(1), DC(2), DDJJ, M, NCA, NDA, STK |
| pv | Int? | Punto de venta |
| nro | BigInt? | Número de comprobante |
| importe_neto | Decimal(12,2)? | |
| descuento | Decimal(12,2)? | |
| importe | Decimal(12,2)? | Total final |
| id_metodo | FK → MetodoPago? | |
| cashflow | DateTime? | Fecha de vencimiento |
| pagado | Boolean | false = pendiente |
| fecha_pago | DateTime? | |
| estado_op | Enum EstadoOp? | CAJA, CUENTA CTE, MP PDP, PDP |
| ingresa_egreso | Boolean | true = ingreso, false = egreso |
| id_local | FK → Local? | |
| created_by | FK → User? | |
| id_pdp, id_eventos, id_cheque, id_ctacte | String? | Campos para futuras relaciones |

**Relaciones:** → impuestos[]

**Ejemplo completo:**
```
Pago #1205 — LUCERO — 2026-05-15
  Proveedor: "El Criollo" (Carnes)
  RubCat: CMV Alimentos > Carnes (RC-0007)
  Tipo: A (Factura A)
  PV: 0001, Nro: 38234
  Importe Neto: $85,000.00
  Impuestos:
    - IVA21: $17,850.00
  Importe Total: $102,850.00
  Método: Transferencia
  Estado: CUENTA CTE → PDP → Pagado (2026-06-01)
```

---

#### **Impuesto** (`impuestos`) — Líneas de impuestos de un pago
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id_pago | FK → Pago | |
| tipo | Enum TipoImpuesto | IVA21, IVA27, IVA10, RETENCION, PERCEPCION |
| monto | Decimal(12,2) | |

---

#### **Audit** (`audits`) — Registro genérico de auditoría
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUID PK | |
| id_registro | String | ID del registro auditado (pago) |
| tabla | String | "pagos" |
| tipo | String | "auditoria_pago" o "auditado" |
| aprobado | Boolean? | |
| id_user | String? | ⚠️ Guarda email, no UUID (ver problemas) |
| fecha | DateTime? | |

**Nota:** No tiene FK a ninguna tabla. Es una tabla genérica.

---

## 3. Flujos de Negocio

### 3.1 Flujo de Autenticación
```
Login (email+pass o Google OAuth)
  → JWT generado (header + cookie httpOnly)
  → /api/auth/my-apps → lista de apps+locales según rol
  → Frontend guarda app_id + local_id en appStore
  → Cada request lleva: Authorization: Bearer + X-App-Id
```

### 3.2 Flujo de Permisos (cada request)
```
1. authenticate → verifica JWT
2. appContext → resuelve rol efectivo del usuario para la app
   - super_admin/dcsmart global → acceso a todo
   - admin → acceso a locales asignados (o todos si no tiene restricción)
   - cajero → acceso solo a locales explícitamente asignados
3. can(módulo, acción) → verifica permiso
   - Primero busca UserPermission (override)
   - Si no hay, usa RolePermission del rol efectivo
```

### 3.3 Flujo de Pagos (PDP)
```
1. Crear pagos (estado: sin estado_op, pagado: false)
2. POST /pagos/mandar-pdp → marca pagos con estado_op: "PDP"
3. POST /pagos/pagar → marca pagado: true + fecha_pago + id_metodo
4. PATCH /pagos/:id/audit → crea/elimina registro en tabla audits
```

### 3.4 Flujo de Caja
```
1. Crear caja con fecha_inicio + id_local
2. Agregar movimientos (tipo + método + monto)
3. Agregar detalles (basados en catálogo DetalleTipo)
4. Cerrar caja (actualizar fecha_cierre + totales)
```

---

## 4. Problemas Detectados y Correcciones Sugeridas

### 4.1 🔴 CRÍTICOS

#### P1 — `Audit.id_user` guarda email en vez de UUID
**Archivo:** `backend/src/routes/pagos.js:393`
```js
id_user: request.user.email,  // ❌ Guarda email
```
**Problema:** El campo `id_user` en `audits` a veces guarda el email del usuario y a veces el UUID (en la migración Lucero), lo que genera inconsistencia. No hay FK que valide esto.

**Corrección sugerida:** Cambiar a `request.user.id` y considerar agregar FK a User si se quiere integridad referencial.

---

#### P2 — `Pago.nro_ord` se setea con `parseInt()` que puede dar `NaN`
**Archivo:** `backend/src/routes/pagos.js:271`
```js
nro_ord: nro_ord ? parseInt(nro_ord) : null,
```
Si `nro_ord` es `"abc"`, `parseInt()` devuelve `NaN`, que Prisma rechaza. Lo mismo aplica a `pv`.

**Corrección sugerida:** Validar que el valor sea numérico antes de hacer `parseInt()`, o usar `parseInt(nro_ord) || null`.

---

#### P3 — Schema vs CLAUDE.md: `Pago` perdió campos `audit`, `user_audit`, `audit_date`
El schema original en CLAUDE.md tenía columnas de auditoría directas en `Pago`. El schema actual las eliminó y las movió a la tabla `Audit`, pero hay inconsistencia: el endpoint `PATCH /:id/audit` y los helpers `getAuditedSet`/`buildAuditFilter` ya trabajan con la tabla `audits`, pero los campos fantasma `id_pdp`, `id_eventos`, `id_cheque`, `id_ctacte` siguen sin usar.

**Corrección sugerida:** Están bien como placeholders para módulos futuros, pero documentarlo.

---

### 4.2 🟡 IMPORTANTES

#### P4 — `Proveedor.nombre` es nullable pero el POST valida que no sea null
**Schema:** `nombre String?` (nullable)  
**Ruta:** `if (!nombre) return reply.code(400).send(...)` valida que exista

**Problema:** Inconsistencia: el schema permite null pero la ruta lo rechaza. Si se ejecutó la migración SQL, ya hay proveedores con `nombre = null` (como "GASTOS VARIOS" que tiene `razon_social` pero no `nombre`).

**Corrección sugerida:** Decidir si `nombre` es requerido o no. Si sí, hacerlo `String` (no nullable) en el schema.

---

#### P5 — `CajaMovimiento.tipo` es texto libre sin validación
No hay enum ni validación para los valores de `tipo` en movimientos de caja. Cualquier string es aceptado.

**Corrección sugerida:** Considerar un enum o al menos validación en el backend para prevenir datos inconsistentes.

---

#### P6 — `buildAuditFilter` trae TODOS los audit records para filtrar
**Archivo:** `backend/src/routes/pagos.js:29-41`
```js
const rows = await fastify.db.audit.findMany({
  where: { tabla: 'pagos' },  // Sin filtro por app/local
  select: { id_registro: true }
})
```
**Problema:** Trae todos los registros de auditoría de pagos (de todas las apps) para luego filtrar con `IN`/`NOT IN`. A medida que crezca la tabla `audits`, esto será lento.

**Corrección sugerida:** Pre-filtrar por los IDs de pagos del query paginado, o hacer un JOIN en SQL.

---

#### P7 — `Caja.cajero` es texto libre en vez de FK a User
Si un usuario cambia de nombre, las cajas viejas quedan con el nombre anterior.

**Corrección sugerida:** Para trazabilidad, usar `created_by` (que ya existe y es FK a User) como el cajero.

---

#### P8 — Enum `TipoPago` y `EstadoOp` difieren entre CLAUDE.md y schema real
- CLAUDE.md: `TipoPago = A, B, C, CM, INTERCOMPANY` / `EstadoOp = PENDIENTE, APROBADO, RECHAZADO, PAGADO`
- Schema real: `TipoPago = A, B, C, CM, DC_1, DC_2, DDJJ, M, NCA, NDA, STK` / `EstadoOp = CAJA, CUENTA_CTE, MP_PDP, PDP`

Los enums reales reflejan los datos migrados de producción. CLAUDE.md está desactualizado.

---

### 4.3 🟢 MENORES / MEJORAS

#### P9 — `Impuestos.jsx` tiene `TIPOS` hardcodeado sin incluir `IVA27`
**Archivo:** `frontend/src/pages/admin/Impuestos.jsx:21`
```js
const TIPOS = ['IVA21', 'IVA10', 'RETENCION', 'PERCEPCION']  // Falta IVA27
```
El schema tiene `IVA27` en el enum `TipoImpuesto`, pero el frontend no lo ofrece como opción.

---

#### P10 — `Proveedores` no usa `appContext` (datos globales)
Las rutas de proveedores (`/api/proveedores`) no usan el middleware `appContext`. Proveedores es una tabla global compartida entre todos los grupos. Esto es correcto por diseño, pero significa que **todos los usuarios con permiso `proveedores.view` ven todos los proveedores** independientemente de su grupo.

---

#### P11 — RubCat, Rubros y Categorias son globales
Similar a proveedores: son compartidos entre todos los grupos. Un admin de GRUPO RVLR ve los mismos rubros que un admin de GRUPO ALDOS. Esto parece intencional.

---

#### P12 — `App.delete` hace hard delete sin verificar dependencias
**Archivo:** `backend/src/routes/apps.js:50-59`  
Si una App tiene locales con cajas/pagos, el delete fallará por FK constraints. No hay manejo de esto.

**Corrección sugerida:** Usar soft delete (`activo: false`) o verificar dependencias antes de borrar.

---

#### P13 — `Local.delete` hace hard delete sin verificar dependencias
Mismo problema que P12 para locales.

---

#### P14 — No hay índices adicionales explícitos
El schema no define índices más allá de los implícitos (PK, UNIQUE). Para tablas como `pagos` (potencialmente miles de rows), podrían beneficiarse de índices en: `fecha`, `id_local`, `pagado`, `estado_op`.

**Corrección sugerida:** Agregar `@@index` en el schema para los campos más consultados.

---

## 5. Resumen de Relaciones Clave (con ejemplos)

### Ejemplo 1: Flujo completo de un pago
```
App: GRUPO LUCERO (grupo-lucero)
  └── Local: LUCERO (J45J3822)
        └── Pago:
              ├── nro_ord: 1205
              ├── fecha: 2026-05-15
              ├── Proveedor: "El Criollo" (id: 1dcfc651)
              │     └── RubCat: CMV Alimentos > Carnes (RC-0007)
              ├── RubCat: CMV Alimentos > Carnes (RC-0007)
              ├── id_tipo: A (Factura A)
              ├── pv: 1, nro: 38234
              ├── importe_neto: $85,000.00
              ├── Impuestos:
              │     └── IVA21: $17,850.00
              ├── importe: $102,850.00
              ├── MetodoPago: Transferencia
              ├── estado_op: PDP
              ├── pagado: true, fecha_pago: 2026-06-01
              ├── created_by: dc1@dcsmart.com
              └── Audit:
                    └── { tabla: "pagos", tipo: "auditado", aprobado: true }
```

### Ejemplo 2: Permisos de un cajero
```
Usuario: cajero1@dcsmart.com (Cajero PALERMO)
  └── UserAppRole: { id_app: GRUPO_RVLR, id_role: cajero }
  └── UserLocalAccess: { id_app: GRUPO_RVLR, id_local: PALERMO }

Al hacer GET /api/cajas con X-App-Id: GRUPO_RVLR:
  1. authenticate → OK (JWT válido)
  2. appContext → rol "cajero", allowedLocalIds: [PALERMO]
  3. can('caja', 'view') → RolePermission: cajero+caja → can_view: true ✓
  4. Query: WHERE id_local IN ('PALERMO')
  → Solo ve cajas de PALERMO
```

### Ejemplo 3: Caja con movimientos y detalles
```
Caja: PALERMO — 2026-06-20 Turno 1
  ├── CajaMovimiento:
  │     ├── { tipo: "ingreso_efectivo", metodo: Efectivo, monto: 320000 }
  │     ├── { tipo: "ingreso_tarjeta", metodo: Tarjeta débito, monto: 250000 }
  │     └── { tipo: "ingreso_mp", metodo: Mercado Pago, monto: 280000 }
  ├── CajaDetalle:
  │     ├── { DetalleTipo: "Salon" (canal), monto: 500000 }
  │     ├── { DetalleTipo: "Delivery" (canal), monto: 200000 }
  │     └── { DetalleTipo: "MP Total" (medio_pago), monto: 280000 }
  ├── total: 850000, efectivo: 320000
  └── origin: DCSMART
```

---

## 6. Scripts Analizados

| Script | Propósito | Estado |
|--------|-----------|--------|
| `prisma/seed.js` | Seed de roles, módulos, métodos de pago, apps de referencia, usuarios de prueba | ✅ Activo — Se usa para resetear datos de test |
| `scripts/seed-detalle-tipos.js` | Crea DetalleTipos preset (Salon, Delivery, etc.) en todas las apps | ⚠️ One-shot — Ya ejecutado |
| `scripts/migrate-user-local-access.js` | Migra `id_local` de `user_app_roles` a la nueva tabla `user_local_access` | ⚠️ One-shot — Ya ejecutado |
| `scripts/migrate_clean_rubcat.local.sql` | Limpia y re-puebla apps, locales, rubros, categorías, rubcat, proveedores | ⚠️ One-shot — Migración masiva ya ejecutada |
| `scripts/cleanup-lucero-pagos.sql` | Borra todos los pagos de LUCERO (prerequisito de la migración) | ⚠️ One-shot — Ya ejecutado |
| `scripts/run-cleanup-lucero.js` | Versión JS del cleanup de Lucero (usa Prisma) | ⚠️ One-shot — Ya ejecutado |
| `scripts/migrate-lucero-pagos.js` | Migra pagos de LUCERO desde CSV a PostgreSQL | ⚠️ One-shot — Ya ejecutado |
| `scripts/rerun-lucero-failed.js` | Re-procesa 11 filas que fallaron en la migración de Lucero | ⚠️ One-shot — Ya ejecutado |

---

## 7. Archivos Candidatos a Eliminación

Scripts one-shot que ya fueron ejecutados y no se necesitan para la operación de la app:

| Archivo | Razón para borrar |
|---------|-------------------|
| `scripts/cleanup-lucero-pagos.sql` | Script SQL de limpieza ya ejecutado |
| `scripts/run-cleanup-lucero.js` | Variante JS del mismo cleanup |
| `scripts/migrate-lucero-pagos.js` | Migración CSV→DB ya completada |
| `scripts/rerun-lucero-failed.js` | Fix de 11 rows que fallaron, ya aplicado |
| `scripts/migrate-user-local-access.js` | Migración de schema completada |
| `scripts/migrate_clean_rubcat.local.sql` | Migración masiva de datos completada |
| `scripts/seed-detalle-tipos.js` | Seed one-shot ya aplicado |

**NO borrar:**
- `prisma/schema.prisma` — Schema activo
- `prisma/seed.js` — Se usa activamente para datos de prueba
- `CLAUDE.md` — Documentación de referencia del proyecto

---

## 8. Conclusiones

1. **La arquitectura de permisos es sólida**: el sistema de roles + módulos + overrides por usuario es flexible y bien implementado.
2. **La separación App → Local → datos operativos funciona bien** para el modelo multi-tenant por grupo económico.
3. **La tabla `Audit` genérica** es un diseño razonable pero necesita normalizar el `id_user` (UUID vs email).
4. **Los datos globales** (rubros, categorías, proveedores, métodos de pago) compartidos entre grupos es una decisión de diseño consciente y correcta para este dominio.
5. **Los scripts de migración one-shot** pueden limpiarse para reducir ruido en el repo.
6. **CLAUDE.md necesita actualizarse** para reflejar el schema real (enums, tablas nuevas como `Audit`, `DetalleTipo`, `CajaDetalle`, `UserLocalAccess`).
