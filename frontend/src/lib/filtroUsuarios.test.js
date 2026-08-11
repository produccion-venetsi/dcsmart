import test from 'node:test'
import assert from 'node:assert/strict'
import {
  filtrarUsuarios, alcanzaGrupo, alcanzaLocal, tieneRol, rolesDe,
  conteoPorRol, conteoPorDepartamento, agruparUsuarios, AGRUPACIONES,
  bloqueAbierto, subAbierto, alternar, todoAbierto, todasLasClaves, claveSub,
} from './filtroUsuarios.js'

// Grupos y locales de prueba: PERROS con dos locales, TITA con uno.
const LOCALES = new Map([['dogg', 'perros'], ['evelia', 'perros'], ['tita', 'gtita']])

const rol = (nombre, id_app, appNombre) => ({
  id: `r-${nombre}-${id_app ?? 'global'}`,
  id_app: id_app ?? null,
  role: { nombre },
  app: id_app ? { id: id_app, nombre: appNombre } : null,
})
const acceso = (id_local, id_app) => ({ id: `la-${id_local}`, id_local, id_app })

const superAdmin = { id: 'u1', nombre: 'Max', email: 'max@x.com', activo: true, user_app_roles: [rol('super_admin')], local_access: [] }
const adminPerros = { id: 'u2', nombre: 'Ana', email: 'ana@x.com', activo: true, user_app_roles: [rol('admin', 'perros', 'GRUPO PERROS')], local_access: [] }
const adminPerrosConLocal = { id: 'u3', nombre: 'Bea', email: 'bea@x.com', activo: true, user_app_roles: [rol('admin', 'perros', 'GRUPO PERROS')], local_access: [acceso('evelia', 'perros')] }
const cajeroDogg = { id: 'u4', nombre: 'Caro', email: 'caro@x.com', activo: true, user_app_roles: [rol('cajero', 'perros', 'GRUPO PERROS')], local_access: [acceso('dogg', 'perros')] }
const adminTita = { id: 'u5', nombre: 'Dani', email: 'dani@x.com', activo: false, user_app_roles: [rol('admin', 'gtita', 'GRUPO TITA')], local_access: [] }
const sinRoles = { id: 'u6', nombre: 'Eze', email: 'eze@x.com', activo: true, user_app_roles: [], local_access: [] }

const TODOS = [superAdmin, adminPerros, adminPerrosConLocal, cajeroDogg, adminTita, sinRoles]
const ids = (r) => r.map(u => u.id).sort()

// ── grupo ───────────────────────────────────────────────────────────────────

test('sin filtro de grupo entran todos', () => {
  assert.deepEqual(ids(filtrarUsuarios(TODOS, {}, LOCALES)), ids(TODOS))
})

test('filtrar por grupo trae a los de ese grupo Y a los de rol global', () => {
  // El super_admin entra a todos los grupos: esconderlo seria lo peor que puede
  // hacer esta pantalla, es el que mas acceso tiene.
  const r = filtrarUsuarios(TODOS, { idApp: 'perros' }, LOCALES)
  assert.deepEqual(ids(r), ['u1', 'u2', 'u3', 'u4'])
})

test('un usuario de otro grupo no aparece', () => {
  const r = filtrarUsuarios(TODOS, { idApp: 'perros' }, LOCALES)
  assert.equal(r.some(u => u.id === 'u5'), false)
})

test('alcanzaGrupo: el rol global alcanza cualquier grupo', () => {
  assert.equal(alcanzaGrupo(superAdmin, 'gtita'), true)
  assert.equal(alcanzaGrupo(adminPerros, 'gtita'), false)
})

// ── local ───────────────────────────────────────────────────────────────────

test('el admin sin locales asignados aparece en cualquier local de su grupo', () => {
  // En la practica entra a todos los locales de la app (ver appContext.js).
  assert.equal(alcanzaLocal(adminPerros, 'dogg', 'perros'), true)
  assert.equal(alcanzaLocal(adminPerros, 'evelia', 'perros'), true)
})

test('el admin CON un local asignado solo aparece en ese local', () => {
  assert.equal(alcanzaLocal(adminPerrosConLocal, 'evelia', 'perros'), true)
  assert.equal(alcanzaLocal(adminPerrosConLocal, 'dogg', 'perros'), false)
})

