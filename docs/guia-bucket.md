 Ahora que tus archivos están seguros y optimizados dentro de tu Bucket privado de Google Cloud Storage (GCS), necesitamos que tu nueva aplicación web pueda mostrarlos en pantalla.
Como el Bucket es 100% privado para proteger las facturas, no puedes usar enlaces fijos. La solución estándar en el desarrollo web profesional es utilizar URLs Firmadas (Signed URLs).
¿Cómo funciona la arquitectura de URLs Firmadas?
El usuario entra a tu aplicación web y hace clic en "Ver Pago".
El Frontend (React, Angular, Vue o HTML puro) le pide los datos al Backend.
Tu Backend consulta la base de datos, ve la ruta gs://tu-bucket-pagos/UYPLAVIG/facturas/060ad8b5...jpg.
Tu Backend (usando las credenciales de Google Cloud) genera un enlace HTTPS especial que tiene una firma criptográfica y un tiempo de expiración (por ejemplo, 15 minutos).
El Backend le envía ese enlace temporal al Frontend.
El navegador del usuario renderiza la imagen o el PDF inmediatamente. Pasados los 15 minutos, ese enlace deja de funcionar por completo, protegiendo tus datos.
1. El Código del Backend (Crear el Endpoint)
Dependiendo de qué estés usando para construir tu backend (Node.js o Python), aquí tienes cómo se genera esa URL temporal.
Como venimos trabajando con Python, aquí tienes un ejemplo limpio usando FastAPI (o Flask), pero la lógica de Google Cloud es la misma para cualquier lenguaje:
Python
from google.cloud import storage
import datetime
from fastapi import FastAPI, HTTPException

app = FastAPI()

# Inicializar el cliente de Google Cloud Storage
# Recomiendo que en producción uses variables de entorno en lugar del archivo físico .json
STORAGE_CLIENT = storage.Client.from_service_account_json('credenciales.json')

def obtener_url_temporal(ruta_gs: str, minutos_validez: int = 15):
    """
    Transforma 'gs://tu-bucket/local/facturas/archivo.jpg' 
    en una URL HTTPS pública pero temporal.
    """
    if not ruta_gs or not ruta_gs.startswith("gs://"):
        return None
        
    try:
        # Separar el nombre del bucket y la ruta interna del archivo
        partes = ruta_gs.replace("gs://", "").split("/", 1)
        nombre_bucket = partes[0]
        ruta_objeto = partes[1]
        
        bucket = STORAGE_CLIENT.bucket(nombre_bucket)
        blob = bucket.blob(ruta_objeto)
        
        # Generar la URL firmada v4 (Estándar actual de Google)
        url = blob.generate_signed_url(
            version="v4",
            expiration=datetime.timedelta(minutes=minutos_validez),
            method="GET" # Solo permitir lectura
        )
        return url
    except Exception as e:
        print(f"Error generando URL firmada: {e}")
        return None

@app.get("/api/pagos/{pago_id}")
def obtener_detalle_pago(pago_id: str):
    # 1. Aquí simulas la consulta a tu Base de Datos (PostgreSQL, MySQL, etc.)
    # Imaginemos que la DB te devuelve esto:
    registro_db = {
        "id": pago_id,
        "IdLocal": "UYPLAVIG",
        "Importe": 2890100,
        "Foto_Factura_GS": "gs://tu-bucket-pagos/UYPLAVIG/facturas/060ad8b5.Foto Factura.121133.jpg",
        "Pdf_GS": "gs://tu-bucket-pagos/UYPLAVIG/pdfs/060ad8b5.Pdf.121133.pdf"
    }
    
    # 2. Convertir las rutas internas de GS en URLs firmadas para el Frontend
    url_foto_web = obtener_url_temporal(registro_db["Foto_Factura_GS"])
    url_pdf_web = obtener_url_temporal(registro_db["Pdf_GS"])
    
    # 3. Responder al Frontend con los enlaces listos para usar
    return {
        "id": registro_db["id"],
        "idLocal": registro_db["IdLocal"],
        "importe": registro_db["Importe"],
        "fotoFacturaUrl": url_foto_web,
        "pdfUrl": url_pdf_web
    }
2. El Código del Frontend (Cómo mostrarlo en la Web App)
Gracias a que en el Paso 2 configuramos el content_type exacto de cada archivo (image/jpeg para fotos y application/pdf para los PDFs) al momento de subirlos, el navegador web no descargará el archivo en la computadora del usuario, sino que lo abrirá de forma nativa directamente dentro de tu aplicación web.
En el código HTML/JavaScript de tu frontend, los renderizas de la siguiente manera:
Para visualizar la Foto del Recibo/Factura:
Lo pones directamente dentro de una etiqueta <img>. Al ser una URL firmada de Google, se cargará al instante:
HTML
<div class="contenedor-foto">
  <h3>Comprobante de Pago</h3>
  <img 
    src="${pago.fotoFacturaUrl}" 
    alt="Foto de la factura" 
    style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);"
  />
</div>
Para visualizar el PDF:
Los PDFs no se pueden renderizar en una etiqueta <img>. La forma correcta y limpia de incrustarlos dentro de tu propia web app sin salir de ella es utilizando un <iframe>. Google Cloud Storage enviará el PDF y el navegador activará su visor nativo (con opciones de zoom, imprimir, etc.) dentro del cuadro:
HTML
<div class="contenedor-pdf" style="margin-top: 20px;">
  <h3>Documento PDF Adjunto</h3>
  <iframe 
    src="${pago.pdfUrl}" 
    width="100%" 
    height="600px" 
    style="border: 1px solid #ccc; border-radius: 8px;"
    allow="autoplay">
  </iframe>
</div>
Conclusión de tu nueva estructura corporativa:
Con estos 3 pasos completados, has construido un ecosistema mucho más robusto que AppSheet:
Mantuviste la relación: Tus registros siguen amarrados a sus archivos mediante el id y están segmentados por IdLocal.
Optimizaste costos y velocidad: Las imágenes ya no pesan megabytes innecesarios; tu web cargará de inmediato incluso desde conexiones móviles.
Seguridad absoluta: Tus documentos son privados y nadie puede acceder a ellos a menos que tu aplicación web verifique que el usuario está logueado y le genere una URL firmada de 15 minutos.
¿Hay alguna tecnología específica (como React, Node.js, Angular, Python) que estés usando para el frontend o backend donde quieras que adaptemos estos ejemplos, o necesitas asistencia con la base de datos?