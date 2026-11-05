# Cambios

Cada versión indica si trae **migraciones nuevas** (hay que ejecutar `npx supabase db push`; ver [`UPDATING.md`](UPDATING.md)).

## Sin publicar

- **Migración nueva:** `20261104000000_admin_inicial.sql` (tabla privada `instalacion`). Si está puesto el email del admin inicial, solo ese email entra como admin.
- `npm run setup` pide el email del admin, lo guarda y genera `.env.vercel` con las variables para Vercel.
- El correo es opcional: sin `GMAIL_USER` ni `GMAIL_APP_PASSWORD` la API arranca (responde 503 al enviar) y Ajustes avisa. `SUPABASE_URL` ya no hace falta en Vercel.
- **Despliegue en un clic:** el botón de Vercel instala la integración de Supabase y solo pide `ADMIN_EMAIL`. El build de producción (`scripts/vercel-build.mjs`) aplica las migraciones, guarda el admin inicial y, con `SUPABASE_ACCESS_TOKEN`, configura Supabase Auth (Site URL, hook, contraseñas y SMTP con el Gmail). Vite y la API leen también los nombres de variable de la integración.
- **Importar empresas desde Excel** (admins, botón «Importar» en Empresas): acepta .xlsx, .xls, .ods o CSV con cualquier estructura. Propone la hoja, la fila de cabecera y a qué campo va cada columna (por la cabecera y el contenido); se traducen los estados y responsables del archivo a los del CRM; limpia teléfonos y correos; detecta duplicados por CIF o nombre (saltar o completar campos vacíos) y muestra una vista previa antes de importar. El mapeo se recuerda para archivos con las mismas columnas. Nueva dependencia: SheetJS (`xlsx`, desde cdn.sheetjs.com).
- Corregido: el remitente por defecto salía como «Mi centro» en vez del nombre del centro. Asunto por defecto del primer correo neutro.

## 1.0.0

Primera versión del template.

- CRM de empresas multicentro: ficha de empresa con seguimiento, llamadas, notas y estados, reparto de empresas entre el equipo, agenda y avisos de seguimiento.
- Todo lo propio de cada centro se configura desde la pestaña **Ajustes** (nombre, logo, color, funciones, estados, subcentros, correo y puntuación), sin tocar código.
- Correo con las empresas (SMTP/IMAP con un Gmail compartido), plantillas HTML y adjuntos.
- Puntuación opcional: rúbrica editable, clasificación, solicitudes de puntos y puntos automáticos.
- `npm run setup` prepara el Supabase de un centro nuevo; `npm run local` levanta todo en local con datos de prueba.
- Migraciones: `supabase/migrations/20261007000000` a `20261102000000`.
