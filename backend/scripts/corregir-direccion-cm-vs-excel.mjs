// Corrige la dirección (`ingreso`) de los movimientos de Caja Mayor contra el
// signo del export de la app vieja, que es el dato original.
//
// EL PROBLEMA
//
// En el AppSheet el signo vivía DENTRO del importe (negativo = sale de la caja
// mayor). Acá el importe es positivo y la dirección va en `ingreso`. Para las
// copias de ops de gestión la dirección no se migró desde ese signo: la calcula
// `direccionCajaMayor()`, que invierte `ingresa_egreso` del pago y corrige a mano
// los rubros que se pagan DESDE la caja mayor (Sueldos, Socios, Honorarios).
//
// Esa regla no alcanza: en LOS GALGOS 14 movimientos de rubro Sueldos quedaron al
// revés del Excel y solos inflaban el saldo de $8.154.379 a $179.927.379. Un
// sueldo puede ser plata que sale de la caja mayor (se paga desde ahí) o que
// entra (el local manda el efectivo para pagarlos), y con un booleano del lado
// del local no se distingue.
//
// LA CORRECCIÓN
//
// Donde el Excel tiene la fila, su signo manda. Se escribe `ingreso` y se marca
// `direccion_manual = true`, que es el mecanismo que ya existe para que la
// sincronización con gestión no vuelva a pisar la dirección con la regla.
//
// No toca:
//   - lo que no está en el Excel (ops cargadas después del export): ahí la regla
//     es lo único que hay,
//   - lo que ya tiene `direccion_manual = true` con la dirección del Excel (nada
//     que hacer),
//   - los importes, los estados ni nada más.
//
//   node scripts/corregir-direccion-cm-vs-excel.mjs                        -> dry run (lab/test)
//   CONFIRMO_PROD=si PROD_URL=... node scripts/corregir-direccion-cm-vs-excel.mjs --prod
//   CONFIRMO_PROD=si PROD_URL=... node scripts/corregir-direccion-cm-vs-excel.mjs --prod --aplicar
import { PrismaClient } from '@prisma/client'
import * as XLSX from '../../frontend/node_modules/xlsx/xlsx.mjs'
import fs from 'node:fs'

const APLICAR = process.argv.includes('--aplicar')
const PROD = process.argv.includes('--prod')
const SOLO = (process.argv.find((a) => a.startsWith('--local=')) ?? '').slice(8) || null
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

const p = new PrismaClient({ datasources: { db: { url: URL } } })
const f$ = (n) => '$' + Math.round(n).toLocaleString('es-AR')
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }

// ── el Excel: local + Orden -> signo ────────────────────────────────────────
const wb = XLSX.read(fs.readFileSync(XLSX_PATH), { cellDates: true })
const signo = new Map()   // `local|orden|moneda` -> true (entra) / false (sale) / '__AMBIGUO__'
for (const [hoja, moneda] of [['CM', 'ARS'], ['CM_DOLAR', 'USD']]) {
  for (const f of XLSX.utils.sheet_to_json(wb.Sheets[hoja], { defval: null })) {
    const local = NOMBRE_POR_ID[f.EmpresaEnvia]
    const orden = String(f.Orden ?? '')
    if (!local || !orden) continue
    const imp = num(f.IMPORTE ?? f[' IMPORTE'])
    if (imp === 0) continue
    const k = `${local}|${orden}|${moneda}`
    const entra = imp > 0
    const previo = signo.get(k)
    if (previo === undefined) signo.set(k, entra)
    else if (previo !== entra) signo.set(k, '__AMBIGUO__')
  }
}

// ── los movimientos ─────────────────────────────────────────────────────────
const movs = await p.$queryRawUnsafe(`
  SELECT mc.id, mc.origen::text origen, mc.estado::text estado, mc.moneda::text moneda,
         mc.ingreso, mc.importe, mc.direccion_manual, mc.observaciones,
         pg.nro_ord, r.nombre rubro, l.nombre local
  FROM movimientos_cm mc
  JOIN locales l ON l.id = mc.id_local
  LEFT JOIN pagos pg ON pg.id = mc.id_pago
  LEFT JOIN rubcat rc ON rc.id = pg.id_rubcat
  LEFT JOIN rubros r ON r.id = rc.id_rub
  ${SOLO ? 'WHERE l.nombre = $1' : ''}
  ORDER BY l.nombre`, ...(SOLO ? [SOLO] : []))

