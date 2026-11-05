// Importación de empresas desde Excel/CSV con estructura libre.
// Lógica pura (sin React): leer el libro, detectar la cabecera, sugerir a qué campo del CRM
// va cada columna, traducir estados/responsables y preparar las filas a insertar.

// Campos de la tabla empresas a los que se puede llevar una columna
export const CAMPOS = [
  { id: 'nombre', label: 'Nombre de la empresa', sinonimos: ['empresa', 'nombre', 'razon social', 'compania', 'company', 'organizacion', 'entidad', 'cliente'] },
  { id: 'cif', label: 'CIF / NIF', sinonimos: ['cif', 'nif', 'vat', 'identificacion fiscal', 'tax id'] },
  { id: 'sector', label: 'Sector', sinonimos: ['sector', 'actividad', 'industria', 'industry', 'ambito', 'area'] },
  { id: 'contacto', label: 'Persona de contacto', sinonimos: ['contacto', 'persona', 'contact', 'interlocutor', 'responsable empresa', 'nombre contacto'] },
  { id: 'email', label: 'Email', sinonimos: ['correo', 'email', 'e-mail', 'mail'] },
  { id: 'telefono', label: 'Teléfono', sinonimos: ['telefono', 'tel', 'tlf', 'movil', 'phone', 'telf'] },
  { id: 'web', label: 'Web', sinonimos: ['web', 'pagina', 'url', 'website', 'sitio'] },
  { id: 'direccion', label: 'Dirección / ciudad', sinonimos: ['direccion', 'domicilio', 'ciudad', 'localidad', 'poblacion', 'municipio', 'provincia', 'address', 'city'] },
  { id: 'estado', label: 'Estado', sinonimos: ['estado', 'situacion', 'status', 'fase', 'solicitud'] },
  { id: 'responsable', label: 'Responsable (miembro)', sinonimos: ['responsable', 'miembro', 'member', 'asignado', 'encargado', 'quien'] },
  { id: 'notas', label: 'Notas', sinonimos: ['notas', 'nota', 'observaciones', 'comentarios', 'comentario', 'notes'] },
  { id: 'proximo_contacto', label: 'Próximo contacto (fecha)', sinonimos: ['proximo contacto', 'fecha contacto', 'recordatorio', 'siguiente contacto'] },
]
export const IGNORAR = ''
export const A_NOTAS = '__notas' // la columna se añade a las notas como «Cabecera: valor»

export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9@.]+/g, ' ').trim()
export const cifNorm = (cif) => String(cif || '').replace(/[^A-Z0-9]/gi, '').toUpperCase()
// Clave para detectar la misma empresa por nombre: sin tildes, puntos ni forma jurídica (S.L., S.A.U.…)
export const claveNombre = (nombre) => norm(nombre).replace(/\./g, '')
  .replace(/\b(slu|sau|sll|sl|sa|scp|sccl|sociedad limitada|sociedad anonima)\b/g, '').replace(/\s+/g, ' ').trim()

const EMAIL_G = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi
const ES_EMAIL = /^\s*[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\s*$/i
const ES_WEB = /^\s*(https?:\/\/|www\.)\S+$/i
const ES_CIF = /^\s*[A-HJNP-SUVW]-?\d{7}-?[0-9A-J]\s*$/i
const ES_TEL = /^[\s+()\d./-]{9,}$/

// ---------- Lectura ----------
// Devuelve [{ nombre, filas: string[][] }] con todas las celdas como texto. Se quitan las filas
// vacías (o solo con casillas a 0/FALSE); cada fila guarda en .n su número de fila en Excel.
export async function leerLibro(archivo) {
  const XLSX = await import('xlsx')
  const datos = await archivo.arrayBuffer()
  const libro = XLSX.read(datos, { type: 'array', cellDates: true, dense: true })
  return libro.SheetNames.map((nombre) => {
    const hoja = libro.Sheets[nombre]
    const inicio = hoja['!ref'] ? XLSX.utils.decode_range(hoja['!ref']).s.r : 0
    const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, raw: false, defval: '', blankrows: true, dateNF: 'yyyy-mm-dd' })
      .map((f, i) => Object.assign(f.map((c) => String(c ?? '').trim()), { n: inicio + i + 1 }))
    return { nombre, filas: filas.filter((f) => f.some((c) => c !== '' && c !== '0' && c.toUpperCase() !== 'FALSE')) }
  })
}

