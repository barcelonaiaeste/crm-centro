// Prepara un proyecto de Supabase NUEVO (el del centro) con este CRM: lo enlaza, aplica las migraciones,
// guarda el email del admin inicial y deja en .env.vercel las variables listas para pegar en Vercel.
// Uso: `npm run setup` (lo pregunta todo) o `npm run setup -- --project-ref abcd1234 --admin tu@correo.com`.
// No carga datos de prueba (supabase/seed.sql es solo para el entorno local) ni toca supabase/config.toml del remoto.
import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'

const run = (cmd, args = []) => spawnSync(cmd, args, { stdio: 'inherit', shell: true })
const leer = (cmd, args = []) => spawnSync(cmd, args, { stdio: ['inherit', 'pipe', 'inherit'], shell: true, encoding: 'utf8' })
const paso = (t) => console.log(`\n\x1b[36m▶ ${t}\x1b[0m`)
const aviso = (t) => console.log(`\x1b[33m! ${t}\x1b[0m`)
const fallo = (t) => { console.error(`\n\x1b[31m✖ ${t}\x1b[0m`); process.exit(1) }
const arg = (n) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] || '' : '')
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

if (Number(process.versions.node.split('.')[0]) < 20) fallo(`Hace falta Node 20 o superior (tienes ${process.versions.node}).`)

const rl = createInterface({ input: process.stdin, output: process.stdout })
const preguntar = async (texto) => (await rl.question(texto)).trim()

// Referencia del proyecto
let ref = arg('--project-ref')
if (!ref) {
  console.log('Crea antes un proyecto vacío en https://supabase.com/dashboard (guarda la contraseña de la base de datos).')
  console.log('La referencia es el texto de la URL del panel: supabase.com/dashboard/project/<referencia>')
  ref = await preguntar('Referencia del proyecto de Supabase: ')
}
if (!/^[a-z0-9]{15,25}$/.test(ref)) fallo('La referencia no parece válida (son unas 20 letras y números, en minúsculas).')

// Admin inicial: solo ese email entrará como admin al registrarse (migración admin_inicial)
let admin = arg('--admin').toLowerCase()
while (!EMAIL.test(admin)) {
  admin = (await preguntar('Tu email (serás el admin del CRM; el resto entrará como miembro): ')).toLowerCase()
}
rl.close()

paso('Iniciando sesión en Supabase (se abre el navegador; si ya la tienes iniciada, no hace nada)')
if (!process.env.SUPABASE_ACCESS_TOKEN && run('npx', ['supabase', 'projects', 'list']).status !== 0) {
  if (run('npx', ['supabase', 'login']).status !== 0) fallo('No se ha podido iniciar sesión en Supabase.')
}

paso(`Enlazando con el proyecto ${ref} (pide la contraseña de la base de datos)`)
if (run('npx', ['supabase', 'link', '--project-ref', ref]).status !== 0) fallo('supabase link ha fallado.')

paso('Aplicando las migraciones (crea las tablas, políticas y funciones)')
if (run('npx', ['supabase', 'db', 'push']).status !== 0) fallo('supabase db push ha fallado.')

// Claves del proyecto: para guardar el admin inicial y para dejar listas las variables de Vercel
paso('Leyendo las claves del proyecto')
const url = `https://${ref}.supabase.co`
let anon = ''
let servicio = ''
try {
  const r = leer('npx', ['supabase', 'projects', 'api-keys', '--project-ref', ref, '--reveal', '-o', 'json'])
  const lista = JSON.parse(r.stdout.slice(r.stdout.indexOf('[')))
  const clave = (...nombres) => lista.find((k) => nombres.includes(k.name) || nombres.includes(k.type))?.api_key || ''
  anon = clave('anon', 'publishable')
  servicio = clave('service_role', 'secret')
} catch { /* se explica abajo */ }
if (!anon || !servicio) aviso('No se han podido leer las claves: cópialas de Project Settings → API Keys.')

let adminGuardado = false
if (servicio) {
  paso(`Guardando ${admin} como admin inicial`)
  try {
    const r = await fetch(`${url}/rest/v1/instalacion?id=eq.true`, {
      method: 'PATCH',
      headers: { apikey: servicio, Authorization: `Bearer ${servicio}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_email: admin }),
    })
    adminGuardado = r.ok
    if (!r.ok) aviso(`Supabase ha respondido ${r.status}: ${await r.text()}`)
  } catch (e) {
    aviso(`No se ha podido guardar: ${e.message}`)
  }
}

// Variables para Vercel (.env.* está en .gitignore: no se sube al repo)
writeFileSync('.env.vercel', [
  '# Generado por `npm run setup`. Pégalo en Vercel → Settings → Environment Variables (admite pegar el archivo entero).',
  '# Contiene la service_role key: NO lo subas al repo ni lo compartas. Bórralo cuando lo hayas pegado.',
  `VITE_SUPABASE_URL=${url}`,
  `VITE_SUPABASE_ANON_KEY=${anon || '<Project Settings → API Keys → anon / publishable>'}`,
  `SUPABASE_SERVICE_ROLE_KEY=${servicio || '<Project Settings → API Keys → service_role / secret>'}`,
  '# Opcional: buzón compartido para enviar y recibir correos desde el CRM (ver server/README.md)',
  '# GMAIL_USER=buzon-del-centro@gmail.com',
  '# GMAIL_APP_PASSWORD=',
  '',
].join('\n'))

console.log(`
\x1b[32m✔ Base de datos lista.\x1b[0m ${adminGuardado ? `Admin inicial: ${admin}.` : '\x1b[33mNo se ha guardado el admin inicial: el primero que se registre será admin.\x1b[0m'}
  Variables de Vercel en \x1b[1m.env.vercel\x1b[0m (secretas: bórralo después de pegarlas).

Quedan estos pasos en los paneles:

  1. Vercel: importa el repositorio y pega el contenido de .env.vercel en Settings → Environment Variables.
     Si vais a usar el correo, añade también GMAIL_USER y GMAIL_APP_PASSWORD.
  2. Supabase → Authentication → URL Configuration: pon la URL de Vercel como «Site URL» y en «Redirect URLs».
  3. Supabase → Authentication → Hooks → «Before User Created»: actívalo con la función Postgres
     public.hook_antes_de_crear_usuario (bloquea correos desechables).
  4. Supabase → Authentication → Sign In / Providers → Email: deja «Confirm email» activado, longitud
     mínima 8 y «letters and digits».
  5. Supabase → Authentication → SMTP: el de Supabase solo envía unos pocos correos por hora. Si tenéis el
     Gmail del centro, usa el mismo: host smtp.gmail.com, puerto 465, usuario = el Gmail, contraseña = su
     contraseña de aplicación, remitente = el Gmail.
  6. Abre la web y regístrate con ${admin}. Configura el centro en la pestaña Ajustes.
`)
