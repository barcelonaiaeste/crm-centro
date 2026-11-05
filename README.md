# CRM de empresas multicentro

Aplicación web para gestionar el contacto con empresas de un comité: quién habla con quién, en qué punto está cada conversación, cuándo toca el siguiente seguimiento, plantillas de correo compartidas y, si se quiere, una puntuación de campaña con clasificación del equipo.

Es un **template**: cada centro tiene su propia copia, su propio Vercel y su propio Supabase (ver [«Montar el CRM para un centro nuevo»](#montar-el-crm-para-un-centro-nuevo)). Los datos de cada centro quedan en su Supabase; no hay ningún servidor compartido. **Todo lo que cambia de un centro a otro se configura desde el propio CRM** (pestaña **Ajustes**, solo admins), sin tocar código:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FJavierStark%2Fcrm-iaeste&project-name=crm-centro&repository-name=crm-centro&integration-ids=oac_VqOgBHqhEoFTPzGkPd7L0iH6&env=ADMIN_EMAIL&envDescription=Tu+email%3A+ser%C3%A1+el+%C3%BAnico+que+entre+como+admin+del+CRM&envLink=https%3A%2F%2Fgithub.com%2FJavierStark%2Fcrm-iaeste%23despliegue-en-un-clic)

> **Un clic, sin terminal:** el botón copia el repo a tu GitHub, crea tu Supabase con la integración oficial, aplica la base de datos y publica la web. Solo pide tu email (el del admin). Ver [«Despliegue en un clic»](#despliegue-en-un-clic).

| En Ajustes | Qué se cambia |
|---|---|
| **Nombre y aspecto** | Nombre del centro, título, ciudad, textos de la pantalla de entrada, logo (se sube una imagen) y color de marca (con vista previa en vivo) |
| **Funciones** | Encender o apagar: correo, plantillas, puntuación, registro de llamadas, empresas prioritarias, lista negra, reclamar empresas, pestaña Seguimiento, gráfica, exportar y guía. Apagar solo oculta: los datos se conservan |
| **Empresas y equipo** | Tamaño de los lotes, aviso de «te quedan pocas», subcentros (escuelas/facultades) y cómo se llaman, y nombres de los estados |
| **Correo** | Nombre del remitente y asunto del primer correo |
| **Puntuación** | Puntos automáticos por empresa y por llamada, categoría que los recibe, mínimo para el nivel «Mínimo», primera campaña y la **rúbrica completa**: categorías y conceptos (puntos, rangos, unidad, notas y cuáles cuentan como práctica) |
| **Copia de seguridad** | Descargar la configuración en un archivo o cargar la de otro centro como punto de partida |

Al pulsar **Guardar cambios** se aplica a todo el equipo (la página se recarga).

**Stack:** React 18 + Vite + Tailwind CSS v4 + Supabase (Auth + Postgres con Row Level Security). Despliegue íntegro en Vercel (web + API de correo) y Supabase.

## Roles

| Rol | Qué puede hacer |
|---|---|
| **Admin** | Ver y editar todo, crear/borrar empresas, asignarlas, registrar prácticas (empresas prioritarias), cambiar roles y centros, poner contraseñas temporales, dar, editar y penalizar puntos de la rúbrica, ajustar los automáticos y resolver solicitudes de puntos |
| **Miembro** | Ver todas las empresas (las ajenas en solo lectura). Crear empresas (quedan asignadas a él) y, en las suyas, editar contacto, CIF, estado, notas y próximo contacto. Registrar llamadas, ver su desglose de puntos y el total de los demás, y solicitar puntos |

Las reglas están impuestas en la base de datos (políticas RLS y triggers), no solo en la interfaz. El admin inicial es el email que diste en `npm run setup` (si no se dio ninguno, el primer usuario que se registra). Siempre tiene que quedar al menos un admin.

---

## Entorno local (con base de datos propia)

Todo corre en tu máquina con el CLI de Supabase sobre Docker: Postgres, Auth, API y un buzón de correo falso. No toca ningún proyecto real. Usa puertos propios (app 5174, Supabase 553xx, correo 8788) para no chocar con otros proyectos.

Los datos de prueba ponen un «Centro Demo» (con puntuación y cinco subcentros de ejemplo); cámbialo en Ajustes para probar otro centro y `npm run db:reset` lo devuelve al de demostración.

**Requisitos:** Node 20+ y Docker Desktop abierto. La primera vez se descargan unas imágenes (unos minutos).

```bash
npm install
npm run local:setup     # arranca Supabase, aplica migraciones + datos de prueba y crea .env.development.local
npm run dev             # http://localhost:5174
```

**Todo de una vez:** `npm run local` instala lo que falte, arranca Supabase, genera los `.env`, y lanza el servicio de correo y la app. `Ctrl+C` lo apaga todo (con `--keep-db` deja Supabase encendido; `npm run local:stop` lo apaga a mano).

| Servicio | URL |
|---|---|
| App | http://localhost:5174 |
| Supabase Studio (ver/editar tablas) | http://127.0.0.1:55323 |
| Mailpit (correos de confirmación y recuperación) | http://127.0.0.1:55324 |

**Usuarios de prueba** (definidos en `supabase/seed.sql`):

| Email | Contraseña | Rol |
|---|---|---|
| ana@demo.test | Admin1234 | admin |
| luis@demo.test | Admin1234 | admin |
| marta@demo.test | Miembro1234 | miembro |
| pablo@demo.test | Miembro1234 | miembro |
| irene@demo.test | Miembro1234 | miembro |

Los datos de prueba (38 empresas ficticias con historial, prioritarias y bote común sin asignar) se generan con fechas relativas a hoy, así que la agenda, los avisos de seguimiento siempre tienen algo que mostrar.

Si te registras con un email nuevo, el correo de confirmación llega a **Mailpit**, no a una bandeja real.

### Comandos útiles

| Comando | Qué hace |
|---|---|
| `npm run db:reset` | Borra la base local y la recrea desde las migraciones + seed |
| `npm run db:test` | Prueba de humo de permisos, triggers y RPCs contra la base local (modifica datos: haz `db:reset` después) |
| `npm run db:stop` / `db:start` | Apaga / enciende los contenedores (los datos se conservan) |
| `npm run db:status` | URLs y claves locales |
| `npm run db:new-migration nombre` | Crea una migración nueva en `supabase/migrations/` |
| `npm run build` | Build de producción en `dist/` |

---

## Puntuaciones y subcentros

Cada persona elige su **subcentro** (por ejemplo, escuelas o facultades) al registrarse si el centro tiene alguno; un admin puede cambiarlo en Equipo, y la lista se edita en Ajustes (tabla `subcentros`). La pestaña **Puntos** suma, por campaña (año natural, de enero a diciembre), los puntos automáticos por empresas del CRM (cuentan en la categoría elegida en Ajustes, en la rúbrica de ejemplo «H. Empresas») y los apuntes que dan los admins según la rúbrica. La rúbrica se edita en **Ajustes → Puntuación** y se guarda en la tabla `configuracion`; mientras no se guarde una propia se usa la de ejemplo (`src/rubricaEjemplo.js`, genérica y pequeña; en `examples/rubrica-iaeste-malaga.json` hay una completa para cargarla desde Ajustes). Los apuntes guardan copia del texto del concepto, así que cambiar la rúbrica no altera lo ya anotado.

- Cada persona ve su desglose con motivos; de los demás, solo el total (RLS en la tabla `puntos` y RPC `puntuacion_resumen`).
- Clasificación: nivel (Práctica > Mínimo de la categoría de empresas, 30 por defecto > Pendiente), total y puntos de esa categoría. «Práctica» = algún apunte de un concepto marcado como práctica en la rúbrica (lo calcula `puntuacion_resumen` leyendo la configuración).
- Puntos automáticos (valores en Ajustes → Puntuación): por empresa (por defecto 1 si dicen que no sin haber enviado el correo, 2 si se ha enviado el correo aunque luego digan que no) y por cada llamada, también para el responsable de la empresa (no lo cogen 0,5, seguimiento 3), registradas desde la ficha con la RPC `registrar_llamada`. Un admin puede cambiar o quitar los de una fila concreta (tabla `puntos_auto_ajustes`).
- Penalizaciones: concepto «Penalización» de cualquier categoría; se guardan como apuntes con puntos negativos.
- Solicitudes: cualquiera pide puntos (tabla `solicitudes_puntos`) y un admin la ajusta y acepta o la rechaza (RPC `resolver_solicitud`).
- Al empezar campaña, el admin anota con **Dar puntos** la antigüedad (5 por campaña) y el arrastre (la mitad de los puntos, nada si eran menos de 10 o hubo práctica), categoría «Inicio de campaña».
- Los apuntes pueden importarse sin cuenta (`usuario_id` nulo, con `socio_nombre`): se vinculan solos cuando alguien se registra con el mismo nombre. Importar datos reales (nombres) **no se hace desde el repo**, que es público: se aplica el SQL a mano con el CLI de Supabase.

## Correo (enviar y recibir desde la ficha de cada empresa)

Cada empresa tiene un hilo de correos y una caja para responder, usando un buzón compartido de Gmail por SMTP/IMAP (el equipo no necesita acceso a la cuenta de Google). Lo hace un pequeño servicio Node en `server/`: guía completa, variables y cómo crear la contraseña de aplicación en [`server/README.md`](server/README.md).

```bash
npm run server:install   # una vez
npm run correo           # http://localhost:8788 — en local envía a Mailpit
```

## Montar el CRM para un centro nuevo

Cada centro tiene su propio Supabase (sus datos) y su propio proyecto de Vercel (su web), cada uno desde su copia del template.

1. **Desplegar**: con el botón de arriba ([«Despliegue en un clic»](#despliegue-en-un-clic), unos 5 minutos y sin terminal) o a mano ([«Desplegar desde cero»](#desplegar-desde-cero-supabase--vercel), con `npm run setup`).
2. **Primer admin**: regístrate en la web nueva con el email que diste (`ADMIN_EMAIL` o `npm run setup`); solo ese email entra como admin, aunque otra persona se registre antes.
3. **Ajustes**: entra en la pestaña **Ajustes** y rellena nombre, logo y color; apaga lo que el centro no quiera (por defecto la **puntuación está apagada**); añade sus subcentros si los tiene.
   - Si el centro quiere puntuación, enciéndela en Funciones y edita la rúbrica en Ajustes → Puntuación: parte de la de ejemplo, **Empezar de cero**, o **Copia de seguridad → Cargar desde archivo** con la de otro centro.
4. **Plantillas**: la base trae una plantilla de primer contacto genérica con `{{empresa}}`, `{{contacto}}` y `{{yo}}`; edítala o bórrala en la pestaña Plantillas.
5. **Buzón**: si usan correo, crea su Gmail compartido y pon `GMAIL_USER` / `GMAIL_APP_PASSWORD` en Vercel (ver [`server/README.md`](server/README.md)); ese mismo Gmail sirve de SMTP para Supabase Auth. Si no, apaga «Correo con las empresas» en Ajustes. Ajustes → Funciones y Ajustes → Correo avisan si el correo está encendido pero el servidor no tiene buzón.
6. Pásales el enlace de registro (`https://<su-web>/?registro`) y reparte empresas desde Equipo.

Ningún paso requiere tocar código. Lo único que sigue en código son los **estados** del pipeline (sus ids están en la base de datos; los nombres sí se cambian en Ajustes).

## Despliegue en un clic

1. Pulsa **Deploy with Vercel** (arriba). Vercel te pide:
   - **GitHub:** dónde crear tu copia del repo (puede ser privada).
   - **Supabase:** la integración oficial crea un proyecto nuevo (elige la región más cercana) y pone sus claves en Vercel. Se factura a través de Vercel; el plan gratuito basta para empezar.
   - **`ADMIN_EMAIL`:** tu email. Será el único que entre como admin.
2. Vercel despliega. En cada despliegue de **producción**, `scripts/vercel-build.mjs` aplica las migraciones pendientes a tu Supabase y guarda el admin inicial antes de compilar la web. Si una migración falla, el despliegue falla y sigue publicada la versión anterior. Los despliegues de *preview* no tocan la base de datos.
3. **Ajustes de Supabase Auth** (Site URL, hook de correos desechables, contraseñas y SMTP). Elige una:
   - **Automático:** crea un token en [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens), añádelo en Vercel como `SUPABASE_ACCESS_TOKEN` y vuelve a desplegar (*Deployments → Redeploy*). El build configura todo lo que siga con los valores de fábrica, y si están `GMAIL_USER` y `GMAIL_APP_PASSWORD`, pone ese Gmail como SMTP. Después **borra el token**: da acceso a todos tus proyectos de Supabase y solo hacía falta una vez.
   - **A mano:** los pasos 3 y 4 de [«Desplegar desde cero»](#desplegar-desde-cero-supabase--vercel).

   Sin esto, el registro funciona, pero el enlace del correo de confirmación lleva a `localhost` (la cuenta queda confirmada igualmente) y Supabase solo envía unos pocos correos por hora.
4. **Correo (opcional):** añade `GMAIL_USER` y `GMAIL_APP_PASSWORD` en Vercel y vuelve a desplegar (ver [`server/README.md`](server/README.md)).
5. Abre la web, regístrate con tu email y configura el centro en **Ajustes**.

El log del build (*Deployments → el despliegue → Build Logs*) dice qué ha hecho y qué queda pendiente. Las variables que pone la integración se leen tal cual (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` o `SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY` o `SUPABASE_SERVICE_ROLE_KEY`, `POSTGRES_URL_NON_POOLING` y sus variantes `NEXT_PUBLIC_*`; ver `scripts/entorno.mjs`): no hay que copiar ni renombrar ninguna. Si conectas un Supabase que ya tenías sin la integración, define `SUPABASE_DB_URL` (la cadena de conexión *Session pooler* de *Project Settings → Database*) para que el build pueda migrar.

## Desplegar desde cero (Supabase + Vercel)

Sin integración, con tu cuenta de Supabase y la terminal.


1. **Supabase:** crea un proyecto vacío en [supabase.com](https://supabase.com) y guarda la contraseña de la base de datos. En una terminal del repo ejecuta `npm run setup`: pide la referencia del proyecto y tu email (el del admin), inicia sesión, enlaza, aplica las migraciones (**no** carga el seed), guarda tu email como admin inicial y escribe **`.env.vercel`** con las variables para Vercel. Ese archivo lleva la `service_role` key: no se sube al repo (`.gitignore`) y conviene borrarlo después de usarlo.
2. **Vercel:** importa tu copia del repo (*Add New → Project*; detecta Vite) y pega el contenido de `.env.vercel` en *Settings → Environment Variables* (acepta pegar el archivo entero). Son tres: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` (**secreta**). Para el correo, añade `GMAIL_USER`, `GMAIL_APP_PASSWORD` y, opcional, `MAIL_FROM_NAME` (ver [`server/README.md`](server/README.md)); sin ellas el CRM funciona, pero no envía correos.
   La API de correo corre en el mismo proyecto como función serverless (`api/index.js`), así que no hace falta otro hosting. No definas `VITE_EMAIL_API_URL`: sin ella el navegador usa `/api/...` del mismo dominio. Los correos entrantes **no se leen en segundo plano**: se buscan en Gmail cuando alguien abre los correos de una empresa o pulsa el botón de actualizar.
3. **Supabase → Authentication:**
   - **URL Configuration:** la URL de Vercel como *Site URL* y en *Redirect URLs* (para confirmar cuentas y recuperar contraseñas).
   - **Hooks → Before User Created:** actívalo con la función Postgres `public.hook_antes_de_crear_usuario` (bloquea correos desechables).
   - **Sign In / Providers → Email:** deja **Confirm email** activado, longitud mínima 8 y "letters and digits".
4. **Supabase → Authentication → SMTP:** el correo por defecto de Supabase solo envía unos pocos mensajes por hora, así que el equipo no podría registrarse el primer día. Si tenéis el Gmail del centro, usa el mismo: host `smtp.gmail.com`, puerto `465`, usuario y remitente = el Gmail, contraseña = su contraseña de aplicación.
5. Regístrate con el email que diste en `npm run setup`: serás admin. Configura el centro en **Ajustes** y después los demás se registran; desde la pestaña **Equipo** les asignas empresas o los haces admin.

Si se te olvidó dar el email o quieres cambiarlo: en el *SQL Editor* de Supabase, `update public.instalacion set admin_email = 'tu@correo.com';` (con `null`, vuelve la regla de «el primero que se registra es admin»).

Para traer las novedades del template a tu copia, mira [`UPDATING.md`](UPDATING.md).

La anon key es pública por diseño; la seguridad la imponen las políticas RLS. Nunca pongas la `service_role`/secret key en el frontend ni en el repo.

## Estructura

```
src/App.jsx                  toda la aplicación (un solo fichero a propósito)
src/centro.js                configuración del centro: valores por defecto y carga desde la tabla `configuracion`
src/Configuracion.jsx        pestaña Ajustes (editor de la configuración)
src/puntuaciones.js          interpreta la rúbrica y calcula la clasificación
src/rubricaEjemplo.js        rúbrica de ejemplo genérica
src/estados.js               estados del pipeline (ids fijos; los nombres se cambian en Ajustes)
src/ui.jsx                   componentes básicos compartidos
src/supabase.js              cliente de Supabase
public/                      archivos estáticos (el logo se sube desde Ajustes)
examples/                    configuraciones de ejemplo para «Cargar desde archivo»
supabase/migrations/         esquema de la base de datos (fuente de verdad)
server/                      servicio de correo SMTP/IMAP (Node)
supabase/seed.sql            datos de prueba SOLO para local
supabase/config.toml         configuración del Supabase local
scripts/setup.mjs            prepara el Supabase de un centro nuevo y genera .env.vercel (`npm run setup`)
scripts/vercel-build.mjs     build de Vercel: migraciones, admin inicial y Auth antes de compilar
scripts/entorno.mjs          nombres de variables aceptados (los nuestros y los de la integración)
scripts/env-local.mjs        genera .env.development.local
scripts/smoke-test.mjs       prueba de humo de la base de datos
```

### Cambiar la base de datos

Siempre con una **migración nueva** (`npm run db:new-migration nombre`), nunca editando una ya publicada (los centros que la aplicaron no la repiten) ni desde el SQL Editor sin dejar rastro. Pruébala con `npm run db:reset` y `npm run db:test`. Los estados del pipeline viven en dos sitios que deben coincidir: `ESTADOS_TODOS` en `src/estados.js` y el `check` de `empresas.estado` en la migración.

**Nueva opción de configuración:** añádela con su valor por defecto en `DEFECTO` (`src/centro.js`), léela con `CENTRO.<opción>` (o `F.<función>` si es un interruptor, añadiéndola también a `FUNCIONES`) y ponle su campo en `src/Configuracion.jsx`. No hace falta migración: se guarda dentro del JSON de `configuracion`.

## Problemas frecuentes

| Síntoma | Causa | Solución |
|---|---|---|
| Página en blanco con error de variables | Falta `.env.development.local` | `npm run db:env` (con Supabase arrancado) |
| `local:setup` falla al conectar con Docker | Docker Desktop apagado | Ábrelo y espera a que diga *Engine running* |
| "No se han podido cargar los datos" | Supabase local parado o proyecto remoto pausado | `npm run db:start`, o *Restore project* en Supabase |
| Registro: "demasiados intentos" | Límite de correos de Supabase | Configura SMTP propio (ver arriba) |
| Un miembro no puede cambiar nombre/sector/responsable | Es la protección funcionando | Lo hace un admin |
