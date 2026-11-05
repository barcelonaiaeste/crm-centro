import { useState, useEffect, useMemo, useRef } from 'react'
import {
  Building2, Palette, ToggleRight, ListChecks, Mail, Trophy, Save, Upload, Trash2, Plus, ChevronUp, ChevronDown,
  AlertCircle, RotateCcw, Download, FileUp, X, ChevronRight,
} from 'lucide-react'
import { supabase } from './supabase'
import { DATOS, DEFECTO, FUNCIONES, SUBCENTROS, mezclar, resolver, aplicarCentro } from './centro'
import { RUBRICA_EJEMPLO } from './rubricaEjemplo'
import { ESTADOS_TODOS } from './estados'
import { Input, Label, Btn, Aviso } from './ui'
import { estadoCorreo } from './EmailThread'

// Pestaña Configuración (solo admins): edita la fila de `configuracion` y la tabla `subcentros`.
// Todo se guarda de una vez con «Guardar cambios» y la página se recarga para aplicar la configuración nueva.

const SECCIONES = [
  ['identidad', 'Nombre y aspecto', Palette],
  ['funciones', 'Funciones', ToggleRight],
  ['empresas', 'Empresas y equipo', ListChecks],
  ['correo', 'Correo', Mail],
  ['puntuacion', 'Puntuación', Trophy],
  ['copia', 'Copia de seguridad', Download],
]

const LOGO_MAX_ALTO = 160 // px: el logo se reduce a esta altura y se guarda como PNG dentro de la configuración
const ID_CAT = /^[A-Za-z0-9_]{1,12}$/
const ID_SUB = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,19}$/
const nuevoId = () => `c_${Math.random().toString(36).slice(2, 8)}`
const copia = (x) => JSON.parse(JSON.stringify(x))
const aNum = (v) => (v === '' || v === null || v === undefined ? NaN : Number(String(v).replace(',', '.')))

const Seccion = ({ titulo, sub, children }) => (
  <section className="card p-5 sm:p-6 space-y-4">
    <div>
      <h2 className="text-lg font-bold text-slate-900">{titulo}</h2>
      {sub && <p className="text-sm text-slate-500 mt-0.5">{sub}</p>}
    </div>
    {children}
  </section>
)
const Campo = ({ label, ayuda, children }) => (
  <div>
    <Label>{label}</Label>
    {children}
    {ayuda && <p className="text-[11px] text-slate-400 mt-1">{ayuda}</p>}
  </div>
)
const Interruptor = ({ on, onChange, label }) => (
  <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
    className={`relative shrink-0 w-11 h-6 rounded-full transition ${on ? 'bg-brand-600' : 'bg-slate-300'}`}>
    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
  </button>
)
const iconBtn = 'p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30'

// Reduce la imagen a LOGO_MAX_ALTO de alto y la devuelve como data URL PNG
function leerLogo(archivo) {
  return new Promise((ok, mal) => {
    if (!/^image\//.test(archivo.type)) { mal(new Error('El logo tiene que ser una imagen (PNG, JPG, SVG…).')); return }
    const url = URL.createObjectURL(archivo)
    const img = new Image()
    img.onload = () => {
      const k = Math.min(1, LOGO_MAX_ALTO / img.height)
      const cv = document.createElement('canvas')
      cv.width = Math.max(1, Math.round(img.width * k)); cv.height = Math.max(1, Math.round(img.height * k))
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height)
      URL.revokeObjectURL(url)
      const datos = cv.toDataURL('image/png')
      if (datos.length > 900_000) mal(new Error('El logo es demasiado grande incluso reducido. Prueba con una imagen más sencilla.'))
      else ok(datos)
    }
    img.onerror = () => { URL.revokeObjectURL(url); mal(new Error('No se ha podido leer la imagen.')) }
    img.src = url
  })
}

// Lo que se guarda: la configuración completa (valores por defecto incluidos), para que no cambie sola
// si algún día cambian los valores por defecto del código.
const inicial = () => {
  const c = mezclar(DEFECTO, DATOS)
  c.puntos = { ...c.puntos, rubrica: copia(c.puntos.rubrica || RUBRICA_EJEMPLO) }
  return c
}

