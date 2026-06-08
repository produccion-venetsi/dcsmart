import client from './client.js'

export const rolesApi = {
  list:    () => client.get('/roles'),
  modules: () => client.get('/roles/modules')
}
