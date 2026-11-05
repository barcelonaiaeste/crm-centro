// Asistente para importar empresas desde un Excel/CSV con cualquier estructura (solo admins).
// Pasos: archivo → columnas (a qué campo va cada una) → valores (estados y responsables) → revisar → importar.
import { useMemo, useState } from 'react'
import { supabase } from './supabase'
import { CENTRO, F } from './centro'
import { ESTADOS_TODOS } from './estados'
import { Btn, Aviso, Label, Modal, ModalHead } from './ui'
import {
  CAMPOS, IGNORAR, A_NOTAS, leerLibro, elegirHoja, detectarCabecera, sugerirMapeo, sugerirEstado,
  sugerirResponsable, valoresDistintos, prepararImportacion, norm,
} from './importar'
import { FileSpreadsheet, Upload, AlertCircle, AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Info } from 'lucide-react'

const ESTADOS = ESTADOS_TODOS
  .filter((e) => (F.listaNegra || e.id !== 'lista_negra') && !e.oculto)
  .map((e) => ({ ...e, label: CENTRO.estados[e.id] || e.label }))
const LOTE = 100
const PASOS = [['archivo', 'Archivo'], ['columnas', 'Columnas'], ['valores', 'Valores'], ['revisar', 'Revisar']]
const sel = 'w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-4 focus:ring-brand-500/15 focus:border-brand-500'

// El mapeo de columnas se recuerda (en este navegador) para la próxima vez que llegue un Excel con las mismas cabeceras
const firmaDe = (cab) => 'importar-mapeo:' + cab.map(norm).join('|')
const leerGuardado = (cab) => { try { return JSON.parse(localStorage.getItem(firmaDe(cab)) || 'null') } catch { return null } }
const guardar = (cab, mapeo) => { try { localStorage.setItem(firmaDe(cab), JSON.stringify(mapeo)) } catch { /* sin almacenamiento */ } }

