import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Faltan las variables de entorno de Supabase en la configuración.');
}

// Exportación principal de la base de datos
export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');

// variables de configuración de archivos requeridas por helpers.ts
export const STORAGE_BUCKET = 'expedientes';
export const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.tiff', '.zip'];
export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB en bytes

// Configuración del motor de Inteligencia Artificial
export const GEMINI_CONFIG = {
  model: 'gemini-1.5-flash',
  apiBaseUrl: 'https://googleapis.com',
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
