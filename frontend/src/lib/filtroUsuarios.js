// Filtro de la lista de usuarios por grupo, local, rol y estado.
//
// Lo que no es obvio: "los usuarios del local X" no son solo los que tienen X
// asignado en `local_access`. El acceso real se resuelve por rol (ver
// backend/src/plugins/appContext.js) y hay dos casos que se pierden si se mira
// nada más que la asignación explícita:
//
//   - super_admin y dcsmart tienen rol global (id_app = null) y entran a TODOS los
//     locales de todos los grupos. Filtrando por grupo o por local tienen que
//     aparecer igual: son los que más acceso tienen, esconderlos es lo peor que
//     puede hacer esta pantalla.
//   - admin y externo SIN locales asignados ven todos los locales de su app. Un
//     admin de GRUPO PERROS aparece al filtrar por DOGG aunque no tenga a DOGG
//     cargado, porque en la práctica entra a DOGG.
//
// Cada función responde una pregunta sola y se testea sin renderizar nada.
//
// Las dos preguntas sobre alcance salen de lib/roles.js, que ya espeja
// ROLES_TODOS_LOS_LOCALES del backend: `esAlcanceGlobal` (ve todos los grupos) y
// `sinLocalesVeTodos` (sin locales asignados alcanza todos los del grupo). No se
// repiten los nombres de rol acá — si mañana se agrega un rol con alcance global,
// alcanza con tocarlos en un solo lugar.

import { esAlcanceGlobal, sinLocalesVeTodos } from './roles.js'
import { DEPARTAMENTO_LABEL } from './datosUsuario.js'

export const esRolGlobal = esAlcanceGlobal

// Los roles del usuario, por nombre y sin repetir.
export function rolesDe(user) {
  return [...new Set((user?.user_app_roles ?? []).map(r => r.role?.nombre).filter(Boolean))]
}

export function tieneRolGlobal(user) {
  return rolesDe(user).some(esRolGlobal)
}

// ¿Este usuario tiene algo que ver con el grupo?
export function alcanzaGrupo(user, idApp) {
  if (!idApp) return true
  if (tieneRolGlobal(user)) return true
  return (user?.user_app_roles ?? []).some(r => r.id_app === idApp)
}

// ¿Y con el local? `idAppDelLocal` es el grupo al que pertenece ese local, que hace
// falta para resolver el caso de admin/externo sin locales asignados.
export function alcanzaLocal(user, idLocal, idAppDelLocal) {
  if (!idLocal) return true
  if (tieneRolGlobal(user)) return true

  // Asignado explícitamente: alcanza con eso.
  if ((user?.local_access ?? []).some(la => la.id_local === idLocal)) return true

  // admin/externo en ese grupo y sin locales cargados en ese grupo: los ve todos.
  return (user?.user_app_roles ?? []).some(r =>
    r.id_app === idAppDelLocal &&
    sinLocalesVeTodos(r.role?.nombre) &&
    !(user?.local_access ?? []).some(la => la.id_app === idAppDelLocal)
  )
}

export function tieneRol(user, rol) {
  if (!rol) return true
  return rolesDe(user).includes(rol)
}

// La búsqueda mira nombre, email y puesto. El puesto porque con el dato cargado uno
// escribe "encargada" y espera encontrarla; el departamento no está acá porque tiene su
// propio filtro.
export function coincideTexto(user, texto) {
  const q = texto?.trim().toLowerCase()
  if (!q) return true
  return [user?.nombre, user?.email, user?.puesto]
    .some(v => v?.toLowerCase().includes(q))
}

export function coincideDepartamento(user, departamento) {
  if (!departamento) return true
  // 'SIN' filtra los que faltan cargar, que al principio son casi todos.
  if (departamento === SIN_DEPARTAMENTO) return !user?.departamento
  return user?.departamento === departamento
}

export function coincideEstado(user, estado) {
  if (!estado) return true
  return estado === 'activos' ? user?.activo === true : user?.activo === false
}

// Valor del filtro para "todavía no se cargó". No es un departamento: es el que hace
// falta para encontrar a los que faltan completar.
export const SIN_DEPARTAMENTO = 'SIN'

