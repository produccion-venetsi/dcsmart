import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  CLASIFICACIONES_QUE_CARGAN, cargaLaCuenta, clasificacionEfectiva, cargaCuenta,
  totalesCajaCliente, ayudaCuentaDetalle,
  VENTANAS, VENTANA_INFO, esVentanaValida, ventanaInicial,
} from './cuentaCorrienteCaja.js'

const CLI = 'cli-1'

// ── que habilita el campo ───────────────────────────────────────────────────

test('cobro y gasto pueden llevar cuenta; informativo no', () => {
  assert.equal(cargaLaCuenta('cobro'), true)
  assert.equal(cargaLaCuenta('gasto'), true)
  assert.equal(cargaLaCuenta('informativo'), false)
})

test('sin clasificacion no se habilita', () => {
  // El backend lo rechaza: habilitarlo seria dejar completar un campo que no se puede
  // guardar. OJO: normalizarClasificacion del frontend cae en 'cobro' por defecto, asi que
  // esto solo pasa si se le pide el fallback null. Es la trampa que este test cuida.
  assert.equal(cargaLaCuenta(null), false)
  assert.equal(cargaLaCuenta(''), false)
  assert.equal(cargaLaCuenta('fucsia'), false)
})

test('los valores historicos de la base tambien', () => {
  assert.equal(cargaLaCuenta('ingreso'), true)
  assert.equal(cargaLaCuenta('egreso'), true)
  assert.equal(cargaLaCuenta('canal'), false)
})

// ── detalles ────────────────────────────────────────────────────────────────

test('sin cliente no carga cuenta', () => {
  assert.equal(cargaCuenta({ tipo: 'cobro', monto: 100 }), false)
})

test('con cliente y cobro, carga', () => {
  assert.equal(cargaCuenta({ id_cliente: CLI, tipo: 'cobro', monto: 100 }), true)
})

test('reconoce el cliente venga por id o por objeto', () => {
  // La ficha lo recibe anidado (`cliente`), el formulario por id.
  assert.equal(cargaCuenta({ cliente: { id: CLI }, tipo: 'cobro', monto: 100 }), true)
})

test('la clasificacion del detalle gana sobre la del tipo', () => {
  const d = { id_cliente: CLI, tipo: 'informativo', detalle_tipo: { clasificacion: 'cobro' } }
  assert.equal(clasificacionEfectiva(d), 'informativo')
  assert.equal(cargaCuenta(d), false)
})

// ── totales ─────────────────────────────────────────────────────────────────

test('respeta el carga_cuenta que manda el backend', () => {
  // El backend es la autoridad: si la pantalla volviera a decidir, los tags y las filas
  // podrian discrepar.
  const t = totalesCajaCliente([
    { carga_cuenta: true, monto: 5000 },
    { carga_cuenta: false, monto: 2000 },
  ])
  assert.equal(t.cargado, 5000)
  assert.equal(t.informativos, 2000)
})

test('si el backend no lo manda, lo decide igual que el backend', () => {
  const t = totalesCajaCliente([{ id_cliente: CLI, tipo: 'cobro', monto: 5000 }])
  assert.equal(t.cargado, 5000)
})

test('el monto va en positivo', () => {
  assert.equal(totalesCajaCliente([{ carga_cuenta: true, monto: -5000 }]).cargado, 5000)
})

test('sin detalles, todo en cero', () => {
  assert.deepEqual(totalesCajaCliente([]), { cargado: 0, cantidad: 0, informativos: 0, cantidad_informativos: 0 })
  assert.deepEqual(totalesCajaCliente(null).cargado, 0)
})

// ── la ayuda del campo ──────────────────────────────────────────────────────

test('la ayuda dice que genera deuda, no como se llama el campo', () => {
  assert.match(ayudaCuentaDetalle('cobro'), /debe/)
  assert.match(ayudaCuentaDetalle('gasto'), /debe/)
})

