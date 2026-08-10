// Validación de CUIT y el genérico para cuando no se tiene el real.
//
// El CUIT son 11 dígitos: 2 de tipo, 8 del documento y 1 verificador. El último se
// calcula con módulo 11 sobre los otros 10, así que un dígito mal tipeado se detecta
// sin consultar nada — que es justo lo que hace falta al cargar una factura a mano.

// El CUIT genérico ("consumidor final" / proveedor sin datos). Es un CUIT
// válido de verdad: pasa el módulo 11, así que no rompe nada aguas abajo.
export const CUIT_GENERICO = '30999999995'

// Pesos del dígito verificador, en orden.
const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]

// Prefijos de tipo que usa AFIP. Se valida porque un CUIT que empieza en 99 puede
// pasar el módulo 11 y no existir: el dígito verificador solo dice que los números
// son consistentes entre sí, no que el CUIT sea real.
//
//   20, 23, 24, 27  personas físicas
//   30, 33, 34      personas jurídicas
//   50, 51, 55      otros (usados por AFIP en casos especiales)
const PREFIJOS = ['20', '23', '24', '27', '30', '33', '34', '50', '51', '55']

// Deja solo los dígitos: se escribe con guiones, con puntos o pegado.
export const soloDigitos = (v) => String(v ?? '').replace(/\D/g, '')

// El dígito verificador que le corresponde a los primeros 10 dígitos.
export function digitoVerificador(diezDigitos) {
  const d = soloDigitos(diezDigitos)
  if (d.length !== 10) return null
  const suma = PESOS.reduce((acc, peso, i) => acc + peso * Number(d[i]), 0)
  const resto = suma % 11
  if (resto === 0) return 0
  // resto 1 daría 10, que no es un dígito. AFIP lo resuelve cambiando el prefijo
  // (23) y usando 9; acá alcanza con devolver 9, que es lo que termina en el número.
  if (resto === 1) return 9
  return 11 - resto
}

// ¿Es un CUIT válido? Chequea largo, prefijo y dígito verificador.
export function esCuitValido(valor) {
  const d = soloDigitos(valor)
  if (d.length !== 11) return false
  if (!PREFIJOS.includes(d.slice(0, 2))) return false
  // Todos los dígitos iguales (11111111111) pasa el módulo en algunos casos y no es
  // un CUIT de nadie.
  if (/^(\d)\1+$/.test(d)) return false
  return digitoVerificador(d.slice(0, 10)) === Number(d[10])
}

// Formato de lectura: 30-99999999-5. Se guarda como se escribió; esto es para
// mostrar.
export function formatearCuit(valor) {
  const d = soloDigitos(valor)
  if (d.length !== 11) return String(valor ?? '')
  return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`
}

// Qué decirle a quien lo escribió. Devuelve null si está bien o si está vacío: un
// CUIT en blanco no es un error, es un dato que falta (el campo es opcional en los
// tres formularios donde se usa).
//
// El estado se separa del texto para que la pantalla pueda decidir el tono y si
// ofrece el genérico, sin volver a interpretar el mensaje.
export function revisarCuit(valor) {
  const d = soloDigitos(valor)
  if (!d) return null
  if (esCuitValido(d)) return null

  // Incompleto todavía: no se avisa nada mientras se está tipeando. Avisar "no es
  // válido" en el tercer dígito es ruido y entrena a ignorar el mensaje.
  if (d.length < 11) {
    return { estado: 'incompleto', mensaje: `Faltan ${11 - d.length} dígitos`, ofreceGenerico: false }
  }
  if (d.length > 11) {
    return { estado: 'largo', mensaje: `Un CUIT tiene 11 dígitos y escribiste ${d.length}`, ofreceGenerico: true }
  }
  return {
    estado: 'invalido',
    mensaje: 'No es un CUIT válido',
    ofreceGenerico: true,
  }
}

// El texto completo del aviso, con la oferta del genérico. Es el que pidió el
// negocio, palabra por palabra.
export const textoOfrecerGenerico = () =>
  `No es un CUIT válido, ¿desea completar con genérico: ${CUIT_GENERICO}?`
