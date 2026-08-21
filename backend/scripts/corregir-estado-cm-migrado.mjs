// Corrige el estado de los movimientos de Caja Mayor que vinieron de la app
// vieja: la migración leyó al revés el ciclo del AppSheet.
//
// EL ERROR
//
// `migrar-caja-mayor.mjs` asumió que el estado viejo "ESTUDIO" era el equivalente
// de ENVIADA (op mandada, esperando que el CM confirme) y que "RECIBIDA" era
// RECIBIDA. Es al revés, confirmado por el usuario el 2026-08-21: en la app
// vieja "ESTUDIO" quería decir que la plata YA ESTABA en el estudio -- o sea
// recibida-- y "RECIBIDA" era la op que el local acababa de enviar.
//
//   ESTUDIO  -> RECIBIDA   (3.047 movimientos)
//   RECIBIDA -> ENVIADA    (302 movimientos)
//
// QUÉ TOCA Y QUÉ NO
//
// La migración tuvo DOS patas y las dos quedaron mal, por el mismo motivo:
//
//   1. El histórico del Excel -> movimientos origen PROPIO, reconocibles por el
//      Orden de la app vieja al principio de las observaciones. Los tres
//      prefijos que usó la app: "CM-" y "OP-" en pesos y "CMD-" en dólares.
//   2. Las ops CM que YA estaban en gestión -> movimientos origen PAGO creados
//      por el backfill del alta del módulo (todos el 2026-08-07 19:02-19:03).
//      Nacieron con el ENVIADA por defecto del modelo, pero en la app vieja esas
//      mismas filas estaban en ESTUDIO: son las que el usuario seguía viendo mal
//      en LOS GALGOS (101 movimientos, y en el Excel sus 286 filas son todas
//      ESTUDIO). Se cruzan por local + OP-<nro_ord> + moneda.
//
// No toca:
//   - los movimientos PAGO creados DESPUÉS del backfill: esos son ops cargadas
//     en la app nueva y su ENVIADA es real (una op recién cargada está enviada),
//   - los cargados a mano en el módulo (sin Orden viejo en las observaciones),
//   - ninguno que tenga `recibida_at` (alguien lo confirmó en el módulo: ese
//     estado lo puso una persona, no la migración),
//   - los que no aparecen en el Excel: Local Testing y LORETO nunca estuvieron
//     en el AppSheet, así que no hay dato viejo que respetar. Se informan.
//
// El estado nuevo NO se calcula invirtiendo el actual, se lee del Excel original
// fila por fila (cruce por el Orden, y por Orden+importe+moneda cuando un Orden
// se repite entre locales). Un Orden que sigue siendo ambiguo se informa y se
// deja intacto: mejor 14 filas para mirar a mano que 14 estados inventados.
//
//   node scripts/corregir-estado-cm-migrado.mjs                        -> dry run (lab/test)
//   CONFIRMO_PROD=si PROD_URL=... node scripts/corregir-estado-cm-migrado.mjs --prod
//   CONFIRMO_PROD=si PROD_URL=... node scripts/corregir-estado-cm-migrado.mjs --prod --aplicar
import { PrismaClient } from '@prisma/client'
import * as XLSX from '../../frontend/node_modules/xlsx/xlsx.mjs'
import fs from 'node:fs'

const APLICAR = process.argv.includes('--aplicar')
const PROD = process.argv.includes('--prod')
const URL = PROD ? process.env.PROD_URL : process.env.LAB_URL
if (PROD) {
  if (process.env.CONFIRMO_PROD !== 'si') { console.error('Producción exige CONFIRMO_PROD=si. Abortado.'); process.exit(1) }
  if (!URL || !/\/postgres\?/.test(URL)) { console.error('PROD_URL tiene que apuntar a la base `postgres`. Abortado.'); process.exit(1) }
} else if (!URL || !/dcsmart_(test|lab)/.test(URL)) {
  console.error('LAB_URL tiene que apuntar a dcsmart_test o dcsmart_lab. Abortado.')
  process.exit(1)
}

const XLSX_PATH = 'C:/Users/agusl/Repos/dcsmart-apps/dcsmart/app vieja caja mayor/DC-CAJA MAYOR.xlsx'
if (!fs.existsSync(XLSX_PATH)) { console.error(`No está el export de la app vieja: ${XLSX_PATH}`); process.exit(1) }

// El estado nuevo de cada estado viejo. Lo que la migración hizo al revés.
const ESTADO_NUEVO = { ESTUDIO: 'RECIBIDA', RECIBIDA: 'ENVIADA' }

const p = new PrismaClient({ datasources: { db: { url: URL } } })
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
// La misma clave con la que se puede reconocer una fila del Excel en la base:
// el importe se compara en valor absoluto porque al migrar el signo se movió a
// `ingreso`, y redondeado al peso porque el Decimal(12,2) de la base y el float
// del Excel no son el mismo número.
const clave = (orden, importe, moneda) => `${orden}|${Math.round(Math.abs(num(importe)))}|${moneda}`

