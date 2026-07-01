import client from './client.js'

export const pagosApi = {
  list:       (params, signal) => client.get('/pagos',                     { params, signal }),
  get:        (id,    signal)  => client.get(`/pagos/${id}`,               { signal }),
  stats:      (params, signal) => client.get('/pagos/stats',               { params, signal }),
  chart:      (params, signal) => client.get('/pagos/chart',               { params, signal }),
  create:     (data)           => client.post('/pagos',                     data),
  update:     (id, data)       => client.put(`/pagos/${id}`,                data),
  remove:     (id)             => client.delete(`/pagos/${id}`),
  audit:      (id)             => client.patch(`/pagos/${id}/audit`),
  periodico:  (id)             => client.patch(`/pagos/${id}/periodico`),
  mandarPdp:  (ids)            => client.post('/pagos/mandar-pdp',          { ids }),
  revertirPdp:(ids)            => client.post('/pagos/revertir-pdp',        { ids }),
  pagar:      (ids, data)      => client.post('/pagos/pagar',               { ids, ...data }),
  upload:     (formData, idLocal) => client.post(`/pagos/upload${idLocal ? `?id_local=${idLocal}` : ''}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  listMM:     (id)             => client.get(`/pagos/${id}/multimoneda`),
  createMM:   (id, data)       => client.post(`/pagos/${id}/multimoneda`,   data),
  updateMM:   (id, mmId, data) => client.put(`/pagos/${id}/multimoneda/${mmId}`, data),
  deleteMM:   (id, mmId)       => client.delete(`/pagos/${id}/multimoneda/${mmId}`),
}
