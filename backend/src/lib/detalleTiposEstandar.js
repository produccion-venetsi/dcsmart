// Catálogo estándar de DetalleTipo que se le da a toda app nueva, para que el
// dropdown de "tipo" en Caja/Arqueo no aparezca vacío (pasó con TESTING y con
// LORETO: una app sin ningún DetalleTipo cargado no tiene ni "Mercado Pago").
//
// Los nombres son los más repetidos entre las apps existentes (delivery,
// salón, mostrador, barra, online, etc.) y los medios de pago que se cargan
// como detalle (MP QR, transferencia, tarjetas). Clasificación ya en su forma
// vigente (ver lib/clasificaciones.js) para no seguir sembrando valores legacy.
export const CATALOGO_ESTANDAR_DETALLE_TIPOS = [
  { nombre: 'Salón',             clasificacion: 'informativo' },
  { nombre: 'Mostrador',         clasificacion: 'informativo' },
  { nombre: 'Barra',             clasificacion: 'informativo' },
  { nombre: 'Delivery',          clasificacion: 'informativo' },
  { nombre: 'Takeaway',          clasificacion: 'informativo' },
  { nombre: 'Online',            clasificacion: 'informativo' },
  { nombre: 'Web',               clasificacion: 'informativo' },
  { nombre: 'Cta Cte',           clasificacion: 'informativo' },
  { nombre: 'MP QR',             clasificacion: 'cobro' },
  { nombre: 'MP Link',           clasificacion: 'cobro' },
  { nombre: 'MP Point Débito',   clasificacion: 'cobro' },
  { nombre: 'MP Point Crédito',  clasificacion: 'cobro' },
  { nombre: 'Transferencia',     clasificacion: 'cobro' },
  { nombre: 'Tarjeta de Débito', clasificacion: 'cobro' },
  { nombre: 'Tarjeta de Crédito', clasificacion: 'cobro' },
  { nombre: 'LAPOS/PAYWAY',      clasificacion: 'cobro' }
]

// Idempotente: si un nombre ya existe para esa app (cargado a mano o de una
// corrida anterior), no lo toca -- podría estar editado.
export async function asegurarCatalogoEstandar(db, id_app) {
  for (const t of CATALOGO_ESTANDAR_DETALLE_TIPOS) {
    await db.detalleTipo.upsert({
      where: { nombre_id_app: { nombre: t.nombre, id_app } },
      create: { ...t, id_app, activo: true },
      update: {}
    })
  }
}