// EmpresaEnvia (id de AppSheet) -> nombre del local, igual que en
// migrar-caja-mayor.mjs: el export solo trae el id. Hace falta para cruzar los
// movimientos origen PAGO, donde el Orden (OP-####) se repite entre locales y el
// local es lo único que desempata.
const NOMBRE_POR_ID = {
  deb7f085: 'DOGG', '6cda1b65': 'EVELIA', '6cda1b66': 'TOGNIS-CAFE', '6cda1b67': 'TOGNIS-PIZZA',
  d77f7289: 'LA FUERZA', '6cda1b69': 'LF B2B', e5b7eb5f: 'ROMA',
  becc0667: 'BASA', d77f7288: 'GRAN-DANZON', a6e600f0: 'PUERTO-RETIRO',
  '64356': '878 BAR', '6cda1b45': '878COOP', '6cda1b68': 'LOS GALGOS',
  O12UIE2U: 'TITA', OR8GO56T: 'TITA-CH', ccf146ee: 'Estudio DC',
  '546ergft': 'TI AMO', '54676ergft': 'CAPRICCHIO', '546eFGHF': 'SORELLINA',
  '56754ghjg': 'ALACENA', KHBJON435: 'LATINO TACUARI 185', FGHDVTV: 'LATINO PASEO',
  FNHTYHERG: 'GALLOSI', OLHGEOYQ: 'ALDOS', LTRXNBIR: 'GRIS GRIS', J45J3822: 'LUCERO',
  sdfghjfvfd: 'ADA',
}

// El backfill de las ops de gestión corrió entero en dos minutos. Todo lo PAGO
// creado después es la app nueva funcionando, y no se toca.
const FIN_BACKFILL = new Date('2026-08-07T19:10:00.000Z')

// ── el Excel ────────────────────────────────────────────────────────────────
const wb = XLSX.read(fs.readFileSync(XLSX_PATH), { cellDates: true })
const filas = []
for (const [hoja, moneda] of [['CM', 'ARS'], ['CM_DOLAR', 'USD']]) {
  for (const f of XLSX.utils.sheet_to_json(wb.Sheets[hoja], { defval: null })) {
    filas.push({
      orden: String(f.Orden ?? ''),
      importe: f.IMPORTE ?? f[' IMPORTE'],
      estado: f['ESTADO OP'],
      local: NOMBRE_POR_ID[f.EmpresaEnvia] ?? null,
      moneda,
    })
  }
}

// Dos índices: por Orden y por Orden+importe+moneda. El segundo desempata los
// Orden repetidos entre locales.
const porOrden = new Map()
const porClave = new Map()
// Y uno más para las ops de gestión: local + Orden + moneda.
const porLocalOrden = new Map()
const sumar = (mapa, k, estado) => {
  const previo = mapa.get(k)
  if (previo === undefined) mapa.set(k, estado)
  else if (previo !== estado) mapa.set(k, '__AMBIGUO__')
}
for (const f of filas) {
  if (!f.orden) continue
  sumar(porOrden, f.orden, f.estado)
  sumar(porClave, clave(f.orden, f.importe, f.moneda), f.estado)
  if (f.local && f.orden.startsWith('OP-')) sumar(porLocalOrden, `${f.local}|${f.orden}|${f.moneda}`, f.estado)
}

// ── los migrados en la base ─────────────────────────────────────────────────
const migrados = await p.$queryRawUnsafe(`
  SELECT m.id, m.estado::text estado, m.moneda::text moneda, m.importe, m.recibida_at,
         split_part(m.observaciones, ' — ', 1) orden, l.nombre local
  FROM movimientos_cm m JOIN locales l ON l.id = m.id_local
  WHERE m.origen = 'PROPIO' AND m.observaciones ~ '^(CMD?|OP)-'
  ORDER BY l.nombre, m.fecha`)

console.log(APLICAR ? `=== APLICANDO (${PROD ? 'PRODUCCIÓN' : 'lab/test'}) ===` : '=== DRY RUN ===')
console.log(`migrados encontrados: ${migrados.length}\n`)

const cambios = []
const saltados = { yaConfirmado: [], ambiguo: [], sinEstado: [], sinMatch: [], yaCorrecto: [] }

for (const m of migrados) {
  if (m.recibida_at) { saltados.yaConfirmado.push(m); continue }
  // Primero la clave completa; si ese Orden+importe no está o es ambiguo, el
  // Orden solo. Si las dos son ambiguas, no se toca.
  let viejo = porClave.get(clave(m.orden, m.importe, m.moneda))
  if (viejo === undefined || viejo === '__AMBIGUO__') viejo = porOrden.get(m.orden)
  if (viejo === undefined) { saltados.sinMatch.push(m); continue }
  if (viejo === '__AMBIGUO__') { saltados.ambiguo.push(m); continue }
  if (viejo == null) { saltados.sinEstado.push(m); continue }

  const nuevo = ESTADO_NUEVO[String(viejo).toUpperCase()]
  if (!nuevo) { saltados.sinEstado.push(m); continue }
  if (nuevo === m.estado) { saltados.yaCorrecto.push(m); continue }
  cambios.push({ ...m, viejo, nuevo })
}