test('en un cobro aclara que no cambia el cuadre', () => {
  // Es la duda inmediata de quien carga: si atribuir la venta a alguien le va a descuadrar
  // la caja. No se la cambia.
  assert.match(ayudaCuentaDetalle('cobro'), /cuadre/)
})

test('en informativo explica por que no se puede y que hacer', () => {
  const a = ayudaCuentaDetalle('informativo')
  assert.match(a, /no mueve/)
  assert.match(a, /cobro o gasto/)
})

test('sin clasificacion la ayuda NO invita a elegir un cliente', () => {
  // El campo esta deshabilitado en ese caso: decir "elegilo aca" manda a hacer algo que no
  // se puede. Es la trampa del fallback 'cobro' otra vez.
  const a = ayudaCuentaDetalle(null)
  assert.match(a, /cobro o gasto/)
  assert.ok(!/elegilo/.test(a), `invita a elegir estando deshabilitado: "${a}"`)
})

test('la ayuda nunca queda vacia', () => {
  for (const c of ['cobro', 'gasto', 'informativo', null, '', 'fucsia']) {
    assert.ok(ayudaCuentaDetalle(c).length > 0, `sin ayuda para ${c}`)
  }
})

// ── las ventanas de la ficha ────────────────────────────────────────────────

test('dos ventanas, cada una con etiqueta y ayuda', () => {
  assert.deepEqual(VENTANAS, ['pagos', 'cajas'])
  for (const v of VENTANAS) {
    assert.ok(VENTANA_INFO[v]?.label, `${v} sin etiqueta`)
    assert.ok(VENTANA_INFO[v]?.ayuda, `${v} sin ayuda`)
  }
})

test('valida contra la lista', () => {
  assert.equal(esVentanaValida('cajas'), true)
  assert.equal(esVentanaValida('movimientos'), false)
})

test('abre en cajas si toda la deuda esta en cajas', () => {
  // Entrar a "Pagos" vacio cuando la deuda esta en cajas hace parecer que no debe nada.
  assert.equal(ventanaInicial({ pagos: 0, cajas: 3 }), 'cajas')
})

test('abre en pagos si hay pagos', () => {
  assert.equal(ventanaInicial({ pagos: 2, cajas: 5 }), 'pagos')
  assert.equal(ventanaInicial({ pagos: 2, cajas: 0 }), 'pagos')
})

test('sin nada abre en pagos', () => {
  // Es la ventana historica: un cliente sin movimientos no tiene por que abrir en la nueva.
  assert.equal(ventanaInicial({ pagos: 0, cajas: 0 }), 'pagos')
  assert.equal(ventanaInicial(), 'pagos')
})

// ── CONTRATO con el backend ─────────────────────────────────────────────────

test('CONTRATO: las clasificaciones que cargan son las mismas que en el backend', () => {
  // Si el backend acepta una clasificacion que el frontend no habilita (o al reves), el
  // campo se puede completar y el guardado falla, o el total de la ficha no coincide con
  // el del listado.
  const src = readFileSync(
    new URL('../../../backend/src/lib/cuentaCorrienteCaja.js', import.meta.url), 'utf8'
  )
  const m = src.match(/export const CLASIFICACIONES_QUE_CARGAN = \[([^\]]+)\]/)
  assert.ok(m, 'no se encontro CLASIFICACIONES_QUE_CARGAN en el backend')
  const delBackend = m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
  assert.deepEqual(CLASIFICACIONES_QUE_CARGAN, delBackend)
})

test('CONTRATO: el backend devuelve carga_cuenta en la ficha', () => {
  // La pantalla confia en ese campo. Si la ruta deja de mandarlo, el respaldo local tapa el
  // problema y los numeros pueden discrepar sin que nada falle.
  const ruta = readFileSync(
    new URL('../../../backend/src/routes/clientes.js', import.meta.url), 'utf8'
  )
  assert.match(ruta, /carga_cuenta:/)
})
