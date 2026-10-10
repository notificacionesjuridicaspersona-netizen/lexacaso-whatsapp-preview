// Detector y cliente de Google Gemini API

export function isGeminiConfigured(): boolean {
  const key = import.meta.env.VITE_GEMINI_API_KEY;
  return typeof key === 'string' && key.trim().length > 0;
}

export async function generarRespuestaGemini(prompt: string): Promise<string> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

  if (!apiKey || apiKey.trim() === '') {
    throw new Error('La variable VITE_GEMINI_API_KEY no está configurada.');
  }

  // Se actualiza el endpoint a la versión estable v1 con gemini-2.5-flash
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: 'Eres un abogado consultor y analista jurídico experto en derecho colombiano. Proporciona resúmenes claros, estructurados y detallados de los documentos y del expediente sin inventar leyes ni sentencias.',
            },
          ],
        },
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 2500,
        },
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    // Sanitización para no exponer la clave de API en registros de error
    const safeError = errorText.replace(apiKey, '***');
    throw new Error(`Error ${response.status} en la API de Gemini: ${safeError}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || 'Sin respuesta de Gemini.';
}
