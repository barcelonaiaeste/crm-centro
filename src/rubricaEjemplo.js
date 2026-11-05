// Rúbrica de ejemplo, genérica: la que se usa mientras un admin no guarde una propia desde
// Configuración → Puntuación, y la que se carga con «Cargar rúbrica de ejemplo».
// Para una rúbrica más completa, mira examples/rubrica-iaeste-malaga.json (se carga desde
// Configuración → Copia de seguridad → «Cargar desde archivo»).
// Formato del concepto: { id, cat, texto, min, max, unidad?, nota?, practica? } (ver src/puntuaciones.js).
//
// Dos ids son especiales: la categoría 'H' es la que recibe los puntos automáticos por empresas y llamadas
// (Configuración → categoriaGt), y los conceptos con `practica: true` cuentan para el nivel «Práctica».

const c = (id, cat, texto, min, max, extra = {}) => ({ id, cat, texto, min, max: max ?? min, ...extra })

const CONCEPTOS = [
  // Inicio de campaña
  c('antiguedad', 'INI', 'Antigüedad (campañas completadas)', 5, 5, { unidad: 'campaña' }),
  c('arrastre', 'INI', 'Arrastre de la campaña anterior', undefined, undefined, { nota: 'La mitad de los puntos de la campaña anterior (nada si eran menos de 10 o si disfrutó una práctica).' }),

  // A. Vida del equipo
  c('a_reunion', 'A', 'Asistir a una reunión del equipo', 1, 1, { unidad: 'reunión' }),
  c('a_cargo', 'A', 'Ocupar un cargo en la junta o coordinar un grupo', 10, 10, { unidad: 'tramo', nota: 'Se anota una vez por tramo (por ejemplo, dos al año).' }),
  c('a_evento', 'A', 'Organizar o participar en un evento', 3, 10),

  // H. Empresas (recibe los puntos automáticos)
  c('h_jornada_llamadas', 'H', 'Asistir a una jornada de llamadas', 0.5),
  c('h_reunion_conseguir', 'H', 'Conseguir una reunión con una empresa', 5),
  c('h_reunion_online', 'H', 'Reunirse con una empresa online', 10),
  c('h_reunion_presencial', 'H', 'Reunirse con una empresa presencialmente', 15),
  c('h_patrocinador', 'H', 'Conseguir un patrocinador', 20),
  c('h_practica_renovacion', 'H', 'Conseguir una práctica de una empresa que ya colaboraba', 25, 25, { practica: true }),
  c('h_practica_nueva', 'H', 'Conseguir una práctica de una empresa nueva', 50, 50, { practica: true }),
]

export const RUBRICA_EJEMPLO = {
  categorias: [
    { id: 'INI', label: 'Inicio de campaña', grupo: 'Campaña', sinCodigo: true },
    { id: 'A', label: 'Vida del equipo', grupo: 'Equipo' },
    { id: 'H', label: 'Empresas', grupo: 'Grupos de trabajo' },
  ],
  conceptos: CONCEPTOS,
}