export default function Configuracion() {
  const [cfg, setCfg] = useState(inicial)
  const [subs, setSubs] = useState(SUBCENTROS)
  const [seccion, setSeccion] = useState('identidad')
  const [err, setErr] = useState('')
  const [guardando, setGuardando] = useState(false)
  const base = useRef(JSON.stringify([inicial(), SUBCENTROS]))
  const cambiado = JSON.stringify([cfg, subs]) !== base.current

  // Avisa antes de salir con cambios sin guardar
  useEffect(() => {
    if (!cambiado) return
    const f = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', f)
    return () => window.removeEventListener('beforeunload', f)
  }, [cambiado])

  // Vista previa en vivo del color y del título
  useEffect(() => { aplicarCentro(resolver(cfg)) }, [cfg.color, cfg.tituloApp]) // eslint-disable-line react-hooks/exhaustive-deps
  // Al salir de Ajustes sin guardar se vuelve a lo guardado
  useEffect(() => () => aplicarCentro(), [])

  const set = (ruta, v) => setCfg((c) => {
    const n = copia(c)
    const claves = ruta.split('.')
    let o = n
    for (const k of claves.slice(0, -1)) o = o[k] ||= {}
    o[claves.at(-1)] = v
    return n
  })

  const validar = () => {
    if (!cfg.nombre.trim()) return 'Pon el nombre del centro (Nombre y aspecto).'
    if (!cfg.tituloApp.trim()) return 'Pon el título de la aplicación (Nombre y aspecto).'
    if (!(Number.isInteger(+cfg.lote) && +cfg.lote >= 1 && +cfg.lote <= 100)) return 'Las empresas por lote tienen que ser un número entre 1 y 100.'
    if (!(Number.isInteger(+cfg.avisoPocas) && +cfg.avisoPocas >= 0)) return 'El aviso de «quedan pocas» tiene que ser un número entero.'
    const vistos = new Set()
    for (const s of subs) {
      if (!ID_SUB.test(s)) return `«${s}» no vale como ${cfg.subcentroEtiqueta.toLowerCase()}: hasta 20 letras, números, espacios, puntos o guiones.`
      if (vistos.has(s)) return `«${s}» está repetido en ${cfg.subcentroEtiqueta.toLowerCase()}s.`
      vistos.add(s)
    }
    const p = cfg.puntos
    for (const [k, v] of [['correo con empresa', p.empresa.correo], ['empresa negativa', p.empresa.negativa], ['llamada no contestada', p.llamada.no_contesta], ['llamada de seguimiento', p.llamada.seguimiento], ['mínimo', p.minimoGt]]) {
      if (Number.isNaN(aNum(v))) return `Puntuación: falta el número de «${k}».`
    }
    if (!(Number.isInteger(+p.primeraCampana) && +p.primeraCampana >= 2000 && +p.primeraCampana <= 2100)) return 'Puntuación: la primera campaña tiene que ser un año.'
    const cats = p.rubrica.categorias
    if (!cats.length) return 'Puntuación: la rúbrica necesita al menos una categoría.'
    const ids = new Set()
    for (const c of cats) {
      if (!ID_CAT.test(c.id)) return `Puntuación: el código de categoría «${c.id}» solo puede tener letras, números o _ (máx. 12).`
      if (ids.has(c.id)) return `Puntuación: el código de categoría «${c.id}» está repetido.`
      if (!c.label.trim()) return `Puntuación: la categoría ${c.id} necesita un nombre.`
      ids.add(c.id)
    }
    if (!ids.has(p.categoriaGt)) return 'Puntuación: elige a qué categoría van los puntos automáticos.'
    for (const x of p.rubrica.conceptos) {
      if (!x.texto.trim()) return `Puntuación: hay un concepto sin texto en la categoría ${x.cat}.`
      if (x.min !== '' && x.min !== undefined && Number.isNaN(aNum(x.min))) return `Puntuación: «${x.texto}» tiene unos puntos que no son un número.`
      if (x.max !== '' && x.max !== undefined && Number.isNaN(aNum(x.max))) return `Puntuación: «${x.texto}» tiene un máximo que no es un número.`
    }
    return ''
  }

  // Normaliza números y quita marcas internas antes de guardar
  const limpiar = () => {
    const c = copia(cfg)
    c.lote = +c.lote; c.avisoPocas = +c.avisoPocas
    for (const k of ['correo', 'negativa']) c.puntos.empresa[k] = aNum(c.puntos.empresa[k])
    for (const k of ['no_contesta', 'seguimiento']) c.puntos.llamada[k] = aNum(c.puntos.llamada[k])
    c.puntos.minimoGt = aNum(c.puntos.minimoGt); c.puntos.primeraCampana = +c.puntos.primeraCampana
    c.puntos.rubrica.categorias = c.puntos.rubrica.categorias.map(({ nueva, ...x }) => ({ ...x, label: x.label.trim(), grupo: (x.grupo || '').trim() })) // eslint-disable-line no-unused-vars
    c.puntos.rubrica.conceptos = c.puntos.rubrica.conceptos.map((x) => {
      const o = { id: x.id, cat: x.cat, texto: x.texto.trim() }
      if (x.min !== '' && x.min !== undefined) o.min = aNum(x.min)
      if (x.max !== '' && x.max !== undefined) o.max = aNum(x.max)
      if (x.unidad?.trim()) o.unidad = x.unidad.trim()
      if (x.nota?.trim()) o.nota = x.nota.trim()
      if (x.practica) o.practica = true
      return o
    })
    for (const [id, v] of Object.entries(c.estados)) if (!v?.trim()) delete c.estados[id]
    return c
  }

  const guardar = async () => {
    const problema = validar()
    if (problema) { setErr(problema); return }
    setErr(''); setGuardando(true)
    try {
      // Subcentros quitados: a quien lo tuviera se le queda vacío (la base de datos lo hace sola)
      const quitados = SUBCENTROS.filter((s) => !subs.includes(s))
      if (quitados.length) {
        const { count } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).in('centro', quitados)
        if (count && !confirm(`${count} persona${count !== 1 ? 's tienen' : ' tiene'} ${quitados.join(', ')}: se ${count !== 1 ? 'quedarán' : 'quedará'} sin ${cfg.subcentroEtiqueta.toLowerCase()}. ¿Continuar?`)) {
          setGuardando(false); return
        }
        const { error } = await supabase.from('subcentros').delete().in('codigo', quitados)
        if (error) throw error
      }
      if (subs.length) {
        const { error } = await supabase.from('subcentros').upsert(subs.map((codigo, orden) => ({ codigo, orden })))
        if (error) throw error
      }
      const { data, error } = await supabase.from('configuracion').update({ datos: limpiar() }).eq('id', true).select('id')
      if (error) throw error
      if (!data?.length) throw new Error('No se ha guardado: la tabla de configuración no existe o no eres admin.')
      base.current = JSON.stringify([cfg, subs])
      window.location.reload()
    } catch (e) {
      setErr(`No se ha podido guardar: ${e.message}`)
      setGuardando(false)
    }
  }

  const descartar = () => {
    if (!confirm('¿Descartar todos los cambios sin guardar?')) return
    const [c, s] = JSON.parse(base.current)
    setCfg(c); setSubs(s); setErr('')
  }

  return (
    <div className="space-y-4 pb-20">
      <div className="card p-1.5 flex gap-1 overflow-x-auto no-scrollbar">
        {SECCIONES.map(([id, label, Icono]) => (
          <button key={id} onClick={() => setSeccion(id)}
            className={`shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm transition ${seccion === id ? 'bg-brand-900 text-white font-semibold shadow-nav' : 'text-slate-600 font-medium hover:bg-slate-100'}`}>
            <Icono className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {seccion === 'identidad' && <Identidad cfg={cfg} set={set} setErr={setErr} />}
      {seccion === 'funciones' && <Funciones cfg={cfg} set={set} />}
      {seccion === 'empresas' && <Empresas cfg={cfg} set={set} subs={subs} setSubs={setSubs} />}
      {seccion === 'correo' && <Correo cfg={cfg} set={set} />}
      {seccion === 'puntuacion' && <Puntuacion cfg={cfg} set={set} />}
      {seccion === 'copia' && <Copia cfg={cfg} setCfg={setCfg} subs={subs} setSubs={setSubs} setErr={setErr} />}

      {(cambiado || err) && (
        <div className="fixed bottom-20 lg:bottom-6 inset-x-4 lg:left-[calc(16rem+2rem)] lg:right-8 z-50 max-w-3xl lg:mx-auto">
          <div className="rounded-2xl bg-brand-900 text-white shadow-pop px-4 py-3 flex flex-wrap items-center gap-3">
            <p className="flex-1 min-w-[12rem] text-sm">
              {err ? <span className="flex items-start gap-2 text-rose-200"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{err}</span>
                : 'Tienes cambios sin guardar. Al guardar, la página se recarga para aplicarlos a todo el equipo.'}
            </p>
            {cambiado && <button onClick={descartar} disabled={guardando} className="px-3 py-2 rounded-xl text-sm text-white/80 hover:bg-white/10">Descartar</button>}
            {cambiado && (
              <button onClick={guardar} disabled={guardando}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-brand-900 text-sm font-bold disabled:opacity-60">
                <Save className="w-4 h-4" />{guardando ? 'Guardando…' : 'Guardar cambios'}
              </button>
            )}
            {!cambiado && <button onClick={() => setErr('')} aria-label="Cerrar" className="p-1.5 rounded-lg hover:bg-white/10"><X className="w-4 h-4" /></button>}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- Nombre y aspecto ----------
function Identidad({ cfg, set, setErr }) {
  const archivo = useRef(null)
  const subir = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try { set('logo', await leerLogo(f)) } catch (x) { setErr(x.message) }
  }
  const r = resolver(cfg)
  return (
    <Seccion titulo="Nombre y aspecto" sub="Cómo se llama el centro y cómo se ve el CRM.">
      <div className="grid sm:grid-cols-2 gap-3">
        <Campo label="Nombre del centro" ayuda="Aparece en los textos, en la guía y como remitente de los correos.">
          <Input value={cfg.nombre} onChange={(e) => set('nombre', e.target.value)} placeholder="Mi centro" maxLength={80} />
        </Campo>
        <Campo label="Título de la aplicación" ayuda="Pestaña del navegador y cabecera en el móvil.">
          <Input value={cfg.tituloApp} onChange={(e) => set('tituloApp', e.target.value)} placeholder="CRM Mi centro" maxLength={60} />
        </Campo>
        <Campo label="Ciudad o lugar" ayuda="Debajo del logo, en la barra lateral. Puede quedar vacío.">
          <Input value={cfg.lugar} onChange={(e) => set('lugar', e.target.value)} placeholder="Sevilla" maxLength={40} />
        </Campo>
        <Campo label="Texto corto del logo" ayuda="Se muestra junto a un icono si no hay imagen de logo.">
          <Input value={cfg.nombreCorto} onChange={(e) => set('nombreCorto', e.target.value)} placeholder="CRM" maxLength={20} />
        </Campo>
        <Campo label="Quién usa el CRM" ayuda={`«El CRM de ${cfg.equipo || '…'} de ${cfg.nombre || '…'}»`}>
          <Input value={cfg.equipo} onChange={(e) => set('equipo', e.target.value)} placeholder="el equipo de empresas" maxLength={60} />
        </Campo>
      </div>
      <Campo label="Texto de la pantalla de entrada" ayuda="Vacío = un texto genérico con el nombre del centro.">
        <textarea value={cfg.descripcion} onChange={(e) => set('descripcion', e.target.value)} rows={2} maxLength={300} placeholder={r.descripcion}
          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-4 focus:ring-brand-500/15 focus:border-brand-500 resize-none" />
      </Campo>

      <div className="grid sm:grid-cols-2 gap-4">
        <Campo label="Logo" ayuda="Mejor en blanco con fondo transparente (se ve sobre el color de marca).">
          <div className="flex flex-wrap items-center gap-2">
            <input ref={archivo} type="file" accept="image/*" onChange={subir} className="hidden" />
            <Btn variant="ghost" onClick={() => archivo.current?.click()}><Upload className="w-4 h-4" />{cfg.logo ? 'Cambiar logo' : 'Subir logo'}</Btn>
            {cfg.logo && <Btn variant="danger" onClick={() => set('logo', null)}><Trash2 className="w-4 h-4" />Quitar</Btn>}
          </div>
        </Campo>
        <Campo label="Color de marca" ayuda="Barra lateral, botones y resaltados. Se ve en vivo mientras lo eliges.">
          <div className="flex items-center gap-2">
            <input type="color" value={cfg.color || '#2f6bb8'} onChange={(e) => set('color', e.target.value)}
              className="w-12 h-10 rounded-lg border border-slate-200 bg-white p-1 cursor-pointer" aria-label="Color de marca" />
            <span className="text-sm text-slate-500 tabular-nums">{cfg.color || 'Azul por defecto'}</span>
            {cfg.color && <button onClick={() => set('color', null)} className="text-xs text-slate-500 hover:underline inline-flex items-center gap-1"><RotateCcw className="w-3 h-3" />Por defecto</button>}
          </div>
        </Campo>
      </div>

      <div>
        <Label>Vista previa</Label>
        <div className="rounded-2xl bg-brand-900 text-white px-6 py-5 max-w-xs">
          <div className="flex items-center gap-2.5">
            {cfg.logo ? <img src={cfg.logo} alt="" className="h-9 w-auto" /> : (
              <>
                <div className="w-8 h-8 rounded-full border border-white/40 flex items-center justify-center"><Building2 className="w-4 h-4" /></div>
                <span className="text-lg tracking-[0.12em] font-light">{cfg.nombreCorto}</span>
              </>
            )}
          </div>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">{cfg.lugar ? `${cfg.lugar} · CRM` : 'CRM'}</p>
          <div className="mt-4 rounded-xl bg-white text-brand-900 text-sm font-semibold px-3.5 py-2">Empresas</div>
        </div>
      </div>
    </Seccion>
  )
}

// ---------- Estado del buzón (servidor) ----------
// Las credenciales viven en las variables de entorno: aquí solo se pregunta al servidor si las tiene.
function useEstadoCorreo() {
  const [estado, setEstado] = useState(undefined) // undefined = comprobando
  useEffect(() => { estadoCorreo().then(setEstado) }, [])
  return estado
}

function AvisoCorreo({ estado, encendido, completo = false }) {
  if (estado === undefined) return null
  if (estado === true) return completo ? <Aviso tono="ok">Buzón configurado en el servidor ✓</Aviso> : null
  if (!encendido && !completo) return null
  return (
    <Aviso tono="warn" icono={AlertCircle}>
      {estado === false
        ? <>El servidor no tiene buzón: faltan <code>GMAIL_USER</code> y <code>GMAIL_APP_PASSWORD</code> en las variables de entorno de Vercel. {encendido ? 'Mientras tanto no se pueden enviar correos: añádelas o apaga «Correo con las empresas».' : ''}</>
        : <>No se puede conectar con el servicio de correo{import.meta.env.DEV ? ' (en local, arráncalo con `npm run correo`)' : ''}.</>}
    </Aviso>
  )
}

// ---------- Funciones ----------
function Funciones({ cfg, set }) {
  const correo = useEstadoCorreo()
  return (
    <Seccion titulo="Funciones" sub="Apaga lo que tu centro no use. Apagar algo solo lo oculta: los datos se conservan y puedes volver a encenderlo.">
      <AvisoCorreo estado={correo} encendido={cfg.funciones.correo} />
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        {FUNCIONES.map(([id, nombre, texto]) => (
          <div key={id} className="flex items-start gap-4 px-4 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800">{nombre}</p>
              <p className="text-xs text-slate-500 mt-0.5">{texto}</p>
            </div>
            <Interruptor on={!!cfg.funciones[id]} onChange={(v) => set(`funciones.${id}`, v)} label={nombre} />
          </div>
        ))}
      </div>
    </Seccion>
  )
}

// ---------- Empresas y equipo ----------
function Empresas({ cfg, set, subs, setSubs }) {
  const [nuevo, setNuevo] = useState('')
  const mover = (i, d) => setSubs((l) => { const n = [...l]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n })
  const anadir = () => {
    const v = nuevo.trim().replace(/\s+/g, ' ')
    if (!v || subs.includes(v)) return
    setSubs((l) => [...l, v]); setNuevo('')
  }
  const etq = cfg.subcentroEtiqueta || 'Centro'
  return (
    <>
      <Seccion titulo="Reparto de empresas">
        <div className="grid sm:grid-cols-2 gap-3">
          <Campo label="Empresas por lote" ayuda="Las que se asignan o devuelven con los botones +/− de Equipo.">
            <Input type="number" inputMode="numeric" min="1" max="100" value={cfg.lote} onChange={(e) => set('lote', e.target.value)} />
          </Campo>
          <Campo label="Aviso de «te quedan pocas»" ayuda="Se avisa cuando a alguien le quedan estas o menos sin contactar.">
            <Input type="number" inputMode="numeric" min="0" value={cfg.avisoPocas} onChange={(e) => set('avisoPocas', e.target.value)} />
          </Campo>
        </div>
      </Seccion>

      <Seccion titulo={`${etq}s`} sub={`Escuelas o facultades a las que pertenece cada persona. Se eligen al registrarse y sirven para filtrar la clasificación. Si la lista queda vacía, no se pregunta.`}>
        <Campo label="Cómo se llaman" ayuda="Centro, Escuela, Facultad…">
          <Input value={cfg.subcentroEtiqueta} onChange={(e) => set('subcentroEtiqueta', e.target.value)} maxLength={20} className="sm:max-w-xs" />
        </Campo>
        {subs.length > 0 && (
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {subs.map((s, i) => (
              <div key={s} className="flex items-center gap-2 px-3 py-2">
                <span className="flex-1 text-sm font-semibold text-slate-700">{s}</span>
                <button onClick={() => mover(i, -1)} disabled={i === 0} className={iconBtn} aria-label="Subir"><ChevronUp className="w-3.5 h-3.5" /></button>
                <button onClick={() => mover(i, 1)} disabled={i === subs.length - 1} className={iconBtn} aria-label="Bajar"><ChevronDown className="w-3.5 h-3.5" /></button>
                <button onClick={() => setSubs((l) => l.filter((x) => x !== s))} className={`${iconBtn} hover:!text-rose-600`} aria-label={`Quitar ${s}`}><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2 sm:max-w-sm">
          <Input value={nuevo} onChange={(e) => setNuevo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && anadir()} placeholder="ETSII" maxLength={20} />
          <Btn variant="ghost" onClick={anadir} disabled={!nuevo.trim()}><Plus className="w-4 h-4" />Añadir</Btn>
        </div>
      </Seccion>

      <Seccion titulo="Nombres de los estados" sub="Cambia cómo se llama cada estado de una empresa. Vacío = el nombre de siempre.">
        <div className="grid sm:grid-cols-2 gap-3">
          {ESTADOS_TODOS.filter((e) => cfg.funciones.listaNegra || e.id !== 'lista_negra').map((e) => (
            <div key={e.id} className="flex items-center gap-2">
              <span className={`shrink-0 w-2 h-2 rounded-full ${e.dot}`} />
              <Input value={cfg.estados[e.id] || ''} onChange={(ev) => set(`estados.${e.id}`, ev.target.value)} placeholder={e.label} maxLength={30} />
            </div>
          ))}
        </div>
      </Seccion>
    </>
  )
}

// ---------- Correo ----------
function Correo({ cfg, set }) {
  const estado = useEstadoCorreo()
  return (
    <Seccion titulo="Correo" sub={cfg.funciones.correo ? 'Cómo salen los correos a las empresas.' : 'El correo está apagado en Funciones: esto solo se usará si lo enciendes.'}>
      <AvisoCorreo estado={estado} encendido={cfg.funciones.correo} completo />
      <Campo label="Nombre del remitente" ayuda={`Lo que ven las empresas como remitente. Vacío = «${cfg.nombre}». El buzón (dirección y contraseña) se configura en Vercel.`}>
        <Input value={cfg.correo.remitente} onChange={(e) => set('correo.remitente', e.target.value)} placeholder={cfg.nombre} maxLength={80} />
      </Campo>
      <Campo label="Asunto del primer correo" ayuda="{{centro}} = nombre del centro, {{empresa}} = nombre de la empresa. Al responder se usa «Re: …».">
        <Input value={cfg.correo.asunto} onChange={(e) => set('correo.asunto', e.target.value)} maxLength={200} />
      </Campo>
    </Seccion>
  )
}

// ---------- Puntuación ----------
function Puntuacion({ cfg, set }) {
  const p = cfg.puntos
  const rub = p.rubrica
  const [abierta, setAbierta] = useState(null)
  const setRub = (r) => set('puntos.rubrica', r)
  const cats = rub.categorias
  const porCat = useMemo(() => Object.fromEntries(cats.map((c) => [c.id, rub.conceptos.filter((x) => x.cat === c.id)])), [cats, rub.conceptos])

  const cambiarCat = (i, k, v) => {
    const r = copia(rub)
    const viejo = r.categorias[i].id
    r.categorias[i][k] = v
    // Si se cambia el código de una categoría nueva, sus conceptos la siguen
    if (k === 'id') {
      r.conceptos.forEach((x) => { if (x.cat === viejo) x.cat = v })
      if (p.categoriaGt === viejo) set('puntos.categoriaGt', v)
      if (abierta === viejo) setAbierta(v)
    }
    setRub(r)
  }
  const moverCat = (i, d) => { const r = copia(rub); [r.categorias[i], r.categorias[i + d]] = [r.categorias[i + d], r.categorias[i]]; setRub(r) }
  const quitarCat = (c) => {
    const n = porCat[c.id]?.length || 0
    if (!confirm(`¿Quitar la categoría «${c.label}»${n ? ` y sus ${n} conceptos` : ''}? Los puntos ya anotados se conservan.`)) return
    setRub({ categorias: rub.categorias.filter((x) => x.id !== c.id), conceptos: rub.conceptos.filter((x) => x.cat !== c.id) })
  }
  const anadirCat = () => {
    let id = 'N1'
    for (let k = 1; cats.some((c) => c.id === id); k++) id = `N${k}`
    setRub({ ...rub, categorias: [...cats, { id, label: 'Nueva categoría', grupo: '', nueva: true }] })
    setAbierta(id)
  }
  const cambiarConc = (id, k, v) => setRub({ ...rub, conceptos: rub.conceptos.map((x) => (x.id === id ? { ...x, [k]: v } : x)) })
  const quitarConc = (id) => setRub({ ...rub, conceptos: rub.conceptos.filter((x) => x.id !== id) })
  const anadirConc = (cat) => setRub({ ...rub, conceptos: [...rub.conceptos, { id: nuevoId(), cat, texto: '', min: '', max: '' }] })
  const cargarEjemplo = () => {
    if (!confirm('Se sustituirá la rúbrica actual por la de ejemplo. Los puntos ya anotados no cambian. ¿Continuar?')) return
    setRub(copia(RUBRICA_EJEMPLO)); set('puntos.categoriaGt', 'H')
  }
  const vaciar = () => {
    if (!confirm('Se quitarán todas las categorías y conceptos para empezar de cero. Los puntos ya anotados no cambian. ¿Continuar?')) return
    setRub({ categorias: [{ id: 'EMP', label: 'Empresas', grupo: '', nueva: true }], conceptos: [] }); set('puntos.categoriaGt', 'EMP')
  }
  const numInput = (ruta, valor) => (
    <Input inputMode="decimal" value={valor ?? ''} onChange={(e) => set(ruta, e.target.value)} className="!py-2" />
  )

  return (
    <>
      {!cfg.funciones.puntuacion && (
        <Aviso tono="warn" icono={AlertCircle}>La puntuación está apagada en <strong>Funciones</strong>. Puedes prepararla aquí y encenderla cuando esté lista.</Aviso>
      )}
      <Seccion titulo="Puntos automáticos" sub="Lo que suma cada persona sin que nadie lo anote, por las empresas que tiene asignadas.">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Campo label="Empresa con correo">{numInput('puntos.empresa.correo', p.empresa.correo)}</Campo>
          <Campo label="Empresa: «no» sin correo">{numInput('puntos.empresa.negativa', p.empresa.negativa)}</Campo>
          <Campo label="Llamada no contestada">{numInput('puntos.llamada.no_contesta', p.llamada.no_contesta)}</Campo>
          <Campo label="Llamada de seguimiento">{numInput('puntos.llamada.seguimiento', p.llamada.seguimiento)}</Campo>
        </div>
        <p className="text-xs text-slate-500">Por empresa cuenta lo mayor de las dos primeras (con correo: se llegó a enviar el correo aunque luego dijeran que no). Las llamadas suman aparte y solo si «Registrar llamadas» está encendido.</p>
        <div className="grid sm:grid-cols-3 gap-3">
          <Campo label="Categoría que los recibe">
            <select value={p.categoriaGt} onChange={(e) => set('puntos.categoriaGt', e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white">
              {cats.map((c) => <option key={c.id} value={c.id}>{c.sinCodigo ? c.label : `${c.id}. ${c.label}`}</option>)}
            </select>
          </Campo>
          <Campo label="Mínimo de esa categoría" ayuda="Puntos para el nivel «Mínimo» de la clasificación.">{numInput('puntos.minimoGt', p.minimoGt)}</Campo>
          <Campo label="Primera campaña" ayuda="Año desde el que se muestran campañas (una campaña = un año natural).">
            <Input type="number" inputMode="numeric" value={p.primeraCampana} onChange={(e) => set('puntos.primeraCampana', e.target.value)} className="!py-2" />
          </Campo>
        </div>
      </Seccion>

      <Seccion titulo="Rúbrica" sub="Categorías y conceptos por los que un admin da puntos («Dar puntos»). Cada categoría trae además «Otro» (puntos libres) y «Penalización».">
        <div className="flex flex-wrap gap-2">
          <Btn variant="ghost" onClick={anadirCat}><Plus className="w-4 h-4" />Nueva categoría</Btn>
          <Btn variant="ghost" onClick={cargarEjemplo}><RotateCcw className="w-4 h-4" />Cargar rúbrica de ejemplo</Btn>
          <Btn variant="danger" onClick={vaciar}><Trash2 className="w-4 h-4" />Empezar de cero</Btn>
        </div>
        <div className="space-y-2">
          {cats.map((c, i) => {
            const abiertaEsta = abierta === c.id
            const lista = porCat[c.id] || []
            return (
              <div key={`${i}-${c.nueva ? 'n' : c.id}`} className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 bg-slate-50">
                  <button onClick={() => setAbierta(abiertaEsta ? null : c.id)} className="flex-1 min-w-0 flex items-center gap-2 text-left" aria-expanded={abiertaEsta}>
                    <ChevronRight className={`w-4 h-4 text-slate-400 shrink-0 transition ${abiertaEsta ? 'rotate-90' : ''}`} />
                    <span className="text-xs font-bold text-slate-400 w-10 shrink-0">{c.id}</span>
                    <span className="text-sm font-semibold text-slate-800 truncate">{c.label}</span>
                    <span className="text-xs text-slate-400 shrink-0">{lista.length} concepto{lista.length !== 1 ? 's' : ''}</span>
                    {c.id === p.categoriaGt && <span className="shrink-0 text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-700">automáticos</span>}
                  </button>
                  <button onClick={() => moverCat(i, -1)} disabled={i === 0} className={iconBtn} aria-label="Subir"><ChevronUp className="w-3.5 h-3.5" /></button>
                  <button onClick={() => moverCat(i, 1)} disabled={i === cats.length - 1} className={iconBtn} aria-label="Bajar"><ChevronDown className="w-3.5 h-3.5" /></button>
                  <button onClick={() => quitarCat(c)} disabled={cats.length === 1} className={`${iconBtn} hover:!text-rose-600`} aria-label={`Quitar ${c.label}`}><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
                {abiertaEsta && (
                  <div className="p-3 space-y-3">
                    <div className="grid sm:grid-cols-[7rem_1fr_1fr] gap-2">
                      <Campo label="Código" ayuda={c.nueva ? 'Letras o números, corto.' : 'Fijo: ya puede haber puntos con él.'}>
                        <Input value={c.id} disabled={!c.nueva} onChange={(e) => cambiarCat(i, 'id', e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 12))} className="!py-2 disabled:bg-slate-50" />
                      </Campo>
                      <Campo label="Nombre"><Input value={c.label} onChange={(e) => cambiarCat(i, 'label', e.target.value)} maxLength={60} className="!py-2" /></Campo>
                      <Campo label="Grupo (opcional)"><Input value={c.grupo || ''} onChange={(e) => cambiarCat(i, 'grupo', e.target.value)} maxLength={40} className="!py-2" placeholder="Comité Local" /></Campo>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-slate-600">
                      <input type="checkbox" checked={!!c.sinCodigo} onChange={(e) => cambiarCat(i, 'sinCodigo', e.target.checked)} />
                      Mostrar solo el nombre (sin «{c.id}.» delante)
                    </label>
                    <div className="space-y-2">
                      {lista.length === 0 && <p className="text-xs text-slate-400">Sin conceptos: de momento solo tendrá «Otro» y «Penalización».</p>}
                      {lista.map((x) => (
                        <div key={x.id} className="rounded-lg border border-slate-200 p-2.5 space-y-2">
                          <div className="flex gap-2">
                            <Input value={x.texto} onChange={(e) => cambiarConc(x.id, 'texto', e.target.value)} placeholder="Qué se ha hecho (p. ej. Reunión con una empresa)" maxLength={200} className="!py-2" />
                            <button onClick={() => quitarConc(x.id)} className={`${iconBtn} hover:!text-rose-600 self-center`} aria-label="Quitar concepto"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <Input inputMode="decimal" value={x.min ?? ''} onChange={(e) => cambiarConc(x.id, 'min', e.target.value)} placeholder="Puntos" title="Puntos (vacío = libres)" className="!py-1.5 !text-xs" />
                            <Input inputMode="decimal" value={x.max ?? ''} onChange={(e) => cambiarConc(x.id, 'max', e.target.value)} placeholder="Máx. (rango)" title="Máximo si es un rango (vacío = igual que los puntos)" className="!py-1.5 !text-xs" />
                            <Input value={x.unidad || ''} onChange={(e) => cambiarConc(x.id, 'unidad', e.target.value)} placeholder="Por… (hora, reunión)" title="Unidad: los puntos se multiplican por la cantidad" maxLength={20} className="!py-1.5 !text-xs" />
                          </div>
                          <Input value={x.nota || ''} onChange={(e) => cambiarConc(x.id, 'nota', e.target.value)} placeholder="Nota para el admin (opcional): topes, reparto…" maxLength={300} className="!py-1.5 !text-xs" />
                          <label className="flex items-center gap-2 text-xs text-slate-600">
                            <input type="checkbox" checked={!!x.practica} onChange={(e) => cambiarConc(x.id, 'practica', e.target.checked)} />
                            Cuenta como «ha conseguido una práctica» (nivel Práctica de la clasificación)
                          </label>
                        </div>
                      ))}
                      <Btn variant="ghost" onClick={() => anadirConc(c.id)} className="!py-1.5 !text-xs"><Plus className="w-3.5 h-3.5" />Añadir concepto</Btn>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </Seccion>
    </>
  )
}

// ---------- Copia de seguridad ----------
function Copia({ cfg, setCfg, subs, setSubs, setErr }) {
  const archivo = useRef(null)
  const exportar = () => {
    const blob = new Blob([JSON.stringify({ configuracion: cfg, subcentros: subs }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `configuracion-crm-${(cfg.nombre || 'centro').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }
  const importar = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try {
      const j = JSON.parse(await f.text())
      if (!j || typeof j.configuracion !== 'object') throw new Error('El archivo no es una configuración del CRM.')
      const c = mezclar(DEFECTO, j.configuracion)
      c.puntos = { ...c.puntos, rubrica: copia(c.puntos.rubrica || RUBRICA_EJEMPLO) }
      setCfg(c)
      if (Array.isArray(j.subcentros)) setSubs(j.subcentros.map(String))
      setErr('')
    } catch (x) {
      setErr(`No se ha podido importar: ${x.message}`)
    }
  }
  return (
    <Seccion titulo="Copia de seguridad" sub="Descarga toda la configuración en un archivo, o carga la de otro centro como punto de partida (por ejemplo, para montar un centro nuevo con la misma rúbrica).">
      <div className="flex flex-wrap gap-2">
        <Btn variant="ghost" onClick={exportar}><Download className="w-4 h-4" />Descargar configuración</Btn>
        <input ref={archivo} type="file" accept="application/json,.json" onChange={importar} className="hidden" />
        <Btn variant="ghost" onClick={() => archivo.current?.click()}><FileUp className="w-4 h-4" />Cargar desde archivo</Btn>
      </div>
      <p className="text-xs text-slate-500">Al cargar un archivo, los cambios no se aplican hasta que pulses «Guardar cambios». No incluye empresas, personas ni puntos: solo la configuración.</p>
    </Seccion>
  )
}