// Aplica todos los filtros. `localesPorId` mapea id_local -> id_app, necesario para
// el filtro por local (ver alcanzaLocal).
export function filtrarUsuarios(users, { texto, idApp, idLocal, rol, estado, departamento }, localesPorId) {
  const idAppDelLocal = idLocal ? localesPorId?.get(idLocal) : null
  return (users ?? []).filter(u =>
    coincideTexto(u, texto) &&
    coincideEstado(u, estado) &&
    tieneRol(u, rol) &&
    coincideDepartamento(u, departamento) &&
    alcanzaGrupo(u, idApp) &&
    alcanzaLocal(u, idLocal, idAppDelLocal)
  )
}

// Cuántos usuarios hay por rol, para mostrarlo en el selector y saber de antemano
// si un filtro va a devolver algo. Un usuario con dos roles cuenta en los dos.
export function conteoPorRol(users) {
  const m = new Map()
  for (const u of users ?? []) {
    for (const rol of rolesDe(u)) m.set(rol, (m.get(rol) ?? 0) + 1)
  }
  return m
}

// Cómo se puede separar la lista. El default es 'rol-grupo': por rol y, dentro de
// cada rol, por grupo. Es el orden en que se busca gente -- "los cajeros de DOGG",
// no "la gente de DOGG que además es cajera".
export const AGRUPACIONES = [
  { valor: 'rol-grupo', label: 'Rol y grupo' },
  { valor: 'rol', label: 'Solo rol' },
  { valor: 'grupo', label: 'Solo grupo' },
  { valor: 'departamento', label: 'Departamento' },
  { valor: '', label: 'Sin separar' },
]