// Hoja con más filas que parecen empresas (la que más columnas reconoce en su cabecera)
export function elegirHoja(hojas) {
  let mejor = 0, puntos = -1
  hojas.forEach((h, i) => {
    const cab = h.filas[detectarCabecera(h.filas)] || []
    const p = puntuarCabecera(cab) * 1000 + Math.min(h.filas.length, 999)
    if (p > puntos) { puntos = p; mejor = i }
  })
  return mejor
}

function campoPorCabecera(cabecera) {
  const c = norm(cabecera)
  if (!c) return null
  let mejor = null, largo = 0
  for (const campo of CAMPOS) {
    for (const s of campo.sinonimos) {
      const hit = c === s || new RegExp(`(^| )${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`).test(c)
      if (hit && s.length > largo) { mejor = campo.id; largo = s.length }
    }
  }
  return mejor
}
const puntuarCabecera = (fila) => new Set(fila.map(campoPorCabecera).filter(Boolean)).size

// Índice de la fila de cabecera: entre las 15 primeras, la que más columnas reconoce
export function detectarCabecera(filas) {
  let mejor = 0, puntos = 0
  filas.slice(0, 15).forEach((f, i) => {
    const p = puntuarCabecera(f)
    if (p > puntos) { puntos = p; mejor = i }
  })
  return mejor
}

// Qué campo parece por el contenido (cuando la cabecera no dice nada)
function campoPorContenido(valores) {
  const v = valores.filter(Boolean).slice(0, 50)
  if (v.length < 3) return null
  const prop = (re) => v.filter((x) => re.test(x)).length / v.length
  if (prop(ES_EMAIL) > 0.6) return 'email'
  if (prop(ES_WEB) > 0.6) return 'web'
  if (prop(ES_CIF) > 0.6) return 'cif'
  if (prop(ES_TEL) > 0.6) return 'telefono'
  return null
}

// Mapeo sugerido: { [índice de columna]: idCampo | IGNORAR | A_NOTAS }
export function sugerirMapeo(cabecera, datos) {
  const mapeo = {}
  const usados = new Set()
  const n = Math.max(cabecera.length, ...datos.slice(0, 50).map((f) => f.length))
  const columna = (i) => datos.map((f) => f[i] || '')
  // 1.º por cabecera, 2.º por contenido; cada campo solo una vez
  for (let i = 0; i < n; i++) {
    const campo = campoPorCabecera(cabecera[i])
    if (campo && !usados.has(campo)) { mapeo[i] = campo; usados.add(campo) }
  }
  for (let i = 0; i < n; i++) {
    if (mapeo[i] !== undefined) continue
    const campo = campoPorContenido(columna(i))
    if (campo && !usados.has(campo)) { mapeo[i] = campo; usados.add(campo) }
    else {
      // Columnas casi vacías o de casillas (0/1, TRUE/FALSE) se ignoran; el resto, a notas
      const llenas = columna(i).filter((x) => x && !/^(0|1|true|false|verdadero|falso|si|no|x)$/i.test(x))
      mapeo[i] = cabecera[i] && llenas.length >= 1 ? A_NOTAS : IGNORAR
    }
  }
  return mapeo
}

