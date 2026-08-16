import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  TEMAS, CLAVE, ETIQUETA_TEMA, esTemaValido,
  leerPreferencia, guardarPreferencia, temaEfectivo, atributosDelTema,
  siguienteTema, estadoBoton,
} from './tema.js'

// Un localStorage de mentira, y uno que falla como en modo privado.
const almacen = (inicial = {}) => {
  const datos = { ...inicial }
  return {
    getItem: (k) => (k in datos ? datos[k] : null),
    setItem: (k, v) => { datos[k] = String(v) },
    _datos: datos,
  }
}
const almacenRoto = () => ({
  getItem: () => { throw new Error('bloqueado') },
  setItem: () => { throw new Error('bloqueado') },
})

test('los tres temas, con etiqueta cada uno', () => {
  assert.deepEqual(TEMAS, ['sistema', 'claro', 'oscuro'])
  for (const t of TEMAS) assert.ok(ETIQUETA_TEMA[t], `${t} sin etiqueta`)
})

test('valida contra la lista', () => {
  assert.equal(esTemaValido('claro'), true)
  assert.equal(esTemaValido('light'), false)
  assert.equal(esTemaValido(null), false)
})

// ── preferencia guardada ────────────────────────────────────────────────────

test('sin nada guardado, sigue al sistema', () => {
  // El default es 'sistema' y no 'oscuro': la app arranca acompañando al sistema operativo.
  assert.equal(leerPreferencia(almacen()), 'sistema')
})

test('lee lo guardado', () => {
  assert.equal(leerPreferencia(almacen({ [CLAVE]: 'claro' })), 'claro')
})

test('basura guardada se ignora en vez de romper', () => {
  assert.equal(leerPreferencia(almacen({ [CLAVE]: 'fucsia' })), 'sistema')
})

test('un localStorage que TIRA no impide abrir la app', () => {
  // Pasa en modo privado y con las cookies bloqueadas.
  assert.equal(leerPreferencia(almacenRoto()), 'sistema')
  assert.equal(guardarPreferencia(almacenRoto(), 'claro'), false)
})

test('sin almacen tampoco rompe', () => {
  assert.equal(leerPreferencia(undefined), 'sistema')
  assert.equal(guardarPreferencia(undefined, 'claro'), true)
})

test('guarda solo valores validos', () => {
  const a = almacen()
  assert.equal(guardarPreferencia(a, 'oscuro'), true)
  assert.equal(a._datos[CLAVE], 'oscuro')
  assert.equal(guardarPreferencia(a, 'fucsia'), false)
  assert.equal(a._datos[CLAVE], 'oscuro', 'no se piso con el valor invalido')
})

// ── tema efectivo ───────────────────────────────────────────────────────────

test('claro y oscuro fijos ignoran al sistema', () => {
  assert.equal(temaEfectivo('claro', true), 'claro')
  assert.equal(temaEfectivo('oscuro', false), 'oscuro')
})

test('sistema resuelve contra el sistema operativo', () => {
  assert.equal(temaEfectivo('sistema', true), 'oscuro')
  assert.equal(temaEfectivo('sistema', false), 'claro')
})

test('sin saber que dice el sistema, oscuro', () => {
  // Es como se ve la app desde siempre: arrancar en claro seria un cambio visual para
  // todos los que no eligieron nada.
  assert.equal(temaEfectivo('sistema', undefined), 'oscuro')
  assert.equal(temaEfectivo('sistema', null), 'oscuro')
})

test('el efectivo nunca es "sistema"', () => {
  for (const pref of TEMAS) {
    for (const sis of [true, false, undefined]) {
      assert.notEqual(temaEfectivo(pref, sis), 'sistema')
    }
  }
})

// ── lo que se le pone al <html> ─────────────────────────────────────────────

test('color-scheme acompaña al tema', () => {
  // Sin esto el navegador dibuja los select, los date y las scrollbars con el esquema del
  // sistema mientras el CSS pinta encima: en claro con Windows oscuro, desplegable negro
  // con letra negra.
  assert.deepEqual(atributosDelTema('claro'), { 'data-tema': 'claro', colorScheme: 'light' })
  assert.deepEqual(atributosDelTema('oscuro'), { 'data-tema': 'oscuro', colorScheme: 'dark' })
})

