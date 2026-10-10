import { callGemini } from './ai';

export function isGeminiConfigured(): boolean {
  const key = import.meta.env.VITE_GEMINI_API_KEY;
  return typeof key === 'string' && key.trim().length > 0;
}

export async function generarRespuestaGemini(prompt: string): Promise<string> {
  const result = await callGemini(prompt);
  if (result.error) throw new Error(result.error);
  return result.content;
}
