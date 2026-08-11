import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEPARTAMENTOS, DEPARTAMENTO_LABEL, LARGOS,
  esDepartamentoValido, normalizarDepartamento, normalizarEquipo, normalizarPuesto,
  normalizarFechaNac, edad, patchDatosPersona,
} from './datosUsuario.js'

const HOY = new Date('2026-08-11T12:00:00Z')

// ── departamentos ───────────────────────────────────────────────────────────

test('los diez departamentos tienen etiqueta', () => {
  assert.equal(DEPARTAMENTOS.length, 10)
  for (const d of DEPARTAMENTOS) {
    assert.ok(DEPARTAMENTO_LABEL[d], `${d} sin etiqueta`)
  }
})

test('no hay etiquetas de mas: la lista y las etiquetas son el mismo conjunto', () => {
  // Una etiqueta huerfana significa que alguien saco un departamento y se olvido de
  // la mitad, y el que quedo nunca se puede elegir.
  assert.deepEqual(Object.keys(DEPARTAMENTO_LABEL).sort(), [...DEPARTAMENTOS].sort())
})

test('las claves van sin acentos y las etiquetas con', () => {
  // El valor guardado no tiene que depender de la tilde; lo que se lee, si.
  assert.ok(DEPARTAMENTOS.every((d) => /^[A-Z]+$/.test(d)), 'alguna clave tiene acentos o minusculas')
  assert.equal(DEPARTAMENTO_LABEL.AUDITORIA, 'Auditoría')
  assert.equal(DEPARTAMENTO_LABEL.DIRECCION, 'Dirección')
})

test('acepta los de la lista y rechaza cualquier otro', () => {
  assert.equal(esDepartamentoValido('SISTEMAS'), true)
  assert.equal(esDepartamentoValido('MARKETING'), false)
  assert.equal(esDepartamentoValido(''), false)
  assert.equal(esDepartamentoValido(null), false)
})

test('normaliza a mayusculas, asi el select y un import a mano guardan lo mismo', () => {
  assert.equal(normalizarDepartamento('sistemas'), 'SISTEMAS')
  assert.equal(normalizarDepartamento('  Compras  '), 'COMPRAS')
})

test('un departamento que no existe se guarda como null, no como texto', () => {
  // Guardar "MARKETING" crearia un departamento por la ventana, sin pasar por la lista.
  assert.equal(normalizarDepartamento('MARKETING'), null)
})

test('vacio es null y no cadena vacia', () => {
  // Una cadena vacia se agrupa y se ordena como si fuera un valor: los usuarios sin
  // departamento apareceria como un departamento mas.
  assert.equal(normalizarDepartamento(''), null)
  assert.equal(normalizarDepartamento('   '), null)
  assert.equal(normalizarDepartamento(undefined), null)
})

// ── equipo y puesto ─────────────────────────────────────────────────────────

test('equipo y puesto se recortan al largo de la columna', () => {
  const largo = 'x'.repeat(200)
  assert.equal(normalizarEquipo(largo).length, LARGOS.equipo)
  assert.equal(normalizarPuesto(largo).length, LARGOS.puesto)
})

test('se limpian los espacios de los costados', () => {
  assert.equal(normalizarEquipo('  Turno noche  '), 'Turno noche')
  assert.equal(normalizarPuesto('  Encargada  '), 'Encargada')
})

test('vacio es null en los dos', () => {
  for (const f of [normalizarEquipo, normalizarPuesto]) {
    assert.equal(f(''), null)
    assert.equal(f('   '), null)
    assert.equal(f(null), null)
  }
})

test('equipo y puesto NO se pasan a mayusculas', () => {
  // Son texto que se lee: "Encargada de salón", no "ENCARGADA DE SALÓN".
  assert.equal(normalizarPuesto('Encargada de salón'), 'Encargada de salón')
})

// ── fecha de nacimiento ─────────────────────────────────────────────────────

test('guarda la fecha como texto AAAA-MM-DD, sin hora', () => {
  // Sin hora no hay zona que la corra un dia. Es el bug que ya paso con 2076 cajas.
  assert.deepEqual(normalizarFechaNac('1990-05-17', HOY), { valor: '1990-05-17', error: null })
})

test('acepta lo que manda un <input type=date> con hora pegada', () => {
  assert.equal(normalizarFechaNac('1990-05-17T00:00:00.000Z', HOY).valor, '1990-05-17')
})

test('vacio es null y no es un error: el dato puede faltar', () => {
  assert.deepEqual(normalizarFechaNac('', HOY), { valor: null, error: null })
  assert.deepEqual(normalizarFechaNac(null, HOY), { valor: null, error: null })
})

