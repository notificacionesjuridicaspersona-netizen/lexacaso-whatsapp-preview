// Detector y cliente de Google Gemini API

export function isGeminiConfigured(): boolean {
  const key = import.meta.env.VITE_GEMINI_API_KEY;
  return typeof key === 'string' && key.trim().length > 0;
}

export async function generarRespuestaGemini(prompt: string): Promise<string> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error('La variable VITE_GEMINI_API_KEY no está configurada.');
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Error ${response.status} en la API de Gemini`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || 'Sin respuesta de Gemini.';
}
