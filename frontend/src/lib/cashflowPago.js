// Qué fecha de cashflow propone el formulario de pagos.
//
// El cashflow es la fecha en que la plata efectivamente se mueve, y el backend lo exige
// (`POST /pagos` responde "El cashflow es obligatorio"). Hay dos situaciones distintas y
// hasta ahora el formulario solo sabía resolver una:
//
//   Op con factura     → la plata sale a futuro: fecha de factura + plazo del proveedor.
//   Modo rápido        → la plata YA salió de la caja: el cashflow es el día que salió.
//
// En los modos rápidos (Carga Avión y MovStock) el pago nace con `pagado: true` y su fecha
// de pago puesta, así que pedir el cashflow aparte es pedir dos veces el mismo dato: quien
// carga tiene que tipear a mano, en cada op, una fecha que el formulario ya conoce. Acá el
// cashflow sigue a la fecha de pago.
//
// El plazo del proveedor se ignora en modo rápido a propósito: un plazo de 30 días sobre
// una op que se pagó en efectivo hoy no describe nada real.
//
// ── Lo automático no pisa lo escrito a mano ─────────────────────────────────────
//
// Regla que ya existía para el plazo y que se mantiene: si alguien escribió el cashflow, no
// se vuelve a tocar nunca en silencio. El cliente carga vencimientos pactados que no
// coinciden con ningún cálculo, y verlos cambiar solos al mover otro campo es peor que
// tener que tipearlos.

// La parte fecha de un valor de <input type="date"> o de <input type="datetime-local">.
// fecha_pago viaja como 'YYYY-MM-DDTHH:mm' porque necesita hora (Arqueo ordena por ella);
// el cashflow es solo día.
export function soloFecha(valor) {
  const s = String(valor ?? '')
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : ''
}

// fecha + plazo (días). Aritmética de día calendario en UTC para no depender del huso del
// navegador: `new Date(fecha + 'T00:00:00')` se interpreta en hora local y, fuera de
// Argentina, corría el día resultante.
export function calcCashflow(fecha, plazo) {
  const base = soloFecha(fecha)
  if (!base || !plazo) return ''
  const dias = Number(plazo)
  if (!Number.isFinite(dias)) return ''
  const [y, m, d] = base.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10)
}

// El cashflow que le corresponde al formulario tal como está. Devuelve '' cuando no hay con
// qué calcularlo (una op con factura sin proveedor elegido todavía).
export function cashflowAutomatico({ modoRapido, fecha, fechaPago, plazo } = {}) {
  if (modoRapido) {
    // Si se destildó "pagado" no hay fecha de pago: queda la fecha de la op, que es el día
    // en que se espera que salga.
    return soloFecha(fechaPago) || soloFecha(fecha)
  }
  return calcCashflow(fecha, plazo)
}

// ¿El valor que hay lo puso una persona? Se decide comparándolo con el automático que le
// correspondía: si coinciden, era automático y se puede seguir moviendo.
export function esCashflowManual(actual, automatico) {
  const a = soloFecha(actual)
  if (!a) return false
  return a !== soloFecha(automatico)
}

// Qué decirle a quien carga, debajo del campo. El cashflow es obligatorio y su valor puede
// venir de tres lugares distintos (la fecha de pago, el plazo del proveedor, o la mano de
// una persona); sin decirlo, el campo es una fecha sin explicación y nadie sabe si el número
// que ve lo puso el sistema o lo dejó otro. `accion` es la vuelta atrás a lo automático, que
// aparece solo cuando hay algo distinto a lo que volver.
export function ayudaCashflow({ modoRapido, fecha, fechaPago, plazo, actual } = {}) {
  const automatico = cashflowAutomatico({ modoRapido, fecha, fechaPago, plazo })
  const manual = esCashflowManual(actual, automatico)

  const base = modoRapido
    ? (soloFecha(fechaPago)
        ? 'Sigue a la fecha de pago.'
        : 'Sigue a la fecha de la operación.')
    : (plazo
        ? `Fecha + ${plazo} días de plazo del proveedor.`
        : 'Fecha estimada en que sale la plata. Elegí el proveedor para calcularla por su plazo.')

  return {
    automatico,
    texto: manual ? `Puesto a mano. ${base}` : base,
    titulo: manual
      ? `Escrito a mano. Lo automático sería ${automatico}.`
      : base,
    // Sin valor automático no hay adónde volver (op con factura sin proveedor todavía).
    puedeVolver: manual && Boolean(automatico),
    accion: modoRapido ? 'usar la fecha de pago' : 'recalcular por plazo',
  }
}

// El cashflow después de mover un campo. `autoAnterior` es el que correspondía ANTES del
// cambio (con el que se decide si lo de ahora es manual) y `autoNuevo` el que corresponde
// después. Nunca devuelve '' pisando un valor que había: preferir el dato viejo antes que
// vaciarle el campo a alguien.
export function siguienteCashflow({ actual, autoAnterior, autoNuevo } = {}) {
  if (esCashflowManual(actual, autoAnterior)) return soloFecha(actual)
  return soloFecha(autoNuevo) || soloFecha(actual)
}
