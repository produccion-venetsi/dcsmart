// Versión de la app que se muestra en el Sidebar y en el cartel de "Hay una
// versión nueva".
//
// Antes salía tal cual de package.json y nadie se acordaba de subirla: el cartel
// decía "Tenés la v1.0.0" deploy tras deploy, así que no servía para saber si
// tenías la última. El major y el minor siguen siendo una decisión humana (pasar
// a 2.0 se edita a mano), pero el patch se calcula solo con la cantidad de
// commits, que sube en cada deploy sin que nadie haga nada.
//
// Se usa desde vite.config.js en tiempo de build, no en el navegador.

// Un repo recién clonado en shallow devuelve 1 commit. Por debajo de esto no se
// confía en el número: es más honesto mostrar la versión declarada que congelar
// la app en "1.0.1" para siempre.
const MINIMO_CONFIABLE = 2

export function construirVersion(versionPkg, cantidadCommits) {
  const declarada = String(versionPkg ?? '').trim()
  const [major = '0', minor = '0'] = declarada.split('.')

  const crudo = String(cantidadCommits ?? '').trim()
  // Solo dígitos: cualquier otra cosa (un mensaje de error de git, un sufijo)
  // significa que el conteo no es confiable.
  const commits = /^\d+$/.test(crudo) ? Number(crudo) : NaN

  if (!Number.isFinite(commits) || commits < MINIMO_CONFIABLE) {
    return declarada || '0.0.0'
  }
  return `${major || '0'}.${minor || '0'}.${commits}`
}