// ---------- Estados y responsables ----------
const REGLAS_ESTADO = [
  [/lista negra|no volver/, 'lista_negra'],
  [/no existe|cerrad|desaparec|extingu/, 'no_existe'],
  [/rechaz|no quier|no interes|denegad|descart|negativ/, 'rechazada'],
  [/conseguid|beca|aprobad|cerrad[ao] con|firmad|practica/, 'beca'],
  [/otra (provincia|comunidad|ciudad)|fuera de/, 'otra_provincia'],
  [/mas adelante|futuro|proximo curso|siguiente ano|despues/, 'mas_adelante'],
  [/segundo plazo/, 'segundo_plazo'],
  [/no contesta|no lo cogen|no responde|sin respuesta|no cogen|buzon/, 'no_contesta'],
  [/interes|reunion|propuesta|negociac/, 'interesados'],
  [/espera|enviad|email|correo|mail|contactad/, 'mail_enviado'],
  [/no contactad|sin contactar|pendiente|nuev/, 'sin_contactar'],
]
export function sugerirEstado(valor, estados) {
  const v = norm(valor)
  if (!v) return 'sin_contactar'
  const exacto = estados.find((e) => norm(e.label) === v || norm(e.id.replace(/_/g, ' ')) === v)
  if (exacto) return exacto.id
  // «No contactado» antes que la regla de «contactado» → mail enviado
  if (/^no contactad|^sin contact/.test(v)) return 'sin_contactar'
  const regla = REGLAS_ESTADO.find(([re, id]) => re.test(v) && estados.some((e) => e.id === id))
  return regla ? regla[1] : 'sin_contactar'
}

export function sugerirResponsable(valor, usuarios) {
  const v = norm(valor)
  if (!v) return ''
  const u = usuarios.find((x) => norm(x.nombre) === v)
    || usuarios.find((x) => norm(x.nombre).startsWith(v) || v.startsWith(norm(x.nombre)))
    || usuarios.find((x) => x.email && norm(x.email) === v)
  return u?.id || ''
}

// Valores distintos de una columna con su número de apariciones (para la tabla de traducción)
export function valoresDistintos(datos, col) {
  const cuenta = new Map()
  for (const f of datos) {
    const v = (f[col] || '').trim()
    cuenta.set(v, (cuenta.get(v) || 0) + 1)
  }
  return [...cuenta.entries()].sort((a, b) => b[1] - a[1]).map(([valor, n]) => ({ valor, n }))
}

// ---------- Limpieza ----------
const separar = (s) => String(s || '').split(/\s*(?:\/|;|\||\n|,(?=\s*\+?\d)| y )\s*/).map((x) => x.trim()).filter(Boolean)

export function limpiarTelefono(s) {
  return separar(s).map((t) => {
    // Excel guarda los teléfonos como número: «9.321634E8» o «932163400.0»
    if (/^\d(\.\d+)?e\+?\d+$/i.test(t)) t = String(Math.round(Number(t)))
    t = t.replace(/\.0$/, '')
    const dig = t.replace(/[^\d+]/g, '')
    return dig.length >= 9 ? dig.replace(/^(\+?\d{0,3}?)(\d{9})$/, (m, p, n) => (p ? p + ' ' : '') + n) : t
  }).join(' / ')
}

export function limpiarWeb(s) {
  const w = String(s || '').trim().split(/\s+/)[0] || ''
  if (!w) return ''
  return /^https?:\/\//i.test(w) ? w : /^www\.|^[a-z0-9-]+\.[a-z]{2,}/i.test(w) ? `https://${w}` : w
}

