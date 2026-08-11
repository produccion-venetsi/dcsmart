// Los íconos de los tipos de documento.
//
// El tipo guarda una CLAVE (ver lib/documentos.js del backend, que las valida) y acá
// está el dibujo. La clave se guarda en la base y el dibujo vive en el código: así,
// cambiar cómo se ve un ícono no toca datos.
//
// Todos con el mismo trazo y el mismo viewBox que el resto de la app: 24×24, stroke
// currentColor, sin relleno. Un ícono con relleno al lado de once sin relleno se ve
// como un error.

const D = {
  documento: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </>
  ),
  contrato: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      {/* La firma: es lo que distingue un contrato de un documento cualquiera. */}
      <path d="M8 17c1.5-2 2.5-2 3 0s1.5 2 3-1" />
    </>
  ),
  habilitacion: (
    <>
      {/* Escudo con tilde: habilitado. */}
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 11 11.5 13.5 16 9" />
    </>
  ),
  reporte: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      {/* Barras de un gráfico. */}
      <line x1="8" y1="18" x2="8" y2="14" />
      <line x1="12" y1="18" x2="12" y2="11" />
      <line x1="16" y1="18" x2="16" y2="15" />
    </>
  ),
  certificado: (
    <>
      <circle cx="12" cy="9" r="6" />
      <polyline points="9 15 9 22 12 20 15 22 15 15" />
    </>
  ),
  plano: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="10" y1="10" x2="10" y2="20" />
    </>
  ),
  foto: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="M21 17l-5-5-4 4-2-2-4 4" />
    </>
  ),
  link: (
    <>
      <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5" />
      <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7L12 19" />
    </>
  ),
  factura: (
    <>
      <path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="9" y1="12" x2="15" y2="12" />
    </>
  ),
  seguro: (
    <>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      {/* Un paraguas adentro del escudo sería ilegible a 16px: va un más, de "cobertura". */}
      <line x1="12" y1="8" x2="12" y2="14" />
      <line x1="9" y1="11" x2="15" y2="11" />
    </>
  ),
  impuesto: (
    <>
      <circle cx="12" cy="12" r="9" />
      <line x1="9" y1="15" x2="15" y2="9" />
      <circle cx="9.5" cy="9.5" r="1.2" />
      <circle cx="14.5" cy="14.5" r="1.2" />
    </>
  ),
  carpeta: (
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  ),
}

export default function IconoDocumento({ clave, size = 16, title }) {
  // Una clave que no conocemos cae en el documento genérico: un tipo guardado con un
  // ícono que después se saca del catálogo no puede dejar la fila sin nada.
  const dibujo = D[clave] ?? D.documento
  return (
    <svg
      viewBox="0 0 24 24" width={size} height={size}
      fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round"
      // Decorativo salvo que se le dé un título: el nombre del tipo ya está al lado en
      // texto, así que repetirlo en un lector de pantalla es ruido.
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      style={{ flexShrink: 0 }}
    >
      {title && <title>{title}</title>}
      {dibujo}
    </svg>
  )
}
