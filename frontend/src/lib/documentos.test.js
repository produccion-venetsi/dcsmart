import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  DIAS_AVISO, fechaISO, fechaTexto, diasParaVencer, estadoVencimiento, textoVencimiento,
  colorVencimiento, seVeEnPantalla, accionDeArchivo, nombreDeArchivo, ACEPTA,
  AGRUPACIONES, TODO_EL_GRUPO, agrupar, resumen, EMPTY_DOC, erroresDoc, avisosDoc,
  linkParaMostrar, MAX_BYTES, pesoLegible, revisarElegidos, motivoRechazo,
  modoPreview, archivoInicial, MODOS, esEdicion, paraGuardar, nuevoPendiente, esPendiente,
} from './documentos.js'

const HOY = new Date(2026, 7, 11) // 11/08/2026 local, como lo ve el navegador

// ── contrato con el backend ─────────────────────────────────────────────────

const BACK = readFileSync(
  new URL('../../../backend/src/lib/documentos.js', import.meta.url), 'utf8'
).replace(/\r\n/g, '\n')

test('CONTRATO: los dias de aviso son los mismos que en el backend', () => {
  // Si el backend avisa a 30 dias y la pantalla pinta a 15, hay documentos en ambar sin
  // aviso y al reves.
  const m = BACK.match(/export const DIAS_AVISO = (\d+)/)
  assert.ok(m, 'no se encontro DIAS_AVISO en el backend')
  assert.equal(DIAS_AVISO, Number(m[1]))
})

test('CONTRATO: los tres estados de vencimiento se llaman igual', () => {
  // El backend manda `estado_vencimiento` en el listado y la pantalla lo usa para
  // elegir el color: un nombre distinto deja todo gris sin fallar.
  for (const estado of ['vencido', 'por-vencer', 'vigente']) {
    assert.ok(BACK.includes(`'${estado}'`), `el backend no menciona '${estado}'`)
  }
})

test('CONTRATO: las extensiones aceptadas son las que valida el backend', () => {
  const m = BACK.match(/export const EXTENSIONES = new Set\(\[([^\]]*)\]/)
  assert.ok(m, 'no se encontro EXTENSIONES en el backend')
  const delBack = [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]).sort()
  const delFront = ACEPTA.split(',').map(s => s.replace('.', '')).sort()
  // Si el input ofrece algo que el backend rechaza, el usuario elige el archivo, espera
  // la subida y recibe un error.
  assert.deepEqual(delFront, delBack)
})

test('CONTRATO: los estados que el backend calcula coinciden con los de aca', () => {
  // Mismo caso de borde: 30 dias es por-vencer, 31 es vigente.
  assert.equal(estadoVencimiento('2026-09-10', HOY), 'por-vencer')
  assert.equal(estadoVencimiento('2026-09-11', HOY), 'vigente')
})

// ── fechas ──────────────────────────────────────────────────────────────────

test('la fecha del backend se corta, no se parsea', () => {
  assert.equal(fechaISO('2026-09-01T00:00:00.000Z'), '2026-09-01')
  assert.equal(fechaISO('2026-09-01'), '2026-09-01')
})

test('el dia que se muestra es el que se guardo', () => {
  // new Date('2026-09-01').toLocaleDateString() en GMT-3 da 31/8/2026.
  assert.equal(fechaTexto('2026-09-01T00:00:00.000Z'), '01/09/2026')
})

test('sin fecha no muestra nada ni "Invalid Date"', () => {
  assert.equal(fechaTexto(null), '')
  assert.equal(fechaTexto('cualquier cosa'), '')
  assert.equal(fechaISO(''), null)
})

test('cuenta los dias por calendario', () => {
  assert.equal(diasParaVencer('2026-08-11', HOY), 0)
  assert.equal(diasParaVencer('2026-08-12', HOY), 1)
  assert.equal(diasParaVencer('2026-08-01', HOY), -10)
})

test('los textos se leen como los diria una persona', () => {
  assert.equal(textoVencimiento('2026-08-11', HOY), 'Vence hoy')
  assert.equal(textoVencimiento('2026-08-12', HOY), 'Vence mañana')
  assert.equal(textoVencimiento('2026-08-10', HOY), 'Venció ayer')
  assert.equal(textoVencimiento('2026-08-01', HOY), 'Venció hace 10 días')
  assert.equal(textoVencimiento(null, HOY), '')
})

