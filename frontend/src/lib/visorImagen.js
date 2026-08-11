// Rotación y transform del visor de imágenes (lightbox de comprobantes).
//
// Existe porque rotar parece trivial y tiene dos cosas que se hacen mal seguido: el
// orden de las transformaciones CSS, y qué pasa con el zoom y el arrastre cuando la
// imagen quedó de costado.

// Solo múltiplos de 90: una factura escaneada al revés se arregla con un cuarto de
// giro, y un ángulo libre solo sirve para dejarla torcida.
export const PASO = 90

// Lleva cualquier ángulo a 0, 90, 180 o 270.
//
// El módulo de JS con negativos da negativo (-90 % 360 === -90), así que sumar 360
// antes es lo que evita un rotate(-90) que después no se puede comparar con 270.
export function normalizar(grados) {
  const g = Number(grados)
  if (!Number.isFinite(g)) return 0
  return ((g % 360) + 360) % 360
}

// Gira. Separada de `normalizar` a propósito: una sola función con `delta = 90` por
// defecto hacía que `rotar(450)` --que se lee como "normalizá esto"-- sumara otro
// cuarto de vuelta y devolviera 180. Dos nombres, dos cosas.
export function rotar(gradosActuales, delta) {
  return normalizar(normalizar(gradosActuales) + Number(delta || 0))
}

export const rotarDerecha = (g) => rotar(g, PASO)
export const rotarIzquierda = (g) => rotar(g, -PASO)

// ¿La imagen quedó de costado? Sirve para decidir el ajuste al ancho de la pantalla:
// rotada 90°, el alto de la imagen ocupa el ancho del visor.
export const estaDeCostado = (grados) => normalizar(grados) % 180 !== 0

// El transform de la imagen.
//
// El ORDEN importa y es este a propósito: primero el desplazamiento, después el zoom
// y al final la rotación.
//
// CSS aplica las transformaciones de derecha a izquierda sobre el elemento, así que
// con `translate scale rotate` el translate queda en coordenadas de PANTALLA: al
// arrastrar una imagen rotada 90°, se mueve para donde va el mouse. Si la rotación
// fuera primero, el arrastre quedaría girado con la imagen -- se tira a la derecha y
// la foto baja -- que es el bug clásico de los visores caseros.
export function transformCss({ x = 0, y = 0, scale = 1, rot = 0 } = {}) {
  const partes = [`translate(${x}px, ${y}px)`, `scale(${scale})`]
  // El rotate(0deg) se omite: no cambia nada y ensucia el DOM al inspeccionar.
  if (normalizar(rot) !== 0) partes.push(`rotate(${normalizar(rot)}deg)`)
  return partes.join(' ')
}

// El estado inicial, y el mismo al que se vuelve con "ajustar" o doble click.
export const VISTA_INICIAL = { scale: 1, x: 0, y: 0, rot: 0 }

// Reset que PRESERVA la rotación.
//
// Es la parte menos obvia del visor: si el reset del zoom también endereza la imagen,
// alguien que giró una factura para poder leerla y después hace doble click para
// ajustarla la ve volver a estar de costado. La rotación es una corrección del
// archivo (está escaneado al revés), no parte de la navegación.
export function resetearVista(vista) {
  return { ...VISTA_INICIAL, rot: normalizar(vista?.rot ?? 0) }
}

// Texto del estado para mostrar arriba: "150% · 90°".
export function etiquetaVista({ scale = 1, rot = 0 } = {}) {
  const zoom = `${Math.round(scale * 100)}%`
  return normalizar(rot) === 0 ? zoom : `${zoom} · ${normalizar(rot)}°`
}
