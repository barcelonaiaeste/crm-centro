-- ============================================================
-- Admin inicial por email
-- ============================================================
-- Hasta ahora el primer usuario que se registraba en una base vacía era admin: si alguien encontraba la web
-- recién desplegada antes que el responsable, se quedaba con el admin. `npm run setup` guarda aquí el email
-- del responsable y, si está puesto, solo ese email entra como admin (el resto, miembros), se registre cuando
-- se registre. Sin email guardado se mantiene la regla de siempre: el primero es admin.

create table public.instalacion (
  id boolean primary key default true check (id),
  admin_email text check (admin_email is null or admin_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);
insert into public.instalacion default values;

-- Privada: solo la toca el service_role (setup) o el SQL Editor. Sin políticas, RLS lo bloquea para el resto.
alter table public.instalacion enable row level security;
revoke all on public.instalacion from anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_centro text := nullif(btrim(new.raw_user_meta_data ->> 'centro'), '');
  v_admin text := (select lower(btrim(admin_email)) from public.instalacion);
begin
  insert into public.profiles (id, nombre, rol, centro)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'nombre'), ''), split_part(new.email, '@', 1)),
    case
      when v_admin is not null then case when lower(new.email) = v_admin then 'admin' else 'miembro' end
      when not exists (select 1 from public.profiles) then 'admin'
      else 'miembro'
    end,
    (select codigo from public.subcentros where codigo = v_centro)
  );
  return new;
end;
$$;
