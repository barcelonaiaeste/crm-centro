// Nombres de variables de entorno que aceptamos para lo mismo. Las nuestras van primero; después, las que crea
// la integración de Supabase en Vercel (Marketplace), en sus dos generaciones: con anon/service_role y con
// publishable/secret. Así el botón de despliegue funciona sin tener que copiar ni renombrar ninguna clave.
// Lo usan vite.config.js (solo los valores públicos) y scripts/vercel-build.mjs.

const primero = (env, nombres) => nombres.map((n) => env[n]).find((v) => v && String(v).trim())?.trim() || ''

// Públicas: acaban en el navegador
export const urlSupabase = (env) => primero(env, ['VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL'])
export const clavePublica = (env) => primero(env, [
  'VITE_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY',
])

// Secretas: solo en el build y en la función de la API, nunca en el navegador
export const claveServicio = (env) => primero(env, ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY'])

// Conexión directa a Postgres para aplicar migraciones. La integración da POSTGRES_URL_NON_POOLING (pooler en modo
// sesión, sirve para migrar); POSTGRES_URL es el modo transacción (puerto 6543), que no sirve: se pasa al 5432.
// Se quitan los parámetros propios de la integración (supa, pgbouncer) que el CLI de Supabase no entiende.
export function urlBaseDatos(env) {
  let url = primero(env, ['SUPABASE_DB_URL', 'POSTGRES_URL_NON_POOLING'])
  if (!url && env.POSTGRES_URL) url = env.POSTGRES_URL.replace(/:6543\//, ':5432/')
  if (!url) return ''
  try {
    const u = new URL(url)
    for (const p of ['supa', 'pgbouncer']) u.searchParams.delete(p)
    return u.toString()
  } catch {
    return url
  }
}

// Referencia del proyecto (https://<ref>.supabase.co)
export const refProyecto = (env) => urlSupabase(env).match(/^https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1] || ''
