import client from './client.js'

export const authApi = {
  register: (data) => client.post('/auth/register', data),
  login: (email, password) => client.post('/auth/login', { email, password }),
  loginGoogle: (credential) => client.post('/auth/google', { credential }),
  me: () => client.get('/auth/me'),
  myApps: () => client.get('/auth/my-apps'),
  touchApp: (appId) => client.post(`/auth/my-apps/${appId}/touch`),
  logout: () => client.post('/auth/logout')
}
