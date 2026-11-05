import { createClient } from '@supabase/supabase-js'

const falta = (n) => { throw new Error(`Falta la variable de entorno ${n} (ver server/.env.example)`) }
const num = (n, d) => (process.env[n] ? Number(process.env[n]) : d)
const bool = (n, d) => (process.env[n] === undefined ? d : process.env[n] === 'true')

export const config = {
  port: num('PORT', 8788),
  // Orígenes del frontend autorizados (separados por comas)
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5174').split(',').map((s) => s.trim()),

  // En Vercel vale la misma URL que usa el frontend: no hace falta repetirla. SUPABASE_SECRET_KEY y
  // NEXT_PUBLIC_SUPABASE_URL son los nombres que pone la integración de Supabase en Vercel.
  supabaseUrl: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || falta('SUPABASE_URL'),
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || falta('SUPABASE_SERVICE_ROLE_KEY'),

  // Opcionales: sin ellas la API arranca igual, pero no envía ni lee correos (ver correoConfigurado)
  gmailUser: (process.env.GMAIL_USER || '').trim().toLowerCase(),
  gmailPass: (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, ''), // Google la muestra con espacios
  // Remitente: si no se fija aquí, el de Configuración → Correo del CRM (tabla `configuracion`)
  fromName: process.env.MAIL_FROM_NAME || '',

  // SMTP (por defecto Gmail; sobreescribible para pruebas locales con Mailpit)
  smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
  smtpPort: num('SMTP_PORT', 465),
  smtpSecure: bool('SMTP_SECURE', true), // true = SSL (465); false = STARTTLS (587)
  smtpAuth: bool('SMTP_AUTH', true),

  // IMAP
  imapHost: process.env.IMAP_HOST || 'imap.gmail.com',
  imapPort: num('IMAP_PORT', 993),
  syncEnabled: bool('SYNC_ENABLED', true),
  syncMinutes: num('SYNC_INTERVAL_MINUTES', 3),
  syncLookbackDays: num('SYNC_LOOKBACK_DAYS', 7), // cuántos días atrás se revisa la bandeja (leídos o no)
  syncMaxPerRun: num('SYNC_MAX_PER_RUN', 100),
  maxMessageBytes: num('MAX_MESSAGE_MB', 15) * 1024 * 1024,
  // Para disparar la sincronización desde un cron externo: POST /api/sync con "Authorization: Bearer <SYNC_SECRET>"
  syncSecret: process.env.SYNC_SECRET || '',

  sendsPerHour: num('SENDS_PER_HOUR_PER_USER', 30),
}

// Hay buzón si está la cuenta y su contraseña (o un SMTP sin autenticación, como Mailpit en local)
config.correoConfigurado = Boolean(config.gmailUser && (config.gmailPass || !config.smtpAuth))

export const supabaseAdmin = () =>
  createClient(config.supabaseUrl, config.supabaseServiceKey, { auth: { persistSession: false, autoRefreshToken: false } })
