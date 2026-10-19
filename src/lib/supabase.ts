import { createClient } from '@supabase/supabase-js';

function limpiarUrl(valor: string | undefined): string {
  const coincidencia = (valor || '').match(/https?:\/\/[a-z0-9-]+\.supabase\.co/i);
  return coincidencia ? coincidencia[0] : 'https://placeholder.supabase.co';
}

function limpiarClave(valor: string | undefined): string {
  return (valor || '').replace(/["'\s]/g, '');
}

const supabaseUrl = limpiarUrl(import.meta.env.VITE_SUPABASE_URL);
const supabaseAnonKey = limpiarClave(import.meta.env.VITE_SUPABASE_ANON_KEY) || 'placeholder-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const STORAGE_BUCKET = 'expedientes';
export const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.txt', '.png', '.jpg', '.jpeg', '.xls', '.xlsx', '.zip', '.rar'];
export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// Identificador de modelo estable y explícito (se evita el uso de alias como 'gemini-flash-latest')
const rawModel = import.meta.env.VITE_GEMINI_MODEL || import.meta.env.GEMINI_MODEL || '';
const cleanModel = rawModel.replace(/^models\//, '').trim();

// Si la variable contiene un alias antiguo o no existe, fuerza 'gemini-1.5-flash'
const esAliasObsoleto = !cleanModel || cleanModel.includes('latest') || cleanModel.includes('2.0') || cleanModel.includes('3.8');

export const GEMINI_CONFIG = {
  model: esAliasObsoleto ? 'gemini-1.5-flash' : cleanModel,
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
