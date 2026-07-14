import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mapTurno } from './mapping.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const turno = JSON.parse(readFileSync(join(__dirname, '__fixtures__/turno-ejemplo.json'), 'utf8'))

test('mapTurno arma la fila de Caja desde header/sales/fiscal', () => {
  const { caja } = mapTurno(turno)
  assert.equal(caja.id_externo, '237719609')
  assert.equal(caja.nro_turno, '675')
  assert.equal(caja.cajero, 'plataformas')
  assert.equal(caja.total.toString(), '576500')
  assert.equal(caja.efectivo.toString(), '28500')
  assert.equal(caja.fiscal.toString(), '538600')
  assert.equal(caja.comensales, 0)
  assert.equal(caja.fecha_inicio.toISOString(), new Date(1784020409463).toISOString())
  assert.equal(caja.fecha_cierre.toISOString(), new Date(1784033303222).toISOString())
})

test('mapTurno arma un CajaMovimiento por cada item de cobranzas, con signo positivo', () => {
  const { movimientos } = mapTurno(turno)
  const cobros = movimientos.filter((m) => m.tipo === 'COBRO')
  assert.equal(cobros.length, 3) // 2 en la caja de alexis + 1 en la de dylan
  assert.ok(cobros.every((m) => m.monto > 0))
  assert.deepEqual(
    cobros.map((m) => m.monedaname).sort(),
    ['Efectivo', 'MP Point', 'MP Point'].sort()
  )
})

test('mapTurno arma los detalles que siempre se crean (Delivery/Takeaway/Salon/Web/Tarjetas/CtaCte)', () => {
  const { detallesSiempre } = mapTurno(turno)
  const porNombre = Object.fromEntries(detallesSiempre.map((d) => [d.nombre, d.monto]))
  assert.equal(porNombre['Delivery'], 0)
  assert.equal(porNombre['Takeaway'], 576500)
  assert.equal(porNombre['Salón'], 0)
  assert.equal(porNombre['Web'], 0)
  assert.equal(porNombre['Tarjetas'], 515600)
  assert.equal(porNombre['Cta Cte'], 0)
})

test('mapTurno arma "A Cobrar" en detallesSiOcurren cuando cobrarmonto > 0, y NO arma Mesas Abiertas si abiertasmonto es 0', () => {
  const { detallesSiOcurren } = mapTurno(turno)
  const nombres = detallesSiOcurren.map((d) => d.nombre)
  assert.ok(nombres.includes('A Cobrar'))
  assert.ok(!nombres.includes('Mesas Abiertas'))
  const aCobrar = detallesSiOcurren.find((d) => d.nombre === 'A Cobrar')
  assert.equal(aCobrar.monto, 32400)
})
