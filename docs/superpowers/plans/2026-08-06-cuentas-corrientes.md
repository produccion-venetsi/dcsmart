# Clientes / Cuentas Corrientes — qué se hizo y qué probar

Fecha: 2026-08-10. Branch `DEV-64-clientes`. Diseño en
`docs/superpowers/specs/2026-08-06-cuentas-corrientes-design.md`.

**Los cambios de base ya están aplicados en producción**, sin esperar el merge (no hay
base de dev separada):

| Cambio | Estado |
|---|---|
| Tabla `clientes` (11 columnas) | aplicada |
| `pagos.id_cliente` + índice `(id_cliente, fecha)` + FK | aplicada |
| `pagos.id_ctacte` borrada | aplicada (estaba en 0 de 54.028) |
| `CTA CTE CLI` en el enum `estado_op` | aplicado |
| 7 filas de permisos del módulo `clientes` | aplicadas |

Automático en verde: **360 tests de backend**, **270 de frontend**, build limpio.
Esta lista es lo que los tests no pueden cubrir.

---

## 1. La regla de cliente + estado (lo que sostiene el saldo)

- [ ] Cargá un pago, poné estado **CTA CTE CLI** y **no** elijas cliente. Tiene que
      avisarte que falta el cliente y no dejarte guardar.
- [ ] Elegí el cliente y guardá. Tiene que entrar bien.
- [ ] Editá ese pago y cambiá el estado a **CAJA**. El cliente tiene que desaparecer
      del formulario solo (si quedara puesto, el guardado fallaría con un error que
      desde la pantalla no se entiende).
- [ ] Volvé a poner **CTA CTE CLI**: tiene que volver a pedirte el cliente.

## 2. El saldo

- [ ] Cargá un gasto de **$100.000** a nombre de un cliente, marcado como pagado.
      La cuenta corriente tiene que decir **Debe 100.000**.
- [ ] Cargá una cobranza: mismo cliente, `ingresa_egreso` = ingreso, **$40.000**.
      El saldo tiene que quedar en **Debe 60.000**.
- [ ] Cargá otra cobranza de **$80.000**. Tiene que pasar a **A favor 20.000**
      (no a "Debe -20.000").
- [ ] Cargá un gasto a nombre del cliente **sin marcarlo como pagado**. **No** tiene
      que aparecer en la cuenta corriente ni mover el saldo. Marcalo como pagado y
      recién ahí tiene que aparecer.
- [ ] Cargá gastos del mismo cliente en **dos locales distintos** del grupo. Los dos
      tienen que aparecer en la misma cuenta corriente.

## 3. Aislamiento entre grupos

- [ ] Con el grupo A activo, entrá a Clientes. Solo tienen que verse los del grupo A.
- [ ] Cambiá al grupo B y volvé a Clientes: la lista tiene que cambiar entera.
- [ ] Pegá en la barra de direcciones la URL de la cuenta corriente de un cliente del
      grupo A estando en el grupo B. Tiene que dar **no encontrado**, no un error de
      permisos y menos los datos.

## 4. El alta y la baja

- [ ] Dá de alta un cliente con **solo razón social** (sin nombre). En la lista tiene
      que verse la razón social, no un guión.
- [ ] Dá de baja un cliente. Tiene que dejar de aparecer en el combobox al cargar un
      pago, pero su cuenta corriente y sus movimientos tienen que seguir estando.
- [ ] En la lista, poné el filtro en "Incluir dados de baja": tiene que volver a
      aparecer con el badge de baja.
- [ ] Editá un pago viejo que tenga cliente. El combobox tiene que abrir **con el
      nombre del cliente puesto**, no vacío.

## 5. Reportes y listado de pagos

- [ ] En Pagos, filtrá por estado **CTA CTE CLI**. Tiene que traer las ops del cliente.
- [ ] Mirá el badge del estado: violeta, distinto del ámbar de CUENTA CTE.
- [ ] En Reportes, **las cobranzas cuentan como ingresos** —eso es a propósito.
      Verificá que el total de ingresos las incluya y que el número te cierre.
- [ ] Exportá pagos a Excel con una op de cuenta corriente de cliente incluida y
      revisá que la columna Estado diga `CTA CTE CLI`.

## 6. Permisos

- [ ] Entrá con un usuario **cajero**: **no** tiene que ver Clientes en el menú, pero
      **sí** tiene que poder elegir cliente al cargar un pago.
- [ ] Entrá con un **admin**: tiene que ver Clientes y la cuenta corriente.
- [ ] Como super_admin, verificá que Clientes aparezca en modo **Operar** y no en
      Administrar.

---

## Pendientes conocidos

Del diseño (no son bugs, es alcance que no entró):

- No hay estado de cuenta imprimible ni exportable para mandarle al cliente.
- El saldo es un neto: no se sabe qué cobranza pagó qué gasto.
- No hay avisos por saldo vencido ni límite de crédito.

Arrastrados de antes, sin relación con este módulo:

- **37 locales siguen sin proveedor relacionado** (los dudosos de la asignación
  automática, documentados en su momento).
- **37 MovStock con método de pago distinto de Intercompany.** El arranque nuevo ya
  pone Intercompany por defecto, pero los 37 viejos siguen como estaban: hay que
  decidir si se corrigen en la base.

Verificado y descartado: `notify(..., 'info')` sí existe —es el default de `notify` en
`uiStore`, tiene `.notification-info` en `app.css` y el ícono de fallback en `Layout`.
El cartel de cambio de contexto de los avisos está bien.