test('un formato que no es fecha da error, no null silencioso', () => {
  const r = normalizarFechaNac('17/05/1990', HOY)
  assert.equal(r.valor, null)
  assert.match(r.error, /AAAA-MM-DD/)
})

test('el 31 de febrero no existe y se dice', () => {
  // Un Date lo corre al 3 de marzo sin avisar.
  const r = normalizarFechaNac('1990-02-31', HOY)
  assert.equal(r.valor, null)
  assert.match(r.error, /no existe/)
})

test('una fecha futura se rechaza', () => {
  const r = normalizarFechaNac('2030-01-01', HOY)
  assert.match(r.error, /futura/)
})

test('hoy mismo se acepta: alguien puede nacer hoy', () => {
  assert.equal(normalizarFechaNac('2026-08-11', HOY).valor, '2026-08-11')
})

test('un año mal tipeado se ataja', () => {
  assert.match(normalizarFechaNac('1093-05-17', HOY).error, /120 años/)
})

// ── edad ────────────────────────────────────────────────────────────────────

test('calcula la edad cumplida', () => {
  assert.equal(edad('1990-05-17', HOY), 36)
})

test('si todavia no cumplio este año, es un año menos', () => {
  // Cumple en diciembre y hoy es agosto.
  assert.equal(edad('1990-12-25', HOY), 35)
})

test('el dia del cumpleaños ya cuenta', () => {
  assert.equal(edad('1990-08-11', HOY), 36)
  assert.equal(edad('1990-08-12', HOY), 35)
})

test('sin fecha no hay edad, y no devuelve NaN', () => {
  assert.equal(edad(null, HOY), null)
  assert.equal(edad('', HOY), null)
  assert.equal(edad('cualquier cosa', HOY), null)
})

test('acepta un Date o un timestamp de Prisma', () => {
  // Prisma devuelve un Date para las columnas DATE; su ISO arranca con la fecha.
  assert.equal(edad(new Date('1990-05-17T00:00:00Z').toISOString(), HOY), 36)
})

// ── patch para el update ────────────────────────────────────────────────────

test('un body que no menciona los campos no los toca', () => {
  // El PUT de usuarios se usa tambien para cambiar el nombre o la clave. Si el patch
  // devolviera los cuatro campos en null, ese PUT borraria departamento, equipo,
  // puesto y fecha de nacimiento sin que nadie lo pidiera.
  const { data, error } = patchDatosPersona({ nombre: 'Ana' })
  assert.equal(error, null)
  assert.deepEqual(data, {})
})

test('mandar el campo vacio SI lo borra', () => {
  // Es como se saca un dato mal cargado desde el formulario.
  const { data } = patchDatosPersona({ departamento: '', equipo: '', puesto: '', fecha_nac: '' })
  assert.deepEqual(data, { departamento: null, equipo: null, puesto: null, fecha_nac: null })
})

test('distingue campo ausente de campo en null', () => {
  assert.deepEqual(patchDatosPersona({ equipo: null }).data, { equipo: null })
  assert.deepEqual(patchDatosPersona({}).data, {})
})

test('un departamento fuera de la lista es un error, no un null callado', () => {
  // Con el select del formulario esto no pasa: si pasa es un bug o alguien pegandole
  // a la API a mano, y conviene que se entere en vez de perder el dato.
  const { data, error } = patchDatosPersona({ departamento: 'MARKETING' })
  assert.equal(data, null)
  assert.match(error, /MARKETING/)
})

test('la fecha se convierte a medianoche UTC para la columna DATE', () => {
  const { data } = patchDatosPersona({ fecha_nac: '1990-05-17' })
  assert.ok(data.fecha_nac instanceof Date)
  // Medianoche UTC exacta: si tuviera hora local, la columna DATE guardaria el 16 en
  // GMT-3.
  assert.equal(data.fecha_nac.toISOString(), '1990-05-17T00:00:00.000Z')
})

test('una fecha invalida corta el update con el motivo', () => {
  const { data, error } = patchDatosPersona({ fecha_nac: '1990-02-31' })
  assert.equal(data, null)
  assert.match(error, /no existe/)
})

test('el patch no arrastra otras claves del body', () => {
  // Se le pasa directo a Prisma: si colara `activo` o `password`, un usuario podria
  // escribir campos que esta ruta no autoriza.
  const { data } = patchDatosPersona({ departamento: 'SISTEMAS', activo: false, password_hash: 'x' })
  assert.deepEqual(Object.keys(data), ['departamento'])
})
