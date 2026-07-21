import client from './client.js'

export const activityLogApi = {
  list:     (params, signal) => client.get('/activity-log', { params, signal }),
  usuarios: (signal)         => client.get('/activity-log/usuarios', { signal }),
}
