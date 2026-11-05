import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { urlSupabase, clavePublica } from './scripts/entorno.mjs'

export default defineConfig(({ mode }) => {
  // Acepta también los nombres que pone la integración de Supabase en Vercel (ver scripts/entorno.mjs).
  // Solo la URL y la clave pública: las secretas no deben acabar nunca en el navegador.
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env }
  const url = urlSupabase(env)
  const clave = clavePublica(env)
  return {
    plugins: [react(), tailwindcss()],
    define: {
      ...(url && { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(url) }),
      ...(clave && { 'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(clave) }),
    },
    // 5174 (y Supabase local en 553xx) para poder tener a la vez otro CRM en el puerto por defecto de Vite (5173)
    server: { port: 5174, strictPort: true },
  }
})