test('vencido en rojo, por vencer en ambar, el resto neutro', () => {
  assert.equal(colorVencimiento('vencido'), 'var(--red)')
  assert.equal(colorVencimiento('por-vencer'), 'var(--amber)')
  assert.equal(colorVencimiento('vigente'), 'var(--t3)')
  // Un estado que no conocemos no rompe el estilo.
  assert.equal(colorVencimiento(undefined), 'var(--t3)')
})

// ── archivos ────────────────────────────────────────────────────────────────

test('fotos y pdf se ven, el resto se baja', () => {
  assert.equal(seVeEnPantalla('foto'), true)
  assert.equal(seVeEnPantalla('pdf'), true)
  assert.equal(seVeEnPantalla('archivo'), false)
  assert.equal(accionDeArchivo('foto'), 'ver')
  assert.equal(accionDeArchivo('archivo'), 'descargar')
})

test('se muestra el nombre original del archivo', () => {
  assert.equal(nombreDeArchivo({ nombre_original: 'contrato firmado.pdf' }), 'contrato firmado.pdf')
})

test('sin nombre original no muestra el timestamp de GCS', () => {
  // El archivo en el bucket se llama "1786445361010-x7f2.pdf": eso no le dice nada a nadie.
  assert.equal(nombreDeArchivo({ tipo: 'pdf' }, 0), 'PDF 1')
  assert.equal(nombreDeArchivo({ tipo: 'foto' }, 1), 'Imagen 2')
  assert.equal(nombreDeArchivo({ tipo: 'archivo' }, 2), 'Archivo 3')
  assert.equal(nombreDeArchivo({ nombre_original: '   ' }, 0), 'Archivo 1')
})

// ── agrupacion ──────────────────────────────────────────────────────────────

const doc = (id, local, tipo, extra = {}) => ({
  id,
  local: local ? { id: local, nombre: local } : null,
  tipo: { nombre: tipo },
  ...extra,
})

const DOCS = [
  doc('d1', 'DOGG', 'Habilitación'),
  doc('d2', 'DOGG', 'Contrato'),
  doc('d3', 'EVELIA', 'Habilitación'),
  doc('d4', null, 'Contrato'),   // de todo el grupo
]

test('agrupa por local y tipo, en dos niveles', () => {
  const b = agrupar(DOCS, 'local-tipo')
  const dogg = b.find(x => x.titulo === 'DOGG')
  assert.deepEqual(dogg.sub.map(s => s.titulo), ['Contrato', 'Habilitación'])
  assert.equal(dogg.total, 2)
})

test('los del grupo entero van PRIMERO, no al final', () => {
  // Aplican a todos los locales: mandarlos abajo invierte su importancia.
  const b = agrupar(DOCS, 'local-tipo')
  assert.equal(b[0].titulo, TODO_EL_GRUPO)
})

test('agrupa solo por tipo', () => {
  const b = agrupar(DOCS, 'tipo')
  assert.deepEqual(b.map(x => x.titulo), ['Contrato', 'Habilitación'])
  assert.equal(b.find(x => x.titulo === 'Habilitación').total, 2)
})

test('sin separar devuelve un bloque con todo', () => {
  const b = agrupar(DOCS, '')
  assert.equal(b.length, 1)
  assert.equal(b[0].titulo, null)
  assert.equal(b[0].sub[0].docs.length, 4)
})

test('cada documento aparece una sola vez', () => {
  // A diferencia de los usuarios, que pueden tener dos roles.
  const ids = agrupar(DOCS, 'local-tipo').flatMap(b => b.sub.flatMap(s => s.docs.map(d => d.id)))
  assert.equal(ids.length, 4)
  assert.equal(new Set(ids).size, 4)
})

test('aguanta lista vacia y nula', () => {
  assert.deepEqual(agrupar([], 'local-tipo'), [])
  assert.deepEqual(agrupar(null, 'local-tipo'), [])
  assert.equal(agrupar(null, '')[0].total, 0)
})

