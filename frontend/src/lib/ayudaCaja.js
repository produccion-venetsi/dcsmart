// Los textos de ayuda de la caja, en un solo lugar.
//
// Están acá y no sueltos en el JSX por dos motivos: para que la misma
// explicación sirva al tip del campo y al centro de ayuda sin que se
// desincronicen, y para poder revisarlos como se revisa una redacción -- son
// lo que la persona lee cuando no entiende, así que valen tanto como el código.
//
// REGLAS DE REDACCIÓN
//  - Lenguaje de cajero, no de contador: "la plata que queda en el cajón", no
//    "saldo de disponibilidades".
//  - Cada ayuda dice QUÉ va en el campo y, cuando se presta a confusión, QUÉ NO.
//  - Sin condicionales ni "debería": la persona necesita una regla.

export const AYUDA_CAMPOS = {
  total: {
    titulo: 'Total del turno',
    que: 'Todo lo que vendiste en el turno, sin importar cómo te lo pagaron: efectivo, tarjetas, apps, transferencias y lo que quedó fiado.',
    ojo: 'Es la venta completa, no lo que quedó en el cajón.',
  },
  efectivo: {
    titulo: 'Efectivo',
    que: 'La plata en billetes que queda en el cajón al cerrar, después de pagar los gastos que hayas pagado con esa misma plata.',
    ojo: 'No incluye lo cobrado con tarjeta, QR ni apps: eso va en los cobros.',
    // Se nombra el arqueo porque es lo que sorprende: que el número afecte al
    // cuadre de su propia caja es esperable; que se arrastre al arqueo del
    // local, no. Antes vivía suelto en lib/camposCaja.js.
    ademas: 'Este número también entra en el arqueo del local: se suma como el efectivo que ingresó en el período.',
  },
  fiscal: {
    titulo: 'Fiscal',
    que: 'La parte de la venta que facturaste.',
    ojo: 'No entra en el cuadre: es un dato aparte, para control. Si no facturás desde acá, dejalo vacío.',
  },
  comensales: {
    titulo: 'Comensales',
    que: 'Cuánta gente comió en el turno. Sirve para saber cuánto gasta cada uno.',
  },
  tickets: {
    titulo: 'Tickets',
    que: 'Cuántas ventas cerraste en el turno.',
  },
  cobro: {
    titulo: 'Cobros',
    que: 'Cada forma de pago que no fue efectivo: tarjetas, Mercado Pago, PedidosYa, Rappi, transferencias.',
    ojo: 'Cargá uno por método. La suma de todos, más el efectivo, tiene que dar el total del turno.',
  },
  fiado: {
    titulo: 'A cobrar / Cuenta corriente',
    que: 'Lo que se llevaron sin pagar: fiado, cuenta corriente o una mesa que quedó abierta.',
    ojo: 'Es venta igual, por eso cuenta en el cuadre. Cuando te lo paguen, se registra aparte.',
  },
  gasto: {
    titulo: 'Gastos',
    que: 'Plata que saliste a pagar desde la caja durante el turno: un flete, una compra de último momento.',
    ojo: 'No reduce lo que vendiste, reduce lo que queda en el cajón.',
  },
  movimiento: {
    titulo: 'Movimientos de la caja',
    que: 'Lo que entra y sale del cajón sin ser una venta: el fondo con el que abrís, los retiros y los vaciados a la caja fuerte.',
    ojo: 'No cambian el total vendido. Sirven para saber cuánta plata tiene que haber en el cajón.',
  },
  descuadre: {
    titulo: 'Diferencia de caja',
    que: 'La cuenta es simple: todo lo que vendiste tiene que estar explicado por alguna forma de cobro. Efectivo + otros cobros + lo que quedó a cobrar = total del turno.',
    ojo: 'Si no da, falta cargar algo (casi siempre un cobro) o el total está mal.',
  },
}

// Los tres bloques en los que se lee una caja. El orden es el del turno real:
// primero cuánto vendiste, después cómo te lo pagaron, y al final qué pasó con
// la plata del cajón.
export const BLOQUES_CAJA = [
  {
    id: 'venta',
    titulo: 'Lo que vendiste',
    ayuda: 'El total del turno y su desglose. Es la referencia contra la que se compara todo lo demás.',
  },
  {
    id: 'cobros',
    titulo: 'Cómo te lo pagaron',
    ayuda: 'Todas las formas de pago, incluida la plata que quedó a cobrar. Esto tiene que sumar el total.',
  },
  {
    id: 'efectivo',
    titulo: 'Qué pasó con la plata',
    ayuda: 'El circuito del efectivo del cajón: con cuánto abriste, qué gastaste, qué retiraste. No cambia la venta.',
  },
]

export function ayudaDe(campo) {
  return AYUDA_CAMPOS[campo] ?? null
}

// Compatibilidad: el texto del efectivo vivía suelto en lib/camposCaja.js y lo
// usan el alta y la edición de caja.
export const AYUDA_EFECTIVO = AYUDA_CAMPOS.efectivo.ademas

// El texto corto que va debajo del campo. Es el que más se lee, así que suma
// el "ojo" solo cuando aporta: repetir todo hace que no se lea ninguno.
export function tipCorto(campo) {
  const a = ayudaDe(campo)
  if (!a) return ''
  return a.ojo ? `${a.que} ${a.ojo}` : a.que
}
