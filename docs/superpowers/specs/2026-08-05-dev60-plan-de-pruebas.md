# DEV-60 — Plan de pruebas antes de mergear

Fecha: 2026-08-05. Branch `DEV-60`, 13 commits.

**Un merge a `dev` redeploya el backend de producción.** Y dos cosas ya están
aplicadas en la base de producción sin esperar el merge: la tabla `notificaciones`
y el rol `data_entry`.

Lo automático ya está: **294 tests de backend** y **195 de frontend** en verde, build
limpio. Esta lista es lo que las pruebas automáticas **no** pueden cubrir.

---

## 0. Lo más importante: el arreglo del descuadre

Es el cambio de mayor impacto y el que toca plata. Cambia números que ya estabas
mirando.

- [ ] Abrí **una caja de LOS GALGOS que tenga un detalle "Gastos"** y mirá el cuadre.
      Antes marcaba descuadre por exactamente 2× el gasto; ahora debería cuadrar.
- [ ] Abrí **una caja sin gastos**. El cuadre no tiene que haber cambiado en nada.
- [ ] Abrí **una caja de LUCERO** (carga por movimientos, origen TAPTAP). Tampoco
      tiene que haber cambiado: el arreglo no toca esa rama.
- [ ] En el listado de Cajas, mirá la columna **Cuadre**: debería haber bastante
      menos triángulos de alerta que antes en LOS GALGOS y GRAN-DANZON.
- [ ] **Contrastá contra la realidad:** tomá 2 o 3 cajas que ahora cuadran y
      verificá con el cierre en papel o con el cajero que efectivamente cuadran.
      Esto es lo único que confirma que la regla nueva es la correcta; yo la validé
      contra 6.434 cajas de la base, pero la base no es la verdad, el turno sí.

**Lo que este arreglo NO resuelve:** ATTE sigue con 3% de cajas cuadrando y
GRIS GRIS con 30%. Ahí hay otra causa distinta, sin diagnosticar.

---

## 1. Reportes → Pagos

- [ ] **Total ingresos + Total egresos** contra la tabla de Pagos con los mismos
      filtros (mismo local, mismo rango, mismo tipo de fecha).
- [ ] **En efectivo + Resto de las formas = el total**, en cada dirección por
      separado. Si no cierra, hay pagos que se están contando dos veces o ninguna.
- [ ] Cambiá el **tipo de fecha** (Fecha / Fecha de Pago / Cashflow / Período) y
      confirmá que los cuatro números se mueven de forma coherente.
- [ ] La tarjeta **Gastos** debería dar igual que **Total egresos**. Si difieren,
      avisame: son dos caminos distintos para el mismo concepto.
- [ ] **Ojo, cambio de comportamiento:** la tarjeta "En efectivo" antes mostraba un
      solo número que sumaba ingresos y egresos. Ahora son dos. **El número que
      venías viendo va a ser distinto** — es la corrección, no un bug.

## 2. Reportes → Pagos, las tortas de rubros

- [ ] La suma de la torta de egresos = Total egresos. Ídem ingresos.
- [ ] Desplegá **"Ver los N rubros agrupados en Otros"** y confirmá que los montos
      de la cola suman lo que dice el gajo "Otros".
- [ ] Con un rango donde haya **pocos rubros** (un día suelto), la torta no debería
      mostrar "Otros".
- [ ] Con un rango **sin ingresos**, la torta de ingresos debería decir "Sin
      ingresos en el período" y no romperse.
- [ ] Miralo en **celular**: la torta y la leyenda tienen que apilarse, no
      desbordarse.

## 3. Reportes → Cajas

- [ ] **Total cajas** = lo que dice la tabla de Cajas con el mismo rango.
- [ ] **Total detalles** = el que ya mostraba el reporte (no cambió de fuente).
- [ ] La tarjeta **Descuadre**: el conteo de cajas descuadradas debería coincidir con
      las que tienen alerta en el listado.
