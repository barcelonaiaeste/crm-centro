// Build de Vercel (vercel.json → buildCommand). En los despliegues de PRODUCCIÓN, antes de compilar la web:
//   1. Aplica las migraciones de supabase/migrations a la base de datos del centro (si hay conexión a Postgres:
//      la da la integración de Supabase en Vercel, o SUPABASE_DB_URL).
//   2. Guarda ADMIN_EMAIL como admin inicial (tabla privada `instalacion`).
//   3. Si hay SUPABASE_ACCESS_TOKEN, configura Supabase Auth: Site URL, hook de correos desechables, contraseñas
//      y, si hay Gmail, el SMTP. Solo cambia lo que siga con los valores de fábrica.
// En los despliegues de preview no toca la base de datos (comparten la de producción). Si las migraciones
// fallan, el build falla y sigue publicada la versión anterior. Uso local para probar: ver README.
import { spawnSync } from 'node:child_process'
import { urlSupabase, claveServicio, urlBaseDatos, refProyecto } from './entorno.mjs'

const env = process.env
const paso = (t) => console.log(`\n▶ ${t}`)
const aviso = (t) => console.log(`  ! ${t}`)
const bien = (t) => console.log(`  ✔ ${t}`)
const npx = (args) => spawnSync('npx', args, { stdio: 'inherit', shell: process.platform === 'win32' })

const produccion = env.MIGRAR === 'true' || (env.VERCEL_ENV === 'production' && env.MIGRAR !== 'false')
const url = urlSupabase(env)
const servicio = claveServicio(env)
const pendientes = []

if (!produccion) {
  paso(`Despliegue ${env.VERCEL_ENV || 'local'}: no se toca la base de datos (solo en producción)`)
} else {
  // ---------- 1. Migraciones ----------
  paso('Aplicando migraciones a Supabase')
  const db = urlBaseDatos(env)
  if (!db) {
    aviso('No hay conexión a Postgres (POSTGRES_URL_NON_POOLING o SUPABASE_DB_URL): no se aplican migraciones.')
    aviso('Si creaste el Supabase con `npm run setup`, ya están aplicadas; para las siguientes, usa `npx supabase db push`.')
    pendientes.push('migraciones automáticas (falta POSTGRES_URL_NON_POOLING o SUPABASE_DB_URL)')
  } else if (npx(['supabase', 'db', 'push', '--db-url', db, '--include-all', '--yes']).status !== 0) {
    console.error('\n✖ Las migraciones han fallado: no se publica esta versión (sigue la anterior). Revisa el error de arriba.')
    process.exit(1)
  } else {
    bien('Base de datos al día')
  }

  // ---------- 2. Admin inicial ----------
  const admin = (env.ADMIN_EMAIL || '').trim().toLowerCase()
  if (admin && url && servicio) {
    paso(`Admin inicial: ${admin}`)
    try {
      const r = await fetch(`${url}/rest/v1/instalacion?id=eq.true`, {
        method: 'PATCH',
        headers: { apikey: servicio, Authorization: `Bearer ${servicio}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_email: admin }),
      })
      if (r.ok) bien('Guardado: solo ese email entrará como admin')
      else aviso(`Supabase ha respondido ${r.status}: ${await r.text()}`)
    } catch (e) {
      aviso(`No se ha podido guardar: ${e.message}`)
    }
  } else if (!admin) {
    pendientes.push('ADMIN_EMAIL (sin él, el primero que se registre será admin)')
  }

  // ---------- 3. Supabase Auth ----------
  await configurarAuth()
}

paso('Compilando la web')
const build = npx(['vite', 'build'])
if (pendientes.length) {
  console.log('\nQueda pendiente (ver README → «Despliegue en un clic»):')
  for (const p of pendientes) console.log(`  - ${p}`)
}
process.exit(build.status ?? 1)

async function configurarAuth() {
  const ref = refProyecto(env)
  const token = env.SUPABASE_ACCESS_TOKEN
  const sitio = (env.SITE_URL || (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : '')).replace(/\/$/, '')
  if (!token || !ref) {
    pendientes.push('ajustes de Supabase Auth: Site URL, hook, contraseñas y SMTP (o añade SUPABASE_ACCESS_TOKEN y vuelve a desplegar)')
    return
  }
  paso('Configurando Supabase Auth')
  const api = `${env.SUPABASE_API_URL || 'https://api.supabase.com'}/v1/projects/${ref}/config/auth` // otra URL solo para pruebas
  const cabeceras = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  try {
    const r = await fetch(api, { headers: cabeceras })
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`)
    const actual = await r.json()
    const cambios = {}

    // Site URL: solo si sigue la de fábrica (o se fuerza con SITE_URL)
    if (sitio && (env.SITE_URL || !actual.site_url || /localhost/.test(actual.site_url))) cambios.site_url = sitio
    if (sitio) {
      const lista = new Set(String(actual.uri_allow_list || '').split(',').map((s) => s.trim()).filter(Boolean))
      const antes = lista.size
      lista.add(sitio).add(`${sitio}/**`)
      if (lista.size !== antes) cambios.uri_allow_list = [...lista].join(',')
    }
    // Hook que bloquea correos desechables (migración auth_seguridad)
    if (!actual.hook_before_user_created_enabled) {
      cambios.hook_before_user_created_enabled = true
      cambios.hook_before_user_created_uri = 'pg-functions://postgres/public/hook_antes_de_crear_usuario'
    }
    // Contraseñas: 8 caracteres con letras y números, y confirmación por email
    if (!(actual.password_min_length >= 8)) cambios.password_min_length = 8
    if (!actual.password_required_characters) cambios.password_required_characters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ:0123456789'
    if (actual.mailer_autoconfirm) cambios.mailer_autoconfirm = false
    // SMTP propio con el Gmail del centro, si lo hay y no hay otro SMTP configurado
    const gmail = (env.GMAIL_USER || '').trim().toLowerCase()
    const clave = (env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '')
    if (gmail && clave && !actual.smtp_host) {
      Object.assign(cambios, {
        smtp_host: 'smtp.gmail.com', smtp_port: '465', smtp_user: gmail, smtp_pass: clave,
        smtp_admin_email: gmail, smtp_sender_name: env.MAIL_FROM_NAME || 'CRM',
      })
    } else if (!actual.smtp_host) {
      pendientes.push('SMTP de Supabase Auth: añade GMAIL_USER y GMAIL_APP_PASSWORD (el de Supabase solo envía unos pocos correos por hora)')
    }

    if (!Object.keys(cambios).length) return bien('Ya estaba configurado')
    const p = await fetch(api, { method: 'PATCH', headers: cabeceras, body: JSON.stringify(cambios) })
    if (!p.ok) throw new Error(`${p.status} ${await p.text()}`)
    bien(`Actualizado: ${Object.keys(cambios).filter((k) => k !== 'smtp_pass').join(', ')}`)
    aviso('Ya puedes borrar SUPABASE_ACCESS_TOKEN de Vercel: solo hacía falta para esto.')
  } catch (e) {
    aviso(`No se ha podido configurar Auth: ${e.message}`)
    pendientes.push('ajustes de Supabase Auth (ver el aviso de arriba)')
  }
}
