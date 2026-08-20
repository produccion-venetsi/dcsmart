// Una clave única para identificar filas que todavía NO existen en la base:
// los detalles que se van agregando a un formulario antes de guardar.
//
// POR QUÉ NO `crypto.randomUUID()` a secas: no existe en Safari iOS anterior a
// 15.4 ni en contextos no seguros (una IP local por HTTP). En esos navegadores
// tocar "Agregar" tiraba `TypeError: crypto.randomUUID is not a function` y el
// detalle simplemente no se sumaba a la lista — el cajero veía un error y la
// línea perdida, sin entender por qué. Es la clase de bug que solo aparece en
// el celular de otra persona (2026-08-20).
//
// La clave solo tiene que ser única DENTRO de un formulario abierto: no se
// guarda, no viaja al backend, no es un id. Por eso el respaldo alcanza.

let contador = 0

export function claveLocal() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  contador += 1
  return `tmp-${Date.now()}-${contador}-${Math.random().toString(36).slice(2, 10)}`
}
