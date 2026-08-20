// Las disponibilidades de un arqueo: la plata del local que NO está en el
// cajón.
//
// Antes era un combo con TODO el catálogo de cajas más un botón "Agregar": el
// que contaba la plata tenía que acordarse de qué cuentas tiene su local, y
// elegir mal era fácil —en producción hay arqueos con "Salón" y "Rappi"
// cargados como si fueran disponibilidades—. Peor: olvidarse una cuenta entera
// no dejaba ninguna marca, simplemente no aparecía.
//
// Ahora la lista es fija: la que el local tiene activa (se define en Locales).
// Se ven todos los renglones desde el principio, se completa el que
// corresponde, y los que quedan vacíos se cuentan y se avisan.

import { useEffect, useState } from 'react'
import { disponibilidadesApi } from '../api/disponibilidades.js'
import { agruparDisponibilidades, totalDisponibilidades } from '../lib/disponibilidades.js'

const fmt$ = (n) => (Number(n) || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 })

// `valores` es { [id_tipo]: monto } y `onChange` recibe el objeto entero.
//
// `heredadas` son las líneas de un arqueo viejo que apuntan al catálogo
// anterior: se muestran para que el que edita vea el arqueo completo, pero no
// se editan — el concepto ya no existe en la lista del local. Se guardan tal
// cual estaban (ver `detallesDesdeValores`).
export default function DisponibilidadesInput({ idLocal, valores, onChange, disabled, heredadas = [] }) {
  const [tipos, setTipos] = useState(null) // null = cargando
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!idLocal) return
    const ctrl = new AbortController()
    setTipos(null); setError(false)
    disponibilidadesApi.delLocal(idLocal, ctrl.signal)
      .then(({ data }) => setTipos(data.disponibilidades || []))
      .catch(() => { if (!ctrl.signal.aborted) { setError(true); setTipos([]) } })
    return () => ctrl.abort()
  }, [idLocal])

  if (tipos === null) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem' }}><span className="spinner" /></div>
  }

  if (error) {
    return <div style={{ fontSize: 13, color: 'var(--red)' }}>No se pudieron cargar las disponibilidades del local. Recargá la página.</div>
  }

  // Sin lista configurada no se inventa un combo: se dice qué falta y dónde se
  // arregla. El arqueo se puede guardar igual — el efectivo es lo obligatorio.
  if (!tipos.length && !heredadas.length) {
    return (
      <div style={{ fontSize: 13, color: 'var(--t3)', lineHeight: 1.5 }}>
        Este local no tiene disponibilidades configuradas (Mercado Pago, dólares, cuentas de banco).
        Se activan en <strong>Locales → el local → Disponibilidades</strong>. El arqueo se puede guardar sin ellas.
      </div>
    )
  }

  const lineas = [...tipos.map((t) => ({ monto: valores[t.id] ?? '' })), ...heredadas]
  const { total, sinCargar } = totalDisponibilidades(lineas)
  const grupos = agruparDisponibilidades(tipos)

  return (
    <>
      {grupos.map((g) => (
        <div key={g.familia} style={{ marginBottom: '0.75rem' }}>
          {/* El nombre de la familia solo cuando hay más de una: con un solo
              grupo el título repite lo que ya dicen los renglones. */}
          {grupos.length > 1 && (
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--t3)', margin: '0 0 4px' }}>
              {g.nombre}
            </div>
          )}
          {g.tipos.map((t) => (
            <div key={t.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '3px 0' }}>
              <label htmlFor={`disp-${t.id}`} style={{ flex: 1, minWidth: 0, fontSize: 13 }}>{t.nombre}</label>
              <div className="form-input-wrap" style={{ width: 130, flexShrink: 0 }}>
                <input
                  id={`disp-${t.id}`}
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="—"
                  disabled={disabled}
                  value={valores[t.id] ?? ''}
                  onChange={(e) => onChange({ ...valores, [t.id]: e.target.value })}
                />
              </div>
            </div>
          ))}
        </div>
      ))}

      {/* Las del catálogo viejo: se ven pero no se tocan, y se guardan igual.
          Editar la fecha de un arqueo de 2025 no tiene por qué borrarle lo que
          se contó ese día. */}
      {heredadas.length > 0 && (
        <div style={{ marginBottom: '0.75rem' }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--t3)', margin: '0 0 4px' }}>
            Cargadas antes (no se editan)
          </div>
          {heredadas.map((h, i) => (
            <div key={h.id || i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '3px 0', fontSize: 13, color: 'var(--t3)' }}>
              <span>{h.nombre}</span>
              <span>{fmt$(h.monto)}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4 }}>
        <span style={{ fontSize: 12, color: 'var(--t3)' }}>
          {/* Lo que falta se dice acá y no se da por cero: un renglón vacío
              puede ser "esta cuenta hoy está en cero" o "me la olvidé", y el
              total no distingue. */}
          {sinCargar
            ? `Faltan ${sinCargar} de ${lineas.length} — poné 0 si esa cuenta está vacía`
            : `${lineas.length} de ${lineas.length} cargadas`}
        </span>
        <strong style={{ fontSize: 15 }}>{fmt$(total)}</strong>
      </div>
    </>
  )
}

// Del estado del formulario al body de la API. Solo van los renglones con un
// número —los vacíos no se guardan como cero— y detrás las heredadas tal cual
// vinieron: el PUT reemplaza la lista entera, así que lo que no se manda se
// borra.
export function detallesDesdeValores(valores, heredadas = []) {
  return [
    ...Object.entries(valores || {})
      .filter(([, v]) => v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v)))
      .map(([id_disponibilidad, v]) => ({ id_disponibilidad, monto: Number(v) })),
    ...heredadas.map((h) => ({ id_tipo: h.id_tipo || null, nombre: h.nombre, monto: Number(h.monto) || 0 })),
  ]
}

// Y la vuelta, para editar un arqueo ya cargado. Las líneas del catálogo viejo
// salen aparte: no tienen renglón donde escribirse, pero tampoco se descartan.
export function valoresDesdeDetalles(detalles) {
  const valores = {}
  const heredadas = []
  for (const d of detalles || []) {
    if (d.id_disponibilidad) valores[d.id_disponibilidad] = String(d.monto)
    else heredadas.push({
      id: d.id,
      id_tipo: d.id_tipo || null,
      nombre: d.disponibilidad?.nombre || d.detalle_tipo?.nombre || d.nombre || 'Sin concepto',
      monto: d.monto,
    })
  }
  return { valores, heredadas }
}
