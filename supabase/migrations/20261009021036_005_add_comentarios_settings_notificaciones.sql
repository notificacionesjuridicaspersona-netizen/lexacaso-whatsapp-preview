/*
# Add comentarios, app_settings, notificaciones tables and expand expedientes

1. New Tables
- `comentarios`: bidirectional communication admin<->client per expediente.
- `app_settings`: key-value config (admin email, whatsapp, tool toggles).
- `notificaciones`: tracks email notification attempts.
2. Modified Tables
- `expedientes`: add nullable columns (entidad_involucrada, fecha_hechos, pretensiones, actuaciones_previas, observaciones_adicionales).
3. Security: RLS on all new tables.
*/

ALTER TABLE public.expedientes
  ADD COLUMN IF NOT EXISTS entidad_involucrada text,
  ADD COLUMN IF NOT EXISTS fecha_hechos date,
  ADD COLUMN IF NOT EXISTS pretensiones text,
  ADD COLUMN IF NOT EXISTS actuaciones_previas text,
  ADD COLUMN IF NOT EXISTS observaciones_adicionales text;

CREATE TABLE IF NOT EXISTS public.comentarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id uuid NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  autor_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  contenido text NOT NULL,
  visibilidad text NOT NULL DEFAULT 'cliente' CHECK (visibilidad IN ('cliente','interno','sistema')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.comentarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_comentarios" ON public.comentarios;
CREATE POLICY "select_comentarios" ON public.comentarios FOR SELECT
  TO authenticated USING (
    public.is_admin()
    OR (expediente_id IN (SELECT id FROM public.expedientes WHERE user_id = auth.uid())
        AND visibilidad IN ('cliente','sistema'))
  );

DROP POLICY IF EXISTS "insert_comentarios" ON public.comentarios;
CREATE POLICY "insert_comentarios" ON public.comentarios FOR INSERT
  TO authenticated WITH CHECK (
    public.is_admin()
    OR (expediente_id IN (SELECT id FROM public.expedientes WHERE user_id = auth.uid())
        AND visibilidad = 'cliente')
  );

DROP POLICY IF EXISTS "update_comentarios" ON public.comentarios;
CREATE POLICY "update_comentarios" ON public.comentarios FOR UPDATE
  TO authenticated USING (
    public.is_admin() OR (autor_id = auth.uid() AND visibilidad = 'cliente')
  ) WITH CHECK (public.is_admin() OR autor_id = auth.uid());

DROP POLICY IF EXISTS "delete_comentarios" ON public.comentarios;
CREATE POLICY "delete_comentarios" ON public.comentarios FOR DELETE
  TO authenticated USING (
    public.is_admin() OR (autor_id = auth.uid() AND visibilidad = 'cliente')
  );

CREATE TABLE IF NOT EXISTS public.app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clave text UNIQUE NOT NULL,
  valor text,
  descripcion text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_app_settings" ON public.app_settings;
CREATE POLICY "select_app_settings" ON public.app_settings FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_app_settings" ON public.app_settings;
CREATE POLICY "insert_app_settings" ON public.app_settings FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "update_app_settings" ON public.app_settings;
CREATE POLICY "update_app_settings" ON public.app_settings FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "delete_app_settings" ON public.app_settings;
CREATE POLICY "delete_app_settings" ON public.app_settings FOR DELETE
  TO authenticated USING (public.is_admin());

INSERT INTO public.app_settings (clave, valor, descripcion) VALUES
  ('admin_email', 'notipersonales2026@gmail.com', 'Correo del administrador para notificaciones'),
  ('whatsapp_enabled', 'true', 'Mostrar boton de WhatsApp'),
  ('whatsapp_number', '573105603386', 'Numero de WhatsApp (formato internacional)'),
  ('tool_analizar_documentos', 'true', 'Analizar documentos juridicos'),
  ('tool_resumir_hechos', 'true', 'Resumir hechos cronologicamente'),
  ('tool_identificar_problemas', 'true', 'Identificar problemas juridicos'),
  ('tool_jurisprudencia', 'true', 'Investigar jurisprudencia'),
  ('tool_normatividad', 'true', 'Identificar normatividad aplicable'),
  ('tool_alternativas', 'true', 'Evaluar alternativas de solucion'),
  ('tool_terminos_plazos', 'true', 'Identificar terminos y plazos'),
  ('tool_pruebas_faltantes', 'true', 'Detectar documentos y pruebas faltantes'),
  ('tool_estrategias', 'true', 'Proponer estrategias juridicas'),
  ('tool_acciones', 'true', 'Determinar posibles acciones'),
  ('tool_conducta', 'true', 'Indicar conducta a evaluar'),
  ('tool_borradores', 'true', 'Elaborar borradores de documentos'),
  ('tool_contradicciones', 'true', 'Revisar contradicciones y debilidades'),
  ('tool_informe_integral', 'true', 'Generar informe juridico integral'),
  ('tool_segunda_revision', 'true', 'Segunda revision critica'),
  ('ai_service_configured', 'false', 'Hay un servicio de IA configurado?'),
  ('ocr_service_configured', 'false', 'Hay un servicio de OCR configurado?'),
  ('jurisprudencia_service_configured', 'false', 'Hay un servicio de jurisprudencia configurado?')
ON CONFLICT (clave) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.notificaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  destinatario text NOT NULL,
  evento text NOT NULL,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','enviada','fallida')),
  resultado text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.notificaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_notificaciones" ON public.notificaciones;
CREATE POLICY "select_notificaciones" ON public.notificaciones FOR SELECT
  TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "insert_notificaciones" ON public.notificaciones;
CREATE POLICY "insert_notificaciones" ON public.notificaciones FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_notificaciones" ON public.notificaciones;
CREATE POLICY "update_notificaciones" ON public.notificaciones FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "delete_notificaciones" ON public.notificaciones;
CREATE POLICY "delete_notificaciones" ON public.notificaciones FOR DELETE
  TO authenticated USING (public.is_admin());
