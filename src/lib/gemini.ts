import { GEMINI_CONFIG, getGeminiEndpoint } from './supabase';

export { GEMINI_CONFIG, getGeminiEndpoint };

export async function callGemini(prompt: string) {
  try {
    const endpoint = getGeminiEndpoint();
    if (!GEMINI_CONFIG.apiKey) {
      return { content: '', error: 'API Key de Gemini no configurada.' };
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: GEMINI_CONFIG.generationConfig,
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return { content: '', error: `Gemini Error (${response.status}): ${JSON.stringify(errData)}` };
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return { content: text };
  } catch (error) {
    return { content: '', error: error instanceof Error ? error.message : 'Error al conectar con Gemini.' };
  }
}

export async function runAI(prompt: string): Promise<string> {
  const result = await callGemini(prompt);
  if (result.error) throw new Error(result.error);
  return result.content;
}
