// Tema claro / oscuro.
//
// La app nació solo oscura: las variables de color viven en `:root` y no había alternativa.
// El tema claro se hace redefiniendo esas mismas variables bajo `[data-tema="claro"]`, así
// que no hay que tocar los 471 usos de `var(--...)` que ya existen.
//
// ── Tres estados, no dos ─────────────────────────────────────────────────────
//
// La preferencia guardada puede ser 'oscuro', 'claro' o 'sistema'. Es distinto de guardar
// un booleano: alguien que eligió "sistema" quiere que la app cambie cuando cambia
// Windows, y eso se pierde si al elegir se guarda el resultado en vez de la intención.
//
// ── El detalle que rompe todo si falta ───────────────────────────────────────
//
// `color-scheme` tiene que acompañar al tema. Sin eso, el navegador dibuja los widgets
// nativos (el desplegable de los select, el calendario de los date, las scrollbars) con el
// esquema del sistema mientras el CSS les pinta encima: en tema claro con Windows en
// oscuro, un desplegable negro con letra negra. Ya estaba documentado en app.css para el
// modo oscuro; ahora hay que moverlo con el tema.

export const TEMAS = ['sistema', 'claro', 'oscuro']
export const CLAVE = 'dcsmart-tema'

export const ETIQUETA_TEMA = {
  sistema: 'Como el sistema',
  claro: 'Claro',
  oscuro: 'Oscuro',
}

export const esTemaValido = (v) => TEMAS.includes(v)

// Lo elegido, o 'sistema' si no hay nada guardado o hay basura. `sistema` como default y no
// 'oscuro': la app arranca siguiendo al sistema, y quien quiera fijarlo lo elige.
export function leerPreferencia(almacen) {
  try {
    const v = almacen?.getItem?.(CLAVE)
    return esTemaValido(v) ? v : 'sistema'
  } catch {
    // localStorage puede tirar en modo privado o con las cookies bloqueadas. Sin tema
    // guardado la app tiene que abrir igual.
    return 'sistema'
  }
}

export function guardarPreferencia(almacen, tema) {
  if (!esTemaValido(tema)) return false
  try {
    almacen?.setItem?.(CLAVE, tema)
    return true
  } catch {
    return false
  }
}

// El tema que hay que pintar: resuelve 'sistema' contra lo que dice el sistema operativo.
// Devuelve siempre 'claro' u 'oscuro', nunca 'sistema'.
export function temaEfectivo(preferencia, sistemaPrefiereOscuro) {
  if (preferencia === 'claro') return 'claro'
  if (preferencia === 'oscuro') return 'oscuro'
  // Sin dato del sistema se asume oscuro, que es como la app se ve desde siempre.
  return sistemaPrefiereOscuro === false ? 'claro' : 'oscuro'
}

// Lo que se le pone al <html>. `color-scheme` va junto y no aparte: son el mismo cambio y
// separarlos es lo que deja los widgets nativos del color equivocado.
export const atributosDelTema = (efectivo) => ({
  'data-tema': efectivo,
  colorScheme: efectivo === 'claro' ? 'light' : 'dark',
})

// El siguiente en el ciclo del botón. Tres estados en un solo botón: sistema -> claro ->
// oscuro -> sistema. Un interruptor de dos posiciones no puede volver a "seguir al
// sistema" una vez que se salió.
export function siguienteTema(actual) {
  const i = TEMAS.indexOf(actual)
  return TEMAS[(i + 1) % TEMAS.length] ?? 'sistema'
}

// Qué mostrar en el botón: el ícono habla del tema EFECTIVO (lo que se ve) y el texto de la
// preferencia (lo que se eligió). Con "sistema" los dos datos son distintos y hacen falta
// los dos: el sol dice cómo está, "como el sistema" dice por qué.
export function estadoBoton(preferencia, sistemaPrefiereOscuro) {
  const efectivo = temaEfectivo(preferencia, sistemaPrefiereOscuro)
  return {
    efectivo,
    preferencia,
    icono: efectivo === 'claro' ? 'sol' : 'luna',
    etiqueta: ETIQUETA_TEMA[preferencia] ?? ETIQUETA_TEMA.sistema,
    ayuda: preferencia === 'sistema'
      ? `Sigue al sistema (ahora ${efectivo}). Clic para fijar claro.`
      : `Tema ${preferencia} fijo. Clic para ${siguienteTema(preferencia) === 'sistema' ? 'volver a seguir al sistema' : `pasar a ${siguienteTema(preferencia)}`}.`,
  }
}

// Escribe el tema en el <html>. Vive acá y no en el componente porque un archivo que
// exporta un componente Y una función rompe el hot reload de Vite, y porque main.jsx la
// necesita ANTES de montar React: aplicarlo en un effect pinta un primer frame oscuro y
// salta a claro (el "flash" del tema).
//
// Tiene la guarda de `document` para poder importarse desde los tests, que corren en node.
export function aplicarTema(preferencia, prefiereOscuro) {
  if (typeof document === 'undefined') return null
  const efectivo = temaEfectivo(preferencia, prefiereOscuro)
  const { 'data-tema': tema, colorScheme } = atributosDelTema(efectivo)
  document.documentElement.setAttribute('data-tema', tema)
  // `color-scheme` no es un atributo sino una propiedad CSS, y es la que hace que los
  // widgets nativos (select, date, scrollbars) sigan al tema.
  document.documentElement.style.colorScheme = colorScheme
  return efectivo
}
