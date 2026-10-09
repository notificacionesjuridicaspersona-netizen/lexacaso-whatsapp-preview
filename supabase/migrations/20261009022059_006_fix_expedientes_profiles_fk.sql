-- Add FK from expedientes.user_id to profiles.id
-- This fixes the "Could not find a relationship between 'expedientes' and 'profiles'" error
-- The existing FK references auth.users(id); we add a second FK to profiles(id)
-- Both can coexist since profiles.id IS also the auth user id

ALTER TABLE public.expedientes
  ADD CONSTRAINT expedientes_user_id_profiles_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;