// ── el ciclo del boton ──────────────────────────────────────────────────────

test('el boton cicla por los tres y vuelve', () => {
  // Con dos posiciones no se puede volver a "seguir al sistema" una vez que se salio.
  assert.equal(siguienteTema('sistema'), 'claro')
  assert.equal(siguienteTema('claro'), 'oscuro')
  assert.equal(siguienteTema('oscuro'), 'sistema')
})

test('desde un valor raro, vuelve al ciclo', () => {
  assert.equal(siguienteTema('fucsia'), 'sistema')
  assert.equal(siguienteTema(undefined), 'sistema')
})

test('el icono habla de lo que SE VE y el texto de lo que se ELIGIO', () => {
  // Con "sistema" los dos datos son distintos y hacen falta los dos.
  const e = estadoBoton('sistema', true)
  assert.equal(e.icono, 'luna')
  assert.equal(e.etiqueta, 'Como el sistema')
  assert.equal(e.efectivo, 'oscuro')

  const c = estadoBoton('sistema', false)
  assert.equal(c.icono, 'sol')
  assert.equal(c.etiqueta, 'Como el sistema')
})

test('con tema fijo, el icono y el texto coinciden', () => {
  assert.equal(estadoBoton('claro', true).icono, 'sol')
  assert.equal(estadoBoton('claro', true).etiqueta, 'Claro')
})

test('la ayuda dice que va a pasar al hacer clic', () => {
  assert.match(estadoBoton('sistema', true).ayuda, /fijar claro/)
  assert.match(estadoBoton('oscuro', true).ayuda, /volver a seguir al sistema/)
})

// ── contrato con el CSS ─────────────────────────────────────────────────────

