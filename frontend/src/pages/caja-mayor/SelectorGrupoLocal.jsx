// Selector de grupo y local para Caja Mayor.
//
// El módulo se usa mirando 32 grupos con 61 locales. Un solo select con todos los
// locales agrupados obliga a recorrer una lista larga para llegar a cualquier cosa,
// así que se parte en dos pasos: primero el grupo, y el local aparece al lado solo
// cuando el grupo tiene más de uno. Los grupos de un solo local -- la mayoría -- no
// muestran un segundo control que no decide nada.

import { useMemo } from 'react'

// Un grupo de un solo local no necesita que se elija el local: el grupo YA es ese
// local. Se muestra su nombre como dato, no como control.
export default function SelectorGrupoLocal({ grupos, locales, idApp, idLocal, onChange }) {
  // Locales por grupo, para saber cuáles ofrecen elección.
  const porGrupo = useMemo(() => {
    const m = new Map()
    for (const l of locales) {
      if (!l.id_app) continue
      if (!m.has(l.id_app)) m.set(l.id_app, [])
      m.get(l.id_app).push(l)
    }
    for (const arr of m.values()) arr.sort((a, b) => a.nombre.localeCompare(b.nombre))
    return m
  }, [locales])

  const delGrupo = idApp ? (porGrupo.get(idApp) ?? []) : []
  const unico = delGrupo.length === 1 ? delGrupo[0] : null

  // Los grupos sin ningún local no se ofrecen: elegirlos no mostraría nada.
  const gruposConLocales = useMemo(
    () => grupos
      .filter(g => (porGrupo.get(g.id)?.length ?? 0) > 0)
      .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [grupos, porGrupo]
  )

  // Cambiar de grupo limpia el local: el que estaba elegido es de otro grupo.
  const elegirGrupo = (nuevo) => onChange({ idApp: nuevo, idLocal: '' })

  return (
    <>
      <div className="form-group" style={{ margin: 0 }}>
        <label className="form-label">Grupo</label>
        <select
          className="filter-select"
          value={idApp}
          onChange={e => elegirGrupo(e.target.value)}
          style={{ minWidth: 190 }}
        >
          <option value="">Todos los grupos</option>
          {gruposConLocales.map(g => {
            const n = porGrupo.get(g.id).length
            return (
              <option key={g.id} value={g.id}>
                {g.nombre}{n > 1 ? ` (${n})` : ''}
              </option>
            )
          })}
        </select>
      </div>

      {/* El local solo cuando hay algo que elegir. */}
      {delGrupo.length > 1 && (
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Local</label>
          <select
            className="filter-select"
            value={idLocal}
            onChange={e => onChange({ idApp, idLocal: e.target.value })}
            style={{ minWidth: 170 }}
          >
            <option value="">Todo el grupo</option>
            {delGrupo.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
          </select>
        </div>
      )}

      {/* Un solo local: se dice cuál es, sin un control que no decide nada. */}
      {unico && (
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Local</label>
          <div
            style={{
              fontSize: 13, color: 'var(--t2)', padding: '0.45rem 0',
              whiteSpace: 'nowrap',
            }}
            title="El grupo tiene un solo local"
          >
            {unico.nombre}
          </div>
        </div>
      )}
    </>
  )
}
