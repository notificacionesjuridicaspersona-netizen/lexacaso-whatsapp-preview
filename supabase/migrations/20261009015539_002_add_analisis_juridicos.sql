/*
# Add analisis_juridicos table

## New Table
- analisis_juridicos: Legal analysis records linked to expedientes
  - tipo: 'estructurado' | 'ia' | 'jurisprudencia' (structured / AI / jurisprudence search)
  - contenido: the analysis text
  - documento_id: optional link to a specific documento
  - autor_id: who created the analysis

## Security
- RLS enabled
- SELECT: owner of the expediente or admin
- INSERT/UPDATE/DELETE: admin only
*/

CREATE TABLE IF NOT EXISTS public.analisis_juridicos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id uuid NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  autor_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  documento_id uuid REFERENCES public.documentos(id) ON DELETE SET NULL,
  tipo text NOT NULL DEFAULT 'estructurado',
  titulo text NOT NULL DEFAULT 'Análisis jurídico',
  contenido text NOT NULL,
  resumen text,
  creado_en timestamptz DEFAULT now(),
  actualizado_en timestamptz DEFAULT now()
);

ALTER TABLE public.analisis_juridicos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_analisis" ON public.analisis_juridicos;
CREATE POLICY "select_own_analisis" ON public.analisis_juridicos FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.expedientes e
      WHERE e.id = analisis_juridicos.expediente_id
      AND (e.user_id = auth.uid() OR public.is_admin())
    )
  );

DROP POLICY IF EXISTS "insert_admin_analisis" ON public.analisis_juridicos;
CREATE POLICY "insert_admin_analisis" ON public.analisis_juridicos FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "update_admin_analisis" ON public.analisis_juridicos;
CREATE POLICY "update_admin_analisis" ON public.analisis_juridicos FOR UPDATE
  TO authenticated USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "delete_admin_analisis" ON public.analisis_juridicos;
CREATE POLICY "delete_admin_analisis" ON public.analisis_juridicos FOR DELETE
  TO authenticated USING (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_analisis_expediente_id ON public.analisis_juridicos(expediente_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.analisis_juridicos TO authenticated;
