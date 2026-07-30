import client from './client.js'

export const authApi = {
  register: (data) => client.post('/auth/register', data),
  login: (email, password) => client.post('/auth/login', { email, password }),
  loginGoogle: (credential) => client.post('/auth/google', { credential }),
  analyticsTicket: () => client.post('/auth/analytics-ticket'),
  // id_local: el local activo, para que Costos abra en el mismo local
  costosTicket: (idLocal) => client.post('/auth/costos-ticket', idLocal ? { id_local: idLocal } : {}),
  me: () => client.get('/auth/me'),
  myApps: () => client.get('/auth/my-apps'),
  touchApp: (appId) => client.post(`/auth/my-apps/${appId}/touch`),
  logout: () => client.post('/auth/logout')
}
