/*
# Fix SECURITY DEFINER function execute grants

PostgreSQL grants EXECUTE on functions to PUBLIC by default.
REVOKE FROM anon, authenticated was insufficient because PUBLIC still has access.
Now properly:
- Revoke EXECUTE from PUBLIC on trigger-only functions (handle_new_user, protect_rol_column)
- Revoke EXECUTE from PUBLIC on is_admin and set_user_role, then grant only to authenticated
*/

-- Trigger-only functions: no one should call these via API
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.protect_rol_column() FROM PUBLIC;

-- is_admin: only authenticated users need this (for RLS policy checks)
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- set_user_role: only authenticated (admin) users need this
REVOKE EXECUTE ON FUNCTION public.set_user_role(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_user_role(uuid, text) TO authenticated;