test('un documento sin tipo no desaparece', () => {
  const b = agrupar([{ id: 'x', local: null, tipo: null }], 'tipo')
  assert.equal(b.length, 1)
  assert.equal(b[0].titulo, 'Sin tipo')
})

test('las agrupaciones del selector incluyen las dos que se pidieron', () => {
  const v = AGRUPACIONES.map(a => a.valor)
  assert.ok(v.includes('local-tipo'))
  assert.ok(v.includes('tipo'))
})

// ── resumen ─────────────────────────────────────────────────────────────────

test('cuenta vencidos, por vencer y fichas vacias', () => {
  const r = resumen([
    { estado_vencimiento: 'vencido', archivos: [{ id: 'a' }] },
    { estado_vencimiento: 'por-vencer', url: 'https://x' },
    { estado_vencimiento: 'vigente', archivos: [{ id: 'b' }] },
    { estado_vencimiento: null, archivos: [] },  // ni archivos ni link
  ])
  assert.deepEqual(r, { total: 4, vencidos: 1, porVencer: 1, sinArchivo: 1 })
})

test('un documento con solo link NO cuenta como ficha vacia', () => {
  assert.equal(resumen([{ url: 'https://drive.google.com/x', archivos: [] }]).sinArchivo, 0)
})

test('el resumen aguanta nulo', () => {
  assert.deepEqual(resumen(null), { total: 0, vencidos: 0, porVencer: 0, sinArchivo: 0 })
})

// ── validacion del formulario ───────────────────────────────────────────────

test('el nombre y el tipo son obligatorios', () => {
  const e = erroresDoc(EMPTY_DOC)
  assert.equal(e.nombre, 'Requerido')
  assert.equal(e.id_tipo, 'Requerido')
})

test('con nombre y tipo ya se puede guardar', () => {
  assert.deepEqual(erroresDoc({ ...EMPTY_DOC, nombre: 'Habilitación', id_tipo: 't1' }), {})
})

test('el local NO es obligatorio: puede ser de todo el grupo', () => {
  const e = erroresDoc({ ...EMPTY_DOC, nombre: 'Contrato marco', id_tipo: 't1', id_local: '' })
  assert.deepEqual(e, {})
})

test('un link tiene que ser http', () => {
  const base = { nombre: 'X', id_tipo: 't1' }
  assert.equal(erroresDoc({ ...base, url: 'javascript:alert(1)' }).url, 'Tiene que empezar con http:// o https://')
  assert.equal(erroresDoc({ ...base, url: 'drive.google.com' }).url, 'Tiene que empezar con http:// o https://')
  assert.equal(erroresDoc({ ...base, url: 'https://drive.google.com' }).url, undefined)
})

test('una fecha a medio escribir avisa', () => {
  assert.equal(erroresDoc({ nombre: 'X', id_tipo: 't', vence: '2026-09' }).vence, 'Fecha incompleta')
})

test('un vencimiento pasado se PUEDE guardar, pero avisa', () => {
  // Se carga una habilitacion ya vencida para tenerla registrada; casi siempre igual es
  // un año mal tipeado, asi que se dice.
  const form = { nombre: 'X', id_tipo: 't', vence: '2020-01-01', _tieneArchivos: true }
  assert.deepEqual(erroresDoc(form, HOY), {})
  const avisos = avisosDoc(form, HOY)
  assert.ok(avisos.some(a => /Venci/.test(a)), avisos)
})

test('avisa si va a quedar sin archivos ni link', () => {
  const avisos = avisosDoc({ nombre: 'X', id_tipo: 't' }, HOY)
  assert.ok(avisos.some(a => /ficha vacía/.test(a)), avisos)
})

test('con archivos no avisa nada', () => {
  assert.deepEqual(avisosDoc({ nombre: 'X', id_tipo: 't', _tieneArchivos: true }, HOY), [])
})

test('con solo link tampoco avisa', () => {
  assert.deepEqual(avisosDoc({ nombre: 'X', id_tipo: 't', url: 'https://x.com' }, HOY), [])
})

// ── contrato de iconos ──────────────────────────────────────────────────────