test('el cajero solo aparece en su local', () => {
  assert.equal(alcanzaLocal(cajeroDogg, 'dogg', 'perros'), true)
  assert.equal(alcanzaLocal(cajeroDogg, 'evelia', 'perros'), false)
})

test('el rol global aparece en cualquier local', () => {
  assert.equal(alcanzaLocal(superAdmin, 'dogg', 'perros'), true)
  assert.equal(alcanzaLocal(superAdmin, 'tita', 'gtita'), true)
})

test('el admin de otro grupo no aparece en un local ajeno', () => {
  assert.equal(alcanzaLocal(adminTita, 'dogg', 'perros'), false)
})

test('filtrar por local combina las tres reglas', () => {
  const r = filtrarUsuarios(TODOS, { idLocal: 'dogg' }, LOCALES)
  // super_admin (global), adminPerros (sin locales, ve todos), cajeroDogg (asignado).
  // Queda afuera adminPerrosConLocal, que tiene evelia y no dogg.
  assert.deepEqual(ids(r), ['u1', 'u2', 'u4'])
})

// ── rol ─────────────────────────────────────────────────────────────────────

test('filtrar por rol', () => {
  assert.deepEqual(ids(filtrarUsuarios(TODOS, { rol: 'admin' }, LOCALES)), ['u2', 'u3', 'u5'])
  assert.deepEqual(ids(filtrarUsuarios(TODOS, { rol: 'cajero' }, LOCALES)), ['u4'])
})

test('rolesDe no repite y tieneRol contesta por nombre', () => {
  const dosVeces = { user_app_roles: [rol('admin', 'a1', 'A'), rol('admin', 'a2', 'B')] }
  assert.deepEqual(rolesDe(dosVeces), ['admin'])
  assert.equal(tieneRol(dosVeces, 'admin'), true)
  assert.equal(tieneRol(dosVeces, 'cajero'), false)
  assert.equal(tieneRol(sinRoles, 'admin'), false)
})

// ── estado y texto ──────────────────────────────────────────────────────────

test('filtrar por estado', () => {
  assert.deepEqual(ids(filtrarUsuarios(TODOS, { estado: 'inactivos' }, LOCALES)), ['u5'])
  assert.equal(filtrarUsuarios(TODOS, { estado: 'activos' }, LOCALES).length, 5)
})

test('el texto busca en nombre y en email, sin importar mayusculas', () => {
  assert.deepEqual(ids(filtrarUsuarios(TODOS, { texto: 'ANA' }, LOCALES)), ['u2'])
  assert.deepEqual(ids(filtrarUsuarios(TODOS, { texto: 'caro@x' }, LOCALES)), ['u4'])
  assert.equal(filtrarUsuarios(TODOS, { texto: '   ' }, LOCALES).length, TODOS.length)
})

test('los filtros se combinan entre si', () => {
  const r = filtrarUsuarios(TODOS, { idApp: 'perros', rol: 'cajero', estado: 'activos' }, LOCALES)
  assert.deepEqual(ids(r), ['u4'])
})

test('una combinacion sin resultados devuelve lista vacia, no explota', () => {
  assert.deepEqual(filtrarUsuarios(TODOS, { idApp: 'gtita', rol: 'cajero' }, LOCALES), [])
  assert.deepEqual(filtrarUsuarios([], { rol: 'admin' }, LOCALES), [])
  assert.deepEqual(filtrarUsuarios(null, {}, LOCALES), [])
})

// ── conteo y agrupado ───────────────────────────────────────────────────────

test('conteoPorRol cuenta un usuario en cada rol que tiene', () => {
  const c = conteoPorRol(TODOS)
  assert.equal(c.get('admin'), 3)
  assert.equal(c.get('cajero'), 1)
  assert.equal(c.get('super_admin'), 1)
  assert.equal(c.get('inexistente'), undefined)
})

// ── agrupado en dos niveles ─────────────────────────────────────────────────
// La forma es siempre [{ titulo, total, sub: [{ titulo, users }] }], así la tabla
// no tiene que ramificar por modo de agrupación.

const titulos = (b) => b.map(x => x.titulo)
const bloque = (b, t) => b.find(x => x.titulo === t)

