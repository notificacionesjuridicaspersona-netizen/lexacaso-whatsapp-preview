import { callGemini } from './ai';

/**
 * Verifica si la clave API de Gemini está presente y no está vacía
 */
export function isGeminiConfigured(): boolean {
  const key = import.meta.env.VITE_GEMINI_API_KEY;
  return typeof key === 'string' && key.trim().length > 0;
}

/**
 * Ejecuta una consulta a la API de Gemini y retorna el contenido en texto
 */
export async function generarRespuestaGemini(prompt: string): Promise<string> {
  const result = await callGemini(prompt);
  if (result.error) throw new Error(result.error);
  return result.content;
}