test('CONTRATO: los iconos dibujados son exactamente los que valida el backend', () => {
  // El backend rechaza con 400 cualquier clave que no este en su lista, y el componente
  // dibuja un documento genérico para las que no conoce. Si se desincronizan, o el
  // formulario ofrece un icono que no se puede guardar, o guarda uno que se ve mal.
  const front = readFileSync(
    new URL('../components/IconoDocumento.jsx', import.meta.url), 'utf8'
  ).replace(/\r\n/g, '\n')

  const m = front.match(/^const D = \{([\s\S]*?)^\}/m)
  assert.ok(m, 'no se encontro el catalogo D en IconoDocumento.jsx')
  // Las claves son las que arrancan una linea con dos espacios de sangria.
  const delFront = [...m[1].matchAll(/^ {2}(\w+):/gm)].map(x => x[1]).sort()

  const mb = BACK.match(/export const ICONOS = \[([\s\S]*?)\n\]/)
  assert.ok(mb, 'no se encontro ICONOS en el backend')
  const delBack = [...mb[1].matchAll(/clave: '([^']+)'/g)].map(x => x[1]).sort()

  assert.deepEqual(delFront, delBack)
})

test('CONTRATO: el icono por default existe en el catalogo del frontend', () => {
  const front = readFileSync(
    new URL('../components/IconoDocumento.jsx', import.meta.url), 'utf8'
  ).replace(/\r\n/g, '\n')
  const mb = BACK.match(/export const ICONO_DEFAULT = '([^']+)'/)
  assert.ok(mb, 'no se encontro ICONO_DEFAULT en el backend')
  // Se busca como clave del catalogo, con la sangria de dos espacios.
  assert.match(front, new RegExp(`^ {2}${mb[1]}:`, 'm'))
})

// ── link para mostrar ───────────────────────────────────────────────────────

test('el panel recien abierto NO tiene link y no explota', () => {
  // Este es el bug real: escrito como `link?.id === sel?.id ? link.url : null`, con los
  // dos en null la comparacion es `undefined === undefined` (true) y lee .url de un null.
  // La pantalla se caia justo al abrirse, que es cuando los dos son null.
  assert.equal(linkParaMostrar(null, null), null)
})

test('sin link no muestra nada aunque haya documento abierto', () => {
  assert.equal(linkParaMostrar(null, { id: 'd1' }), null)
})

test('muestra el link del documento abierto', () => {
  assert.equal(linkParaMostrar({ id: 'd1', url: 'https://x/publico/abc' }, { id: 'd1' }), 'https://x/publico/abc')
})

test('NO muestra el link de un documento sobre otro', () => {
  // Es la razon de guardar el id junto a la url: mostrar el link de otro documento seria
  // compartir el archivo equivocado.
  assert.equal(linkParaMostrar({ id: 'd1', url: 'https://x/publico/abc' }, { id: 'd2' }), null)
})

test('un link sin documento abierto no se muestra', () => {
  assert.equal(linkParaMostrar({ id: 'd1', url: 'https://x' }, null), null)
})

// ── elegir archivos ─────────────────────────────────────────────────────────

const archivo = (name, size = 1000) => ({ name, size })

test('separa los que se pueden subir de los que no', () => {
  const r = revisarElegidos([
    archivo('contrato.pdf'),
    archivo('virus.exe'),
    archivo('enorme.pdf', MAX_BYTES + 1),
    archivo('foto.JPG'),
  ])
  assert.deepEqual(r.ok.map(f => f.name), ['contrato.pdf', 'foto.JPG'])
  assert.deepEqual(r.rechazados.map(f => f.name), ['virus.exe'])
  assert.deepEqual(r.grandes.map(f => f.name), ['enorme.pdf'])
})

test('la extension se mira sin importar mayusculas', () => {
  assert.equal(revisarElegidos([archivo('ESCANEO.PDF')]).ok.length, 1)
})

test('un archivo sin extension se rechaza', () => {
  assert.equal(revisarElegidos([archivo('sin-extension')]).rechazados.length, 1)
})

test('en el limite exacto de 20 MB todavia entra', () => {
  assert.equal(revisarElegidos([archivo('justo.pdf', MAX_BYTES)]).ok.length, 1)
  assert.equal(revisarElegidos([archivo('uno-mas.pdf', MAX_BYTES + 1)]).grandes.length, 1)
})