console.log(APLICAR ? `=== APLICANDO (${PROD ? 'PRODUCCIÓN' : 'lab/test'}) ===` : '=== DRY RUN ===')
console.log(`movimientos leidos: ${movs.length}${SOLO ? ` (solo ${SOLO})` : ''}\n`)

const ordenDe = (m) => m.origen === 'PAGO' ? `OP-${m.nro_ord}` : String(m.observaciones ?? '').split(' — ')[0]
const cambios = []
let ok = 0, sinRef = 0, ambiguos = 0
for (const m of movs) {
  const ref = signo.get(`${m.local}|${ordenDe(m)}|${m.moneda}`)
  if (ref === undefined) { sinRef++; continue }
  if (ref === '__AMBIGUO__') { ambiguos++; continue }
  if (ref === (m.ingreso === true)) { ok++; continue }
  cambios.push({ ...m, orden: ordenDe(m), debeEntrar: ref })
}

console.log(`coinciden con el Excel: ${ok} · INVERTIDOS: ${cambios.length} · sin referencia: ${sinRef} · ambiguos: ${ambiguos}`)

// El efecto en el saldo, por local y moneda: es el número que la pantalla va a
// mostrar distinto, y lo que hay que poder mirar antes de aplicar.
const porLocal = new Map()
for (const c of cambios) {
  const k = `${c.local}|${c.moneda}`
  if (!porLocal.has(k)) porLocal.set(k, { local: c.local, moneda: c.moneda, n: 0, efecto: 0, rubros: new Map() })
  const a = porLocal.get(k)
  a.n++
  // Pasa de +importe a -importe (o al revés): el saldo se mueve el doble.
  a.efecto += (c.debeEntrar ? 2 : -2) * num(c.importe)
  const r = c.rubro ?? '(sin rubro)'
  a.rubros.set(r, (a.rubros.get(r) ?? 0) + 1)
}
console.log('\nefecto en el saldo por local:')
for (const a of [...porLocal.values()].sort((x, y) => Math.abs(y.efecto) - Math.abs(x.efecto))) {
  console.log(`  ${a.local.padEnd(20)} ${a.moneda} ${String(a.n).padStart(4)} movs  ${f$(a.efecto).padStart(18)}   ${[...a.rubros].map(([k, v]) => `${k}:${v}`).join(' ')}`)
}

if (!APLICAR) {
  console.log('\nPara aplicarlo: --aplicar')
} else {
  const respaldo = `backup-direccion-cm-${cambios.length}.json`
  fs.writeFileSync(respaldo, JSON.stringify(cambios.map((c) => ({
    id: c.id, local: c.local, orden: c.orden, importe: String(c.importe),
    ingreso_anterior: c.ingreso, ingreso_nuevo: c.debeEntrar,
    direccion_manual_anterior: c.direccion_manual,
  })), null, 1))
  console.log(`\nrespaldo: ${respaldo}`)

  await p.$transaction(async (tx) => {
    for (const entra of [true, false]) {
      const ids = cambios.filter((c) => c.debeEntrar === entra).map((c) => c.id)
      for (let i = 0; i < ids.length; i += 500) {
        const lote = ids.slice(i, i + 500)
        if (!lote.length) continue
        // `direccion_manual` en true: es el mecanismo que impide que la
        // sincronización con gestión vuelva a aplicar la regla y lo pise.
        await tx.movimientoCM.updateMany({
          where: { id: { in: lote } },
          data: { ingreso: entra, direccion_manual: true },
        })
      }
      console.log(`  ${entra ? 'ingreso' : 'egreso'}: ${ids.length} actualizados`)
    }
  })
  console.log('\nlisto')
}
await p.$disconnect()