test('CONTRATO: el CSS define el tema claro con el mismo atributo', () => {
  // Si el JS pone data-tema y el CSS escucha otra cosa, el boton no hace nada visible.
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8')
  assert.ok(
    /\[data-tema=["']claro["']\]/.test(css),
    'app.css no define los colores del tema claro bajo [data-tema="claro"]'
  )
})

// ── contraste del tema claro ────────────────────────────────────────────────
//
// Un tema claro se rompe por contraste, no por sintaxis: el CSS compila igual con un gris
// que no se lee. Estos numeros se midieron al elegir la paleta y quedan fijados aca.

const hexARgb = (h) => {
  const x = h.replace('#', '')
  return [0, 2, 4].map(i => parseInt(x.slice(i, i + 2), 16))
}
const luminancia = (rgb) => {
  const [r, g, b] = rgb.map(v => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contraste = (a, b) => {
  const [la, lb] = [luminancia(a), luminancia(b)]
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}
// Un rgba compuesto sobre el fondo: es lo que el ojo ve.
const sobre = (rgb, alfa, fondo) => rgb.map((c, i) => Math.round(c * alfa + fondo[i] * (1 - alfa)))

const bloqueClaro = () => {
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8')
  const i = css.indexOf(':root[data-tema="claro"]')
  assert.ok(i > -1, 'no se encontro el bloque del tema claro')
  return css.slice(i, css.indexOf('\n}', i))
}
const variable = (bloque, nombre) => {
  const m = bloque.match(new RegExp(`--${nombre}:\\s*([^;]+);`))
  assert.ok(m, `falta --${nombre} en el tema claro`)
  return m[1].trim()
}
const color = (valor, fondo) => {
  if (valor.startsWith('#')) return hexARgb(valor)
  const m = valor.match(/rgba?\(([^)]+)\)/)
  const p = m[1].split(',').map(x => parseFloat(x.trim()))
  return p.length > 3 ? sobre(p.slice(0, 3), p[3], fondo) : p.slice(0, 3)
}

test('CONTRASTE: el texto del tema claro se lee sobre el fondo', () => {
  const b = bloqueClaro()
  const fondo = hexARgb(variable(b, 'bg-app'))
  // 4.5x es el minimo de WCAG para texto normal; t3 y t4 son auxiliares (11px) y van a 3.0x.
  for (const [nombre, minimo] of [['t1', 4.5], ['t2', 4.5], ['t3', 3], ['t4', 3]]) {
    const r = contraste(color(variable(b, nombre), fondo), fondo)
    assert.ok(r >= minimo, `--${nombre} da ${r.toFixed(2)}x sobre bg-app y necesita ${minimo}x`)
  }
})

test('CONTRASTE: los colores de estado se leen sobre el fondo claro', () => {
  // Los del tema oscuro estan pensados para brillar sobre oscuro: el ambar #D4952A sobre
  // blanco casi no se lee. Estos son los oscurecidos.
  const b = bloqueClaro()
  const fondo = hexARgb(variable(b, 'bg-app'))
  for (const nombre of ['gold', 'green', 'red', 'blue', 'amber', 'purple']) {
    const r = contraste(color(variable(b, nombre), fondo), fondo)
    assert.ok(r >= 4.5, `--${nombre} da ${r.toFixed(2)}x sobre bg-app y necesita 4.5x`)
  }
})

test('CONTRASTE: el velo del tema claro es NEGRO, no blanco', () => {
  // Los fondos sutiles del tema oscuro son blanco transparente. Dejarlos blancos en claro
  // los hace invisibles: no hay tabla, ni tarjeta, ni input.
  const b = bloqueClaro()
  assert.match(variable(b, 'velo-rgb'), /^0,\s*0,\s*0$/)
})

test('CONTRASTE: el tema claro declara color-scheme light', () => {
  assert.match(bloqueClaro(), /color-scheme:\s*light/)
})

// ── superficies solidas ─────────────────────────────────────────────────────
//
// El primer intento del tema claro convirtio los velos (rgba blanco translucido) pero dejo
// los fondos SOLIDOS escritos a mano en hex oscuro. Resultado: el drawer de detalle de op y
// de caja quedaba negro con texto negro, y los encabezados de TODAS las tablas tambien.
// Compilaba y pasaba los tests de contraste, porque esos colores no eran variables.

const CSS = () => readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8')

// ── paridad de tokens de color entre temas ──────────────────────────────────
// Todo color de status definido en :root tiene que estar redefinido en el
// bloque claro: los que faltan quedan con el valor del tema oscuro y se lavan
// sobre fondo claro. Pasó con --teal/--orange en las stat-cards (1.7x-2.0x de
// contraste, mínimo 4.5x): las demás familias estaban adaptadas y esas dos no.
test('todo token de color de status tiene su versión clara', () => {
  const css = CSS()
  const bloque = (desde) => {
    const abre = css.indexOf('{', desde)
    let nivel = 1, i = abre + 1
    while (nivel > 0 && i < css.length) {
      if (css[i] === '{') nivel++
      if (css[i] === '}') nivel--
      i++
    }
    return css.slice(abre + 1, i - 1)
  }
  const root = bloque(css.indexOf(':root {'))
  const claro = bloque(css.indexOf(':root[data-tema="claro"]'))
  const FAMILIAS = ['green', 'red', 'blue', 'amber', 'purple', 'teal', 'orange']
  const tokensStatus = [...root.matchAll(/--([\w-]+):/g)]
    .map((m) => m[1])
    .filter((t) => FAMILIAS.some((f) => t === f || t.startsWith(`${f}-`)))
  assert.ok(tokensStatus.length >= 21, `se esperaban los tokens de status en :root (hay ${tokensStatus.length})`)
  for (const t of tokensStatus) {
    assert.ok(claro.includes(`--${t}:`), `--${t} no está redefinido en el tema claro (queda con el valor oscuro)`)
  }
})

// Rangos de linea de los bloques :root, donde un color literal SI corresponde.
const rangosRoot = (css) => {
  const out = []
  const re = /^:root[^{]*\{/gm
  let m
  while ((m = re.exec(css)) !== null) {
    const ini = css.slice(0, m.index).split('\n').length
    const cierre = css.indexOf('\n}', m.index)
    out.push([ini, css.slice(0, cierre).split('\n').length])
  }
  return out
}

const luminanciaDe = (literal) => {
  let rgb
  if (literal.startsWith('#')) {
    let h = literal.slice(1)
    if (h.length === 3) h = [...h].map((c) => c + c).join('')
    if (h.length < 6) return null
    rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  } else {
    const p = literal.match(/rgba?\(([^)]*)\)/)?.[1]?.split(',').map((x) => parseFloat(x.trim()))
    if (!p || p.length < 3) return null
    // Un alfa bajo es un velo sobre el fondo del tema, no una superficie: no aplica.
    if (p.length > 3 && p[3] < 0.75) return null
    rgb = p.slice(0, 3)
  }
  return luminancia(rgb)
}

test('NINGUN fondo solido oscuro escrito a mano fuera de las variables', () => {
  const css = CSS()
  const rangos = rangosRoot(css)
  const enRoot = (n) => rangos.some(([a, b]) => n >= a && n <= b)
  const lineas = css.split('\n')
  const culpables = []

  lineas.forEach((linea, i) => {
    const n = i + 1
    if (enRoot(n)) return
    const l = linea.trim()
    // Las sombras y los backdrop son negros a proposito en los dos temas.
    if (/shadow|backdrop|mask-image/.test(l)) return
    if (!/^background(-color)?\s*:/.test(l)) return
    for (const lit of l.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g) ?? []) {
      const L = luminanciaDe(lit)
      // Un fondo casi negro fijo tapa cualquier texto que el tema claro pinte oscuro.
      if (L != null && L < 0.15) culpables.push(`linea ${n}: ${l.slice(0, 70)}`)
    }
  })

  assert.deepEqual(culpables, [], `fondos oscuros fijos:\n  ${culpables.join('\n  ')}`)
})

test('las superficies solidas estan definidas en LOS DOS temas', () => {
  // Una variable definida solo en :root queda con el valor oscuro en tema claro, que es
  // exactamente el bug que se vino a corregir.
  const css = CSS()
  const claro = bloqueClaro()
  for (const v of ['bg-drawer', 'bg-drawer-head', 'bg-sticky', 'bg-toast', 'scroll-track', 'chevron']) {
    assert.match(css, new RegExp(`--${v}:`), `--${v} no existe`)
    assert.match(claro, new RegExp(`--${v}:`), `--${v} no esta redefinida en el tema claro`)
  }
})

test('el drawer y el sticky del tema claro se leen con el texto del tema claro', () => {
  const b = bloqueClaro()
  const t1 = color(variable(b, 't1'), [255, 255, 255])
  for (const superficie of ['bg-drawer', 'bg-drawer-head', 'bg-sticky']) {
    const fondo = color(variable(b, superficie), [255, 255, 255])
    const r = contraste(t1, fondo)
    assert.ok(r >= 4.5, `--t1 sobre --${superficie} da ${r.toFixed(2)}x y necesita 4.5x`)
  }
})

test('el th del tema claro se separa del fondo de la pagina', () => {
  // Si el sticky queda igual que el fondo, el encabezado se pierde entre las filas al
  // scrollear. No hace falta contraste de texto, solo que se distinga.
  const b = bloqueClaro()
  const app = hexARgb(variable(b, 'bg-app'))
  const th = color(variable(b, 'bg-sticky'), app)
  assert.notDeepEqual(th, app, '--bg-sticky es igual a --bg-app')
})

// ── tarjetas de totales de cuenta corriente ─────────────────────────────────
//
// Son texto de color sobre fondo del MISMO color (--red sobre --red-bg). Es la
// combinacion mas facil de romper al retocar una paleta, y no la cubre ningun test
// anterior porque los otros miden contra --bg-app.

const bloqueOscuro = () => {
  const css = CSS()
  const i = css.indexOf(':root {')
  return css.slice(i, css.indexOf('\n}', i))
}

const sobreTarjeta = (bloque, tono) => {
  const app = hexARgb(variable(bloque, 'bg-app'))
  const fondo = color(variable(bloque, `${tono}-bg`), app)
  return {
    fondo,
    valor: contraste(color(variable(bloque, tono), fondo), fondo),
    rotulo: contraste(color(variable(bloque, 't2'), fondo), fondo),
  }
}

test('CONTRASTE: el valor de las tarjetas se lee sobre su propio fondo tintado', () => {
  // El valor va en 22px bold: texto grande, minimo WCAG 3.0.
  for (const [nombre, bloque] of [['oscuro', bloqueOscuro()], ['claro', bloqueClaro()]]) {
    for (const tono of ['red', 'blue', 'green']) {
      const { valor } = sobreTarjeta(bloque, tono)
      assert.ok(valor >= 3, `tema ${nombre}: --${tono} sobre --${tono}-bg da ${valor.toFixed(2)}x y necesita 3x`)
    }
  }
})

test('CONTRASTE: el rotulo de las tarjetas usa --t2, no --t3', () => {
  // El rotulo es 10px en mayusculas: con --t3 daba 3,07x. Se subio a --t2 (5,4x) porque
  // esta pantalla se rehizo por legibilidad. Si vuelve a --t3, este test avisa.
  const css = CSS()
  const i = css.indexOf('.cta-kpi-rotulo')
  assert.ok(i > -1, 'no existe .cta-kpi-rotulo')
  const regla = css.slice(i, css.indexOf('}', i))
  assert.match(regla, /color:\s*var\(--t2\)/)

  for (const [nombre, bloque] of [['oscuro', bloqueOscuro()], ['claro', bloqueClaro()]]) {
    for (const tono of ['red', 'blue', 'green']) {
      const { rotulo } = sobreTarjeta(bloque, tono)
      assert.ok(rotulo >= 4.5, `tema ${nombre}: --t2 sobre --${tono}-bg da ${rotulo.toFixed(2)}x y necesita 4.5x`)
    }
  }
})

// ── fondos de lo que se queda quieto mientras algo scrollea ─────────────────
//
// Un elemento sticky con fondo translucido deja ver pasar el contenido por debajo. Paso
// tres veces en el mismo dia: el drawer del tema claro, las columnas fijas de la tabla de
// pagos, y el cartel del cuadre -- ahi por cascada, porque la clase del semaforo tiene dos
// clases y le ganaba por especificidad a la que ponia el fondo opaco.
//
// Este test recorre las reglas que se quedan quietas y exige un `background-color` opaco:
// un token solido, o un rgba con alfa >= 0.9. Un `background` shorthand con un token `--*-bg`
// (que son tintes de ~12%) no pasa.

const OPACOS = ['--bg-app', '--bg-sidebar', '--bg-elevated', '--bg-drawer', '--bg-drawer-head', '--bg-sticky', '--bg-menu']

// Reglas que tienen que ser opacas, y por que.
const REGLAS_QUIETAS = [
  ['.cuadre-vivo-sticky', 'el cartel del cuadre queda fijo arriba del formulario'],
  ['.cuadre-vivo.cuadre-cuadra', 'el semaforo pisa el fondo del sticky por especificidad'],
  ['.cuadre-vivo.cuadre-no-cuadra', 'idem'],
  ['.cuadre-vivo.cuadre-sin-datos', 'idem'],
  ['.data-table td.col-fija', 'las columnas fijas dejan pasar las que se deslizan'],
  ['.data-table th.col-fija', 'idem, en el encabezado'],
  // El hover de las filas clickeables (tr.row-clickable:hover td) le gana en
  // cascada a td.col-fija: si esta regla no repone el fondo opaco, en hover se
  // transparentan las columnas fijas y el texto se ve pasar por debajo.
  ['.data-table tbody tr:hover td.col-fija', 'el hover de la fila pisa el fondo opaco de las fijas'],
]

const SALTO = String.fromCharCode(10)
const reglaDe = (css, selector) => {
  // Se busca el selector como regla PROPIA y no como substring: la linea que arranca con el
  // selector y sigue con `{` o `,`. Sin regex a proposito -- escapar un selector con puntos
  // y corchetes para meterlo en un RegExp es mas facil de romper que de leer.
  const lineas = css.split(SALTO)
  const idx = lineas.findIndex((l) => {
    const t = l.trim()
    if (!t.startsWith(selector)) return false
    const sigue = t.slice(selector.length).trimStart()[0]
    return sigue === '{' || sigue === ','
  })
  assert.ok(idx > -1, `no existe la regla ${selector}`)
  const desde = css.indexOf(lineas[idx])
  const abre = css.indexOf('{', desde)
  return css.slice(abre + 1, css.indexOf('}', abre))
}


test('lo que se queda quieto tiene fondo OPACO', () => {
  const css = CSS()
  for (const [selector, motivo] of REGLAS_QUIETAS) {
    const regla = reglaDe(css, selector)
    const m = regla.match(/background-color:\s*([^;]+);/)
    assert.ok(m, `${selector} no declara background-color (${motivo}). Un \`background\` shorthand con un token --*-bg es un tinte translucido.`)
    const valor = m[1].trim()
    const token = valor.match(/var\((--[\w-]+)\)/)?.[1]
    if (token) {
      assert.ok(OPACOS.includes(token), `${selector} usa ${token}, que no es un fondo opaco (${motivo})`)
    } else {
      const alfa = valor.match(/rgba?\([^)]*,\s*([\d.]+)\s*\)/)?.[1]
      assert.ok(!alfa || Number(alfa) >= 0.9, `${selector} usa alfa ${alfa} (${motivo})`)
    }
  }
})

test('los tokens que se dan por opacos lo son de verdad', () => {
  // Si alguno pasara a ser un velo, el test de arriba dejaria de proteger nada.
  const css = CSS()
  for (const bloque of [bloqueOscuro(), bloqueClaro()]) {
    for (const t of OPACOS) {
      const m = bloque.match(new RegExp(`${t}:\s*([^;]+);`))
      if (!m) continue // --bg-menu se saco; si no esta, no hay nada que validar
      const v = m[1].trim()
      const alfa = v.match(/rgba?\([^)]*,\s*([\d.]+)\s*\)/)?.[1]
      assert.ok(!alfa || Number(alfa) >= 0.9, `${t} vale ${v}: dejo de ser opaco`)
    }
  }
})

test('CONTRASTE: el estado del cuadre se lee sobre su fondo tintado', () => {
  // Es el texto que decide si la caja se guarda bien. Sobre el tinte, --green y --red daban
  // 4.23x y 3.70x, por eso el cartel tiene colores propios (--cuadre-*-texto). 4.5x es el
  // minimo para texto normal, y 13.5px bold NO califica como texto grande (hace falta 18.66px).
  const componer = (tinte, base) => {
    const p = tinte.match(/rgba?\(([^)]+)\)/)[1].split(',').map((x) => parseFloat(x.trim()))
    return [0, 1, 2].map((i) => Math.round(p[i] * p[3] + base[i] * (1 - p[3])))
  }
  for (const [nombre, bloque] of [['oscuro', bloqueOscuro()], ['claro', bloqueClaro()]]) {
    const base = hexARgb(variable(bloque, 'bg-drawer-head'))
    for (const [estado, tinte, texto] of [
      ['cuadra', 'cuadre-ok-tinte', 'cuadre-ok-texto'],
      ['no cuadra', 'cuadre-no-tinte', 'cuadre-no-texto'],
    ]) {
      const fondo = componer(variable(bloque, tinte), base)
      const r = contraste(hexARgb(variable(bloque, texto)), fondo)
      assert.ok(r >= 4.5, `tema ${nombre}, "${estado}": ${r.toFixed(2)}x y necesita 4.5x`)
    }
  }
})

test('el tinte del cartel se distingue del fondo del encabezado', () => {
  // Si el tinte fuera tan suave que no se nota, el color no comunica nada y el cartel
  // depende solo del signo y el borde.
  const componer = (tinte, base) => {
    const p = tinte.match(/rgba?\(([^)]+)\)/)[1].split(',').map((x) => parseFloat(x.trim()))
    return [0, 1, 2].map((i) => Math.round(p[i] * p[3] + base[i] * (1 - p[3])))
  }
  for (const [nombre, bloque] of [['oscuro', bloqueOscuro()], ['claro', bloqueClaro()]]) {
    const base = hexARgb(variable(bloque, 'bg-drawer-head'))
    for (const tinte of ['cuadre-ok-tinte', 'cuadre-no-tinte']) {
      const fondo = componer(variable(bloque, tinte), base)
      const dif = contraste(fondo, base)
      assert.ok(dif >= 1.15, `tema ${nombre}, ${tinte}: apenas se distingue (${dif.toFixed(2)}x)`)
    }
  }
})
