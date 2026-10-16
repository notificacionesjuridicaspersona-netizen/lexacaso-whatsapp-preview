-- Add FK from comentarios.autor_id to profiles.id so Supabase client can join comentarios -> profiles
-- The existing FK references auth.users(id) which Supabase PostgREST cannot traverse.
-- We add a second FK to profiles(id) since profiles.id = auth.users.id (1:1).

ALTER TABLE public.comentarios
  DROP CONSTRAINT IF EXISTS comentarios_autor_id_profiles_fkey;

ALTER TABLE public.comentarios
  ADD CONSTRAINT comentarios_autor_id_profiles_fkey
  FOREIGN KEY (autor_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
