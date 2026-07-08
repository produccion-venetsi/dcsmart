import { useState, useEffect } from 'react'
import client from '../api/client.js'

// Muestra la foto de una caja. Si `fotoUrl` es gs:// (subida por el backend
// a partir de esta tarea), la trae vía GET /cajas/:id/attachment (requiere
// auth, no se puede linkear directo). Si es una URL http(s) pegada a mano
// (dato legacy de antes de este cambio), se muestra directo sin pasar por
// el backend.
export default function CajaFotoViewer({ cajaId, fotoUrl, size = 180 }) {
  const [blobUrl, setBlobUrl] = useState(null)
  const [loading, setLoading] = useState(false)
  const isGs = fotoUrl?.startsWith('gs://')

  useEffect(() => {
    if (!isGs || !cajaId) return
    let cancelled = false
    setLoading(true)
    client.get(`/cajas/${cajaId}/attachment`, { responseType: 'blob' })
      .then((res) => { if (!cancelled) setBlobUrl(URL.createObjectURL(res.data)) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [cajaId, isGs])

  useEffect(() => () => { blobUrl && URL.revokeObjectURL(blobUrl) }, [blobUrl])

  if (!fotoUrl) return null

  const src = isGs ? blobUrl : fotoUrl
  if (isGs && loading && !blobUrl) {
    return <span className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
  }
  if (!src) return null

  return (
    <a href={src} target="_blank" rel="noreferrer">
      <img
        src={src}
        alt="Foto caja"
        style={{ width: size, height: size, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--border-hi)', display: 'block' }}
      />
    </a>
  )
}
