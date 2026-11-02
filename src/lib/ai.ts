import { GEMINI_CONFIG, getGeminiEndpoint } from './supabase';

export interface GeminiResponse {
  content: string;
  error?: string;
}

export function isAIConfigured(): boolean {
  return typeof GEMINI_CONFIG.apiKey === 'string' && GEMINI_CONFIG.apiKey.trim().length > 0;
}

export function getAIProvider(): string {
  return 'Google Gemini';
}

const SYSTEM_PROMPT = `Eres un Abogado Experto Senior en litigios y derecho procesal, con dominio en todas las ramas del derecho (civil, penal, laboral, administrativo, constitucional, comercial, familia, etc.).

Tu análisis no debe limitarse a un simple resumen descriptivo. Debes realizar primero un análisis forense exhaustivo del documento o caso, estructurado así:

1. ANÁLISIS FORENSE DEL DOCUMENTO
   - Identifica vicios de procedimiento, irregularidades formales o sustanciales y defectos que constituyan causales de controversia o nulidad.
   - Detecta debilidades probatorias o argumentativas en la contraparte.
   - Evalúa la competencia, jurisdiction, notificaciones, términos y plazos procesales.

2. IDENTIFICACIÓN DE VÍAS JURÍDICAS
   - Estructura estrategias jurídicas de defensa o ataque procesal altamente técnicas.
   - Fundamenta cada estrategia en normas, jurisprudencia y doctrina aplicable.
   - Diferencia hechos acreditados de hechos pendientes de verificación.

3. PLAN DE ACCIÓN
   - Genera un plan de acción claro y preciso sobre la ruta jurídica a seguir.
   - Indica pasos concretos, documentos a gestionar, términos a cumplir y recursos a interponer.
   - Prioriza las acciones según urgencia procesal.

Responde siempre en español, con rigor técnico jurídico, citando normas y artículos cuando corresponda. Si falta información, indícalo expresamente y no la inventes.`;

export async function callGemini(prompt: string, context?: string): Promise<GeminiResponse> {
  try {
    const endpoint = getGeminiEndpoint();

    if (!GEMINI_CONFIG.apiKey) {
      return {
        content: '',
        error: 'La clave de API de Gemini (VITE_GEMINI_API_KEY) no está configurada.'
      };
    }

    const fullPrompt = context
      ? `${SYSTEM_PROMPT}\n\n--- CONTEXTO DEL EXPEDIENTE ---\n${context}\n\n--- CONSULTA ---\n${prompt}`
      : `${SYSTEM_PROMPT}\n\n--- CONSULTA ---\n${prompt}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: fullPrompt,
              },
            ],
          },
        ],
        generationConfig: GEMINI_CONFIG.generationConfig,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        content: '',
        error: `Gemini API Error (${response.status}): ${JSON.stringify(errorData)}`
      };
    }

    const data = await response.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return {
      content: candidateText,
    };
  } catch (error) {
    return {
      content: '',
      error: error instanceof Error ? error.message : 'Error desconocido al conectar con Gemini.',
    };
  }
}

export async function runAI(prompt: string, context?: string): Promise<string> {
  const result = await callGemini(prompt, context);
  if (result.error) {
    throw new Error(result.error);
  }
  return result.content;
}
