# Clientes / Cuentas Corrientes — diseño

Fecha: 2026-08-10. Branch `DEV-64-clientes`.

Módulo dentro de gestión, no una app aparte. La decisión se tomó por lo que el saldo
necesita leer: los movimientos de un cliente son **pagos** de la tabla `pagos`, con
sus rubros, sus locales y sus adjuntos. Una app separada (como costos o analytics)
tendría que leer esa tabla por fuera y quedaría acoplada al esquema sin contrato
—exactamente el problema que ya tenemos con `dcsmart-analisis`.

---

## Qué es un cliente acá

Lo contrario de un proveedor. Un proveedor es a quién le pagamos; un cliente es **a
nombre de quién se generó un gasto**, y por lo tanto quién nos lo debe.

Diferencia importante con proveedores: los proveedores son un **catálogo global**
(los comparten todos los grupos), y un cliente **pertenece a un grupo**. El backend lo
acota con el `X-App-Id` que ya manda el interceptor, así que las pantallas no pasan
nada extra. Pedir un cliente de otro grupo devuelve **404, no 403**: un 403 confirma
que el id existe, y el id de un cliente ajeno no es información de este grupo.

## Cómo se registra el movimiento

Un cobro **no** es una tabla nueva. Es un `Pago` con `ingresa_egreso = true` y el
mismo `id_cliente`:

| Movimiento | `ingresa_egreso` | Efecto en el saldo |
|---|---|---|
| Gasto a nombre del cliente | `false` | debe más |
| Cobranza | `true` | la deuda baja |

Se descartó una tabla `cobranzas` aparte y también la columna `id_ctacte` que traía la
spec original. Razones:

- La cobranza necesita todo lo que ya tiene un pago: fecha, método, importe, adjunto,
  local, auditoría. Una tabla nueva las duplica y después hay que unirlas para
  cualquier reporte.
- `id_ctacte` era un nivel más de indirección para agrupar movimientos que ya quedan
  agrupados por `id_cliente`. Se verificó que estaba en **0 de 54.028** pagos antes de
  borrar la columna.

**Las cobranzas quedan mezcladas en los reportes de pagos**, no se filtran. Fue una
decisión explícita: son plata que entró y los reportes de ingresos las tienen que ver.

## La regla que sostiene el saldo

`id_cliente` y `estado_op` van juntos **en las dos direcciones**. Vive en
`backend/src/lib/cuentaCorriente.js`, al lado del filtro que calcula el saldo, porque
las dos cosas tienen que contar lo mismo:

- **Cliente con otro `estado_op`** → el pago no entra en `whereMovimientosCliente()`,
  así que la deuda queda contada en ningún lado.
- **`CTA_CTE_CLI` sin cliente** → es una deuda a nombre de nadie. Tampoco entra en
  ninguna cuenta corriente y no hay forma de encontrarla después salvo mirando los
  pagos de uno en uno.

Se valida en el POST y en el PUT. En el PUT sobre el **estado resultante**, no sobre el
body: mirar solo el body deja pasar "agregar un cliente sin tocar el estado" y "sacar
el estado dejando el cliente puesto".

El estado nuevo del enum es `CTA_CTE_CLI`, mapeado a `CTA CTE CLI` en Postgres (mismo
criterio que `CUENTA CTE` y `MP PDP`).

## Qué cuenta para el saldo

`whereMovimientosCliente()` exige `pagado: true` **y** `fecha_pago` no nula. Un pago
sin pagar todavía puede cambiar o anularse; contarlo sería mostrarle al cliente una
deuda que la empresa no cerró. El `estado_op` va además como filtro defensivo: el
backend ya no deja guardar un `id_cliente` sin `CTA_CTE_CLI`, pero si apareciera uno
por otro camino no se cuela al saldo.

El signo: positivo = **debe**, negativo = **a favor**, cero = **saldado**.
`describirSaldo()` devuelve etiqueta y monto absoluto para que la pantalla no tenga
que interpretar el signo — un número pelado no dice para qué lado va.

## Alcance de las pantallas

Clientes usa el mismo guard que Proveedores (`ROLES_OPERATIVOS`), que son justo los
roles que alcanzan **todos los locales del grupo**: el saldo de un cliente los cruza,
así que verlo desde un solo local sería un número incompleto. El cajero **no** entra a
la pantalla de Clientes pero **sí** puede elegir cliente al cargar un pago (tiene
`clientes:view`).

Los movimientos se piden a un endpoint propio (`GET /clientes/:id/cuenta-corriente`) y
no a `GET /pagos`: ese está acotado por local.

Clientes es una ruta de **Operar**, no de Admin (ver `lib/modoTrabajo.js`).

## Cosas que se arreglaron de paso

- **El enum de estados estaba duplicado** en `PagoForm` y `PagoList`. Se movió a
  `frontend/src/lib/estadoOp.js` con un test de contrato contra el enum de Prisma.
  El motivo es concreto: ya pasó con el `ESTUDIO → ENVIADA` de Caja Mayor —se renombró
  en el backend, el frontend siguió mandando el nombre viejo y la pantalla contestaba
  400 sin decir por qué.
- **`.form-hint` se usaba sin estar definido** en `app.css`. El texto de ayuda de
  `CampoTexto` salía con el tamaño del body y competía con el valor del campo.
- **`nombre || razon_social`** estaba repetido en tres pantallas → `lib/clientes.js`.
  El alta pide uno de los dos, no los dos, así que mostrar `cliente.nombre` pelado
  dejaba en blanco a los que solo tienen razón social.

## Colores

`CTA CTE CLI` va en **violeta** y no en ámbar como `CUENTA CTE`. Las dos son cuenta
corriente pero en direcciones opuestas —una es lo que le debemos al proveedor, la otra
lo que un cliente nos debe—; compartir color las haría confundibles de un vistazo en
la lista. Hay un test que lo sostiene.

## Lo que NO está hecho

- **No hay estado de cuenta imprimible/exportable** para mandarle al cliente. La
  pantalla se ve, no se emite.
- **No hay aplicación de cobranzas a gastos puntuales.** El saldo es un neto: no se
  sabe qué cobranza pagó qué gasto. Si eso hace falta, es la indirección que
  `id_ctacte` intentaba resolver y hay que rediseñarla.
- **No hay recordatorios ni avisos por saldo vencido.**
- **No hay límite de crédito** ni bloqueo por deuda.
