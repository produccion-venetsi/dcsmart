import { useState, useEffect, useMemo } from 'react'
import { cajasApi } from '../../api/cajas.js'
import { detallesApi } from '../../api/detalles.js'
import CuadreVivo from '../../components/CuadreVivo.jsx'
import { calcularCuadre } from '../../lib/cuadreCaja.js'
import { enterEjecuta } from '../../lib/formularios.js'
import { useUiStore } from '../../store/uiStore.js'
import { toUtcIsoFromDateTimeLocal } from '../../lib/dates.js'
import { TIPOS_TURNO } from '../../lib/tiposTurno.js'
import { conTipoElegido } from '../../lib/detalleForm.js'
import { clasificacionLabel } from '../../lib/clasificaciones.js'
import ClasificacionSelect from '../../components/ClasificacionSelect.jsx'
import TipoDetalleCombo from '../../components/TipoDetalleCombo.jsx'
import AdjuntoUpload from '../../components/AdjuntoUpload.jsx'
import PistaTurno, { PistaPromedio } from '../../components/PistaTurno.jsx'
import CampoClienteCuenta from '../../components/CampoClienteCuenta.jsx'
import { nombreCliente } from '../../lib/clientes.js'
import { AYUDA_EFECTIVO } from '../../lib/camposCaja.js'
import { claveLocal } from '../../lib/claveLocal.js'

// Alta de caja: el turno y sus detalles (cobro / gasto / informativo).
//
// Vivia dentro de CajaList.jsx, que ya tenia 2000 lineas. Se saco a su propio
// archivo porque hay DOS pantallas que dan de alta una caja: el listado (en un
// drawer) y /cajas/nueva (pantalla completa, para el perfil data_entry, que no
// puede entrar al listado porque no tiene `view` en el modulo).
//
// La alternativa era revivir el viejo CajaForm.jsx, que estaba huerfano y
// atrasado -- sin tipo_turno, sin detalles y sin movimientos. Habrian quedado dos
// formularios de alta divergiendo, que es exactamente el bug que cuadreCaja.js
// vino a cerrar.
//
// Estado inicial del formulario. Se vino con el componente: el listado ya no lo usa.
const EMPTY_CAJA = {
  nro_turno: '', tipo_turno: '', fecha_inicio: '', fecha_cierre: '', cajero: '', total: '',
  efectivo: '', fiscal: '', comensales: '', tickets: '', observaciones: '', foto_url: ''
}

