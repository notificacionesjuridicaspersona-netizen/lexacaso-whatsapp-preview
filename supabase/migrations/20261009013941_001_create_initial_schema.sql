/*
# Create initial LEXACASO schema

Creates the complete database schema for the LEXACASO legal case management platform.

## New Tables
- profiles, expedientes, documentos, observaciones, seguimientos, historial_expedientes, bitacora_auditoria, config_categorias, config_estados, config_tipos_actuacion

## Security
- RLS enabled on all tables with owner-scoped and admin policies
- 4 separate policies per table (SELECT/INSERT/UPDATE/DELETE)

## Functions
- is_admin(), handle_new_user(), set_user_role(), protect_rol_column(), update_updated_at()
*/

-- ============================================
-- TABLES (created first, before any functions that reference them)
-- ============================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  nombre_completo text NOT NULL,
  cedula text,
  celular text,
  direccion text,
  rol text NOT NULL DEFAULT 'cliente',
  autorizacion_datos boolean NOT NULL DEFAULT false,
  autorizacion_fecha timestamptz,
  autorizacion_version text DEFAULT '1.0',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.expedientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  numero_expediente text UNIQUE,
  numero_radicado text,
  titulo text NOT NULL,
  descripcion text,
  area_juridica text,
  estado text NOT NULL DEFAULT 'Recibido',
  prioridad text NOT NULL DEFAULT 'Media',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id uuid NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  ruta_storage text NOT NULL,
  tipo_mime text NOT NULL,
  tamano_bytes bigint NOT NULL DEFAULT 0,
  extension text,
  visible_cliente boolean NOT NULL DEFAULT true,
  remitente_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  mensaje_admin text,
  consultado boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.observaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id uuid NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  autor_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  contenido text NOT NULL,
  visible_cliente boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.seguimientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id uuid NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  autor_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo_actuacion text NOT NULL,
  descripcion text NOT NULL,
  fecha_actuacion date NOT NULL DEFAULT CURRENT_DATE,
  fecha_vencimiento date,
  estado text NOT NULL DEFAULT 'Pendiente',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.historial_expedientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id uuid NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  autor_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  campo text NOT NULL,
  valor_anterior text,
  valor_nuevo text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bitacora_auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  autor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  accion text NOT NULL,
  detalle text,
  entidad text,
  entidad_id uuid,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.config_categorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL UNIQUE,
  descripcion text,
  orden int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.config_estados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL UNIQUE,
  color text DEFAULT '#6b7280',
  orden int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.config_tipos_actuacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL UNIQUE,
  descripcion text,
  orden int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- ============================================
