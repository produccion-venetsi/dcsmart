import client from './client.js'

export const cajasApi = {
  list:         (params, signal) => client.get('/cajas',        { params, signal }),
  get:          (id,    signal)  => client.get(`/cajas/${id}`,  { signal }),
  stats:        (params, signal) => client.get('/cajas/stats',  { params, signal }),
  create:       (data)           => client.post('/cajas',        data),
  update:       (id, data)       => client.put(`/cajas/${id}`,   data),
  remove:       (id)             => client.delete(`/cajas/${id}`),
  audit:        (id, data)       => client.patch(`/cajas/${id}/audit`, data),
  auditHistory: (id)             => client.get(`/cajas/${id}/audit-history`),
  auditDc:      (id, data)       => client.patch(`/cajas/${id}/audit-dc`, data),
  upload:       (formData, idLocal) => client.post(`/cajas/upload${idLocal ? `?id_local=${idLocal}` : ''}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
}