// Formateo de montos para los totales que muestra el panel mientras se carga.
// Se definen aca igual que en el listado: son de una linea, y en este proyecto cada
// pantalla define sus propios helpers de display.
function fmt$2(n) { return n != null ? `$${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '—' }

// Los iconos se definen aca y no se importan: en este proyecto cada pantalla
// define los suyos, y son dos SVG de ocho lineas que no cambian.
function IcoPlus() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  )
}
function IcoTrash() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m5 0V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2"/>
    </svg>
  )
}

export default function CajaCreatePanel({ activeLocal, locales, onCreated, onClose, onCuadre }) {
  const notify = useUiStore((s) => s.notify)
  const [form,      setForm]    = useState(EMPTY_CAJA)
  const [localId,   setLocalId] = useState(activeLocal?.id || '')
  const [saving,    setSaving]  = useState(false)
  const [fotoFile,      setFotoFile]      = useState(null)
  const [uploadingFoto, setUploadingFoto] = useState(false)

  const [tipos, setTipos] = useState([])

  const [pendingDetalles, setPendingDetalles] = useState([])
  // Mismos campos que el alta de detalle del drawer: acá faltaban `clasificacion`
  // y `nombre`, así que al crear una caja no se podía cargar "Mostrador -
  // informativo" ni un nombre que no estuviera en el catálogo del local.
  // `id_cliente`/`cliente` desde el ALTA: una venta fiada se anota cuando se
  // carga la caja, no despues. Sin esto habia que guardar, entrar a editar y
  // recien ahi aparecia el campo (reportado por el usuario 2026-08-20).
  const [detForm, setDetForm] = useState({ clasificacion: 'cobro', id_tipo: '', nombre: '', monto: '', cantidad: '', observaciones: '', id_cliente: '', cliente: null })


  // ── Cuadre en vivo ─────────────────────────────────────────────────────────
  //
  // Se recalcula con cada tecla del total y del efectivo y con cada detalle
  // que se agrega, igual que en la edicion. El panel lo pinta pegado arriba
  // (components/CuadreVivo.jsx) para que no se lo coma el scroll.
  //
  // Una traduccion: los detalles pendientes guardan la clasificacion en
  // `clasificacion` y el calculo la lee de `tipo` (como se llama la columna).
  //
  // `origin: 'DCSMART'` porque una caja que se crea desde la app es de la app; las de
  // TapTap entran por el sync y no pasan por esta pantalla.
  const cuadreVivo = useMemo(() => calcularCuadre({
    origin: 'DCSMART',
    total: form.total,
    efectivo: form.efectivo,
    detalles: pendingDetalles.map((d) => ({ tipo: d.clasificacion, monto: d.monto })),
  }), [form.total, form.efectivo, pendingDetalles])

  // El padre (la pantalla completa B+C) pinta el panel de cuadre en su propia
  // columna: se le publica el calculo en vez de duplicarlo.
  useEffect(() => { onCuadre?.(cuadreVivo) }, [cuadreVivo, onCuadre])

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const targetLocalId = activeLocal?.id || localId

  // El catálogo se pide con o sin local. GET /caja-detalles/tipos ya devuelve los
  // tipos del grupo (id_local null) y le SUMA los del local cuando se le pasa uno,
  // así que cortar la llamada por no tener local dejaba el combo vacío teniendo 25
  // tipos disponibles. En LOS GALGOS los 25 son del grupo: sin local igual salen.
  useEffect(() => {
    detallesApi.tipos(targetLocalId)
      .then(r => setTipos(r.data || []))
      .catch(() => notify('No se pudieron cargar los nombres de detalle', 'error'))
  }, [targetLocalId, notify])


  const addPendingDetalle = () => {
    if (!detForm.monto) return
    setPendingDetalles(prev => [...prev, { ...detForm, _key: claveLocal() }])
    setDetForm({ clasificacion: 'cobro', id_tipo: '', nombre: '', monto: '', cantidad: '', observaciones: '', id_cliente: '', cliente: null })
  }
  const removePendingDetalle = (key) => setPendingDetalles(prev => prev.filter(d => d._key !== key))


  const handleCreate = async (e) => {
    e.preventDefault()
    if (!targetLocalId) { notify('Seleccioná un local', 'error'); return }
    setSaving(true)
    try {
      let foto_url = form.foto_url
      if (fotoFile) {
        setUploadingFoto(true)
        const fd = new FormData()
        fd.append('file', fotoFile)
        const r = await cajasApi.upload(fd, targetLocalId)
        foto_url = r.data.url
        setUploadingFoto(false)
      }
      const res = await cajasApi.create({
        ...form,
        fecha_inicio: toUtcIsoFromDateTimeLocal(form.fecha_inicio),
        fecha_cierre: toUtcIsoFromDateTimeLocal(form.fecha_cierre),
        foto_url, id_local: targetLocalId,
      })
      const nuevoId = res.data?.id

      // Los detalles van de a uno. Cuando alguno falla se guarda POR QUÉ y de
      // cuál: el mensaje viejo decía "3/5 guardados" y hablaba de movimientos
      // que ya no existen, así que el que cargaba no sabía qué revisar.
      const fallidos = []
      for (const d of pendingDetalles) {
        const etiqueta = tipos.find(t => t.id === d.id_tipo)?.nombre || d.nombre || `$${d.monto}`
        try {
          await detallesApi.create({
            id_caja: nuevoId,
            id_tipo: d.id_tipo || null,
            // Sin esto el detalle quedaba sin clasificación propia y heredaba la
            // del tipo del catálogo; sin tipo, cuadreCaja lo asumía cobro.
            clasificacion: d.clasificacion || null,
            nombre: d.id_tipo ? null : (d.nombre || null),
            monto: parseFloat(d.monto),
            observaciones: d.observaciones || null,
            cantidad: d.cantidad ? parseInt(d.cantidad) : null,
            id_cliente: d.id_cliente || null,
          })
        } catch (err) {
          fallidos.push(`${etiqueta}: ${err.response?.data?.error || 'no se pudo guardar'}`)
        }
      }

      if (fallidos.length === 0) {
        notify('Caja creada', 'success')
      } else {
        notify(
          `La caja se creó, pero ${fallidos.length === 1 ? 'una línea no entró' : `${fallidos.length} líneas no entraron`}: ` +
          `${fallidos.join(' · ')}. Agregalas desde Editar.`,
          'error'
        )
      }
      onCreated(nuevoId)
    } catch (err) {
      notify(err.response?.data?.error || 'Error al crear', 'error')
      setUploadingFoto(false)
    } finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleCreate}>
      {/* Pegado al tope del drawer: se ve mientras se carga todo lo de abajo. */}
      {!onCuadre && <CuadreVivo cuadre={cuadreVivo} origin="DCSMART" />}

      <div className="drawer-section-title">1 · Lo que vendiste</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
        {!activeLocal && (
          <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
            <label className="form-label">Local *</label>
            <div className="form-input-wrap">
              <select required value={localId} onChange={e => setLocalId(e.target.value)}>
                <option value="">Seleccioná un local…</option>
                {locales.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
              </select>
            </div>
          </div>
        )}
        {/* Las dos fechas ocupan la fila entera y comparten una sola pista
            debajo: la duración y el cruce de día son una propiedad del PAR,
            no de cada campo suelto. */}
        <div style={{ gridColumn: '1 / -1' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Abrió el turno *</label>
              <div className="form-input-wrap">
                <input type="datetime-local" required value={form.fecha_inicio} onChange={e => setF('fecha_inicio', e.target.value)} />
              </div>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Cerró el turno</label>
              <div className="form-input-wrap">
                <input type="datetime-local" value={form.fecha_cierre} onChange={e => setF('fecha_cierre', e.target.value)} />
              </div>
            </div>
          </div>
          <PistaTurno inicio={form.fecha_inicio} cierre={form.fecha_cierre} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Nro Turno</label>
          <div className="form-input-wrap">
            <input type="number" min="1" step="1" placeholder="1" value={form.nro_turno} onChange={e => setF('nro_turno', e.target.value)} />
          </div>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Tipo de Turno</label>
          <div className="form-input-wrap">
            <select value={form.tipo_turno} onChange={e => setF('tipo_turno', e.target.value)}>
              <option value="">Sin especificar</option>
              {TIPOS_TURNO.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Cajero</label>
          <div className="form-input-wrap">
            <input placeholder="Nombre del cajero" value={form.cajero} onChange={e => setF('cajero', e.target.value)} />
          </div>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Total</label>
          <div className="form-input-wrap">
            <input type="number" step="0.01" placeholder="0.00" value={form.total} onChange={e => setF('total', e.target.value)} />
          </div>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Efectivo</label>
          <div className="form-input-wrap">
            <input type="number" step="0.01" placeholder="0.00" value={form.efectivo} onChange={e => setF('efectivo', e.target.value)} />
          </div>
          {/* No es un dato informativo: el arqueo del local lo suma como el efectivo
              del periodo. El texto vive en lib/camposCaja.js porque el mismo campo se
              carga en el alta y en la edicion. */}
          <p className="form-hint" style={{ margin: '4px 0 0' }}>Solo billetes: tarjetas y apps van abajo como cobros. {AYUDA_EFECTIVO}</p>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Fiscal</label>
          <div className="form-input-wrap">
            <input type="number" step="0.01" placeholder="0.00" value={form.fiscal} onChange={e => setF('fiscal', e.target.value)} />
          </div>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Comensales</label>
          <div className="form-input-wrap">
            <input type="number" placeholder="0" value={form.comensales} onChange={e => setF('comensales', e.target.value)} />
          </div>
          <PistaPromedio total={form.total} comensales={form.comensales} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Tickets</label>
          <div className="form-input-wrap">
            <input type="number" placeholder="0" value={form.tickets} onChange={e => setF('tickets', e.target.value)} />
          </div>
        </div>
        <AdjuntoUpload
          label="Foto"
          accept="image/*"
          value={form.foto_url}
          file={fotoFile}
          onFileSelected={setFotoFile}
          onRemove={() => { setF('foto_url', ''); setFotoFile(null) }}
          uploading={uploadingFoto}
        />
        <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
          <label className="form-label">Observaciones</label>
          <div className="form-input-wrap form-textarea-wrap">
            <textarea rows={2} value={form.observaciones} onChange={e => setF('observaciones', e.target.value)} placeholder="Notas opcionales..." />
          </div>
        </div>
      </div>
      <div className="drawer-section-title" style={{ marginTop: '1.5rem' }}>2 · Cómo te lo pagaron (cobros), gastos y demás</div>
      <p className="form-hint" style={{ margin: '0 0 0.6rem' }}>
        Una línea por cada cosa: elegí la clasificación (cobro, gasto o informativo) y el monto. La suma de efectivo + cobros tiene que dar el total.
      </p>
      {pendingDetalles.length > 0 && (
        <div className="table-wrap" style={{ marginBottom: '0.75rem' }}>
          <table className="data-table">
            <thead><tr><th>Clasificación</th><th>Nombre</th><th>Cuenta</th><th title="Cantidad de operaciones">Cant.</th><th>Monto</th><th></th></tr></thead>
            <tbody>
              {pendingDetalles.map(d => (
                <tr key={d._key}>
                  <td className="td-muted">{clasificacionLabel(d.clasificacion)}</td>
                  <td>{tipos.find(t => t.id === d.id_tipo)?.nombre || d.nombre || '—'}</td>
                  {/* A qué cuenta corriente se carga: se ve antes de guardar,
                      igual que en la edición. */}
                  <td className="td-muted">{d.cliente ? nombreCliente(d.cliente) : '—'}</td>
                  <td className="td-number td-muted">{d.cantidad || '—'}</td>
                  <td className="td-number">{fmt$2(d.monto)}</td>
                  <td>
                    <button type="button" className="btn btn-sm btn-danger btn-icon" onClick={() => removePendingDetalle(d._key)}>
                      <IcoTrash />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div onKeyDown={enterEjecuta(addPendingDetalle)} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Clasificación *</label>
          <ClasificacionSelect
            ayuda
            value={detForm.clasificacion}
            onChange={(clasificacion) => setDetForm(f => ({ ...f, clasificacion }))}
          />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Nombre</label>
          <TipoDetalleCombo
            tipos={tipos}
            idTipo={detForm.id_tipo}
            nombre={detForm.nombre}
            onChange={(id_tipo, nombre) => setDetForm(f => conTipoElegido(f, tipos, id_tipo, nombre))}
          />
        </div>
        <CampoClienteCuenta
          clasificacion={detForm.clasificacion}
          idCliente={detForm.id_cliente}
          clienteSel={detForm.cliente}
          onSelect={(c) => setDetForm(f => ({ ...f, id_cliente: c.id, cliente: c }))}
          onClear={() => setDetForm(f => ({ ...f, id_cliente: '', cliente: null }))}
        />
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Monto</label>
          <div className="form-input-wrap">
            <input type="number" step="0.01" min="0" placeholder="0.00" value={detForm.monto} onChange={e => setDetForm(f => ({ ...f, monto: e.target.value }))} />
          </div>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Cant.</label>
          <div className="form-input-wrap">
            <input type="number" min="1" step="1" placeholder="Opcional" value={detForm.cantidad} onChange={e => setDetForm(f => ({ ...f, cantidad: e.target.value }))} />
          </div>
        </div>
        <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
          <label className="form-label">Observaciones</label>
          <div className="form-input-wrap">
            <input type="text" placeholder="Opcional" value={detForm.observaciones} onChange={e => setDetForm(f => ({ ...f, observaciones: e.target.value }))} />
          </div>
        </div>
      </div>
      <div style={{ marginTop: '0.75rem', marginBottom: '1.25rem' }}>
        <button type="button" className="btn btn-secondary" onClick={addPendingDetalle} disabled={!detForm.monto}>
          <IcoPlus /> Agregar
        </button>
      </div>

      {/* La seccion de Movimientos se elimino: en el modelo simple todo se
          carga como detalle de tres tipos (cobro / gasto / informativo). El
          fondo inicial, un retiro o un vaciado se anotan como informativos. */}
      <div className="form-actions" style={{ marginTop: '1.5rem' }}>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Guardando...</> : 'Crear Caja'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
      </div>
    </form>
  )
}
