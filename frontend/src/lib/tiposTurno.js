// Los seis tipos de turno que ofrece la app.
//
// Estaba escrito a mano en tres lugares: el filtro de la tabla de Cajas, el filtro
// del reporte de Cajas, y el alta de caja. Con tres copias, agregar un tipo era
// encontrar las tres y no olvidarse de ninguna.
//
// Ojo: el enum de Postgres guarda la ETIQUETA visible (via @map en schema.prisma),
// no una clave interna. Por eso estos strings viajan tal cual al backend; la
// traduccion a la clave de Prisma la hace backend/src/lib/tipoTurno.js.
export const TIPOS_TURNO = ['Mañana', 'Tarde', 'Noche', 'Trasnoche', 'Evento', 'Otros']

export const TURNO_OPTIONS = TIPOS_TURNO.map((t) => ({ value: t, label: t }))
