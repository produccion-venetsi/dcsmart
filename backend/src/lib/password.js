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
