# Test plan — Auditoría DC + validaciones visuales (branch DEV-09)

Antes de abrir el PR a `dev`. Entorno local: backend en `:3000`, cloud-sql-proxy en `:5433` (ver nota de entorno al final), frontend Vite en `:5173`.

## 1. Auditoría DC — Pagos

- [ ] Login `super_admin` o `dcsmart` → abrir un pago → botón "Audit DC" visible, además del "Auditar" normal.
- [ ] Click "Audit DC" (primera vez) → confirmar que el normal "Auditado" también pasa a "Sí" (cascada).
- [ ] **Recargar la página (F5)** → confirmar que el botón "Audit DC" sigue mostrando "✓ Audit DC" y la fila "Audit DC: Sí" (este era el bug crítico: antes se perdía el estado al recargar e invertía el toggle).
- [ ] Click "Audit DC" de nuevo (desauditar, con motivo) → confirmar que el normal también vuelve a "No".
- [ ] Historial de auditoría del pago → columna "Circuito" muestra "DC" en las filas correctas, "Normal" en las demás.
- [ ] Login `admin` o `cajero` → abrir el mismo pago → confirmar que **no aparece** el botón "Audit DC", ni la fila "Audit DC", ni la columna "Circuito" en el historial.
- [ ] Como `admin`, auditar/desauditar el normal libremente después de que DC ya auditó → confirmar que no se bloquea.

## 2. Auditoría DC — Cajas

- [ ] Repetir los 7 puntos de arriba en el detalle de una caja (`/cajas/:id`).

## 3. Pantalla global `/auditorias` (solo `super_admin`)

- [ ] Login `super_admin` → `/auditorias` → columna "Circuito" visible y con datos correctos (DC/Normal) tras el fix del endpoint.
- [ ] Filtros (fecha, módulo, usuario, acción) siguen funcionando igual que antes.
- [ ] Login `dcsmart` (no super_admin) → confirmar que la pantalla sigue sin ser accesible (comportamiento preexistente, no tocado esta sesión).

## 4. Íconos y validaciones visuales (sesión anterior, sin cambios hoy pero repasar)

- [ ] Tabla de pagos: ícono 👍 verde (auditado) / 👁️ amarillo (no auditado), ↑ verde (ingreso) / ↓ rojo (egreso).
- [ ] Detalle de caja: forzar un descuadre real → aparece el badge de descuadre con el monto correcto.
- [ ] Detalle de pago: forzar impuestos+neto-descuento ≠ importe → aparece el badge "No cierra".
- [ ] (Conocido, no bloqueante) Abrir un pago con impuestos que tardan en cargar → confirmar si el badge "No cierra" parpadea antes de asentarse. Si molesta, lo arreglamos.

## 5. Regresión general

- [ ] Filtros de auditado (`audit=true/false`) en listas de Pagos y Cajas siguen funcionando.
- [ ] Acciones masivas (auditar/desauditar en lote) siguen funcionando.
- [ ] Reportes (Pagos/Cajas/CMV) no muestran errores nuevos (no se tocó nada ahí esta sesión, pero es la última pantalla que comparte la tabla `audits`).

## Nota de entorno (no es parte del feature, es tu máquina)

El servicio de Windows `postgresql-x64-17` ocupa el puerto 5432 de forma permanente. Mientras eso siga así:
- Para levantar el backend local: `cloud-sql-proxy.exe dc-smart-mvp:us-central1:dcsmart-mvp-insta --port 5433`
- `backend/.env` → `DATABASE_URL` debe apuntar a `localhost:5433` (ya está así ahora).

Guardado en memoria del proyecto (`project_local-postgres-puerto-5432.md`) para no repetir la investigación.
