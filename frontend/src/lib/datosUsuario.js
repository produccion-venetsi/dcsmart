// Datos de la persona detrás de un usuario, del lado del formulario.
//
// La lista de departamentos está duplicada con `backend/src/lib/datosUsuario.js` a
// propósito: el frontend no importa del backend en este proyecto. Lo que evita que se
// desincronicen es el test de contrato de `datosUsuario.test.js`, que lee el archivo
// del backend y falla si las listas dejan de coincidir. Si tocás una, tocá la otra.

export const DEPARTAMENTOS = [
  'ADMINISTRACION',
  'OPERACIONES',
  'COMPRAS',
  'FINANZAS',
  'RRHH',
  'SISTEMAS',
  'COMERCIAL',
  'AUDITORIA',
  'MANTENIMIENTO',
  'DIRECCION',
]

export const DEPARTAMENTO_LABEL = {
  ADMINISTRACION: 'Administración',
  OPERACIONES: 'Operaciones',
  COMPRAS: 'Compras',
  FINANZAS: 'Finanzas',
  RRHH: 'RRHH',
  SISTEMAS: 'Sistemas',
  COMERCIAL: 'Comercial',
  AUDITORIA: 'Auditoría',
  MANTENIMIENTO: 'Mantenimiento',
  DIRECCION: 'Dirección',
}

// Para los <select>: la opción vacía va primero porque el dato puede faltar.
export const OPCIONES_DEPARTAMENTO = DEPARTAMENTOS.map((clave) => ({
  value: clave,
  label: DEPARTAMENTO_LABEL[clave],
}))

export const LARGOS = { equipo: 60, puesto: 60 }

export const etiquetaDepartamento = (v) => (v ? DEPARTAMENTO_LABEL[v] ?? v : '')

// ── Fechas ───────────────────────────────────────────────────────────────────
//
// La columna es DATE y el backend la manda como '1990-05-17T00:00:00.000Z'. Se le
// cortan los diez primeros caracteres y NO se construye un Date: `new Date(iso)` en
// GMT-3 da el 16 a las 21:00, y cualquier formateo local muestra el día anterior. Es
// el mismo error que corrió 2076 cajas un día para atrás.

export const fechaNacInput = (v) => String(v ?? '').slice(0, 10)

// Muestra DD/MM/AAAA partiendo el texto, sin pasar por Date.
export function fechaNacTexto(v) {
  const iso = fechaNacInput(v)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return ''
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

// Edad cumplida. Se muestra al lado de la fecha porque es el dato que uno lee.
export function edad(v, hoy = new Date()) {
  const iso = fechaNacInput(v)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const [a, m, d] = iso.split('-').map(Number)
  let años = hoy.getFullYear() - a
  const cumplioYa = hoy.getMonth() + 1 > m || (hoy.getMonth() + 1 === m && hoy.getDate() >= d)
  if (!cumplioYa) años--
  return años >= 0 ? años : null
}

// El máximo que acepta el <input type="date">: hoy. Nadie nació mañana, y es mejor que
// el navegador no deje elegirlo que un 400 después de guardar.
export function hoyISO(hoy = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${hoy.getFullYear()}-${p(hoy.getMonth() + 1)}-${p(hoy.getDate())}`
}

// ── Validación del formulario ────────────────────────────────────────────────
//
// Mismos límites que el backend, para avisar antes de mandar. El backend igual valida:
// esto es comodidad, no la defensa.
export function errorFechaNac(v, hoy = new Date()) {
  const iso = fechaNacInput(v)
  if (!iso) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return 'Fecha incompleta'
  if (iso > hoyISO(hoy)) return 'No puede ser una fecha futura'
  if (Number(iso.slice(0, 4)) < hoy.getFullYear() - 120) return 'Revisá el año'
  return null
}

// ── Qué falta cargar ─────────────────────────────────────────────────────────
//
// La tabla marca los usuarios incompletos. Los 60 usuarios que ya existen arrancan sin
// ninguno de estos datos, y sin una señal visible nadie sabe cuáles faltan.
export const CAMPOS_PERSONA = [
  { clave: 'departamento', label: 'Departamento' },
  { clave: 'equipo', label: 'Equipo' },
  { clave: 'puesto', label: 'Rol' },
  { clave: 'fecha_nac', label: 'Fecha de nac.' },
]

export const faltantes = (u) =>
  CAMPOS_PERSONA.filter(({ clave }) => !String(u?.[clave] ?? '').trim()).map((c) => c.label)
