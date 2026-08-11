import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ICONOS, ICONO_DEFAULT, CLAVES_ICONO, esIconoValido, normalizarIcono,
  EXTENSIONES, tipoDeArchivo, extensionPermitida, nuevoToken,
  DIAS_AVISO, diasParaVencer, estadoVencimiento, textoVencimiento, hayQueAvisar, textoAviso,
  ROLES_VEN_TODO, veTodosLosDocumentos, filtroVisibilidad,
  fechaISO, fechaParaGuardar,
} from './documentos.js'

const HOY = new Date('2026-08-11T15:00:00Z')

// ── iconos ──────────────────────────────────────────────────────────────────

test('las claves de icono no se repiten', () => {
  assert.equal(CLAVES_ICONO.length, new Set(CLAVES_ICONO).size)
})

test('cada icono tiene clave y label', () => {
  for (const i of ICONOS) {
    assert.ok(i.clave && i.label, `icono incompleto: ${JSON.stringify(i)}`)
  }
})

test('el default es uno de la lista', () => {
  // Si no lo fuera, un tipo recien creado guardaria un icono que no se puede dibujar.
  assert.ok(CLAVES_ICONO.includes(ICONO_DEFAULT))
})

test('valida contra la lista', () => {
  assert.equal(esIconoValido('contrato'), true)
  assert.equal(esIconoValido('fa-file-pdf'), false)
  assert.equal(esIconoValido(''), false)
  assert.equal(esIconoValido(null), false)
})

test('un icono desconocido al LEER cae en el default, no rompe la pantalla', () => {
  assert.equal(normalizarIcono('cualquiera'), ICONO_DEFAULT)
  assert.equal(normalizarIcono(null), ICONO_DEFAULT)
  assert.equal(normalizarIcono('plano'), 'plano')
})

// ── archivos ────────────────────────────────────────────────────────────────

test('las imagenes van al visor y el pdf al lector', () => {
  assert.equal(tipoDeArchivo('foto.JPG'), 'foto')
  assert.equal(tipoDeArchivo('escaneo.png'), 'foto')
  assert.equal(tipoDeArchivo('contrato.pdf'), 'pdf')
})

test('lo que no es imagen ni pdf se baja', () => {
  // Un .docx no se puede mostrar en el navegador; la pantalla ofrece descargarlo.
  assert.equal(tipoDeArchivo('contrato.docx'), 'archivo')
  assert.equal(tipoDeArchivo('planilla.xlsx'), 'archivo')
})

test('acepta contratos en Word, que es como llegan la mitad de las veces', () => {
  assert.equal(extensionPermitida('contrato.docx'), true)
  assert.equal(extensionPermitida('planilla.xlsx'), true)
  assert.equal(extensionPermitida('habilitacion.pdf'), true)
})

test('rechaza ejecutables y cosas raras', () => {
  assert.equal(extensionPermitida('virus.exe'), false)
  assert.equal(extensionPermitida('script.sh'), false)
  assert.equal(extensionPermitida('sin-extension'), false)
  assert.equal(extensionPermitida(''), false)
})

test('la extension se mira sin importar mayusculas', () => {
  assert.equal(extensionPermitida('ESCANEO.PDF'), true)
  assert.ok(EXTENSIONES.has('pdf'))
})

// ── token publico ───────────────────────────────────────────────────────────

test('el token es largo e impredecible', () => {
  const a = nuevoToken()
  const b = nuevoToken()
  // 32 bytes en hex. Es el secreto que abre el archivo sin login: corto no sirve.
  assert.equal(a.length, 64)
  assert.match(a, /^[0-9a-f]+$/)
  assert.notEqual(a, b)
})

// ── vencimientos ────────────────────────────────────────────────────────────

test('cuenta los dias por calendario, sin importar la hora', () => {
  assert.equal(diasParaVencer('2026-08-11', HOY), 0)
  assert.equal(diasParaVencer('2026-08-12', HOY), 1)
  assert.equal(diasParaVencer('2026-08-10', HOY), -1)
  assert.equal(diasParaVencer('2026-09-10', HOY), 30)
})

test('a las 11 de la noche sigue venciendo hoy, no ayer', () => {
  // Con hora en el medio, un vencimiento "de hoy" se convertiria en pasado a la tarde.
  assert.equal(diasParaVencer('2026-08-11', new Date('2026-08-11T23:59:00Z')), 0)
  assert.equal(diasParaVencer('2026-08-11', new Date('2026-08-11T00:01:00Z')), 0)
})

test('sin fecha no hay cuenta ni estado', () => {
  assert.equal(diasParaVencer(null, HOY), null)
  assert.equal(estadoVencimiento(null, HOY), null)
  assert.equal(textoVencimiento(null, HOY), '')
})

test('los tres estados', () => {
  assert.equal(estadoVencimiento('2026-08-01', HOY), 'vencido')
  assert.equal(estadoVencimiento('2026-08-11', HOY), 'por-vencer') // vence hoy
  assert.equal(estadoVencimiento('2026-09-01', HOY), 'por-vencer')
  assert.equal(estadoVencimiento('2027-01-01', HOY), 'vigente')
})