test('el aviso NOMBRA los archivos que quedaron afuera', () => {
  // "2 archivos no se pudieron subir" obliga a adivinar cuales.
  const r = revisarElegidos([archivo('virus.exe'), archivo('enorme.pdf', MAX_BYTES + 1)])
  const msg = motivoRechazo(r)
  assert.match(msg, /virus\.exe/)
  assert.match(msg, /enorme\.pdf/)
  assert.match(msg, /no es un tipo permitido/)
  assert.match(msg, /20\.0 MB/)
})

test('sin rechazos no hay mensaje', () => {
  assert.equal(motivoRechazo(revisarElegidos([archivo('ok.pdf')])), '')
  assert.equal(motivoRechazo({}), '')
})

test('los pesos se leen en la unidad que corresponde', () => {
  assert.equal(pesoLegible(500), '500 B')
  assert.equal(pesoLegible(2048), '2 KB')
  assert.equal(pesoLegible(5 * 1024 * 1024), '5.0 MB')
  assert.equal(pesoLegible(null), '')
})

// ── vista previa ────────────────────────────────────────────────────────────

test('cada tipo tiene su forma de mostrarse', () => {
  assert.equal(modoPreview('foto'), 'imagen')
  assert.equal(modoPreview('pdf'), 'pdf')
  assert.equal(modoPreview('archivo'), 'ninguno')
  assert.equal(modoPreview(undefined), 'ninguno')
})

test('abre el primer archivo que SE PUEDA previsualizar, no el primero de la lista', () => {
  // Con un .docx adelante, abrir en "no se puede previsualizar" esconde las fotos que si
  // se ven.
  const archivos = [
    { id: 'a1', tipo: 'archivo' },
    { id: 'a2', tipo: 'foto' },
    { id: 'a3', tipo: 'pdf' },
  ]
  assert.equal(archivoInicial(archivos).id, 'a2')
})

test('si ninguno se puede previsualizar, abre el primero igual', () => {
  // Asi el detalle muestra al menos el nombre y el boton de descarga.
  assert.equal(archivoInicial([{ id: 'a1', tipo: 'archivo' }]).id, 'a1')
})

test('sin archivos no hay ninguno abierto', () => {
  assert.equal(archivoInicial([]), null)
  assert.equal(archivoInicial(null), null)
})

// ── modo del panel ──────────────────────────────────────────────────────────

test('ver no es edicion; nuevo y editar si', () => {
  assert.equal(esEdicion(MODOS.VER), false)
  assert.equal(esEdicion(MODOS.EDITAR), true)
  assert.equal(esEdicion(MODOS.NUEVO), true)
})

// ── archivos antes de guardar ───────────────────────────────────────────────

test('un pendiente se ve como un archivo guardado, con una marca', () => {
  const p = nuevoPendiente({ gs_path: 'gs://b/x.pdf', tipo: 'pdf', nombre_original: 'x.pdf' }, 0)
  assert.equal(p.nombre_original, 'x.pdf')
  assert.equal(p.tipo, 'pdf')
  assert.equal(esPendiente(p), true)
  assert.equal(esPendiente({ id: 'a1', tipo: 'pdf' }), false)
})

test('los pendientes tienen ids distintos, asi se pueden sacar de la lista', () => {
  const a = nuevoPendiente({ gs_path: 'gs://b/1.pdf' }, 0)
  const b = nuevoPendiente({ gs_path: 'gs://b/2.pdf' }, 1)
  assert.notEqual(a.id, b.id)
})

test('al guardar se manda solo lo que el backend espera', () => {
  const pendientes = [
    nuevoPendiente({ gs_path: 'gs://b/1.pdf', tipo: 'pdf', nombre_original: '1.pdf' }, 0),
  ]
  // Ni el id local ni la marca de pendiente: son de la pantalla, no del backend.
  assert.deepEqual(paraGuardar(pendientes), [
    { gs_path: 'gs://b/1.pdf', tipo: 'pdf', nombre_original: '1.pdf' },
  ])
})

test('sin pendientes se manda lista vacia', () => {
  assert.deepEqual(paraGuardar([]), [])
  assert.deepEqual(paraGuardar(null), [])
})
