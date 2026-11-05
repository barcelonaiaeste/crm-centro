-- ============================================================
-- Plantillas de correo + Ranking solo para admins
-- ============================================================

-- Plantillas de correo compartidas por todo el equipo. Se eligen en la caja de redacción del hilo de correo
-- y se editan en la sección «Plantillas». Variables admitidas en asunto y mensaje: {{empresa}}, {{contacto}}, {{yo}}.
-- Todos las leen y cualquiera puede crear las suyas; editar o borrar, solo su autor o un admin
-- (las que no tienen autor, como la de serie, solo las toca un admin).
create table public.plantillas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(btrim(nombre)) between 1 and 80),
  asunto text not null default '' check (length(asunto) <= 200 and asunto !~ '[\r\n]'),
  cuerpo text not null check (length(btrim(cuerpo)) > 0 and length(cuerpo) <= 20000),
  creado_por uuid references public.profiles (id) on delete set null default auth.uid(),
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);

alter table public.plantillas enable row level security;
revoke all on public.plantillas from anon;

create policy "plantillas_select" on public.plantillas
  for select to authenticated using (true);

create policy "plantillas_insert" on public.plantillas
  for insert to authenticated
  with check (creado_por = auth.uid());

create policy "plantillas_update" on public.plantillas
  for update to authenticated
  using (creado_por = auth.uid() or public.is_admin())
  with check (creado_por = auth.uid() or public.is_admin());

create policy "plantillas_delete" on public.plantillas
  for delete to authenticated
  using (creado_por = auth.uid() or public.is_admin());

-- Plantilla de serie: un correo de primer contacto genérico. Cada centro la edita (o la borra) en la
-- pestaña Plantillas; las variables {{empresa}}, {{contacto}} y {{yo}} se rellenan al usarla.
insert into public.plantillas (nombre, asunto, cuerpo, creado_por) values (
  'Primer contacto',
  'Propuesta de colaboración con {{empresa}}',
  $plantilla$Buenos días {{contacto}},

Mi nombre es {{yo}} y le escribo en nombre de nuestro equipo. Como comentamos por teléfono, le envío una breve presentación de lo que hacemos y de cómo podríamos colaborar con {{empresa}}.

[Explica aquí en dos o tres frases quién sois y qué propones a la empresa.]

Si le parece bien, podemos fijar una reunión corta para resolver cualquier duda y ver los siguientes pasos.

Quedamos a su disposición para lo que necesite. Gracias de antemano y un saludo,

{{yo}}
[Nombre del centro]$plantilla$,
  null
);

-- El Ranking pasa a ser solo para admins (los miembros ya no lo ven en la app). Los admins ya leen todo
-- el historial por RLS, así que esta función no da acceso nuevo; solo deja de estar abierta al resto.
create or replace function public.ranking_datos(p_hasta date)
returns json
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if not public.is_admin() then
    raise exception 'Solo un admin puede ver el ranking';
  end if;
  return json_build_object(
    'hist', coalesce((
      select json_agg(json_build_object(
        'id', h.id, 'empresa_id', h.empresa_id, 'usuario_id', h.usuario_id,
        'accion', h.accion, 'estado_nuevo', h.estado_nuevo, 'creado', h.creado
      ) order by h.creado, h.id)
      from public.historial h
      where h.accion in ('estado', 'nota') and h.creado < (p_hasta + 1)
    ), '[]'::json),
    'empresas', coalesce((
      select json_agg(json_build_object('id', e.id, 'nombre', e.nombre, 'responsable', e.responsable, 'estado', e.estado))
      from public.empresas e
    ), '[]'::json)
  );
end;
$$;
