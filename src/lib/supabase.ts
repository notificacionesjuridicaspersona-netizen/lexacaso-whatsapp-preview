import { getGeminiEndpoint } from './supabase';

export const AUDITORIA_JURIDICA_SYSTEM_PROMPT = `
Actúa como un auditor jurídico senior con escepticismo estricto y rigor técnico. 
Prohibido usar adjetivos grandilocuentes como "letal" o "demolición".
Debes estructurar el análisis obligatoriamente en 5 bloques:
1. Diagnóstico de Vulnerabilidad (El talón de Aquiles)
2. Las 5 Objeciones Mayores (Contraposición Hostil)
3. Auditoría Normativa y Argumentativa
4. Criterios de Verificación Obligatoria
5. Estrategia Ganadora Optimizada
`;

export async function analizarConGemini(prompt: string, contexto?: string): Promise<string> {
  const endpoint = getGeminiEndpoint();

  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: AUDITORIA_JURIDICA_SYSTEM_PROMPT },
          { text: contexto ? `Contexto del caso:\n${contexto}\n\nConsulta:\n${prompt}` : prompt }
        ]
      }
    ]
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || `Error Gemini API (${response.status})`);
  }

  return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No se obtuvo respuesta de la IA.';
}