-- FUNCTIONS (after all tables exist)
-- ============================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND rol = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, nombre_completo, autorizacion_datos, autorizacion_fecha, autorizacion_version, rol)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nombre_completo', NEW.email),
    COALESCE((NEW.raw_user_meta_data->>'autorizacion_datos')::boolean, false),
    CASE WHEN COALESCE((NEW.raw_user_meta_data->>'autorizacion_datos')::boolean, false) THEN now() ELSE NULL END,
    '1.0',
    CASE WHEN NEW.email = 'notipersonales2026@gmail.com' THEN 'admin' ELSE 'cliente' END
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_user_role(target_user_id uuid, new_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede cambiar roles';
  END IF;
  IF new_role NOT IN ('admin', 'cliente') THEN
    RAISE EXCEPTION 'Rol no valido: %', new_role;
  END IF;
  UPDATE public.profiles SET rol = new_role, updated_at = now() WHERE id = target_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_user_role(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_user_role(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_user_role(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.protect_rol_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.rol IS DISTINCT FROM OLD.rol AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'No tiene permisos para cambiar el rol';
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================
-- ENABLE RLS ON ALL TABLES
-- ============================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expedientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.observaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seguimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historial_expedientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bitacora_auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.config_categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.config_estados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.config_tipos_actuacion ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES: profiles
-- ============================================

DROP POLICY IF EXISTS "select_own_profile_or_admin" ON public.profiles;
CREATE POLICY "select_own_profile_or_admin" ON public.profiles FOR SELECT
  TO authenticated USING (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "insert_own_profile" ON public.profiles;
CREATE POLICY "insert_own_profile" ON public.profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_profile_or_admin" ON public.profiles;
CREATE POLICY "update_own_profile_or_admin" ON public.profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id OR public.is_admin())
  WITH CHECK (auth.uid() = id OR public.is_admin());

-- ============================================
-- RLS POLICIES: expedientes
-- ============================================

DROP POLICY IF EXISTS "select_own_expedientes" ON public.expedientes;
CREATE POLICY "select_own_expedientes" ON public.expedientes FOR SELECT
  TO authenticated USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "insert_own_expedientes" ON public.expedientes;
CREATE POLICY "insert_own_expedientes" ON public.expedientes FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "update_own_expedientes" ON public.expedientes;
CREATE POLICY "update_own_expedientes" ON public.expedientes FOR UPDATE
  TO authenticated USING (auth.uid() = user_id OR public.is_admin())
  WITH CHECK (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "delete_own_expedientes" ON public.expedientes;
CREATE POLICY "delete_own_expedientes" ON public.expedientes FOR DELETE
  TO authenticated USING (auth.uid() = user_id OR public.is_admin());

-- ============================================
-- RLS POLICIES: documentos
-- ============================================

DROP POLICY IF EXISTS "select_own_documentos" ON public.documentos;
CREATE POLICY "select_own_documentos" ON public.documentos FOR SELECT
  TO authenticated USING (
    (auth.uid() = user_id AND visible_cliente = true) OR public.is_admin()
  );

DROP POLICY IF EXISTS "insert_own_documentos" ON public.documentos;
CREATE POLICY "insert_own_documentos" ON public.documentos FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "update_own_documentos" ON public.documentos;
CREATE POLICY "update_own_documentos" ON public.documentos FOR UPDATE
  TO authenticated USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "delete_own_documentos" ON public.documentos;
CREATE POLICY "delete_own_documentos" ON public.documentos FOR DELETE
  TO authenticated USING (public.is_admin());

-- ============================================
-- RLS POLICIES: observaciones
-- ============================================

DROP POLICY IF EXISTS "select_own_observaciones" ON public.observaciones;
CREATE POLICY "select_own_observaciones" ON public.observaciones FOR SELECT
  TO authenticated USING (
    (EXISTS (
      SELECT 1 FROM public.expedientes e
      WHERE e.id = observaciones.expediente_id AND e.user_id = auth.uid()
    ) AND visible_cliente = true) OR public.is_admin()
  );

DROP POLICY IF EXISTS "insert_own_observaciones" ON public.observaciones;
CREATE POLICY "insert_own_observaciones" ON public.observaciones FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "update_own_observaciones" ON public.observaciones;
CREATE POLICY "update_own_observaciones" ON public.observaciones FOR UPDATE
  TO authenticated USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "delete_own_observaciones" ON public.observaciones;
CREATE POLICY "delete_own_observaciones" ON public.observaciones FOR DELETE
  TO authenticated USING (public.is_admin());

-- ============================================
-- RLS POLICIES: seguimientos
-- ============================================

DROP POLICY IF EXISTS "select_own_seguimientos" ON public.seguimientos;
CREATE POLICY "select_own_seguimientos" ON public.seguimientos FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.expedientes e
      WHERE e.id = seguimientos.expediente_id AND (e.user_id = auth.uid() OR public.is_admin())
    )
  );

DROP POLICY IF EXISTS "insert_own_seguimientos" ON public.seguimientos;
CREATE POLICY "insert_own_seguimientos" ON public.seguimientos FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "update_own_seguimientos" ON public.seguimientos;
CREATE POLICY "update_own_seguimientos" ON public.seguimientos FOR UPDATE
  TO authenticated USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "delete_own_seguimientos" ON public.seguimientos;
CREATE POLICY "delete_own_seguimientos" ON public.seguimientos FOR DELETE
  TO authenticated USING (public.is_admin());

-- ============================================
-- RLS POLICIES: historial_expedientes
-- ============================================

DROP POLICY IF EXISTS "select_own_historial" ON public.historial_expedientes;
CREATE POLICY "select_own_historial" ON public.historial_expedientes FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.expedientes e
      WHERE e.id = historial_expedientes.expediente_id AND (e.user_id = auth.uid() OR public.is_admin())
    )
  );

DROP POLICY IF EXISTS "insert_own_historial" ON public.historial_expedientes;
CREATE POLICY "insert_own_historial" ON public.historial_expedientes FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.expedientes e
      WHERE e.id = historial_expedientes.expediente_id AND (e.user_id = auth.uid() OR public.is_admin())
    )
  );

-- ============================================
-- RLS POLICIES: bitacora_auditoria
-- ============================================

DROP POLICY IF EXISTS "select_admin_bitacora" ON public.bitacora_auditoria;
CREATE POLICY "select_admin_bitacora" ON public.bitacora_auditoria FOR SELECT
  TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "insert_own_bitacora" ON public.bitacora_auditoria;
CREATE POLICY "insert_own_bitacora" ON public.bitacora_auditoria FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = autor_id);

-- ============================================
-- RLS POLICIES: config_categorias
-- ============================================

DROP POLICY IF EXISTS "select_all_categorias" ON public.config_categorias;
CREATE POLICY "select_all_categorias" ON public.config_categorias FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_admin_categorias" ON public.config_categorias;
CREATE POLICY "insert_admin_categorias" ON public.config_categorias FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "update_admin_categorias" ON public.config_categorias;
CREATE POLICY "update_admin_categorias" ON public.config_categorias FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "delete_admin_categorias" ON public.config_categorias;
CREATE POLICY "delete_admin_categorias" ON public.config_categorias FOR DELETE
  TO authenticated USING (public.is_admin());

-- ============================================
-- RLS POLICIES: config_estados
-- ============================================

