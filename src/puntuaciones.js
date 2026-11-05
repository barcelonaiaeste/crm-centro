// Puntuaciones de campaña: catálogo de la rúbrica y cálculo de la clasificación.
// Lógica pura, sin React ni Supabase. Los apuntes viven en la tabla `puntos` (ver la migración
// 20261016000000_puntuaciones.sql) y los puntos automáticos por empresas salen de calcularPuntos() en App.jsx.
// La rúbrica, los puntos automáticos, el mínimo y la primera campaña se editan en Configuración → Puntuación
// (tabla `configuracion`); aquí solo se interpretan.
import { CENTRO } from './centro'
import { RUBRICA_EJEMPLO } from './rubricaEjemplo'

// Puntos de la categoría de empresas para el nivel «Mínimo» (por defecto 30)
export const MINIMO_GT_EMPRESAS = CENTRO.puntos.minimoGt

export const NIVELES = ['Pendiente', 'Mínimo', 'Práctica'] // índice = nivel

// Rúbrica activa: la guardada en Configuración o, si no hay, la de ejemplo (src/rubricaEjemplo.js)
const RUBRICA = CENTRO.puntos.rubrica || RUBRICA_EJEMPLO

// { [id]: { label, grupo, sinCodigo? } } en el orden de la rúbrica
export const CATEGORIAS = Object.fromEntries(RUBRICA.categorias.map((x) => [x.id, x]))
export const ORDEN_CATEGORIAS = RUBRICA.categorias.map((x) => x.id)
// «H. GT Empresas», o solo el nombre si la categoría no lleva código delante (Inicio de campaña)
export const etiquetaCategoria = (id) => {
  const x = CATEGORIAS[id]
  return !x ? id : x.sinCodigo ? x.label : `${id}. ${x.label}`
}

// Categoría a la que van los puntos automáticos por empresas y llamadas, y que cuenta para el nivel Mínimo
export const CAT_GT = CATEGORIAS[CENTRO.puntos.categoriaGt] ? CENTRO.puntos.categoriaGt : ORDEN_CATEGORIAS[0]
export const GT_LABEL = CATEGORIAS[CAT_GT]?.label || 'GT Empresas'

// Concepto: { id, cat, texto, min, max?, unidad?, nota?, penalizacion?, practica? }
//  - min/max: puntos (o rango de puntos) por unidad. Sin min = puntos libres.
//  - unidad: «por qué» se multiplica (hora, reunión…). Sin unidad, la cantidad es 1.
//  - nota: regla que el admin debe tener en cuenta (reparto, topes…). No se aplica sola.
//  - practica: cuenta como «ha conseguido una práctica» para el nivel Práctica (la base de datos lo lee igual)
const c = (id, cat, texto, min, max, extra = {}) => ({ id, cat, texto, min, max: max ?? min, ...extra })
const num0 = (v) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? undefined : Number(v))
export const CATALOGO = RUBRICA.conceptos
  .filter((x) => CATEGORIAS[x.cat])
  .map((x) => ({ ...x, min: num0(x.min), max: num0(x.max) ?? num0(x.min) }))
export const CONCEPTOS_PRACTICA = CATALOGO.filter((x) => x.practica).map((x) => x.id)

// Cada categoría admite además un concepto libre y una penalización (puntos libres que se guardan en negativo;
// si es la de los puntos automáticos, también baja su mínimo)
for (const cat of ORDEN_CATEGORIAS) {
  CATALOGO.push(c(`${cat}_otro`, cat, 'Otro (puntos libres)'))
  CATALOGO.push(c(`${cat}_penalizacion`, cat, 'Penalización (resta puntos)', undefined, undefined, { penalizacion: true }))
}

const POR_ID = Object.fromEntries(CATALOGO.map((x) => [x.id, x]))
export const conceptoDe = (id) => POR_ID[id] || null
export const conceptosDe = (cat) => CATALOGO.filter((x) => x.cat === cat)

// Puntos que propone la app para un concepto y una cantidad (el admin puede cambiarlos).
// En un rango propone el mínimo; sin baremo, nada.
export function puntosSugeridos(concepto, cantidad = 1) {
  if (!concepto || concepto.min === undefined) return ''
  return Math.round(concepto.min * (Number(cantidad) || 1) * 100) / 100
}
export const rangoTexto = (c) => {
  if (!c || c.min === undefined) return 'libre'
  const u = c.unidad ? ` / ${c.unidad}` : ''
  return c.max !== c.min ? `${num(c.min)}–${num(c.max)}${u}` : `${num(c.min)}${u}`
}

// 12,5 en lugar de 12.5 y sin ceros de más
export const num = (x) => {
  const n = Math.round((Number(x) || 0) * 100) / 100
  return String(n).replace('.', ',')
}

// ---------- Campañas (años naturales, de enero a diciembre) ----------
export const PRIMERA_CAMPANA = CENTRO.puntos.primeraCampana // la primera con datos
export const PRIMERA_CAMPANA_CRM = CENTRO.puntos.primeraCampana // desde ahí hay además puntos automáticos por empresas del CRM

export function campana(anio) {
  return { anio, id: String(anio), label: `Campaña ${anio}`, desde: `${anio}-01-01`, hasta: `${anio}-12-31` }
}
export const campanaDe = (iso) => campana(Number(iso.slice(0, 4)))
// De la actual hacia atrás
export function campanas(hoyIso) {
  const out = []
  for (let a = campanaDe(hoyIso).anio; a >= PRIMERA_CAMPANA; a--) out.push(campana(a))
  return out
}
export const dentroDe = (camp, iso) => iso >= camp.desde && iso <= camp.hasta

// ---------- Clasificación ----------
// resumen: filas de puntuacion_resumen() { usuario_id, total, gt, practica }
// auto: { [usuario_id]: puntos automáticos por empresas } (cuentan como GT Empresas)
// users: perfiles { id, nombre, centro }
// Orden (como la hoja CLASIFICACION del Excel): nivel (Práctica > Mínimo > Pendiente), total, GT Empresas, nombre.
export function clasificar({ resumen, auto, users }) {
  const porId = Object.fromEntries((resumen || []).map((r) => [r.usuario_id, r]))
  const filas = users.map((u) => {
    const r = porId[u.id] || {}
    const manual = Number(r.total) || 0
    const aut = Number(auto?.[u.id]) || 0
    const gt = (Number(r.gt) || 0) + aut
    const practica = !!r.practica
    const nivel = practica ? 2 : gt >= MINIMO_GT_EMPRESAS ? 1 : 0
    return { id: u.id, nombre: u.nombre, centro: u.centro || null, manual, auto: aut, total: manual + aut, gt, practica, nivel }
  })
  filas.sort((a, b) => b.nivel - a.nivel || b.total - a.total || b.gt - a.gt || a.nombre.localeCompare(b.nombre))
  // Mismo nivel, total y GT = mismo puesto
  filas.forEach((f, i) => {
    const p = filas[i - 1]
    f.puesto = p && p.nivel === f.nivel && p.total === f.total && p.gt === f.gt ? p.puesto : i + 1
  })
  return filas
}

// Apuntes de una persona agrupados por categoría, en el orden de la rúbrica: [{ cat, subtotal, filas }]
export function agruparPorCategoria(apuntes) {
  const out = []
  for (const cat of ORDEN_CATEGORIAS) {
    const filas = apuntes.filter((a) => a.categoria === cat).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id)
    if (filas.length) out.push({ cat, subtotal: filas.reduce((s, a) => s + Number(a.puntos), 0), filas })
  }
  return out
}