// Cuántos usuarios hay por departamento, para el selector. Acá un usuario cuenta una
// sola vez (a diferencia del rol, que puede repetirse por grupo).
export function conteoPorDepartamento(users) {
  const m = new Map()
  for (const u of users ?? []) {
    const k = u?.departamento || SIN_DEPARTAMENTO
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return m
}

// Etiquetas de los casos borde. Van al final de su nivel: no son lo que se viene
// a buscar.
const SIN_ROLES = 'Sin roles'
const TODOS_LOS_GRUPOS = 'Todos los grupos'
const SIN_DEPTO = 'Sin departamento'
const AL_FINAL = new Set([SIN_ROLES, TODOS_LOS_GRUPOS, 'Sin grupo', SIN_DEPTO])

const ordenarClaves = (a, b) => {
  const pa = AL_FINAL.has(a) ? 1 : 0
  const pb = AL_FINAL.has(b) ? 1 : 0
  return pa - pb || String(a).localeCompare(String(b))
}

// El grupo que le corresponde a una fila de rol. Los roles globales no pertenecen a
// un grupo: alcanzan todos.
const grupoDe = (r, appsPorId) =>
  esRolGlobal(r.role?.nombre)
    ? TODOS_LOS_GRUPOS
    : (r.app?.nombre ?? appsPorId?.get(r.id_app) ?? 'Sin grupo')

// Agrupa una lista ya filtrada para mostrarla separada, en uno o dos niveles.
//
// Devuelve siempre la misma forma, para que la tabla no tenga que ramificar:
//   [{ titulo, total, sub: [{ titulo, users }] }]
// Sin agrupación hay un bloque con `titulo: null` y un subbloque con `titulo: null`.
//
// Un usuario con dos roles aparece en los dos bloques, y eso es lo correcto: la
// pregunta que contesta esta vista es "quiénes son los admin", no "a qué bloque
// pertenece cada uno". Por eso `total` cuenta usuarios distintos dentro del bloque
// y no la suma de los subbloques, que podría contar a alguien dos veces.
export function agruparUsuarios(users, por = 'rol-grupo', { appsPorId } = {}) {
  const lista = users ?? []
  if (!por) return [{ titulo: null, total: lista.length, sub: [{ titulo: null, users: lista }] }]

  // clave de nivel 1 -> (clave de nivel 2 -> usuarios)
  const arbol = new Map()
  const push = (n1, n2, u) => {
    if (!arbol.has(n1)) arbol.set(n1, new Map())
    const sub = arbol.get(n1)
    if (!sub.has(n2)) sub.set(n2, [])
    sub.get(n2).push(u)
  }

  // El departamento es un dato del usuario, no de sus roles: se agrupa directo y cada
  // uno cae en un solo bloque. Por eso no pasa por el recorrido de abajo, que repite al
  // usuario una vez por rol.
  if (por === 'departamento') {
    for (const u of lista) {
      push(u.departamento ? (DEPARTAMENTO_LABEL[u.departamento] ?? u.departamento) : SIN_DEPTO, null, u)
    }
    return armarBloques(arbol)
  }

  for (const u of lista) {
    const filas = u.user_app_roles ?? []
    if (filas.length === 0) {
      push(por === 'grupo' ? 'Sin grupo' : SIN_ROLES, null, u)
      continue
    }
    for (const r of filas) {
      const rol = r.role?.nombre ?? SIN_ROLES
      const grupo = grupoDe(r, appsPorId)
      if (por === 'rol') push(rol, null, u)
      else if (por === 'grupo') push(grupo, null, u)
      else push(rol, grupo, u) // 'rol-grupo'
    }
  }

  return armarBloques(arbol)
}

// Pasa el árbol de dos niveles a la forma que consume la tabla, ordenado.
function armarBloques(arbol) {
  return [...arbol.entries()]
    .sort(([a], [b]) => ordenarClaves(a, b))
    .map(([titulo, sub]) => ({
      titulo,
      // Usuarios distintos: alguien con dos roles en el mismo bloque cuenta una vez.
      total: new Set([...sub.values()].flat().map(u => u.id)).size,
      sub: [...sub.entries()]
        .sort(([a], [b]) => ordenarClaves(a, b))
        .map(([subTitulo, us]) => ({ titulo: subTitulo, users: us })),
    }))
}

// ── qué bloques se ven abiertos ─────────────────────────────────────────────
// Los dos niveles arrancan colapsados: con 47 usuarios en 6 roles, la lista
// completa abierta es una pared y hay que scrollear para entender qué hay.
//
// Con una excepción que importa: si hay una búsqueda o un filtro puesto, se abren
// todos. Quien escribe un nombre quiere VER al usuario, no encontrar un bloque
// cerrado que además no dice si lo que busca está adentro.
//
// Los dos niveles comparten un solo Set porque sus claves no se pisan: el nivel 1
// usa el título pelado y el nivel 2 lo prefija con el de su padre. Sin eso,
// "GRUPO PERROS" dentro de `admin` y dentro de `cajero` serían la misma clave y se
// abrirían juntos.
export const claveSub = (tituloBloque, tituloSub) => `${tituloBloque ?? ''}|${tituloSub ?? ''}`

export function bloqueAbierto(titulo, { abiertos, hayFiltro }) {
  if (hayFiltro) return true
  if (!titulo) return true // sin agrupación no hay nada que colapsar
  return Boolean(abiertos?.has(titulo))
}

// Igual que bloqueAbierto pero para un subbloque, que se identifica junto con su
// padre. Un subbloque sin título (agrupación de un solo nivel) está siempre abierto.
export function subAbierto(tituloBloque, tituloSub, { abiertos, hayFiltro }) {
  if (hayFiltro) return true
  if (!tituloSub) return true
  return Boolean(abiertos?.has(claveSub(tituloBloque, tituloSub)))
}

// Alterna una clave en el conjunto de abiertos. Devuelve un Set nuevo: el estado de
// React no se muta.
export function alternar(abiertos, clave) {
  const s = new Set(abiertos ?? [])
  if (s.has(clave)) s.delete(clave); else s.add(clave)
  return s
}

// Todas las claves de los dos niveles, para el botón de expandir todo.
export function todasLasClaves(bloques) {
  const claves = []
  for (const b of bloques ?? []) {
    if (!b.titulo) continue
    claves.push(b.titulo)
    for (const s of b.sub ?? []) {
      if (s.titulo) claves.push(claveSub(b.titulo, s.titulo))
    }
  }
  return claves
}

// ¿Está todo abierto, en los dos niveles? Decide si el botón dice "Expandir" o
// "Colapsar".
export function todoAbierto(bloques, abiertos) {
  const claves = todasLasClaves(bloques)
  return claves.length > 0 && claves.every(c => abiertos?.has(c))
}
