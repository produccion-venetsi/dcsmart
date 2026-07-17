# Arqueo — diseño

## Contexto

DCSmart no tiene hoy ningún concepto de "arqueo" (conteo físico de efectivo vs lo registrado en el
sistema). Se reconstruye la lógica de una fórmula usada antes en una app AppSheet vieja, adaptada a
la estructura real de `Caja`/`Pago` de DCSmart. Es una feature nueva, definida con el usuario en
varias rondas de preguntas — este documento cubre solo el modelo de datos y la fórmula; la pantalla
de frontend se define en una ronda posterior.

## Qué es un arqueo

Un arqueo es el conteo físico de efectivo guardado en 3 lugares distintos de un local (caja fuerte,
cofre, adición — cada uno un monto total, sin desglose por denominación de billete en esta primera
versión), comparado contra lo que el sistema dice que debería haber acumulado desde el arqueo
anterior. Es **por local** (cada local tiene su propia secuencia independiente de arqueos, igual que
`Caja`/`Pago`), y ordenado por `fecha`.

## Modelo de datos

```prisma
model Arqueo {
  id              String   @id @default(uuid())
  id_local        String
  fecha           DateTime
  caja_fuerte     Decimal  @db.Decimal(12, 2)
  cofre           Decimal  @db.Decimal(12, 2)
  adicion         Decimal  @db.Decimal(12, 2)
  total           Decimal  @db.Decimal(12, 2) // caja_fuerte + cofre + adicion, calculado al crear
  ingresos        Decimal  @db.Decimal(12, 2) // snapshot, ver "Cálculo" abajo
  gastos          Decimal  @db.Decimal(12, 2) // snapshot, ver "Cálculo" abajo
  comprobacion    Decimal  @db.Decimal(12, 2) // resultado de la fórmula, 0 = cuadra
  created_by      String?
  created_at      DateTime @default(now())

  local    Local          @relation(fields: [id_local], references: [id])
  creador  User?          @relation(fields: [created_by], references: [id])
  detalles ArqueoDetalle[]

  @@index([id_local, fecha])
  @@map("arqueos")
}

model ArqueoDetalle {
  id            String   @id @default(uuid())
  id_arqueo     String
  id_tipo       String?
  nombre        String?
  monto         Decimal  @db.Decimal(12, 2)
  created_at    DateTime @default(now())

  arqueo       Arqueo       @relation(fields: [id_arqueo], references: [id])
  detalle_tipo DetalleTipo? @relation(fields: [id_tipo], references: [id])

  @@map("arqueo_detalles")
}
```

`ArqueoDetalle` reusa el catálogo `DetalleTipo` ya existente (mismo patrón que `CajaDetalle` — no se
crea un catálogo nuevo). Se agrega la relación inversa `arqueo_detalles ArqueoDetalle[]` en
`DetalleTipo`. Estos detalles (MP, Rappi, etc.) son informativos — **no participan en la fórmula de
comprobación**.

## Cálculo (al crear un arqueo nuevo)

Para un `Arqueo` nuevo de un local, se busca el **arqueo anterior** de ese mismo local (`orderBy:
fecha desc`, el primero que sea anterior a la fecha del nuevo). Si no existe (es el primer arqueo del
local), `total_ultimo_arqueo = 0`.

- `total` = `caja_fuerte + cofre + adicion`
- `ingresos` = suma de `Caja.efectivo` de todas las `Caja` del mismo local con `fecha_inicio` entre
  `arqueo_anterior.fecha` (exclusivo) y `este.fecha` (inclusivo)
- `gastos` = suma de `Pago.importe` del mismo local donde `pagado = true`, `fecha_pago` entre
  `arqueo_anterior.fecha` (exclusivo) y `este.fecha` (inclusivo), `id_metodo` = el `MetodoPago` real
  llamado "Efectivo", y `ingresa_egreso = false`
- `comprobacion` = `(total + total_ultimo_arqueo) - (ingresos + gastos)`

`ingresos` y `gastos` quedan grabados como **snapshot** en el momento de crear el arqueo — no se
recalculan después si se editan/agregan `Caja`/`Pago` retroactivamente con fecha dentro de ese rango
ya cerrado.

## Permisos

Módulo nuevo `arqueo` (mismo patrón modular que `caja`/`pagos`/`proveedores`, etc. — no se reusa el
módulo de `caja`).

## Fuera de alcance de esta primera versión

- Desglose por denominación de billete/moneda (se carga el total directo por lugar).
- Pantalla de frontend (se define en una ronda de brainstorming posterior).
- Edición/anulación de un arqueo ya creado (a definir más adelante si hace falta).
- Recalcular `ingresos`/`gastos` de arqueos viejos si se editan `Caja`/`Pago` retroactivamente.
