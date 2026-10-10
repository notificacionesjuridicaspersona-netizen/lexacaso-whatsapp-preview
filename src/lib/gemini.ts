const GEMINI_MODEL = 'gemini-3.5-flash';

export async function generarRespuestaGemini(prompt: string): Promise<string> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('La variable VITE_GEMINI_API_KEY no está configurada.');
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: LEGAL_SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Error ${response.status} en la API de Gemini: ${errorText}`);
  }

  const data = await response.json();
  const candidate = data.candidates?.[0];
  const text = (candidate?.content?.parts ?? [])
    .map((p: { text?: string }) => p.text ?? '')
    .join('')
    .trim();

  if (!text) {
    throw new Error(`Gemini no devolvió texto (finishReason: ${candidate?.finishReason ?? 'desconocido'}).`);
  }
  return text;
}
