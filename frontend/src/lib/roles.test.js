import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ROLES, ROLES_TODOS, esRolDc, puedeOperar, puedeEditar,
  puedeBorrarPagos, puedeBorrarCajas, puedeCrearCajas,
  esAlcanceGlobal, sinLocalesVeTodos, puedeExportar,
  puedeBorrarMovimientos, homeDeRol, HOME_POR_DEFECTO, ROLES_RESTRINGIDOS
} from './roles.js'

test('externo edita como admin', () => {
  assert.equal(puedeEditar(ROLES.EXTERNO), true)
  assert.equal(puedeOperar(ROLES.EXTERNO), true)
})

test('externo SI puede borrar pagos y cajas; admin no', () => {
  // Es la unica diferencia entre los dos roles.
  assert.equal(puedeBorrarPagos(ROLES.EXTERNO), true)
  assert.equal(puedeBorrarCajas(ROLES.EXTERNO), true)
  assert.equal(puedeBorrarPagos(ROLES.ADMIN), false)
  assert.equal(puedeBorrarCajas(ROLES.ADMIN), false)
})

test('externo NO es rol interno de DC', () => {
  // No ve el circuito DC ni el historial de actividad: es gente de afuera.
  assert.equal(esRolDc(ROLES.EXTERNO), false)
  assert.equal(esRolDc(ROLES.SUPER), true)
  assert.equal(esRolDc(ROLES.DCSMART), true)
  assert.equal(esRolDc(ROLES.ADMIN), false)
})

test('exportan super_admin, dcsmart, externo y admin; el cajero no', () => {
  assert.equal(puedeExportar(ROLES.SUPER), true)
  assert.equal(puedeExportar(ROLES.DCSMART), true)
  assert.equal(puedeExportar(ROLES.EXTERNO), true)
  // admin es dueño o gerente del local: se baja los pagos de SUS locales.
  assert.equal(puedeExportar(ROLES.ADMIN), true)
  assert.equal(puedeExportar(ROLES.CAJERO), false)
})

test('exportar NO alcanza para ver los datos internos de DC', () => {
  // La columna "Creado" del export se arma con esRolDc, no con puedeExportar:
  // externo y admin exportan, pero sin ese dato. Si algun dia los dos
  // coincidieran, exportar seria una puerta lateral a lo que la tabla esconde.
  for (const rol of [ROLES.EXTERNO, ROLES.ADMIN]) {
    assert.equal(puedeExportar(rol), true)
    assert.equal(esRolDc(rol), false, `${rol} no puede contar como DC`)
  }
})

test('exportar no ensancha el alcance de locales', () => {
  // El archivo se arma con las filas que ya trae la pantalla, y esas vienen
  // recortadas por allowedLocalIds. Si admin pasara a tener alcance global, el
  // export dejaria de ser "mis pagos" y seria "todos los pagos del grupo".
  assert.equal(esAlcanceGlobal(ROLES.ADMIN), false)
})

test('externo NO tiene alcance global de locales', () => {
  // El bug que esto evita: la pantalla de usuarios lo trataba como
  // super_admin/dcsmart y mostraba "Acceso a todos los grupos y locales",
  // ademas de no dejar limitarlo a locales especificos.
  assert.equal(esAlcanceGlobal(ROLES.EXTERNO), false)
  assert.equal(esAlcanceGlobal(ROLES.ADMIN), false)
  assert.equal(esAlcanceGlobal(ROLES.CAJERO), false)
  assert.equal(esAlcanceGlobal(ROLES.SUPER), true)
  assert.equal(esAlcanceGlobal(ROLES.DCSMART), true)
})

test('externo y admin: sin locales asignados ven todos los del grupo', () => {
  // Espeja ROLES_TODOS_LOS_LOCALES del backend (plugins/appContext.js).
  assert.equal(sinLocalesVeTodos(ROLES.EXTERNO), true)
  assert.equal(sinLocalesVeTodos(ROLES.ADMIN), true)
  // El cajero necesita local asignado si o si.
  assert.equal(sinLocalesVeTodos(ROLES.CAJERO), false)
  assert.equal(sinLocalesVeTodos(ROLES.SUPER), false)
})