DROP POLICY IF EXISTS "select_all_estados" ON public.config_estados;
CREATE POLICY "select_all_estados" ON public.config_estados FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_admin_estados" ON public.config_estados;
CREATE POLICY "insert_admin_estados" ON public.config_estados FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "update_admin_estados" ON public.config_estados;
CREATE POLICY "update_admin_estados" ON public.config_estados FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "delete_admin_estados" ON public.config_estados;
CREATE POLICY "delete_admin_estados" ON public.config_estados FOR DELETE
  TO authenticated USING (public.is_admin());

-- ============================================
-- RLS POLICIES: config_tipos_actuacion
-- ============================================

DROP POLICY IF EXISTS "select_all_tipos_actuacion" ON public.config_tipos_actuacion;
CREATE POLICY "select_all_tipos_actuacion" ON public.config_tipos_actuacion FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_admin_tipos_actuacion" ON public.config_tipos_actuacion;
CREATE POLICY "insert_admin_tipos_actuacion" ON public.config_tipos_actuacion FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "update_admin_tipos_actuacion" ON public.config_tipos_actuacion;
CREATE POLICY "update_admin_tipos_actuacion" ON public.config_tipos_actuacion FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "delete_admin_tipos_actuacion" ON public.config_tipos_actuacion;
CREATE POLICY "delete_admin_tipos_actuacion" ON public.config_tipos_actuacion FOR DELETE
  TO authenticated USING (public.is_admin());

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_expedientes_user_id ON public.expedientes(user_id);
CREATE INDEX IF NOT EXISTS idx_expedientes_estado ON public.expedientes(estado);
CREATE INDEX IF NOT EXISTS idx_documentos_expediente_id ON public.documentos(expediente_id);
CREATE INDEX IF NOT EXISTS idx_documentos_user_id ON public.documentos(user_id);
CREATE INDEX IF NOT EXISTS idx_seguimientos_expediente_id ON public.seguimientos(expediente_id);
CREATE INDEX IF NOT EXISTS idx_historial_expediente_id ON public.historial_expedientes(expediente_id);

-- ============================================
-- SEED DATA
-- ============================================

INSERT INTO public.config_categorias (nombre, descripcion, orden) VALUES
  ('Derecho Civil', 'Asuntos civiles: contratos, responsabilidad, familia', 1),
  ('Derecho Penal', 'Defensa y representacion penal', 2),
  ('Derecho Laboral', 'Conflictos laborales y prestaciones', 3),
  ('Derecho Administrativo', 'Actos administrativos y contencioso-administrativo', 4),
  ('Derecho Comercial', 'Mercantil, sociedades, contratos comerciales', 5),
  ('Derecho de Familia', 'Divorcios, custodia, alimentos, visitas', 6)
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO public.config_estados (nombre, color, orden) VALUES
  ('Recibido', '#3b82f6', 1),
  ('En revision', '#f59e0b', 2),
  ('En estudio', '#8b5cf6', 3),
  ('En tramite', '#06b6d4', 4),
  ('En notificacion', '#ec4899', 5),
  ('Finalizado', '#10b981', 6),
  ('Archivado', '#6b7280', 7),
  ('Suspendido', '#ef4444', 8),
  ('Pendiente documentacion', '#f97316', 9),
  ('En audiencia', '#14b8a6', 10),
  ('En apelacion', '#6366f1', 11)
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO public.config_tipos_actuacion (nombre, descripcion, orden) VALUES
  ('Revision inicial', 'Revision preliminar del caso', 1),
  ('Recoleccion de pruebas', 'Recopilacion de documentacion y pruebas', 2),
  ('Audiencia', 'Comparecencia en audiencia', 3),
  ('Notificacion', 'Notificacion a partes interesadas', 4),
  ('Escrito', 'Presentacion de escritos y demandas', 5),
  ('Seguimiento', 'Seguimiento de estado del proceso', 6),
  ('Cierre', 'Cierre o finalizacion del caso', 7)
ON CONFLICT (nombre) DO NOTHING;

-- ============================================
-- TRIGGERS
-- ============================================

DROP TRIGGER IF EXISTS trg_expedientes_updated_at ON public.expedientes;
CREATE TRIGGER trg_expedientes_updated_at
  BEFORE UPDATE ON public.expedientes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS trg_protect_rol ON public.profiles;
CREATE TRIGGER trg_protect_rol
  BEFORE UPDATE OF rol ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_rol_column();

-- ============================================
-- STORAGE BUCKET (private)
-- ============================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('documentos', 'documentos', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users can read own documents" ON storage.objects;
CREATE POLICY "Users can read own documents" ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'documentos' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.is_admin()));

DROP POLICY IF EXISTS "Users can insert own documents" ON storage.objects;
CREATE POLICY "Users can insert own documents" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'documentos' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.is_admin()));

DROP POLICY IF EXISTS "Admin can update documents" ON storage.objects;
CREATE POLICY "Admin can update documents" ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'documentos' AND public.is_admin())
  WITH CHECK (bucket_id = 'documentos' AND public.is_admin());

DROP POLICY IF EXISTS "Admin can delete documents" ON storage.objects;
CREATE POLICY "Admin can delete documents" ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'documentos' AND public.is_admin());

-- ============================================
-- GRANTS
-- ============================================

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE ON storage.objects TO authenticated;
