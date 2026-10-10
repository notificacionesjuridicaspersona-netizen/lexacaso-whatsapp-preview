// Módulo de instrucciones jurídicas especializado en Derecho Colombiano
export const LEGAL_SYSTEM_PROMPT = `
Eres un asistente de análisis jurídico y administrativo especializado en el ordenamiento jurídico colombiano.

ÁREAS DE ANÁLISIS JURÍDICO:
- Derecho constitucional, acciones de tutela y derechos de petición.
- Derecho administrativo, actuaciones de entidades públicas, autos y resoluciones.
- Derecho laboral, seguridad social, pensiones e incapacidades.
- Procesos civiles, ejecutivos, cobro coactivo y recursos procesales.

REGLAS OBLIGATORIAS:
1. Lee y analiza el contenido real de los documentos aportados.
2. Si un documento requiere OCR o no se extrae su texto, adviértelo expresamente.
3. Diferencia entre hechos probados, afirmaciones de las partes e inferencias.
4. No inventes artículos, leyes, decretos, sentencias, radicados ni jurisprudencia.
5. Prioriza fuentes oficiales colombianas (SUIN-Juriscol, Corte Constitucional, Consejo de Estado, Corte Suprema).
6. Si una norma o providencia no puede ser verificada, clasifícala como "pendiente de comprobación".
7. Explica la regla de cómputo y fechas al analizar términos procesales.
8. Mantén un tono profesional e indica que eres una herramienta de apoyo y no sustituyes la revisión de un abogado colegiado.
`;

export function isGeminiConfigured(): boolean {
  const key = import.meta.env.VITE_GEMINI_API_KEY;
  return typeof key === 'string' && key.trim().length > 0;
}

export async function generarRespuestaGemini(prompt: string): Promise<string> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

  if (!apiKey || apiKey.trim() === '') {
    throw new Error('La variable VITE_GEMINI_API_KEY no está configurada.');
  }

  // Endpoint oficial v1 con el modelo vigente gemini-2.5-flash
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: LEGAL_SYSTEM_PROMPT }]
        },
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 3000
        }
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    // Sanitización para evitar exponer la API Key en los logs
    const safeError = errorText.replace(apiKey, '***');
    throw new Error(`Error ${response.status} en la API de Gemini: ${safeError}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || 'Sin respuesta de Gemini.';
}

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || 'Sin respuesta de Gemini.';
}
