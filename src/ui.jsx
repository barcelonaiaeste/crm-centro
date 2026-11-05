// Componentes básicos compartidos por App.jsx y Configuracion.jsx
import { useEffect } from 'react'
import { X } from 'lucide-react'

export const Input = (props) => (
  <input
    {...props}
    className={`w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm bg-white text-slate-900 placeholder:text-slate-400 transition focus:outline-none focus:ring-4 focus:ring-brand-500/15 focus:border-brand-500 ${props.className || ''}`}
  />
)

export const Label = ({ children }) => (
  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">{children}</label>
)

export const Btn = ({ children, variant = 'primary', ...props }) => {
  const styles = {
    primary: 'bg-brand-900 hover:bg-brand-700 text-white shadow-sm shadow-brand-900/20 active:scale-[0.98]',
    ghost: 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200',
    danger: 'bg-white hover:bg-rose-50 text-rose-600 border border-rose-200',
  }
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${styles[variant]} ${props.className || ''}`}
    >
      {children}
    </button>
  )
}

// Aviso de ancho completo (info / éxito / alerta / error)
const AVISO_TONOS = {
  info: 'border-brand-200 bg-brand-50 text-brand-900',
  ok: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  warn: 'border-amber-300 bg-amber-50 text-amber-900',
  error: 'border-rose-200 bg-rose-50 text-rose-800',
  neutral: 'border-slate-200 bg-white text-slate-600',
}
export const Aviso = ({ tono = 'info', icono: Icono, children, className = '' }) => (
  <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${AVISO_TONOS[tono]} ${className}`}>
    {Icono && <Icono className="w-4 h-4 mt-0.5 shrink-0 opacity-80" />}
    <div className="min-w-0 flex-1">{children}</div>
  </div>
)

// Contenedor de diálogos: centrado en móvil como hoja inferior, y en escritorio como panel lateral (panel) o diálogo (dialogo)
// columna: el cuerpo se reparte en una columna flex (cabecera, contenido con scroll propio, pie); fijo: ocupa casi toda la altura
export function Modal({ children, onClose, ancho = 'max-w-lg', panel = false, columna = false, fijo = false }) {
  useEffect(() => {
    if (!onClose) return
    const alTeclear = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [onClose])
  return (
    <div className={`fixed inset-0 bg-brand-950/50 backdrop-blur-[2px] animate-fade-in flex z-50 ${panel ? 'items-end sm:items-stretch sm:justify-end' : 'items-end sm:items-center justify-center p-0 sm:p-4'}`} onClick={onClose}>
      <div
        className={`w-full ${ancho} bg-white shadow-pop ${columna
          ? `flex flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl animate-rise ${fijo ? 'h-[94vh]' : 'max-h-[94vh]'}`
          : `overflow-y-auto scroll-thin ${
            panel ? 'rounded-t-3xl sm:rounded-none sm:rounded-l-3xl max-h-[92vh] sm:max-h-none animate-rise sm:animate-slide-in' : 'rounded-t-3xl sm:rounded-3xl max-h-[92vh] animate-rise'
          }`}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

export function ModalHead({ children, onClose, sub }) {
  return (
    <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-slate-100 shrink-0 sticky top-0 bg-white/90 backdrop-blur z-10">
      <div className="min-w-0">
        <h2 className="font-bold text-slate-900 text-lg leading-snug break-words">{children}</h2>
        {sub}
      </div>
      {onClose && <button onClick={onClose} aria-label="Cerrar" className="p-1.5 -mr-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"><X className="w-5 h-5" /></button>}
    </div>
  )
}
