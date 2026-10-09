-- Add FK from bitacora_auditoria.autor_id to profiles.id
-- This fixes the "Could not find a relationship between 'bitacora_auditoria' and 'profiles'" error
-- The existing FK references auth.users(id); we add a second FK to profiles(id)

ALTER TABLE public.bitacora_auditoria
  ADD CONSTRAINT bitacora_auditoria_autor_id_profiles_fkey
  FOREIGN KEY (autor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;