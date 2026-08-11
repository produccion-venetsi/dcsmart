import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  DEPARTAMENTOS, DEPARTAMENTO_LABEL, OPCIONES_DEPARTAMENTO, LARGOS,
  etiquetaDepartamento, fechaNacInput, fechaNacTexto, edad, hoyISO,
  errorFechaNac, CAMPOS_PERSONA, faltantes,
} from './datosUsuario.js'

const HOY = new Date(2026, 7, 11) // 11/08/2026 en hora local, como lo ve el navegador

// ── contrato con el backend ─────────────────────────────────────────────────
//
// Esta lista esta duplicada en backend/src/lib/datosUsuario.js. Estos tests son lo que
// evita que se desincronicen: si alguien agrega un departamento en un solo lado, el
// backend rechaza con 400 lo que el select del frontend ofrece.

const BACK = readFileSync(
  new URL('../../../backend/src/lib/datosUsuario.js', import.meta.url), 'utf8'
).replace(/\r\n/g, '\n')

const listaDelBackend = (nombre) => {
  const m = BACK.match(new RegExp(`export const ${nombre} = \\[([^\\]]*)\\]`))
  assert.ok(m, `no se encontro ${nombre} en el backend`)
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
}

test('CONTRATO: los departamentos son los mismos que en el backend', () => {
  assert.deepEqual(DEPARTAMENTOS, listaDelBackend('DEPARTAMENTOS'))
})

test('CONTRATO: las etiquetas son las mismas que en el backend', () => {
  // Se comparan las etiquetas y no solo las claves: si el backend dice "Auditoría" y el
  // frontend "Auditoria", el dato es el mismo pero la pantalla se contradice sola.
  const m = BACK.match(/export const DEPARTAMENTO_LABEL = \{([^}]*)\}/)
  assert.ok(m, 'no se encontro DEPARTAMENTO_LABEL en el backend')
  const delBack = Object.fromEntries(
    [...m[1].matchAll(/(\w+):\s*'([^']*)'/g)].map((x) => [x[1], x[2]])
  )
  assert.deepEqual(DEPARTAMENTO_LABEL, delBack)
})

test('CONTRATO: los largos maximos coinciden', () => {
  // Si el frontend deja escribir 200 y el backend recorta a 60, se guarda algo
  // distinto de lo que se vio al escribir.
  const m = BACK.match(/export const LARGOS = \{([^}]*)\}/)
  const delBack = Object.fromEntries(
    [...m[1].matchAll(/(\w+):\s*(\d+)/g)].map((x) => [x[1], Number(x[2])])
  )
  assert.deepEqual(LARGOS, delBack)
})

// ── opciones del select ─────────────────────────────────────────────────────

test('cada departamento es una opcion con su etiqueta', () => {
  assert.equal(OPCIONES_DEPARTAMENTO.length, 10)
  assert.deepEqual(OPCIONES_DEPARTAMENTO[0], { value: 'ADMINISTRACION', label: 'Administración' })
})

test('etiquetaDepartamento muestra el nombre lindo y aguanta un valor viejo', () => {
  assert.equal(etiquetaDepartamento('RRHH'), 'RRHH')
  assert.equal(etiquetaDepartamento('AUDITORIA'), 'Auditoría')
  // Un valor que ya no esta en la lista se muestra tal cual en vez de desaparecer: si
  // alguien saca un departamento, los usuarios que lo tenian no quedan en blanco.
  assert.equal(etiquetaDepartamento('MARKETING'), 'MARKETING')
  assert.equal(etiquetaDepartamento(null), '')
})

// ── fechas: lo que NO hay que hacer con Date ─────────────────────────────────

test('la fecha del backend se corta, no se parsea', () => {
  // Lo que manda Prisma para una columna DATE.
  assert.equal(fechaNacInput('1990-05-17T00:00:00.000Z'), '1990-05-17')
})

test('el dia que se muestra es el que se guardo, no el anterior', () => {
  // new Date('1990-05-17T00:00:00.000Z').toLocaleDateString() en GMT-3 da 16/5/1990.
  // Este es el bug que corrio 2076 cajas un dia para atras.
  assert.equal(fechaNacTexto('1990-05-17T00:00:00.000Z'), '17/05/1990')
})

test('el primero de mes no se cae al mes anterior', () => {
  // El caso donde la zona horaria ademas cambia el mes.
  assert.equal(fechaNacTexto('1990-01-01T00:00:00.000Z'), '01/01/1990')
})

test('sin fecha no muestra nada, no muestra "Invalid Date"', () => {
  assert.equal(fechaNacTexto(null), '')
  assert.equal(fechaNacTexto(''), '')
  assert.equal(fechaNacTexto('cualquier cosa'), '')
})

test('la edad se calcula en hora local, como la ve el usuario', () => {
  assert.equal(edad('1990-05-17T00:00:00.000Z', HOY), 36)
  assert.equal(edad('1990-12-25T00:00:00.000Z', HOY), 35)
  assert.equal(edad('1990-08-11T00:00:00.000Z', HOY), 36)
  assert.equal(edad('1990-08-12T00:00:00.000Z', HOY), 35)
})

test('sin fecha no hay edad y no hay NaN', () => {
  assert.equal(edad(null, HOY), null)
  assert.equal(edad('', HOY), null)
})

test('hoyISO da el dia local con ceros', () => {
  assert.equal(hoyISO(HOY), '2026-08-11')
  assert.equal(hoyISO(new Date(2026, 0, 5)), '2026-01-05')
})

// ── validacion antes de mandar ──────────────────────────────────────────────

test('vacio es valido: el dato puede faltar', () => {
  assert.equal(errorFechaNac('', HOY), null)
  assert.equal(errorFechaNac(null, HOY), null)
})

test('una fecha completa y pasada pasa', () => {
  assert.equal(errorFechaNac('1990-05-17', HOY), null)
})

test('hoy mismo pasa', () => {
  assert.equal(errorFechaNac('2026-08-11', HOY), null)
})

test('mañana no pasa', () => {
  assert.match(errorFechaNac('2026-08-12', HOY), /futura/)
})

test('una fecha a medio escribir avisa en vez de mandarse', () => {
  assert.match(errorFechaNac('1990-05', HOY), /incompleta/)
})

test('un año imposible avisa', () => {
  assert.match(errorFechaNac('1093-05-17', HOY), /año/)
})

// ── que falta cargar ────────────────────────────────────────────────────────

test('un usuario nuevo tiene los cuatro campos vacios', () => {
  assert.deepEqual(faltantes({ nombre: 'Ana' }), ['Departamento', 'Equipo', 'Rol', 'Fecha de nac.'])
})

test('un usuario completo no le falta nada', () => {
  const u = { departamento: 'SISTEMAS', equipo: 'Backend', puesto: 'Dev', fecha_nac: '1990-05-17T00:00:00.000Z' }
  assert.deepEqual(faltantes(u), [])
})

test('un campo con solo espacios cuenta como vacio', () => {
  assert.deepEqual(faltantes({ departamento: 'SISTEMAS', equipo: '  ', puesto: 'Dev', fecha_nac: '1990-05-17' }), ['Equipo'])
})

test('el campo puesto se muestra como "Rol"', () => {
  // En el codigo es `puesto` para no chocar con el rol de permisos; en pantalla el
  // negocio lo llama Rol.
  const c = CAMPOS_PERSONA.find((x) => x.clave === 'puesto')
  assert.equal(c.label, 'Rol')
})

test('faltantes aguanta un usuario sin datos', () => {
  assert.equal(faltantes(null).length, 4)
  assert.equal(faltantes(undefined).length, 4)
})
