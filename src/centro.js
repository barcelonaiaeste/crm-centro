// Configuración del centro: nombre, logo, colores, funciones activas, estados, reparto, correo y puntuación.
// Vive en la tabla `configuracion` (una fila, se edita en la pestaña Configuración) y se mezcla con los
// valores por defecto de DEFECTO. main.jsx la carga ANTES de importar App, así que el resto del código
// puede leer CENTRO, F… al importarse como si fueran constantes. Al guardar cambios se recarga la página.
import { supabase } from './supabase'

export const DEFECTO = {
  // ---------- Textos e imagen ----------
  nombre: 'Mi centro',              // nombre completo («Mi centro»): textos, buzón y remitente de correo
  nombreCorto: 'CRM',               // texto junto al icono si no hay logo («CRM»)
  lugar: '',                        // línea bajo el logo en la barra lateral: «Sevilla» → «SEVILLA · CRM»
  tituloApp: 'CRM de empresas',     // pestaña del navegador y cabecera en móvil
  equipo: 'el equipo de empresas',  // «El CRM de <equipo> de <nombre>»
  descripcion: '',                  // texto de la pantalla de entrada (vacío = uno genérico)
  logo: null,                       // imagen (data URL) del logo, en blanco sobre fondo oscuro
  color: null,                      // color de marca (#rrggbb); null = azul marino

  subcentroEtiqueta: 'Centro',      // cómo se llaman los subcentros: «Centro», «Escuela», «Facultad»…

  correo: {
    remitente: '',                  // nombre que ven las empresas (vacío = nombre)
    asunto: '{{centro}} - Propuesta de colaboración con {{empresa}}', // asunto del primer correo
  },

  estados: {},                      // nombres propios de estados: { otra_provincia: 'Otra comunidad' }

  lote: 5,                          // empresas por lote (+5 / −5 en Equipo)
  avisoPocas: 2,                    // aviso «te quedan pocas» con estas o menos sin contactar

  // Apagar una función solo la oculta: los datos se conservan y se puede volver a encender.
  funciones: {
    correo: true,
    plantillas: true,
    puntuacion: false,
    llamadas: true,
    prioritarias: true,
    listaNegra: true,
    reclamar: true,
    seguimiento: true,
    grafica: true,
    exportar: true,
    guia: true,
  },

  puntos: {
    empresa: { correo: 2, negativa: 1 },          // por empresa: correo enviado / dijeron que no sin correo
    llamada: { no_contesta: 0.5, seguimiento: 3 }, // por cada llamada registrada
    minimoGt: 30,                                  // puntos de la categoría de empresas para el nivel «Mínimo»
    primeraCampana: new Date().getFullYear(),      // primer año del selector de campañas
    categoriaGt: 'H',                              // categoría de la rúbrica que reciben los puntos automáticos
    rubrica: null,                                 // { categorias, conceptos }; null = src/rubricaEjemplo.js
  },
}

// Qué hace cada función (lo muestra la pestaña Configuración)
export const FUNCIONES = [
  ['correo', 'Correo con las empresas', 'Hilo de correos en cada ficha, enviado desde el buzón compartido (necesita el Gmail configurado en Vercel).'],
  ['plantillas', 'Plantillas de correo', 'Pestaña Plantillas y selector de plantilla al escribir un correo.'],
  ['puntuacion', 'Puntuación', 'Pestaña Puntos: rúbrica, clasificación, solicitudes de puntos y puntos automáticos por empresas y llamadas.'],
  ['llamadas', 'Registrar llamadas', '«¿Has llamado?» al añadir un seguimiento (suma puntos si la puntuación está activa).'],
  ['prioritarias', 'Empresas prioritarias', 'Registrar las prácticas conseguidas y marcar esas empresas como prioritarias.'],
  ['listaNegra', 'Lista negra', 'Estado y apartado para empresas que no hay que volver a contactar.'],
  ['reclamar', 'Reclamar empresas', 'Un miembro puede quedarse una empresa sin asignar desde su ficha.'],
  ['seguimiento', 'Pestaña Seguimiento', 'Últimos cambios y notas de todo el equipo (solo admins).'],
  ['grafica', 'Gráfica de reparto', 'Gráfica de empresas por persona en Equipo.'],
  ['exportar', 'Exportar empresas', 'Botón para descargar la lista de empresas en CSV (solo admins).'],
  ['guia', 'Guía de uso', 'Pestaña con la guía para el equipo.'],
]

const esObjeto = (v) => v && typeof v === 'object' && !Array.isArray(v)
// Mezcla profunda: los objetos se combinan; arrays, null y valores sueltos se sustituyen
export function mezclar(base, extra) {
  const out = { ...base }
  for (const [k, v] of Object.entries(extra || {})) {
    if (v === undefined) continue
    out[k] = esObjeto(v) && esObjeto(base[k]) ? mezclar(base[k], v) : v
  }
  return out
}

export function resolver(datos) {
  const c = mezclar(DEFECTO, datos)
  // Copia: mezclar comparte los objetos de DEFECTO que `datos` no trae, y no hay que tocarlos
  c.correo = { ...c.correo, remitente: c.correo.remitente || c.nombre }
  c.descripcion ||= `El CRM de ${c.equipo} de ${c.nombre}: reparte empresas, haz seguimiento y escribe a las empresas con plantillas de correo.`
  return c
}

// Valores vivos (export let: quien los importa ve los cargados)
export let DATOS = {}          // lo guardado tal cual en la tabla (sin los valores por defecto)
export let CENTRO = resolver({})
export let F = CENTRO.funciones
export let SUBCENTROS = []
export let HAY_SUBCENTROS = false

export async function cargarCentro() {
  const [conf, subs] = await Promise.all([
    supabase.from('configuracion').select('datos').maybeSingle(),
    supabase.from('subcentros').select('codigo').order('orden').order('codigo'),
  ])
  // Sin configuración (p. ej. aún no se ha aplicado la migración) la app funciona con los valores por defecto
  if (conf.error) console.error('No se ha podido leer la configuración:', conf.error.message)
  DATOS = conf.data?.datos || {}
  CENTRO = resolver(DATOS)
  F = CENTRO.funciones
  SUBCENTROS = (subs.data || []).map((s) => s.codigo)
  HAY_SUBCENTROS = SUBCENTROS.length > 0
  aplicarCentro()
}

// Rellena {{centro}} y {{empresa}} en textos de la configuración
export const textoCentro = (t, empresa = '') => String(t || '').replaceAll('{{centro}}', CENTRO.nombre).replaceAll('{{empresa}}', empresa)

// Escala de tonos a partir del color de marca: 500 es el elegido; los claros se mezclan con blanco y los
// oscuros con negro. Las clases brand-* de Tailwind leen estas variables.
const MEZCLAS = { 50: 92, 100: 84, 200: 68, 300: 48, 400: 24, 600: -15, 700: -30, 800: -45, 900: -58, 950: -72 }
export function aplicarCentro(cfg = CENTRO) {
  document.title = cfg.tituloApp
  const raiz = document.documentElement.style
  for (const tono of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]) {
    const v = `--color-brand-${tono}`
    if (!cfg.color) { raiz.removeProperty(v); continue }
    const m = MEZCLAS[tono]
    raiz.setProperty(v, tono === 500 ? cfg.color
      : `color-mix(in oklab, ${cfg.color} ${100 - Math.abs(m)}%, ${m > 0 ? 'white' : 'black'})`)
  }
}