- [ ] Si hay cajas **sin total cargado**, la tarjeta tiene que aclararlo. Un "0
      descuadres" con cajas sin comparar sería mentira.
- [ ] El desglose **Cobros / Gastos / Informativos** al pie de la tarjeta: la suma de
      Cobros + Gastos + Informativos debería dar el Total detalles.

## 4. Avisos al desauditar

- [ ] Con **dos usuarios**: A audita un pago, B lo desaudita. **A** tiene que ver el
      contador en el sidebar y el aviso en `/avisos`, con link al pago.
- [ ] **A audita y A desaudita** → no le tiene que llegar nada a nadie.
- [ ] Lo mismo con una **caja**, no solo con un pago.
- [ ] Click en el aviso: tiene que llevarte al pago/caja y bajar el contador.
- [ ] **"Marcar todo como leído"** pone el contador en cero.
- [ ] Probá el **circuito Audit DC**: desauditar por DC, cuando arrastra el circuito
      normal, también tiene que avisar. Y si el circuito normal ya estaba
      desauditado, **no** tiene que avisar (no había nada que revertir).
- [ ] Dejá la pestaña **en segundo plano** un rato, volvé, y confirmá que el contador
      se actualiza al mirarla (no hay que esperar un minuto).

## 5. Perfil Data Entry

Necesita un usuario real con rol `data_entry`. **No alcanza con probarlo desde una
cuenta super_admin**: yo lo verifiqué cambiando el rol en el navegador y por eso la
sección ADMIN me seguía apareciendo — un `data_entry` real no la ve.

- [ ] Al entrar cae en **`/cargar`**, no en el dashboard.
- [ ] Puede **cargar un pago completo** y se guarda (probá con la lectura de factura
      por IA también).
- [ ] Puede **cargar una caja completa, con detalles y movimientos**, y se guarda.
- [ ] Escribir a mano `/pagos`, `/cajas`, `/reportes`, `/dashboard` → lo devuelve a
      `/cargar`.
- [ ] El sidebar muestra **solo** Avisos y las tres entradas de carga. Sin sección
      ADMIN.
- [ ] **No puede editar** lo que cargó. Si esto en la práctica no funciona, decímelo:
      es consecuencia de que los permisos sean por módulo y habría que rediseñarlo.

## 6. Que no se haya roto nada de lo que ya andaba

El refactor movió el alta de caja a un archivo nuevo y `vite build` **no** detecta
este tipo de rotura (son errores de runtime). Ya me pasó dos veces en este PR.

- [ ] Como **super_admin**: "Nueva Caja" desde el listado, cargar una caja con al
      menos un detalle y un movimiento, y guardar.
- [ ] Como **cajero**: lo mismo. Es el rol que más usa esa pantalla.
- [ ] El **listado de Cajas** pagina bien (la constante de filas por página se movió
      de archivo en el refactor).
- [ ] El filtro de **tipo de turno** en Cajas y en Reportes → Cajas (la lista de
      tipos pasó a un módulo compartido).
- [ ] El rol **`reportes`** sigue cayendo en `/reportes` (el redirect por rol se
      reescribió).
- [ ] **Exportar a Excel** en Pagos y en Cajas.

---

## Riesgos conocidos

1. **El arreglo del descuadre cambia números que ya estabas mirando.** No es un
   ajuste cosmético: 293 cajas pasan a cuadrar. Si alguien tomó decisiones con los
   números viejos, conviene avisarle.
2. **9 cajas de LOS GALGOS dejan de cuadrar** (26/1 al 2/2 de 2025). Están todas en
   una ventana de 8 días, lo que apunta a una época de carga distinta.
3. **Data Entry no puede corregir.** Si carga algo mal, necesita a otro.
4. **La paleta de los gráficos viejos falla accesibilidad.** La torta nueva usa una
   paleta validada; los gráficos que ya estaban siguen con la que falla. No lo toqué
   para no meter cambios visuales fuera de alcance.
