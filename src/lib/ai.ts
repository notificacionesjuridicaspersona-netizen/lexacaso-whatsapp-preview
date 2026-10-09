const openaiKey = import.meta.env.VITE_OPENAI_API_KEY;
const geminiKey = import.meta.env.VITE_GEMINI_API_KEY;

export type AIProvider = 'openai' | 'gemini' | null;

export function getAIProvider(): AIProvider {
  if (openaiKey) return 'openai';
  if (geminiKey) return 'gemini';
  return null;
}

export function isAIConfigured(): boolean {
  return getAIProvider() !== null;
}

interface AIResult {
  content: string;
  error?: string;
}

export async function runAI(prompt: string, context: string): Promise<AIResult> {
  const provider = getAIProvider();

  if (!provider) {
    return { content: '', error: 'No hay un servicio de IA configurado.' };
  }

  const fullPrompt = context
    ? `Contexto del expediente:\n${context}\n\nInstrucción:\n${prompt}`
    : prompt;

  try {
    if (provider === 'openai') {
      return await callOpenAI(fullPrompt);
    } else {
      return await callGemini(fullPrompt);
    }
  } catch (e) {
    return { content: '', error: (e as Error).message };
  }
}

async function callOpenAI(prompt: string): Promise<AIResult> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'Eres un asistente jurídico colombiano. Proporciona análisis claros, estructurados y basados en el derecho colombiano. No inventes sentencias, artículos ni citas. Si no conoces un dato, indícalo como pendiente de verificar.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    return { content: '', error: `OpenAI error (${res.status}): ${errBody}` };
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || '';
  return { content };
}

async function callGemini(prompt: string): Promise<AIResult> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: 'Eres un asistente jurídico colombiano. Proporciona análisis claros, estructurados y basados en el derecho colombiano. No inventes sentencias, artículos ni citas. Si no conoces un dato, indícalo como pendiente de verificar.',
            },
          ],
        },
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 2000 },
      }),
    }
  );

  if (!res.ok) {
    const errBody = await res.text();
    return { content: '', error: `Gemini error (${res.status}): ${errBody}` };
  }

  const data = await res.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return { content };
}
