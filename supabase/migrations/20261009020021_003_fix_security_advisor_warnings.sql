/*
# Fix Security Advisor Warnings

1. Revoke EXECUTE on SECURITY DEFINER functions that should not be directly callable
   - `handle_new_user()`: trigger function, only called by trigger, not via API
   - `protect_rol_column()`: trigger function, only called by trigger, not via API
2. Set search_path on `update_updated_at()` to prevent search_path injection
   - Must DROP CASCADE to recreate with fixed search_path, then re-create triggers
3. Keep `is_admin()` and `set_user_role()` callable by authenticated (needed by app)
*/

-- Revoke EXECUTE from anon and authenticated on trigger-only functions
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_rol_column() FROM anon, authenticated;

-- Fix mutable search_path: drop function with cascade (drops triggers), recreate with search_path, recreate triggers
DROP FUNCTION IF EXISTS public.update_updated_at() CASCADE;

CREATE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Recreate the triggers that were dropped by CASCADE
DROP TRIGGER IF EXISTS trg_expedientes_updated_at ON public.expedientes;
CREATE TRIGGER trg_expedientes_updated_at
  BEFORE UPDATE ON public.expedientes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
