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

// Configuración del modelo activo de Gemini
export const GEMINI_CONFIG = {
  model: 'gemini-3.8-flash',
  apiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  apiKey: (import.meta.env.VITE_GEMINI_API_KEY as string) || '',
  generationConfig: {
    temperature: 0.4,
    topK: 32,
    topP: 0.95,
    maxOutputTokens: 8192,
  },
};

export function getGeminiEndpoint(): string {
  return `${GEMINI_CONFIG.apiBaseUrl}/models/${GEMINI_CONFIG.model}:generateContent?key=${GEMINI_CONFIG.apiKey}`;
}

export const PRIORIDADES = [
  { id: 'alta', label: 'Alta', color: 'bg-red-100 text-red-800' },
  { id: 'media', label: 'Media', color: 'bg-yellow-100 text-yellow-800' },
  { id: 'baja', label: 'Baja', color: 'bg-green-100 text-green-800' }
];
