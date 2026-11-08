-- ============================================================
-- Copia (CC) en los correos
--
-- Direcciones en copia separadas por comas: las que se ponen al enviar desde el CRM
-- y las que traen los correos entrantes. Solo informativo (el hilo lo muestra).
-- ============================================================
alter table public.emails add column if not exists cc text;
