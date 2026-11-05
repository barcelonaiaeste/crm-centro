# Actualizar tu CRM con las novedades del template

Tu copia es independiente: no se actualiza sola. Cuando el template publique una versión nueva (ver [`CHANGELOG.md`](CHANGELOG.md) y las *Releases* de GitHub), tráela así. Tus datos y tu configuración viven en tu Supabase, así que no se tocan.

```bash
# Una sola vez: apunta a este repositorio como "upstream"
git remote add upstream https://github.com/JavierStark/crm-iaeste.git

# Cada vez que quieras actualizar
git fetch upstream
git merge upstream/main          # si tocaste código, aquí puede haber conflictos que resolver
git push                         # Vercel vuelve a desplegar solo
```

- **Migraciones:** si desplegaste con el botón (integración de Supabase) o tienes `SUPABASE_DB_URL` en Vercel, el despliegue de producción las aplica solo antes de publicar la web. Si no, ejecuta `npx supabase db push` antes del `git push`: sin él la web nueva puede esperar tablas o funciones que aún no existen.
- Sin terminal: en GitHub, *Sync fork* no sirve para copias hechas desde un template. Lo más sencillo es pedir a alguien con Git que haga estos pasos una vez por versión.
- Si solo usas Ajustes y no has editado ficheros del código, el `merge` no tiene conflictos.
- Antes de actualizar en producción puedes probarlo en local: `npm run db:reset && npm run db:test` (ver el README).

## Para quien mantiene el template

- **Nunca edites una migración ya publicada** (`supabase/migrations/*`): los centros que la aplicaron no la volverán a ejecutar. Añade una migración nueva con `npm run db:new-migration nombre`.
- Cada versión nueva: apunta los cambios en `CHANGELOG.md` (indicando las migraciones nuevas) y crea una *Release* de GitHub con una etiqueta `vX.Y.Z`.
- No subas datos reales al repo (nombres, correos, puntos). Las importaciones se aplican a mano con el CLI de Supabase.