test('el default es rol y grupo: dos niveles', () => {
  const b = agruparUsuarios(TODOS)
  const admin = bloque(b, 'admin')
  assert.deepEqual(titulos(admin.sub), ['GRUPO PERROS', 'GRUPO TITA'])
  assert.deepEqual(ids(bloque(admin.sub, 'GRUPO PERROS').users), ['u2', 'u3'])
  assert.deepEqual(ids(bloque(admin.sub, 'GRUPO TITA').users), ['u5'])
})

test('el total del bloque cuenta usuarios distintos, no la suma de los subbloques', () => {
  // Alguien con el mismo rol en dos grupos aparece en los dos subbloques pero es
  // una sola persona.
  const dosGrupos = {
    id: 'u9', nombre: 'Fer', email: 'fer@x.com', activo: true, local_access: [],
    user_app_roles: [rol('admin', 'perros', 'GRUPO PERROS'), rol('admin', 'gtita', 'GRUPO TITA')],
  }
  const b = agruparUsuarios([dosGrupos])
  const admin = bloque(b, 'admin')
  assert.equal(admin.sub.length, 2)
  assert.equal(admin.total, 1)
})

test('los roles globales caen en su propio subbloque', () => {
  const b = agruparUsuarios(TODOS)
  const sa = bloque(b, 'super_admin')
  assert.deepEqual(titulos(sa.sub), ['Todos los grupos'])
  assert.deepEqual(ids(sa.sub[0].users), ['u1'])
})

test('los casos borde van al final de su nivel', () => {
  const b = agruparUsuarios(TODOS)
  assert.equal(b.at(-1).titulo, 'Sin roles')
})

test('solo rol: un nivel, con el subbloque sin titulo', () => {
  const b = agruparUsuarios(TODOS, 'rol')
  const admin = bloque(b, 'admin')
  assert.equal(admin.sub.length, 1)
  assert.equal(admin.sub[0].titulo, null)
  assert.deepEqual(ids(admin.sub[0].users), ['u2', 'u3', 'u5'])
  assert.equal(admin.total, 3)
})

test('solo grupo: un nivel por grupo', () => {
  const b = agruparUsuarios(TODOS, 'grupo')
  assert.deepEqual(ids(bloque(b, 'GRUPO PERROS').sub[0].users), ['u2', 'u3', 'u4'])
  assert.deepEqual(ids(bloque(b, 'Todos los grupos').sub[0].users), ['u1'])
})

test('sin separar: un bloque y un subbloque, los dos sin titulo', () => {
  const b = agruparUsuarios(TODOS, '')
  assert.equal(b.length, 1)
  assert.equal(b[0].titulo, null)
  assert.equal(b[0].total, TODOS.length)
  assert.equal(b[0].sub[0].titulo, null)
  assert.deepEqual(ids(b[0].sub[0].users), ids(TODOS))
})

test('un usuario sin roles aparece igual, no se pierde', () => {
  // Es el caso que hay que ver para arreglarlo, esconderlo seria lo peor.
  for (const modo of ['rol-grupo', 'rol', 'grupo', '']) {
    const b = agruparUsuarios(TODOS, modo)
    const todos = b.flatMap(x => x.sub.flatMap(sx => sx.users.map(u => u.id)))
    assert.ok(todos.includes('u6'), `se perdio el usuario sin roles con modo "${modo}"`)
  }
})

test('una lista vacia no explota', () => {
  for (const modo of ['rol-grupo', 'rol', 'grupo', '']) {
    const b = agruparUsuarios([], modo)
    assert.equal(b.flatMap(x => x.sub.flatMap(sx => sx.users)).length, 0)
  }
  assert.doesNotThrow(() => agruparUsuarios(null))
})

test('AGRUPACIONES arranca con el default y lo incluye', () => {
  assert.equal(AGRUPACIONES[0].valor, 'rol-grupo')
  assert.ok(AGRUPACIONES.every(a => 'label' in a))
})

// ── colapsado ───────────────────────────────────────────────────────────────

test('los bloques arrancan colapsados', () => {
  const abiertos = new Set()
  assert.equal(bloqueAbierto('admin', { abiertos, hayFiltro: false }), false)
})

test('abrir uno no abre los demas', () => {
  const abiertos = new Set(['admin'])
  assert.equal(bloqueAbierto('admin', { abiertos, hayFiltro: false }), true)
  assert.equal(bloqueAbierto('cajero', { abiertos, hayFiltro: false }), false)
})

