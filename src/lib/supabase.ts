import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Faltan variables de entorno de Supabase');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

export const STORAGE_BUCKET = 'documentos';

export const ALLOWED_EXTENSIONS = [
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'zip', 'rar',
  'jpg', 'jpeg', 'png',
];

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export const PRIORIDADES = ['Baja', 'Media', 'Alta', 'Urgente'] as const;

export const ESTADOS_DOCUMENTO = ['Nuevo', 'Consultado'] as const;

export const CLASIFICACION_DOC = ['entregable', 'interno'] as const;