// ── pata 2: las ops de gestión que copió el backfill del alta del módulo ────
const delBackfill = await p.$queryRawUnsafe(`
  SELECT mc.id, mc.estado::text estado, mc.moneda::text moneda, mc.importe, mc.recibida_at,
         mc.created_at, l.nombre local, pg.nro_ord
  FROM movimientos_cm mc JOIN locales l ON l.id = mc.id_local
  LEFT JOIN pagos pg ON pg.id = mc.id_pago
  WHERE mc.origen = 'PAGO' AND mc.created_at < $1
  ORDER BY l.nombre, pg.nro_ord`, FIN_BACKFILL)
console.log(`copias de gestion del backfill: ${delBackfill.length}`)

for (const m of delBackfill) {
  if (m.recibida_at) { saltados.yaConfirmado.push(m); continue }
  const viejo = porLocalOrden.get(`${m.local}|OP-${m.nro_ord}|${m.moneda}`)
  if (viejo === undefined) { saltados.sinMatch.push({ ...m, orden: `OP-${m.nro_ord}` }); continue }
  if (viejo === '__AMBIGUO__') { saltados.ambiguo.push({ ...m, orden: `OP-${m.nro_ord}` }); continue }
  const nuevo = ESTADO_NUEVO[String(viejo ?? '').toUpperCase()]
  if (!nuevo) { saltados.sinEstado.push({ ...m, orden: `OP-${m.nro_ord}` }); continue }
  if (nuevo === m.estado) { saltados.yaCorrecto.push(m); continue }
  cambios.push({ ...m, orden: `OP-${m.nro_ord}`, viejo, nuevo })
}

const porTransicion = new Map()
for (const c of cambios) {
  const k = `${c.viejo} (base: ${c.estado}) -> ${c.nuevo}`
  porTransicion.set(k, (porTransicion.get(k) ?? 0) + 1)
}
console.log('cambios a aplicar:')
for (const [k, n] of [...porTransicion].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(5)}  ${k}`)

const f$ = (n) => '$' + Math.round(n).toLocaleString('es-AR')
const neto = (lista, moneda) => lista.filter((c) => c.moneda === moneda)
  .reduce((a, c) => a + Number(c.importe ?? 0), 0)
console.log(`\nimporte que cambia de estado: ARS ${f$(neto(cambios, 'ARS'))} · USD ${f$(neto(cambios, 'USD'))}`)
console.log(`saltados -> ya correcto: ${saltados.yaCorrecto.length} · ya confirmado en el modulo: ${saltados.yaConfirmado.length} · ` +
  `Orden ambiguo: ${saltados.ambiguo.length} · sin ESTADO OP en el Excel: ${saltados.sinEstado.length} · sin match: ${saltados.sinMatch.length}`)

for (const [rotulo, lista] of [['AMBIGUOS', saltados.ambiguo], ['SIN ESTADO', saltados.sinEstado], ['SIN MATCH', saltados.sinMatch]]) {
  if (!lista.length) continue
  console.log(`\n${rotulo} (quedan intactos, revisar a mano):`)
  for (const m of lista) console.log(`  ${m.local.padEnd(20)} ${m.orden.padEnd(12)} ${m.moneda} ${String(m.importe).padStart(14)}  estado actual: ${m.estado}`)
}

if (!APLICAR) {
  console.log('\nPara aplicarlo: --aplicar')
} else {
  // Respaldo del estado ANTERIOR de cada fila que se toca, antes de tocarla:
  // es una columna sola y sin esto no hay forma de volver atrás sin rehacer el
  // cruce con el Excel.
  const respaldo = `backup-estado-cm-${cambios.length}.json`
  fs.writeFileSync(respaldo, JSON.stringify(cambios.map((c) => ({ id: c.id, estado_anterior: c.estado, estado_nuevo: c.nuevo })), null, 1))
  console.log(`respaldo de los estados anteriores: ${respaldo}`)

  // En una transacción: es un cambio de estado masivo y a mitad de camino el
  // saldo de la caja mayor no querría decir nada.
  const porNuevo = { RECIBIDA: cambios.filter((c) => c.nuevo === 'RECIBIDA').map((c) => c.id), ENVIADA: cambios.filter((c) => c.nuevo === 'ENVIADA').map((c) => c.id) }
  await p.$transaction(async (tx) => {
    for (const [estado, ids] of Object.entries(porNuevo)) {
      // De a 500 ids: el techo de bind variables de Prisma ya rompió una
      // corrección antes (P2035), y 3.000 en un solo `in` lo pasa.
      for (let i = 0; i < ids.length; i += 500) {
        const lote = ids.slice(i, i + 500)
        if (!lote.length) continue
        await tx.movimientoCM.updateMany({ where: { id: { in: lote } }, data: { estado } })
      }
      console.log(`  ${estado}: ${ids.length} actualizados`)
    }
  })
  console.log('\nlisto')
}
await p.$disconnect()
