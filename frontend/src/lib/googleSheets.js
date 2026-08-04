// Sube una planilla a Google Drive convertida a Google Sheets nativo y
// devuelve el link para abrirla.
//
// Por qué todo pasa por el navegador y no por el backend: Google Identity
// Services entrega un access token efímero (~1h, sin refresh token) contra el
// mismo Client ID que ya usa el login. Así no hay que guardar credenciales de
// Google por usuario en nuestra base ni renovarlas — que es la parte cara y
// riesgosa de integrar Drive.
//
// El scope es `drive.file`: da acceso SOLO a los archivos que crea esta app,
// no al Drive del usuario. Es el mínimo que permite crear la planilla.
//
// Requisito de infraestructura: la Drive API tiene que estar habilitada en el
// proyecto de Google Cloud del Client ID (dc-smart-mvp). Si no lo está, la
// subida falla con 403 SERVICE_DISABLED y el link nunca se abre.

const GIS_SRC = 'https://accounts.google.com/gsi/client'
const SCOPE = 'https://www.googleapis.com/auth/drive.file'
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink'

export function sheetsDisponible() {
  return !!import.meta.env.VITE_GOOGLE_CLIENT_ID
}

// Se llama al montar la pantalla. El script tarda en bajar, y si se cargara
// recién al apretar el botón, `requestAccessToken()` quedaría detrás de un
// await y el navegador ya no lo trataría como parte del click: bloquea la
// ventana de Google. Precargando, el popup se abre dentro del gesto.
export function precargarGoogle() {
  if (!sheetsDisponible()) return
  cargarGis().catch(() => {})  // si falla, el botón lo reporta al usarse
}

// El script de GIS puede haberlo cargado el Login. Se comparte la promesa para
// no insertar dos <script> si se aprieta el botón dos veces seguidas.
let gisPromise = null
function cargarGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  if (gisPromise) return gisPromise
  gisPromise = new Promise((resolve, reject) => {
    const existente = document.querySelector(`script[src="${GIS_SRC}"]`)
    if (existente) {
      existente.addEventListener('load', () => resolve())
      existente.addEventListener('error', () => reject(new Error('No se pudo cargar Google Identity Services')))
      return
    }
    const script = document.createElement('script')
    script.src = GIS_SRC
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('No se pudo cargar Google Identity Services'))
    document.body.appendChild(script)
  })
  return gisPromise
}

// Token cacheado en memoria (nunca en localStorage: es una credencial). Se
// descarta 1 minuto antes del vencimiento real para no mandar a la API un
// token que expira en pleno viaje.
let tokenCache = { value: null, expiraEn: 0 }

// Tiene que llamarse SINCRÓNICAMENTE desde el handler del click. Si GIS ya está
// cargado no hay ningún await antes de `requestAccessToken()`, así que el popup
// de Google sigue contando como abierto por el usuario. Ese era el bug: con un
// `await` de red en el medio, el navegador lo bloqueaba.
export function pedirAccessToken(hintEmail) {
  if (tokenCache.value && Date.now() < tokenCache.expiraEn) return Promise.resolve(tokenCache.value)
  if (window.google?.accounts?.oauth2) return solicitarToken(hintEmail)
  return cargarGis().then(() => solicitarToken(hintEmail))
}

function solicitarToken(hintEmail) {
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      scope: SCOPE,
      // `prompt: ''` reusa el consentimiento ya dado: la pantalla de permisos
      // aparece la primera vez y después no molesta más.
      prompt: '',
      // Preselecciona la cuenta con la que la persona entró a DCSmart, así no
      // termina creando la planilla en un Drive personal por error.
      ...(hintEmail ? { hint: hintEmail } : {}),
      callback: (resp) => {
        if (resp?.error === 'access_denied') {
          // Pasa cuando la pantalla de consentimiento de OAuth sigue en modo
          // "Testing": sólo los testers cargados a mano pueden autorizar.
          reject(new Error('Google bloqueó el acceso: la app todavía no está publicada en la consola de Google. Avisale a sistemas.'))
          return
        }
        if (!resp?.access_token) { reject(new Error(resp?.error || 'Google no devolvió un token')); return }
        tokenCache = {
          value: resp.access_token,
          expiraEn: Date.now() + (Number(resp.expires_in || 3600) - 60) * 1000,
        }
        resolve(resp.access_token)
      },
      error_callback: (err) => reject(new Error(
        err?.type === 'popup_closed'  ? 'Se cerró la ventana de Google sin dar permiso' :
        err?.type === 'popup_failed_to_open' ? 'El navegador bloqueó la ventana de Google. Permití las ventanas emergentes de este sitio y probá de nuevo.' :
        'Google rechazó el permiso'
      )),
    })
    client.requestAccessToken()
  })
}

// Sube el blob y devuelve el webViewLink de la planilla ya convertida. Recibe
// el token ya obtenido: pedirlo acá lo dejaría detrás de la subida y del armado
// del archivo, que es justo lo que hace que el navegador bloquee el popup.
export async function subirComoSheet(nombre, blob, token) {
  // mimeType de destino = Google Sheets: Drive convierte el xlsx al subirlo,
  // así queda una planilla editable y no un adjunto para descargar.
  const metadata = { name: nombre, mimeType: 'application/vnd.google-apps.spreadsheet' }
  const form = new FormData()
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }))
  form.append('file', blob)

  const resp = await fetch(UPLOAD_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })

  if (resp.status === 401 || resp.status === 403) {
    // Token vencido/revocado, o Drive API deshabilitada. Se tira el cache para
    // que el próximo intento pida permiso de nuevo en vez de repetir el error.
    tokenCache = { value: null, expiraEn: 0 }
  }
  if (!resp.ok) {
    const detalle = await resp.text().catch(() => '')
    throw new Error(`Drive respondió ${resp.status}${detalle ? `: ${detalle.slice(0, 200)}` : ''}`)
  }

  const { webViewLink } = await resp.json()
  if (!webViewLink) throw new Error('Drive no devolvió el link de la planilla')
  return webViewLink
}
