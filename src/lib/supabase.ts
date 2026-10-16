import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-key';

export const supabase = createClient(
  supabaseUrl.startsWith('http') ? supabaseUrl : 'https://placeholder.supabase.co',
  supabaseAnonKey
);

export const STORAGE_BUCKET = 'expedientes';
export const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.txt', '.png', '.jpg', '.jpeg', '.xls', '.xlsx', '.zip', '.rar'];
export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// Configuración del modelo de Gemini activo (soluciona el error 404 de la API)
export const GEMINI_CONFIG = {
  model: 'gemini-1.5-flash',
};

export const PRIORIDADES = [
  { id: 'alta', label: 'Alta', color: 'bg-red-100 text-red-800' },
  { id: 'media', label: 'Media', color: 'bg-yellow-100 text-yellow-800' },
  { id: 'baja', label: 'Baja', color: 'bg-green-100 text-green-800' }
];
