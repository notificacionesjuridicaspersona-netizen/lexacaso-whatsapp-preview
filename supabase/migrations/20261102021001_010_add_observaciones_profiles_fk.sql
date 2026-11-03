-- Add FK from observaciones.autor_id to profiles.id
-- This allows the Supabase client to join observaciones with profiles
ALTER TABLE public.observaciones
  ADD CONSTRAINT observaciones_autor_id_profiles_fkey
  FOREIGN KEY (autor_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
