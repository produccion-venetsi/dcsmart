import client from './client.js'

export const authApi = {
  register: (data) => client.post('/auth/register', data),
  login: (email, password) => client.post('/auth/login', { email, password }),
  loginGoogle: (credential) => client.post('/auth/google', { credential }),
  me: () => client.get('/auth/me'),
  logout: () => client.post('/auth/logout')
}
