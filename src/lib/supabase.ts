// Forzar el modelo oficial activo de Google Gemini
const rawModel = import.meta.env.VITE_GEMINI_MODEL || import.meta.env.GEMINI_MODEL || '';
const cleanModel = rawModel.replace(/^models\//, '').trim();

export const GEMINI_CONFIG = {
  // ✅ Usamos la variable limpia de Vercel. Si está vacía, usamos el modelo moderno por defecto.
  model: cleanModel || 'gemini-3.8-flash',
  apiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  apiKey: (import.meta.env.VITE_GEMINI_API_KEY as string) || '',
  generationConfig: {
    temperature: 0.4,
    topK: 32,
    topP: 0.95,
    maxOutputTokens: 8192,
  },
};