test('el limite de aviso son 30 dias y el dia 31 ya esta vigente', () => {
  assert.equal(DIAS_AVISO, 30)
  assert.equal(estadoVencimiento('2026-09-10', HOY), 'por-vencer') // 30 dias
  assert.equal(estadoVencimiento('2026-09-11', HOY), 'vigente')    // 31
})

test('el texto se lee como lo diria una persona', () => {
  assert.equal(textoVencimiento('2026-08-11', HOY), 'Vence hoy')
  assert.equal(textoVencimiento('2026-08-12', HOY), 'Vence mañana')
  assert.equal(textoVencimiento('2026-08-10', HOY), 'Venció ayer')
  assert.equal(textoVencimiento('2026-08-01', HOY), 'Venció hace 10 días')
  assert.equal(textoVencimiento('2026-08-21', HOY), 'Vence en 10 días')
})

// ── a quien avisar y cuando ─────────────────────────────────────────────────

test('avisa de uno que vence pronto y todavia no se aviso', () => {
  assert.equal(hayQueAvisar({ vence: '2026-08-20', avisado_hasta: null }, HOY), true)
})

test('avisa de uno vencido', () => {
  assert.equal(hayQueAvisar({ vence: '2026-07-01', avisado_hasta: null }, HOY), true)
})

test('NO avisa dos veces por el mismo vencimiento', () => {
  // Es lo que evita que el listado genere un aviso nuevo en cada refresco.
  const doc = { vence: '2026-08-20', avisado_hasta: new Date('2026-08-20T00:00:00Z') }
  assert.equal(hayQueAvisar(doc, HOY), false)
})

test('si se renueva y corre el vencimiento, el aviso vuelve a salir', () => {
  // `avisado_hasta` guarda el vencimiento avisado, no la fecha de envio: por eso
  // renovar destraba el aviso solo, sin tener que limpiar nada a mano.
  const doc = { vence: '2026-08-25', avisado_hasta: new Date('2026-08-20T00:00:00Z') }
  assert.equal(hayQueAvisar(doc, HOY), true)
})

test('no avisa de uno vigente ni de uno sin vencimiento', () => {
  assert.equal(hayQueAvisar({ vence: '2027-06-01', avisado_hasta: null }, HOY), false)
  assert.equal(hayQueAvisar({ vence: null, avisado_hasta: null }, HOY), false)
  assert.equal(hayQueAvisar({}, HOY), false)
})

test('el aviso nombra el documento y de donde es', () => {
  const doc = {
    nombre: 'Habilitación municipal', vence: '2026-08-20',
    tipo: { nombre: 'Habilitación' }, local: { nombre: 'DOGG' },
  }
  const { titulo, cuerpo } = textoAviso(doc, HOY)
  assert.match(titulo, /Vence en 9 días/)
  assert.match(titulo, /Habilitación municipal/)
  // Le llega a alguien que maneja varios locales: sin el local no sabe de cual es.
  assert.match(cuerpo, /DOGG/)
})

test('un documento de grupo, sin local, nombra el grupo', () => {
  const doc = { nombre: 'Contrato marco', vence: '2026-08-20', app: { nombre: 'GRUPO PERROS' } }
  assert.match(textoAviso(doc, HOY).cuerpo, /GRUPO PERROS/)
})

// ── visibilidad ─────────────────────────────────────────────────────────────

test('los roles internos ven todo', () => {
  for (const r of ['super_admin', 'dcsmart', 'admin', 'externo']) {
    assert.equal(veTodosLosDocumentos(r), true, r)
  }
})

test('el cajero solo ve los marcados como visibles', () => {
  // Carga plata; no tiene por que ver un contrato de alquiler.
  assert.equal(veTodosLosDocumentos('cajero'), false)
  assert.deepEqual(filtroVisibilidad('cajero'), { visible_todos: true })
})

test('un rol desconocido NO ve todo', () => {
  // Por si aparece un rol nuevo: el default seguro es no mostrar.
  assert.equal(veTodosLosDocumentos('rol_nuevo'), false)
  assert.equal(veTodosLosDocumentos(null), false)
  assert.deepEqual(filtroVisibilidad(undefined), { visible_todos: true })
})

test('para un rol interno el filtro no agrega nada al where', () => {
  assert.deepEqual(filtroVisibilidad('admin'), {})
  assert.ok(ROLES_VEN_TODO.includes('admin'))
})

// ── fechas ──────────────────────────────────────────────────────────────────

test('fechaISO acepta Date, ISO y string cortado', () => {
  assert.equal(fechaISO(new Date('2026-08-11T00:00:00Z')), '2026-08-11')
  assert.equal(fechaISO('2026-08-11T00:00:00.000Z'), '2026-08-11')
  assert.equal(fechaISO('2026-08-11'), '2026-08-11')
})

test('fechaISO devuelve null para lo que no es fecha', () => {
  assert.equal(fechaISO(null), null)
  assert.equal(fechaISO(''), null)
  assert.equal(fechaISO('11/08/2026'), null)
  assert.equal(fechaISO(new Date('cualquier cosa')), null)
})

test('lo que se guarda es medianoche UTC del dia escrito', () => {
  // Con hora local, la columna DATE guardaria el dia anterior en GMT-3.
  assert.equal(fechaParaGuardar('2026-08-11').toISOString(), '2026-08-11T00:00:00.000Z')
  assert.equal(fechaParaGuardar(null), null)
})