test('con un filtro puesto se abren todos', () => {
  // Quien busca un nombre quiere VER al usuario, no encontrar un bloque cerrado
  // que ni dice si lo que busca esta adentro.
  const abiertos = new Set()
  assert.equal(bloqueAbierto('admin', { abiertos, hayFiltro: true }), true)
  assert.equal(bloqueAbierto('cajero', { abiertos, hayFiltro: true }), true)
})

test('sin agrupacion no hay nada que colapsar', () => {
  assert.equal(bloqueAbierto(null, { abiertos: new Set(), hayFiltro: false }), true)
})

test('alternar abre, cierra y no muta el set original', () => {
  const original = new Set(['admin'])
  const conCajero = alternar(original, 'cajero')
  assert.deepEqual([...conCajero].sort(), ['admin', 'cajero'])
  assert.deepEqual([...original], ['admin'], 'no se muto el original')
  assert.deepEqual([...alternar(conCajero, 'admin')], ['cajero'])
  assert.deepEqual([...alternar(null, 'x')], ['x'])
})

test('todoAbierto exige los DOS niveles abiertos', () => {
  const bloques = [{ titulo: 'admin', sub: [{ titulo: 'G1' }, { titulo: 'G2' }] }]
  assert.equal(todoAbierto(bloques, new Set(['admin'])), false, 'el nivel 1 solo no alcanza')
  assert.equal(todoAbierto(bloques, new Set(['admin', claveSub('admin', 'G1')])), false)
  assert.equal(
    todoAbierto(bloques, new Set(['admin', claveSub('admin', 'G1'), claveSub('admin', 'G2')])),
    true
  )
  // Sin agrupación no hay claves: no se puede "expandir todo"
  assert.equal(todoAbierto([{ titulo: null, sub: [{ titulo: null }] }], new Set()), false)
  assert.equal(todoAbierto([], new Set()), false)
})

test('los grupos tambien arrancan colapsados', () => {
  const abiertos = new Set(['admin'])   // el rol abierto, el grupo no
  assert.equal(bloqueAbierto('admin', { abiertos, hayFiltro: false }), true)
  assert.equal(subAbierto('admin', 'GRUPO PERROS', { abiertos, hayFiltro: false }), false)
})

test('abrir un grupo no abre el del mismo nombre en otro rol', () => {
  // Sin prefijar la clave con el rol, "GRUPO PERROS" de admin y de cajero serian
  // la misma y se abririan juntos.
  const abiertos = new Set([claveSub('admin', 'GRUPO PERROS')])
  assert.equal(subAbierto('admin', 'GRUPO PERROS', { abiertos, hayFiltro: false }), true)
  assert.equal(subAbierto('cajero', 'GRUPO PERROS', { abiertos, hayFiltro: false }), false)
})

test('un subbloque sin titulo esta siempre abierto (agrupacion de un nivel)', () => {
  assert.equal(subAbierto('admin', null, { abiertos: new Set(), hayFiltro: false }), true)
})

test('con filtro se abren los dos niveles', () => {
  const abiertos = new Set()
  assert.equal(bloqueAbierto('admin', { abiertos, hayFiltro: true }), true)
  assert.equal(subAbierto('admin', 'GRUPO PERROS', { abiertos, hayFiltro: true }), true)
})

test('todasLasClaves junta los dos niveles y saltea lo que no tiene titulo', () => {
  const bloques = [
    { titulo: 'admin', sub: [{ titulo: 'G1' }, { titulo: null }] },
    { titulo: null, sub: [{ titulo: null }] },
  ]
  assert.deepEqual(todasLasClaves(bloques), ['admin', claveSub('admin', 'G1')])
  assert.deepEqual(todasLasClaves([]), [])
  assert.deepEqual(todasLasClaves(null), [])
})

// ── departamento ───────────────────────────────────────────────────

const conDatos = (u, departamento, puesto) => ({ ...u, departamento, puesto })

const PERSONAS = [
  conDatos(superAdmin, 'DIRECCION', 'Director'),
  conDatos(adminPerros, 'ADMINISTRACION', 'Encargada'),
  conDatos(adminPerrosConLocal, 'ADMINISTRACION', 'Cajera'),
  conDatos(adminTita, 'SISTEMAS', 'Dev'),
  sinRoles, // sin ninguno de los datos cargados
]

