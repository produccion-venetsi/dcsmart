# Caja Mayor: relación con la op y dos modos de alta

Fecha: 2026-08-10. Branch `DEV-67-correcciones`.

Dos cosas: poder ir a la op de gestión desde un movimiento de caja mayor, y que el
alta ofrezca dos caminos — carga rápida y operación con factura.

---

## Lo que ya existía

Antes de diseñar nada, el estado real:

- **`MovimientoCM.id_pago`** ya existe, con FK única a `Pago`. Es lo que hace la copia
  idempotente: una op no puede entrar dos veces a la caja mayor.
- El backend **ya manda** `nro_ord`, rubro, categoría, `foto_url` y `pdf_url` de la op
  en cada movimiento (`normalizarMovimiento`), con el comentario *"De la op original,
  para poder rastrearla hasta gestión"*.
- La pantalla **muestra `OP-1234` como texto plano**.
- `copiarPagoACajaMayor` ya trae a CM cualquier pago con `id_tipo = 'CM'`.

O sea: la relación estaba completa en datos y a medias en pantalla. No hace falta
tocar la base.

## A. Ir a la op desde el movimiento

El `OP-1234` pasa a ser un link a `/pagos/{id_pago}/editar`.

**El problema real no es el link, es el contexto.** Caja Mayor es global: no pasa por
`appContext`, se ven todos los grupos juntos. El formulario de un pago, en cambio,
vive dentro de un grupo y un local, y el backend corta por `allowedLocalIds`. Navegar
sin más devuelve 403.

Se resuelve **reusando `lib/destinoAviso.js`**, que ya hace exactamente esto para los
avisos: `resolverApertura` decide si hay que cambiar de grupo y local antes de ir, y
`mensajeDeCambio` da el cartel. Escribir otra versión de lo mismo terminaría con dos
criterios que se desincronizan — y esa lógica ya tiene el bug del `activeApp.app.id`
arreglado y cubierto con tests de contrato.

Los movimientos de origen `PROPIO` y `APERTURA` no llevan link: no hay op detrás.

## B. Dos modos de alta

El botón "Nuevo movimiento" abre un menú con dos caminos.

### Carga rápida

El `MovimientoForm` de hoy, sin cambios. Es para el movimiento de plata sin
comprobante: un retiro, un envío, el saldo de apertura.

### Operación con factura

**Crea una op de gestión de tipo CM, no un `MovimientoCM`.**

Es la decisión de fondo del diseño. Un "movimiento con factura" necesita proveedor,
rubro, impuestos, punto de venta, número, adjuntos y auditoría — todo lo que `Pago` ya
tiene. Agregarle esos campos a `MovimientoCM` sería duplicar el modelo y dejar el
movimiento afuera de Pagos y de los reportes del local.

Creando el `Pago` con `id_tipo = 'CM'`, el mecanismo que ya existe lo copia a caja
mayor solo, con su `id_pago`, así que la relación de la parte A se arma sin código
nuevo. Y se hereda gratis la carga con IA, el chequeo de duplicado, los impuestos y
el historial de auditoría.

**Se reusa la pantalla de Pagos** en vez de un formulario propio dentro de CM: desde
CM se pone el contexto en el local elegido y se navega a
`/pagos/nuevo?tipo=CM&volver=caja-mayor`. Cambiar de pantalla es el costo; mantener
dos formularios de op habría sido el otro.

## Cambios

| Archivo | Qué |
|---|---|
| `lib/altaCajaMayor.js` *(nuevo)* | Si un movimiento tiene op, y a dónde va cada modo de alta. Con tests. |
| `pages/pagos/PagoForm.jsx` | `?tipo=` precarga el tipo también **sin** `modo=rapido`, y `?volver=caja-mayor` cambia el destino post-guardado. |
| `pages/caja-mayor/CajaMayor.jsx` | El `OP-xxxx` como link, y el menú de dos modos. |

**Sin cambios de base.**

### Por qué el `?tipo=` necesita el cambio

Hoy `tipoParam` solo se aplica cuando `modo=rapido`, y ese modo arrastra un paquete
entero: marca el pago como pagado, genera el número desde la fecha, fuerza
`estado_op = CAJA` y precarga el proveedor del local. Para una op con factura eso está
mal — la factura trae su propio número y su propio estado. Así que el tipo se precarga
aparte del modo rápido.

## Lo que NO entra

- **No se toca el modelo.** Nada de campos de factura en `MovimientoCM`.
- **No se crea un formulario de op dentro de CM.**
- **No se cambia la copia automática**: ya funciona.
- El link va al formulario de edición de la op, que es a donde lleva también el
  listado de Pagos. No se hace una vista de solo lectura nueva.