test('cajero solo crea cajas, no edita ni borra', () => {
  assert.equal(puedeCrearCajas(ROLES.CAJERO), true)
  assert.equal(puedeEditar(ROLES.CAJERO), false)
  assert.equal(puedeBorrarCajas(ROLES.CAJERO), false)
})

test('super_admin y dcsmart pueden todo', () => {
  for (const rol of [ROLES.SUPER, ROLES.DCSMART]) {
    assert.equal(puedeEditar(rol), true)
    assert.equal(puedeBorrarPagos(rol), true)
    assert.equal(puedeBorrarCajas(rol), true)
    assert.equal(puedeCrearCajas(rol), true)
  }
})

test('un rol desconocido no puede nada', () => {
  // Si aparece un rol nuevo en la base y nadie lo agrego aca, que no herede
  // permisos por accidente.
  for (const fn of [esRolDc, puedeOperar, puedeEditar, puedeBorrarPagos, puedeBorrarCajas, puedeCrearCajas]) {
    assert.equal(fn('rol_que_no_existe'), false)
    assert.equal(fn(undefined), false)
    assert.equal(fn(null), false)
  }
})

test('ROLES_TODOS tiene los cinco roles', () => {
  assert.deepEqual([...ROLES_TODOS].sort(), ['admin', 'cajero', 'dcsmart', 'externo', 'super_admin'])
})

// ── Perfil Data Entry ───────────────────────────────────────────────────────

test('data_entry existe como rol', () => {
  assert.equal(ROLES.DATA_ENTRY, 'data_entry')
})

test('data_entry puede crear cajas: es su tarea', () => {
  assert.equal(puedeCrearCajas(ROLES.DATA_ENTRY), true)
})

test('data_entry no opera, no edita, no exporta, no borra y no es de DC', () => {
  for (const fn of [puedeOperar, puedeEditar, puedeExportar, esRolDc,
                    puedeBorrarPagos, puedeBorrarCajas, puedeBorrarMovimientos]) {
    assert.equal(fn(ROLES.DATA_ENTRY), false, fn.name)
  }
})

test('data_entry no entra en ROLES_TODOS: esa lista significa "opera la app"', () => {
  assert.equal(ROLES_TODOS.includes(ROLES.DATA_ENTRY), false)
})

// ── Home por rol ────────────────────────────────────────────────────────────
// Reemplaza el <Navigate to="/reportes"> que estaba hardcodeado en
// ProtectedRoute y que con un segundo rol restringido dejaba de servir.

test('cada rol restringido tiene su propio home', () => {
  assert.equal(homeDeRol('reportes'), '/reportes')
  assert.equal(homeDeRol(ROLES.DATA_ENTRY), '/cargar')
})

test('los roles que operan van al dashboard', () => {
  for (const rol of [ROLES.SUPER, ROLES.DCSMART, ROLES.ADMIN, ROLES.EXTERNO, ROLES.CAJERO]) {
    assert.equal(homeDeRol(rol), HOME_POR_DEFECTO, rol)
  }
})

test('un rol desconocido o sin rol tambien cae en el default', () => {
  assert.equal(homeDeRol(undefined), HOME_POR_DEFECTO)
  assert.equal(homeDeRol(null), HOME_POR_DEFECTO)
  assert.equal(homeDeRol('rol_que_no_existe'), HOME_POR_DEFECTO)
})

test('ROLES_RESTRINGIDOS lista exactamente los roles con home propio', () => {
  assert.deepEqual([...ROLES_RESTRINGIDOS].sort(), ['data_entry', 'reportes'])
})

test('ningun rol restringido va al dashboard, y ninguno que opera tiene home propio', () => {
  for (const rol of ROLES_RESTRINGIDOS) {
    assert.notEqual(homeDeRol(rol), HOME_POR_DEFECTO, rol)
  }
  for (const rol of ROLES_TODOS) {
    assert.equal(ROLES_RESTRINGIDOS.includes(rol), false, rol)
  }
})
