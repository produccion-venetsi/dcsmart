// Los teclados de celular (y algunos gestores de contraseñas de Android) meten
// un espacio al final de lo que escribís, sobre todo después de un símbolo o al
// aceptar una sugerencia. Ese espacio invisible hace que bcrypt no matchee y el
// login devuelve "Credenciales inválidas" sin que el usuario tenga forma de
// darse cuenta: en el campo de contraseña se ven puntitos, no espacios.
//
// Caso real (31/07/2026): clientes de auditoría no podían entrar desde un
// Android. La contraseña correcta daba content-length 61 y 200; la misma con un
// espacio daba 62 y 401. El request del cliente medía 62.
//
// El email ya se normaliza así en /login (trim + lowercase), esto le da el mismo
// trato a la contraseña.
//
// IMPORTANTE: se aplica tanto al VERIFICAR como al GUARDAR. Si se trimeara solo
// en un lado, una contraseña creada con espacios quedaría inaccesible (o al
// revés, una guardada sin espacios nunca aceptaría el input con espacios).
// Consecuencia asumida: no se pueden tener contraseñas cuyo primer o último
// carácter sea un espacio. Ningún gestor de contraseñas genera algo así.
export function normalizarPassword(valor) {
  if (typeof valor !== 'string') return valor
  return valor.trim()
}

// Verificación tolerante con los hashes creados ANTES de que existiera el trim.
//
// El fix de arriba se aplicó al guardar y al verificar al mismo tiempo, pero no
// re-hasheó nada: los hashes que ya estaban en la base se habían generado con la
// contraseña tal cual la tipeó quien creó el usuario. Si ahí había un espacio de
// los que agrega el teclado, el hash es de " clave " y el login —que ahora
// trimea— compara "clave" y nunca da. La cuenta queda inaccesible sin síntoma
// visible: la persona escribe bien la contraseña que le pasaron y recibe
// "Credenciales inválidas" para siempre.
//
// Por eso se prueba la versión normalizada y, si no da, la cruda. Primero la
// normalizada porque es el caso de todos los usuarios nuevos.
//
// Esto NO afloja la verificación: las dos variantes son la misma contraseña con
// espacios en los extremos, que es justo lo que `normalizarPassword` declara
// irrelevante. Cualquier otra diferencia sigue fallando.
export async function verificarPassword(tipeado, hash, comparar) {
  const bcrypt = comparar ?? (await import('bcryptjs')).default.compare
  if (typeof tipeado !== 'string' || typeof hash !== 'string' || !hash) return false

  const normalizado = normalizarPassword(tipeado)
  if (!normalizado) return false

  try {
    if (await bcrypt(normalizado, hash)) return true
    // Segundo intento solo si el trim cambió algo: si no, sería la misma
    // comparación otra vez y bcrypt es caro.
    if (normalizado !== tipeado && await bcrypt(tipeado, hash)) return true
    return false
  } catch {
    // Un hash corrupto o con formato desconocido no autentica a nadie.
    return false
  }
}
