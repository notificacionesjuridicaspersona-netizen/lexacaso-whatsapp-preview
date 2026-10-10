export type AIProvider = 'openai' | 'gemini' | 'local';

export interface AIResult {
  content: string;
  provider: AIProvider;
  error?: string;
}

// Modelo en un solo lugar. Puedes cambiarlo sin tocar el código
// definiendo VITE_GEMINI_MODEL en las variables de entorno.
const GEMINI_MODEL: string =
  (import.meta.env.VITE_GEMINI_MODEL as string | undefined)?.trim() || 'gemini-3.5-flash';

const LEGAL_SYSTEM_PROMPT = `
Eres un asistente de análisis jurídico y administrativo especializado en el ordenamiento jurídico colombiano.

ÁREAS DE ANÁLISIS JURÍDICO:
- Derecho constitucional, acciones de tutela y derechos de petición.
- Derecho administrativo, actuaciones de entidades públicas, autos y resoluciones.
- Derecho laboral, seguridad social, pensiones e incapacidades.
- Procesos civiles, ejecutivos, cobro coactivo y recursos procesales.

REGLAS OBLIGATORIAS DE ANÁLISIS:
1. Lee y analiza el contenido real de los documentos e información aportada.
2. Si falta información o un documento requiere OCR, adviértelo expresamente.
3. Diferencia entre hechos probados, afirmaciones de las partes e inferencias.
