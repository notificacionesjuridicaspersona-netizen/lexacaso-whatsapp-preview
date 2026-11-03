/*
# Harden private expediente document access

1. Purpose
- Keep the `expedientes` bucket private and enforce access at the Storage policy layer.
- Ensure a signed-in client can only access files belonging to that client's own expediente folder and only when the related document is marked visible to the client.
- Allow administrators to manage files for every expediente.

2. Storage changes
- Replace broad policies on `storage.objects` for bucket `expedientes`.
- Uploads are allowed for administrators or for a signed-in user writing inside their own first-level folder.
- Reads are allowed for administrators, or for the owning client when a matching `public.documentos` row has `visible_cliente = true`.
- Updates and deletes are restricted to administrators.

3. Function privileges
- Remove anonymous execution of `public.is_admin()`.
- Remove API execution privileges from the trigger-only `public.update_updated_at()` function.

4. Safety notes
- No records or columns are deleted.
- Existing object paths remain valid because the application already stores paths as `<user_id>/<expediente_id>/<file>`.
*/

DROP POLICY IF EXISTS "Allow authenticated upload to expedientes" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated read from expedientes" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated update to expedientes" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated delete from expedientes" ON storage.objects;

CREATE POLICY "Admins or owners can upload expediente files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'expedientes'
    AND (public.is_admin() OR (storage.foldername(name))[1] = auth.uid()::text)
  );

CREATE POLICY "Admins or visible owners can read expediente files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'expedientes'
    AND (
      public.is_admin()
      OR (
        (storage.foldername(name))[1] = auth.uid()::text
        AND EXISTS (
          SELECT 1
          FROM public.documentos d
          WHERE d.ruta_storage = storage.objects.name
            AND d.user_id = auth.uid()
            AND d.visible_cliente = true
        )
      )
    )
  );

CREATE POLICY "Admins can update expediente files"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'expedientes' AND public.is_admin())
  WITH CHECK (bucket_id = 'expedientes' AND public.is_admin());

CREATE POLICY "Admins can delete expediente files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'expedientes' AND public.is_admin());

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.update_updated_at() FROM PUBLIC, anon, authenticated;