export default function ImportarEmpresas({ users, companies, me, onClose, onDone }) {
  const [paso, setPaso] = useState('archivo')
  const [archivo, setArchivo] = useState(null)
  const [hojas, setHojas] = useState([])
  const [hoja, setHoja] = useState(0)
  const [filaCab, setFilaCab] = useState(0)
  const [mapeo, setMapeo] = useState({})
  const [recordado, setRecordado] = useState(false)
  const [estadoDe, setEstadoDe] = useState({})
  const [responsableDe, setResponsableDe] = useState({})
  const [responsableDefecto, setResponsableDefecto] = useState('')
  const [modoDuplicados, setModoDuplicados] = useState('saltar')
  const [error, setError] = useState('')
  const [leyendo, setLeyendo] = useState(false)
  const [progreso, setProgreso] = useState(null) // { hechas, total }
  const [resultado, setResultado] = useState(null)
  const [verSaltadas, setVerSaltadas] = useState(false)

  const filas = hojas[hoja]?.filas || []
  const cabecera = filas[filaCab] || []
  const datos = useMemo(() => filas.slice(filaCab + 1), [filas, filaCab])
  const nCols = useMemo(() => Math.max(cabecera.length, ...datos.slice(0, 200).map((f) => f.length), 0), [cabecera, datos])
  const colDe = (campo) => { const k = Object.keys(mapeo).find((i) => mapeo[i] === campo); return k === undefined ? undefined : Number(k) }

  // Al cambiar de hoja o de fila de cabecera se vuelve a sugerir el mapeo
  const prepararColumnas = (hs, h, fc) => {
    const cab = hs[h].filas[fc] || []
    const dat = hs[h].filas.slice(fc + 1)
    const guardado = leerGuardado(cab)
    setRecordado(!!guardado)
    setMapeo(guardado || sugerirMapeo(cab, dat))
  }

  const abrirArchivo = async (f) => {
    if (!f) return
    setError(''); setLeyendo(true)
    try {
      const hs = await leerLibro(f)
      if (!hs.some((h) => h.filas.length > 1)) throw new Error('El archivo no tiene filas con datos.')
      const h = elegirHoja(hs)
      const fc = detectarCabecera(hs[h].filas)
      setArchivo(f); setHojas(hs); setHoja(h); setFilaCab(fc)
      prepararColumnas(hs, h, fc)
      setPaso('columnas')
    } catch (e) {
      setError(`No se ha podido leer el archivo: ${e.message || e}`)
    } finally {
      setLeyendo(false)
    }
  }

  const irAValores = () => {
    if (colDe('nombre') === undefined) { setError('Elige qué columna tiene el nombre de la empresa.'); return }
    setError('')
    guardar(cabecera, mapeo)
    const ce = colDe('estado'), cr = colDe('responsable')
    setEstadoDe(ce === undefined ? {} : Object.fromEntries(valoresDistintos(datos, ce).map(({ valor }) => [valor, estadoDe[valor] ?? sugerirEstado(valor, ESTADOS)])))
    setResponsableDe(cr === undefined ? {} : Object.fromEntries(valoresDistintos(datos, cr).map(({ valor }) => [valor, responsableDe[valor] ?? sugerirResponsable(valor, users)])))
    setPaso('valores')
  }

  const plan = useMemo(() => paso === 'revisar' || paso === 'importando'
    ? prepararImportacion({ cabecera, datos, mapeo, estadoDe, responsableDe, responsableDefecto, existentes: companies, modoDuplicados })
    : null, [paso, cabecera, datos, mapeo, estadoDe, responsableDe, responsableDefecto, companies, modoDuplicados])

  const importar = async () => {
    const { nuevas, completar } = plan
    setPaso('importando'); setError('')
    const total = nuevas.length + completar.length
    let hechas = 0
    const fallos = []
    const quien = `Importación Excel (${me.nombre})`
    setProgreso({ hechas, total })
    // Altas por lotes; si un lote falla (p. ej. un CIF que choca), se reintenta fila a fila para saber cuál
    for (let i = 0; i < nuevas.length; i += LOTE) {
      const lote = nuevas.slice(i, i + LOTE)
      const filasDb = lote.map(({ fila, ...e }) => ({ ...e, actualizado_por: quien })) // eslint-disable-line no-unused-vars
      const { error: err } = await supabase.from('empresas').insert(filasDb)
      if (err) {
        for (let j = 0; j < lote.length; j++) {
          const { error: e1 } = await supabase.from('empresas').insert(filasDb[j])
          if (e1) fallos.push({ fila: lote[j].fila, nombre: lote[j].nombre, motivo: /cif/i.test(e1.message) ? 'CIF ya registrado en el CRM' : e1.message })
        }
      }
      hechas += lote.length
      setProgreso({ hechas, total })
    }
    for (const c of completar) {
      const { error: err } = await supabase.from('empresas').update({ ...c.patch, actualizado_por: quien }).eq('id', c.id)
      if (err) fallos.push({ fila: c.fila, nombre: c.nombre, motivo: err.message })
      hechas++
      setProgreso({ hechas, total })
    }
    const fallidasNuevas = fallos.filter((x) => nuevas.some((n) => n.fila === x.fila)).length
    setResultado({ altas: nuevas.length - fallidasNuevas, completadas: completar.length - (fallos.length - fallidasNuevas), fallos })
    setPaso('hecho')
    onDone?.()
  }

  const nPaso = PASOS.findIndex(([id]) => id === paso)
  const cerrar = paso === 'importando' ? undefined : onClose

  return (
    <Modal onClose={cerrar} ancho="max-w-4xl" columna fijo>
      <ModalHead onClose={cerrar} sub={
        <div className="flex items-center gap-1.5 mt-2 text-xs flex-wrap">
          {PASOS.map(([id, label], i) => (
            <span key={id} className={`inline-flex items-center gap-1.5 ${i === nPaso ? 'text-brand-700 font-semibold' : i < nPaso || nPaso === -1 ? 'text-slate-500' : 'text-slate-300'}`}>
              <span className={`w-5 h-5 rounded-full inline-flex items-center justify-center text-[10px] font-bold ${i === nPaso ? 'bg-brand-600 text-white' : i < nPaso || nPaso === -1 ? 'bg-slate-200 text-slate-600' : 'bg-slate-100 text-slate-400'}`}>{i + 1}</span>
              {label}{i < PASOS.length - 1 && <ChevronRight className="w-3 h-3 text-slate-300" />}
            </span>
          ))}
        </div>
      }>
        Importar empresas desde Excel
      </ModalHead>

      <div className="flex-1 overflow-y-auto scroll-thin px-6 py-5 space-y-4">
        {error && <Aviso tono="error" icono={AlertCircle}>{error}</Aviso>}

        {paso === 'archivo' && (
          <>
            <label
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); abrirArchivo(e.dataTransfer.files?.[0]) }}
              className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-slate-200 hover:border-brand-400 hover:bg-brand-50/40 rounded-2xl py-14 px-6 text-center cursor-pointer transition"
            >
              <span className="w-12 h-12 rounded-2xl bg-brand-50 text-brand-700 flex items-center justify-center"><Upload className="w-6 h-6" /></span>
              <span className="text-sm font-semibold text-slate-800">{leyendo ? 'Leyendo…' : 'Arrastra aquí el archivo o pulsa para elegirlo'}</span>
              <span className="text-xs text-slate-500">Excel (.xlsx, .xls), OpenDocument (.ods) o CSV. Da igual el orden o el nombre de las columnas.</span>
              <input type="file" accept=".xlsx,.xlsm,.xls,.ods,.csv,.tsv,.txt" className="hidden" disabled={leyendo} onChange={(e) => abrirArchivo(e.target.files?.[0])} />
            </label>
            <Aviso tono="neutral" icono={Info}>
              El archivo se lee en tu navegador; no se sube a ningún sitio. Antes de importar podrás revisar qué columna va a cada campo,
              cómo se traducen los estados y qué empresas ya estaban en el CRM.
            </Aviso>
          </>
        )}

        {paso === 'columnas' && (
          <>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label>Hoja</Label>
                <select className={sel} value={hoja} onChange={(e) => {
                  const h = Number(e.target.value); const fc = detectarCabecera(hojas[h].filas)
                  setHoja(h); setFilaCab(fc); prepararColumnas(hojas, h, fc)
                }}>
                  {hojas.map((h, i) => <option key={i} value={i}>{h.nombre} ({Math.max(h.filas.length - 1, 0)} filas)</option>)}
                </select>
              </div>
              <div>
                <Label>Fila de cabecera</Label>
                <select className={sel} value={filaCab} onChange={(e) => { const fc = Number(e.target.value); setFilaCab(fc); prepararColumnas(hojas, hoja, fc) }}>
                  {filas.slice(0, 15).map((f, i) => <option key={i} value={i}>Fila {f.n ?? i + 1}: {f.filter(Boolean).slice(0, 4).join(' · ').slice(0, 70)}</option>)}
                </select>
              </div>
            </div>
            <Aviso tono={recordado ? 'ok' : 'info'} icono={recordado ? CheckCircle2 : Info}>
              {recordado
                ? 'Se ha usado el mismo mapeo que la última vez que importaste un archivo con estas columnas. Revísalo por si acaso.'
                : <>He propuesto a qué campo va cada columna mirando su cabecera y su contenido. Corrige lo que haga falta. Las columnas en <strong>«Añadir a notas»</strong> se guardan en las notas como «Cabecera: valor».</>}
            </Aviso>
            <div className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100">
              {Array.from({ length: nCols }, (_, i) => {
                const muestras = datos.map((f) => f[i]).filter(Boolean).slice(0, 3)
                const llenas = datos.filter((f) => f[i]).length
                const elegido = mapeo[i] ?? IGNORAR
                return (
                  <div key={i} className={`grid sm:grid-cols-[1fr_1.3fr_220px] gap-2 sm:gap-4 items-center px-4 py-3 ${elegido === IGNORAR ? 'bg-slate-50/60' : ''}`}>
                    <div className="min-w-0">
                      <p className={`text-sm font-semibold truncate ${elegido === IGNORAR ? 'text-slate-400' : 'text-slate-800'}`}>{cabecera[i] || `Columna ${i + 1}`}</p>
                      <p className="text-[11px] text-slate-400">{llenas} de {datos.length} filas con valor</p>
                    </div>
                    <div className="text-xs text-slate-500 min-w-0 space-y-0.5">
                      {muestras.length ? muestras.map((m, k) => <p key={k} className="truncate">{m}</p>) : <p className="italic text-slate-300">vacía</p>}
                    </div>
                    <select className={sel} value={elegido} onChange={(e) => {
                      const v = e.target.value
                      setMapeo((m) => {
                        const nuevo = { ...m, [i]: v }
                        // Cada campo solo puede venir de una columna: la otra pasa a notas
                        if (v !== IGNORAR && v !== A_NOTAS) for (const k of Object.keys(nuevo)) if (Number(k) !== i && nuevo[k] === v) nuevo[k] = A_NOTAS
                        return nuevo
                      })
                    }}>
                      <option value={IGNORAR}>— No importar —</option>
                      <option value={A_NOTAS}>Añadir a notas</option>
                      {CAMPOS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {paso === 'valores' && (
          <>
            {colDe('estado') !== undefined ? (
              <section>
                <h3 className="text-sm font-bold text-slate-800 mb-1">Estados</h3>
                <p className="text-xs text-slate-500 mb-2">Cada valor de la columna «{cabecera[colDe('estado')]}» pasa a uno de los estados del CRM.</p>
                <TablaTraduccion
                  valores={valoresDistintos(datos, colDe('estado'))}
                  elegido={estadoDe}
                  onCambio={(v, id) => setEstadoDe((m) => ({ ...m, [v]: id }))}
                  opciones={ESTADOS.map((e) => [e.id, e.label])}
                />
              </section>
            ) : (
              <Aviso tono="neutral" icono={Info}>No has elegido columna de estado: todas las empresas entrarán como «{ESTADOS[0].label}».</Aviso>
            )}

            <section>
              <h3 className="text-sm font-bold text-slate-800 mb-1">Responsables</h3>
              {colDe('responsable') !== undefined && (
                <>
                  <p className="text-xs text-slate-500 mb-2">Cada valor de la columna «{cabecera[colDe('responsable')]}» se asigna a un miembro del equipo.</p>
                  <TablaTraduccion
                    valores={valoresDistintos(datos, colDe('responsable'))}
                    elegido={responsableDe}
                    onCambio={(v, id) => setResponsableDe((m) => ({ ...m, [v]: id }))}
                    opciones={[['', 'Responsable por defecto'], ...users.map((u) => [u.id, u.nombre])]}
                  />
                </>
              )}
              <div className="mt-3 max-w-sm">
                <Label>{colDe('responsable') !== undefined ? 'Responsable por defecto (filas sin responsable)' : 'Responsable de todas las empresas'}</Label>
                <select className={sel} value={responsableDefecto} onChange={(e) => setResponsableDefecto(e.target.value)}>
                  <option value="">Sin asignar (bote común)</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                </select>
              </div>
            </section>

            <section>
              <h3 className="text-sm font-bold text-slate-800 mb-1">Empresas que ya están en el CRM</h3>
              <p className="text-xs text-slate-500 mb-2">Se reconocen por el CIF o, si no hay CIF, por el nombre (sin tildes ni «S.L.», «S.A.»…).</p>
              <div className="grid sm:grid-cols-2 gap-2">
                {[['saltar', 'Saltarlas', 'No se toca nada de las que ya existen.'], ['completar', 'Completar datos vacíos', 'Se rellenan CIF, email, teléfono, web, etc. solo si en el CRM están vacíos. Nunca se sobrescribe nada.']].map(([id, t, d]) => (
                  <button key={id} type="button" onClick={() => setModoDuplicados(id)}
                    className={`text-left rounded-xl border px-4 py-3 transition ${modoDuplicados === id ? 'border-brand-500 bg-brand-50 ring-4 ring-brand-500/10' : 'border-slate-200 hover:bg-slate-50'}`}>
                    <p className="text-sm font-semibold text-slate-800">{t}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{d}</p>
                  </button>
                ))}
              </div>
            </section>
          </>
        )}

        {(paso === 'revisar' || paso === 'importando') && plan && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Cifra n={plan.nuevas.length} label="empresas nuevas" tono="bg-emerald-50 text-emerald-700" />
              <Cifra n={plan.completar.length} label="existentes a completar" tono="bg-brand-50 text-brand-700" />
              <Cifra n={plan.saltadas.length} label="filas que se saltan" tono="bg-slate-100 text-slate-600" />
            </div>
            {F.puntuacion && plan.nuevas.some((e) => e.responsable && e.estado !== 'sin_contactar') && (
              <Aviso tono="warn" icono={AlertTriangle}>
                Hay empresas que entran con responsable y un estado distinto de «{ESTADOS[0].label}»: contarán para los puntos automáticos de su responsable en la campaña actual.
              </Aviso>
            )}
            {plan.saltadas.length > 0 && (
              <div className="border border-slate-200 rounded-2xl">
                <button onClick={() => setVerSaltadas((x) => !x)} className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold text-slate-700">
                  Filas que se saltan ({plan.saltadas.length})
                  <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${verSaltadas ? 'rotate-90' : ''}`} />
                </button>
                {verSaltadas && (
                  <ul className="border-t border-slate-100 divide-y divide-slate-100 max-h-60 overflow-y-auto scroll-thin">
                    {plan.saltadas.map((s) => (
                      <li key={s.fila} className="px-4 py-2 text-xs flex gap-3">
                        <span className="text-slate-400 tabular-nums w-14 shrink-0">Fila {s.fila}</span>
                        <span className="text-slate-700 truncate flex-1">{s.nombre}</span>
                        <span className="text-slate-500 shrink-0">{s.motivo}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {plan.nuevas.length > 0 && (
              <div className="border border-slate-200 rounded-2xl overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500 text-left">
                    <tr>{['Fila', 'Empresa', 'Email', 'Teléfono', 'Estado', 'Responsable', 'Notas'].map((h) => <th key={h} className="px-3 py-2 font-semibold whitespace-nowrap">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {plan.nuevas.slice(0, 100).map((e) => (
                      <tr key={e.fila} className="align-top">
                        <td className="px-3 py-2 text-slate-400 tabular-nums">{e.fila}</td>
                        <td className="px-3 py-2 font-medium text-slate-800 min-w-[180px]">{e.nombre}</td>
                        <td className="px-3 py-2 text-slate-600 max-w-[200px] truncate">{e.email}</td>
                        <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{e.telefono}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{ESTADOS.find((x) => x.id === e.estado)?.label}</td>
                        <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{users.find((u) => u.id === e.responsable)?.nombre || <span className="text-slate-400">Sin asignar</span>}</td>
                        <td className="px-3 py-2 text-slate-500 max-w-[220px] truncate" title={e.notas || ''}>{e.notas}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {plan.nuevas.length > 100 && <p className="px-3 py-2 text-xs text-slate-400 border-t border-slate-100">…y {plan.nuevas.length - 100} más</p>}
              </div>
            )}
            {plan.completar.length > 0 && (
              <div className="border border-slate-200 rounded-2xl divide-y divide-slate-100">
                <p className="px-4 py-2.5 text-sm font-semibold text-slate-700">Existentes que se completan</p>
                {plan.completar.slice(0, 50).map((c) => (
                  <p key={c.fila} className="px-4 py-2 text-xs text-slate-600"><strong className="text-slate-800">{c.nombre}</strong>: {Object.entries(c.patch).map(([k, v]) => `${k} → ${v}`).join(' · ')}</p>
                ))}
              </div>
            )}
            {paso === 'importando' && progreso && (
              <div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full bg-brand-600 transition-all" style={{ width: `${progreso.total ? (progreso.hechas / progreso.total) * 100 : 100}%` }} />
                </div>
                <p className="text-xs text-slate-500 mt-1.5">Importando {progreso.hechas} de {progreso.total}…</p>
              </div>
            )}
          </>
        )}

        {paso === 'hecho' && resultado && (
          <>
            <Aviso tono={resultado.fallos.length ? 'warn' : 'ok'} icono={resultado.fallos.length ? AlertTriangle : CheckCircle2}>
              <strong>{resultado.altas} empresa{resultado.altas !== 1 ? 's' : ''} importada{resultado.altas !== 1 ? 's' : ''}</strong>
              {resultado.completadas > 0 && ` y ${resultado.completadas} completada${resultado.completadas !== 1 ? 's' : ''}`}
              {` desde «${archivo?.name}».`}
              {resultado.fallos.length > 0 && ` ${resultado.fallos.length} no se han podido guardar:`}
            </Aviso>
            {resultado.fallos.length > 0 && (
              <ul className="border border-slate-200 rounded-2xl divide-y divide-slate-100 text-xs">
                {resultado.fallos.map((f) => <li key={f.fila} className="px-4 py-2 flex gap-3"><span className="text-slate-400 w-14 shrink-0">Fila {f.fila}</span><span className="flex-1 truncate">{f.nombre}</span><span className="text-rose-600">{f.motivo}</span></li>)}
              </ul>
            )}
          </>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 shrink-0">
        <span className="text-xs text-slate-400 truncate inline-flex items-center gap-1.5 min-w-0">
          {archivo && <><FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />{archivo.name}</>}
        </span>
        <div className="flex gap-2 shrink-0">
          {paso === 'columnas' && <Btn variant="ghost" onClick={() => setPaso('archivo')}><ChevronLeft className="w-4 h-4" />Otro archivo</Btn>}
          {paso === 'valores' && <Btn variant="ghost" onClick={() => setPaso('columnas')}><ChevronLeft className="w-4 h-4" />Atrás</Btn>}
          {paso === 'revisar' && <Btn variant="ghost" onClick={() => setPaso('valores')}><ChevronLeft className="w-4 h-4" />Atrás</Btn>}
          {paso === 'columnas' && <Btn onClick={irAValores}>Siguiente<ChevronRight className="w-4 h-4" /></Btn>}
          {paso === 'valores' && <Btn onClick={() => setPaso('revisar')}>Revisar<ChevronRight className="w-4 h-4" /></Btn>}
          {paso === 'revisar' && plan && (
            <Btn onClick={importar} disabled={!plan.nuevas.length && !plan.completar.length}>
              Importar {plan.nuevas.length} empresa{plan.nuevas.length !== 1 ? 's' : ''}{plan.completar.length ? ` y completar ${plan.completar.length}` : ''}
            </Btn>
          )}
          {paso === 'importando' && <Btn disabled>Importando…</Btn>}
          {paso === 'hecho' && <Btn onClick={onClose}>Cerrar</Btn>}
        </div>
      </div>
    </Modal>
  )
}

const Cifra = ({ n, label, tono }) => (
  <div className="card px-4 py-3 flex items-center gap-3">
    <span className={`min-w-10 h-10 px-2 rounded-xl flex items-center justify-center font-extrabold tabular-nums ${tono}`}>{n}</span>
    <span className="text-xs text-slate-500 leading-tight">{label}</span>
  </div>
)

function TablaTraduccion({ valores, elegido, onCambio, opciones }) {
  return (
    <div className="border border-slate-200 rounded-2xl divide-y divide-slate-100 max-h-72 overflow-y-auto scroll-thin">
      {valores.map(({ valor, n }) => (
        <div key={valor} className="grid grid-cols-[1fr_auto_200px] gap-3 items-center px-4 py-2">
          <span className={`text-sm truncate ${valor ? 'text-slate-800' : 'text-slate-400 italic'}`}>{valor || '(vacío)'}</span>
          <span className="text-[11px] text-slate-400 tabular-nums">{n} fila{n !== 1 ? 's' : ''}</span>
          <select className={sel} value={elegido[valor] ?? ''} onChange={(e) => onCambio(valor, e.target.value)}>
            {opciones.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </div>
      ))}
    </div>
  )
}
