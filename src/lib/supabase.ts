import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Faltan las variables de entorno de Supabase en la configuración.');
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');

export const STORAGE_BUCKET = 'expedientes';
export const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.tiff', '.zip'];
export const MAX_FILE_SIZE = 50 * 1024 * 1024;

export const GEMINI_CONFIG = {
  model: 'gemini-1.5-flash',
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
  { id: 'baja', label: 'Baja' },
  { id: 'media', label: 'Media' },
  { id: 'alta', label: 'Alta' },
  { id: 'urgente', label: 'Urgente' },
];