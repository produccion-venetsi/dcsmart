// El filtro que arma el selector de grupo/local. Vive del lado del backend porque
// acá está el corredor de tests del proyecto; la función es la del frontend
// (frontend/src/lib/cajaMayor.js) y se importa por ruta relativa.
//
// Lo que importa: cuando hay grupo Y local elegidos, al backend va SOLO el local.
// Mandar los dos lo obligaría a resolver una precedencia que acá ya está decidida,
// y un local de otro grupo daría cero resultados sin explicación.

import test from 'node:test'
import assert from 'node:assert/strict'
import { filtroDeSeleccion } from '../../../frontend/src/lib/cajaMayor.js'

test('sin nada elegido no se manda filtro: se ven todos los grupos', () => {
  assert.deepEqual(filtroDeSeleccion({ idApp: '', idLocal: '' }), {})
  assert.deepEqual(filtroDeSeleccion({}), {})
})

test('solo grupo: filtra por grupo entero', () => {
  assert.deepEqual(filtroDeSeleccion({ idApp: 'A1', idLocal: '' }), { id_app: 'A1' })
})

test('grupo y local: manda solo el local, que es el corte mas especifico', () => {
  assert.deepEqual(filtroDeSeleccion({ idApp: 'A1', idLocal: 'L9' }), { id_local: 'L9' })
})

test('local sin grupo tambien vale: es lo que pasa al bajar desde la tabla de saldos', () => {
  assert.deepEqual(filtroDeSeleccion({ idApp: '', idLocal: 'L9' }), { id_local: 'L9' })
})