export function limpiarFecha(s) {
  const t = String(s || '').trim()
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
  if (m) {
    const anio = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${anio}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  return ''
}

// ---------- Preparar ----------
// Convierte las filas del Excel en empresas listas para insertar y las clasifica.
// Devuelve { nuevas, completar, saltadas } (completar: existentes con campos vacíos que el Excel rellena)
export function prepararImportacion({ cabecera, datos, primeraFila = 1, mapeo, estadoDe, responsableDe, responsableDefecto, existentes, modoDuplicados }) {
  const colsDe = (campo) => Object.keys(mapeo).filter((i) => mapeo[i] === campo).map(Number)
  const col = (campo) => colsDe(campo)[0]
  const aNotas = colsDe(A_NOTAS)

  const porCif = new Map(), porNombre = new Map()
  for (const e of existentes) {
    const c = cifNorm(e.cif)
    if (c.length > 5) porCif.set(c, e)
    porNombre.set(claveNombre(e.nombre), e)
  }

  const nuevas = [], completar = [], saltadas = []
  const vistosCif = new Set(), vistosNombre = new Set()

  datos.forEach((f, i) => {
    const fila = f.n ?? primeraFila + i // número de fila tal como se ve en Excel
    const v = (campo) => { const c = col(campo); return c === undefined ? '' : (f[c] || '').trim() }
    let nombre = v('nombre').replace(/\s+/g, ' ')
    const notas = []

    // Emails: el primero al campo; los demás, a notas. Si el «nombre» es un email, se mueve.
    let emails = (v('email').match(EMAIL_G) || [])
    if (ES_EMAIL.test(nombre)) {
      if (!emails.length) emails = [nombre.trim()]
      else if (!emails.includes(nombre.trim())) notas.push(`Otro correo: ${nombre.trim()}`)
      nombre = ''
    }
    if (!nombre) {
      if (f.some((x) => x)) saltadas.push({ fila, nombre: emails[0] || f.find((x) => x) || '', motivo: 'Sin nombre de empresa' })
      return
    }
    if (emails.length > 1) notas.push(`Otros correos: ${emails.slice(1).join(', ')}`)

    const cif = v('cif')
    const cn = cifNorm(cif).length > 5 ? cifNorm(cif) : ''
    const kn = claveNombre(nombre)

    if (cn ? vistosCif.has(cn) : vistosNombre.has(kn)) {
      saltadas.push({ fila, nombre, motivo: cn ? 'CIF repetido en el archivo' : 'Nombre repetido en el archivo' })
      return
    }
    if (cn) vistosCif.add(cn)
    vistosNombre.add(kn)

    const notaCol = v('notas')
    if (notaCol) notas.unshift(notaCol)
    for (const c of aNotas) if (f[c]) notas.push(`${cabecera[c] || `Columna ${c + 1}`}: ${f[c]}`)

    const estadoCol = col('estado')
    const respCol = col('responsable')
    const empresa = {
      nombre,
      cif: cn ? cif : '',
      sector: v('sector'),
      contacto: v('contacto'),
      email: emails[0] || '',
      telefono: limpiarTelefono(v('telefono')),
      web: limpiarWeb(v('web')),
      direccion: v('direccion'),
      estado: estadoCol === undefined ? 'sin_contactar' : (estadoDe[(f[estadoCol] || '').trim()] || 'sin_contactar'),
      responsable: (respCol === undefined ? responsableDefecto : (responsableDe[(f[respCol] || '').trim()] || responsableDefecto)) || null,
      notas: notas.join('\n') || null,
      proximo_contacto: limpiarFecha(v('proximo_contacto')) || null,
    }

    const existente = (cn && porCif.get(cn)) || porNombre.get(kn)
    if (existente) {
      const motivo = cn && porCif.get(cn) ? 'Ya está en el CRM (mismo CIF)' : 'Ya está en el CRM (mismo nombre)'
      if (modoDuplicados === 'completar') {
        const patch = {}
        for (const k of ['cif', 'sector', 'contacto', 'email', 'telefono', 'web', 'direccion']) {
          if (empresa[k] && !String(existente[k] || '').trim()) patch[k] = empresa[k]
        }
        if (Object.keys(patch).length) { completar.push({ fila, id: existente.id, nombre: existente.nombre, patch }); return }
      }
      saltadas.push({ fila, nombre, motivo })
      return
    }
    nuevas.push({ fila, ...empresa })
  })

  return { nuevas, completar, saltadas }
}
