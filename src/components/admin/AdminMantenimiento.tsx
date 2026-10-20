import { GEMINI_CONFIG, getGeminiEndpoint } from '../../lib/supabase.ts';

export interface GeminiResponse {
  content: string;
  error?: string;
}

// Exportación requerida por AdminMantenimiento.tsx
export function isAIConfigured(): boolean {
  return typeof GEMINI_CONFIG.apiKey === 'string' && GEMINI_CONFIG.apiKey.trim().length > 0;
}

// Exportación requerida por AdminMantenimiento.tsx
export function getAIProvider(): string {
  return 'Google Gemini';
}

// Función base para realizar peticiones a Gemini
export async function callGemini(prompt: string): Promise<GeminiResponse> {
  try {
    const endpoint = getGeminiEndpoint();

    if (!GEMINI_CONFIG.apiKey) {
      return {
        content: '',
        error: 'La clave de API de Gemini (VITE_GEMINI_API_KEY) no está configurada.'
      };
    }

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
                text: prompt,
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

// Exportación requerida por HerramientasJuridicas.tsx y AnalisisIA.tsx
export async function runAI(prompt: string): Promise<string> {
  const result = await callGemini(prompt);
  if (result.error) {
    throw new Error(result.error);
  }
  return result.content;
}