test('filtra por departamento', () => {
  const r = filtrarUsuarios(PERSONAS, { departamento: 'ADMINISTRACION', estado: '' }, LOCALES)
  assert.deepEqual(ids(r), ['u2', 'u3'])
})

test('sin filtro de departamento pasan todos', () => {
  assert.equal(filtrarUsuarios(PERSONAS, { estado: '' }, LOCALES).length, 5)
})

test('SIN encuentra a los que faltan cargar', () => {
  // Es lo que hace usable la carga: los 60 usuarios que ya existen arrancan sin dato,
  // y sin este filtro no hay forma de listar los que quedan.
  const r = filtrarUsuarios(PERSONAS, { departamento: 'SIN', estado: '' }, LOCALES)
  assert.deepEqual(ids(r), ['u6'])
})

test('el departamento se cruza con los otros filtros, no los reemplaza', () => {
  // u2 y u3 son ADMINISTRACION y las dos alcanzan evelia (u3 lo tiene asignado, u2 es
  // admin sin locales cargados y ve todos los del grupo).
  const r = filtrarUsuarios(PERSONAS, { departamento: 'ADMINISTRACION', idLocal: 'evelia', estado: '' }, LOCALES)
  assert.deepEqual(ids(r), ['u2', 'u3'])
})

test('el departamento SI deja afuera al super_admin, al contrario que grupo y local', () => {
  // Los filtros de grupo/local nunca esconden a un rol global, porque entra a todos.
  // El departamento es otra cosa: es dónde trabaja la persona, y un director de
  // Dirección no aparece al buscar Administración aunque tenga acceso a todo.
  const r = filtrarUsuarios(PERSONAS, { departamento: 'ADMINISTRACION', estado: '' }, LOCALES)
  assert.ok(!ids(r).includes('u1'))
})

test('la busqueda por texto tambien encuentra por puesto', () => {
  assert.deepEqual(ids(filtrarUsuarios(PERSONAS, { texto: 'encargada', estado: '' }, LOCALES)), ['u2'])
  assert.deepEqual(ids(filtrarUsuarios(PERSONAS, { texto: 'cajera', estado: '' }, LOCALES)), ['u3'])
})

test('la busqueda sigue andando con usuarios sin esos datos', () => {
  // Un null en puesto no tiene que romper el filtro.
  assert.deepEqual(ids(filtrarUsuarios(PERSONAS, { texto: 'eze', estado: '' }, LOCALES)), ['u6'])
})

test('cuenta por departamento, una vez por usuario', () => {
  const c = conteoPorDepartamento(PERSONAS)
  assert.equal(c.get('ADMINISTRACION'), 2)
  assert.equal(c.get('DIRECCION'), 1)
  assert.equal(c.get('SIN'), 1)
})

test('agrupa por departamento con la etiqueta linda', () => {
  const b = agruparUsuarios(PERSONAS, 'departamento')
  const titulos = b.map(x => x.titulo)
  // Con acento y ordenado alfabeticamente; "Sin departamento" al final.
  assert.deepEqual(titulos, ['Administración', 'Dirección', 'Sistemas', 'Sin departamento'])
})

test('agrupando por departamento cada usuario aparece una sola vez', () => {
  // A diferencia de agrupar por rol, donde alguien con dos roles sale dos veces.
  const b = agruparUsuarios(PERSONAS, 'departamento')
  const todos = b.flatMap(x => x.sub.flatMap(s => s.users.map(u => u.id)))
  assert.equal(todos.length, new Set(todos).size)
  assert.equal(todos.length, PERSONAS.length)
})

test('agrupar por departamento no depende de tener roles', () => {
  // sinRoles no tiene user_app_roles: agrupando por rol cae en "Sin roles", pero por
  // departamento tiene que caer en "Sin departamento" y no desaparecer.
  const b = agruparUsuarios([sinRoles], 'departamento')
  assert.equal(b.length, 1)
  assert.equal(b[0].titulo, 'Sin departamento')
  assert.equal(b[0].total, 1)
})

test('la agrupacion por departamento esta en la lista del selector', () => {
  assert.ok(AGRUPACIONES.map(a => a.valor).includes('departamento'))
})
