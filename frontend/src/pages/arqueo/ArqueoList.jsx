import { useEffect, useState } from 'react'
import { arqueoApi } from '../../api/arqueo.js'
import { useAppStore } from '../../store/appStore.js'
import { useUiStore } from '../../store/uiStore.js'
import DrawerPanel from '../../components/DrawerPanel.jsx'

/* ── helpers ── */
function fmt$(n) {
  return n != null
    ? `$${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
    : '—'
}
function fmtDateTime(d) {
  return d ? new Date(d).toLocaleString('es-AR', { hour12: false }) : '—'
}

function IcoPlus() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

/* ── página ── */
export default function ArqueoList() {
  const activeLocal = useAppStore((s) => s.activeLocal)
  const notify      = useUiStore((s) => s.notify)

  const [arqueos, setArqueos] = useState([])
  const [loading, setLoading] = useState(true)
  const [panelOpen,  setPanelOpen]  = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedId, setSelectedId] = useState(null)

  const load = () => {
    if (!activeLocal?.id) { setArqueos([]); setLoading(false); return }
    setLoading(true)
    arqueoApi.list(activeLocal.id)
      .then(({ data }) => setArqueos(data.data))
      .catch(() => notify('Error al cargar el historial de arqueos', 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [activeLocal?.id])

  const openDetail = (id) => { setSelectedId(id); setDetailOpen(true) }

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <h1 className="page-title">Arqueo</h1>
          <p className="page-sub">
            {activeLocal ? activeLocal.nombre : 'Seleccioná un local'}
          </p>
        </div>
        <div className="page-head-right">
          <button
            className="btn btn-primary"
            onClick={() => setPanelOpen(true)}
            disabled={!activeLocal}
          >
            <IcoPlus /> Nuevo arqueo
          </button>
        </div>
      </div>

      {!activeLocal ? (
        <div className="pdp-empty">Seleccioná un local para ver su historial de arqueos.</div>
      ) : loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><span className="spinner" /></div>
      ) : arqueos.length === 0 ? (
        <div className="pdp-empty">Todavía no se cargó ningún arqueo para este local.</div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Fecha</th><th>Caja fuerte</th><th>Cofre</th><th>Adición</th>
                <th>Total</th><th>Comprobación</th><th></th>
              </tr>
            </thead>
            <tbody>
              {arqueos.map((a) => {
                const cuadra = Math.abs(Number(a.comprobacion)) < 0.01
                return (
                  <tr key={a.id}>
                    <td>{fmtDateTime(a.fecha)}</td>
                    <td className="td-number">{fmt$(a.caja_fuerte)}</td>
                    <td className="td-number">{fmt$(a.cofre)}</td>
                    <td className="td-number">{fmt$(a.adicion)}</td>
                    <td className="td-number">{fmt$(a.total)}</td>
                    <td>
                      <span className={`badge ${cuadra ? 'badge-green' : 'badge-red'}`}>
                        {fmt$(a.comprobacion)}
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-sm btn-secondary" onClick={() => openDetail(a.id)}>
                        Ver detalle
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <DrawerPanel open={panelOpen} onClose={() => setPanelOpen(false)} title="Nuevo arqueo" width={560}>
        {panelOpen && activeLocal && (
          <div>Formulario pendiente (Task 4)</div>
        )}
      </DrawerPanel>

      <DrawerPanel open={detailOpen} onClose={() => setDetailOpen(false)} title="Detalle de arqueo" width={560}>
        {detailOpen && selectedId && (
          <div>Detalle pendiente (Task 4)</div>
        )}
      </DrawerPanel>
    </div>
  )
}
