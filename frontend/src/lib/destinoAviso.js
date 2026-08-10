// A dónde lleva un aviso y en qué contexto hay que ponerse antes de ir.
//
// El problema que resuelve: un aviso puede ser de un local distinto del que el
// usuario está mirando. Antes se navegaba al registro sin cambiar de contexto, y el
// backend cortaba con 403 "Sin acceso" (ver la validación por allowedLocalIds en
// routes/pagos.js). Con cajas era peor: el destino es el listado con ?caja=<id>, que
// filtra por el local activo, así que el drawer no abría nunca y no había ni error.
//
// Y el aviso se marcaba leído ANTES de navegar, así que el usuario perdía las dos
// cosas: no veía el registro y el aviso desaparecía del contador. Para un aviso de
// desauditoría — que es alguien pidiendo que revises algo — eso es peor que el error.
//
// Acá se resuelve qué hacer ANTES de tocar nada, para que la pantalla no tenga que
// decidir con datos a medias.

// A dónde va cada aviso según de qué habla.
//
// Un pago va a su formulario de edición, que es a donde lleva también el listado.
//
// Una caja va al LISTADO con ?caja=<id>, que abre el drawer de detalle. NO a
// /cajas/<id>: esa ruta renderiza una segunda pantalla de detalle a la que no
// linkeaba nada de la app y que tiene menos cosas que el drawer (que es la que la
// gente conoce).
export function rutaDe(aviso) {
  if (!aviso?.id_registro) return null
  if (aviso.tabla === 'pagos') return `/pagos/${aviso.id_registro}/editar`
  if (aviso.tabla === 'cajas') return `/cajas?caja=${aviso.id_registro}`
  return null
}

// Busca el local del aviso entre los que el usuario realmente maneja.
// `misApps` es lo que devuelve GET /auth/my-apps: [{ id, nombre, locales: [...] }].
export function buscarLocal(misApps, idLocal) {
  if (!idLocal) return null
  for (const app of misApps ?? []) {
    const local = (app.locales ?? []).find(l => l.id === idLocal)
    if (local) return { app, local }
  }
  return null
}

// Qué hacer al abrir un aviso. Devuelve una de estas acciones:
//
//   { accion: 'navegar', ruta }                      ya estás en el contexto correcto
//   { accion: 'cambiar-contexto', ruta, app, local }  hay que moverse antes de ir
//   { accion: 'sin-acceso', mensaje }                el aviso es de un local ajeno
//   { accion: 'solo-marcar' }                        el aviso no lleva a ningún lado
//
// La pantalla ejecuta la acción; la decisión vive acá y se testea sin renderizar.
export function resolverApertura(aviso, { misApps, appActiva, localActivo }) {
  const ruta = rutaDe(aviso)

  // Un aviso sin registro (o de una tabla que no sabemos abrir) solo se marca leído.
  if (!ruta) return { accion: 'solo-marcar' }

  // Sin local no hay contexto que ajustar: se navega y que el backend decida.
  if (!aviso.id_local) return { accion: 'navegar', ruta }

  // Ya estamos en el local del aviso.
  if (localActivo?.id === aviso.id_local) return { accion: 'navegar', ruta }

  const encontrado = buscarLocal(misApps, aviso.id_local)
  if (!encontrado) {
    // El aviso le llegó pero hoy no maneja ese local: pudo perder el acceso después
    // de que se generó. Se nombra el local, que es lo que le permite pedirlo.
    const donde = [aviso.grupo?.nombre, aviso.local?.nombre].filter(Boolean).join(' / ')
    return {
      accion: 'sin-acceso',
      mensaje: donde
        ? `Este aviso es de ${donde} y no tenés acceso a ese local`
        : 'Este aviso es de un local al que no tenés acceso',
    }
  }

  return {
    accion: 'cambiar-contexto',
    ruta,
    app: encontrado.app,
    local: encontrado.local,
    // Cambiar de grupo mueve al usuario más lejos que cambiar de local dentro del
    // mismo grupo: la pantalla lo dice distinto según el caso.
    cambiaGrupo: appActiva?.id !== encontrado.app.id,
  }
}

// El texto del aviso de "te moví de contexto". Se avisa siempre: el usuario apretó
// un aviso, no pidió cambiar de local, y quedarse sin entender dónde está es peor
// que un cartel de más.
export function mensajeDeCambio({ app, local, cambiaGrupo }) {
  return cambiaGrupo
    ? `Cambiado a ${app.nombre} / ${local.nombre} para abrir el aviso`
    : `Cambiado al local ${local.nombre} para abrir el aviso`
}
