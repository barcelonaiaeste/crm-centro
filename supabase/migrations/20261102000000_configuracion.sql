-- ============================================================
-- Multicentro: configuración editable desde el propio CRM
-- ============================================================
-- Todo lo que cambia de un centro a otro (nombre, logo, colores, funciones activas, etiquetas de estados,
-- reparto, correo y el sistema de puntuación entero) se guarda en una sola fila de `configuracion` y lo
-- edita un admin desde la pestaña Configuración. Lo que no esté en `datos` toma el valor por defecto de
-- src/configuracion.js, así que una base nueva funciona sin tocar nada.

-- ------------------------------------------------------------
-- 1. Configuración (una única fila)
-- ------------------------------------------------------------
create table public.configuracion (
  id boolean primary key default true check (id),
  datos jsonb not null default '{}'::jsonb
    check (jsonb_typeof(datos) = 'object' and pg_column_size(datos) < 2000000), -- el logo va dentro (data URL)
  actualizado timestamptz not null default now(),
  actualizado_por uuid references public.profiles (id) on delete set null default auth.uid()
);
insert into public.configuracion default values;

alter table public.configuracion enable row level security;
-- Se lee sin sesión: la pantalla de entrada ya muestra el nombre, el logo y los subcentros del centro.
-- No guarda nada secreto (las claves del correo siguen en las variables de entorno del servidor).
create policy "configuracion_select" on public.configuracion
  for select to anon, authenticated using (true);
create policy "configuracion_update_admin" on public.configuracion
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
revoke insert, delete, truncate on public.configuracion from anon, authenticated;

create or replace function public.configuracion_sello()
returns trigger
language plpgsql
as $$
begin
  new.actualizado := now();
  new.actualizado_por := auth.uid();
  return new;
end;
$$;
create trigger configuracion_sello before update on public.configuracion
  for each row execute function public.configuracion_sello();

-- ------------------------------------------------------------
-- 2. Subcentros (escuelas o facultades de cada persona)
-- ------------------------------------------------------------
-- Antes eran un check fijo (ING, CIE…). Ahora es una tabla que el admin edita en Configuración.
create table public.subcentros (
  codigo text primary key check (codigo ~ '^[A-Za-z0-9][A-Za-z0-9 ._-]{0,19}$'),
  orden int not null default 0
);

alter table public.subcentros enable row level security;
create policy "subcentros_select" on public.subcentros
  for select to anon, authenticated using (true); -- el formulario de registro los necesita
create policy "subcentros_write_admin" on public.subcentros
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke insert, update, delete, truncate on public.subcentros from anon;

-- Se conservan los que ya se estén usando (en una base nueva no hay ninguno)
insert into public.subcentros (codigo)
select centro from public.profiles where centro is not null
union
select socio_centro from public.puntos where socio_centro is not null
on conflict do nothing;

alter table public.profiles drop constraint if exists profiles_centro_check;
alter table public.profiles add constraint profiles_centro_fkey
  foreign key (centro) references public.subcentros (codigo) on update cascade on delete set null;

alter table public.puntos drop constraint if exists puntos_socio_centro_check;
alter table public.puntos add constraint puntos_socio_centro_fkey
  foreign key (socio_centro) references public.subcentros (codigo) on update cascade on delete set null;

-- Alta automática de perfil: el subcentro elegido solo se guarda si existe en la tabla.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_centro text := nullif(btrim(new.raw_user_meta_data ->> 'centro'), '');
begin
  insert into public.profiles (id, nombre, rol, centro)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'nombre'), ''), split_part(new.email, '@', 1)),
    case when not exists (select 1 from public.profiles) then 'admin' else 'miembro' end,
    (select codigo from public.subcentros where codigo = v_centro)
  );
  return new;
end;
$$;

-- ------------------------------------------------------------
-- 3. Rúbrica de puntuación editable
-- ------------------------------------------------------------
-- Las categorías ya no son una lista fija: las define la rúbrica de la configuración. Los apuntes guardan
-- copia del texto del concepto, así que cambiar la rúbrica no altera lo ya anotado.
alter table public.puntos drop constraint if exists puntos_categoria_check;
alter table public.puntos add constraint puntos_categoria_check check (categoria ~ '^[A-Za-z0-9_]{1,12}$');
alter table public.solicitudes_puntos drop constraint if exists solicitudes_puntos_categoria_check;
alter table public.solicitudes_puntos add constraint solicitudes_puntos_categoria_check check (categoria ~ '^[A-Za-z0-9_]{1,12}$');

-- Categoría a la que van los puntos automáticos y cuenta para el nivel «Mínimo» (por defecto H)
create or replace function public.categoria_gt()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(datos #>> '{puntos,categoriaGt}', ''), 'H') from public.configuracion;
$$;

-- Conceptos que cuentan como «ha conseguido una práctica» (marcados en la rúbrica). Sin rúbrica propia,
-- los de la rúbrica de ejemplo.
create or replace function public.conceptos_practica()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select case
    when jsonb_typeof(datos #> '{puntos,rubrica,conceptos}') = 'array' then coalesce((
      select array_agg(c ->> 'id')
      from jsonb_array_elements(datos #> '{puntos,rubrica,conceptos}') c
      where (c ->> 'practica')::boolean
    ), '{}')
    else array['h_practica_nueva', 'h_practica_renovacion']
  end
  from public.configuracion;
$$;

create or replace function public.puntuacion_resumen(p_desde date, p_hasta date)
returns table (usuario_id uuid, total numeric, gt numeric, practica boolean)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_gt text := public.categoria_gt();
  v_practica text[] := public.conceptos_practica();
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  return query
    select p.usuario_id,
           sum(p.puntos),
           coalesce(sum(p.puntos) filter (where p.categoria = v_gt), 0),
           coalesce(bool_or(p.concepto = any (v_practica)), false)
    from public.puntos p
    where p.usuario_id is not null and p.fecha between p_desde and p_hasta
    group by p.usuario_id;
end;
$$;
revoke execute on function public.puntuacion_resumen(date, date) from public, anon;
grant execute on function public.puntuacion_resumen(date, date) to authenticated;
