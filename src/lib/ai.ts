export type AIProvider = 'openai' | 'gemini' | 'local';

export function getAIProvider(): AIProvider {
  const geminiKey = import.meta.env.VITE_GEMINI_API_KEY;
  const openaiKey = import.meta.env.VITE_OPENAI_API_KEY;

  if (geminiKey && geminiKey.trim() !== '') return 'gemini';
  if (openaiKey && openaiKey.trim() !== '') return 'openai';
  return 'local';
}

export function isAIConfigured(): boolean {
  const provider = getAIProvider();
  return provider === 'gemini' || provider === 'openai';
}

interface AIResult {
  content: string;
  provider: AIProvider;
  error?: string;
}

export async function runAI(prompt: string, context: string): Promise<AIResult> {
  const provider = getAIProvider();

  const fullPrompt = context
    ? `Contexto del expediente e información de documentos:\n${context}\n\nInstrucción de análisis:\n${prompt}`
    : prompt;

  try {
    if (provider === 'gemini' || import.meta.env.VITE_GEMINI_API_KEY) {
      return await callGemini(fullPrompt);
    } else if (provider === 'openai') {
      return await callOpenAI(fullPrompt);
    } else {
      return { content: 'No se configuró una API Key válida para Gemini u OpenAI.', provider: 'local' };
    }
  } catch (e) {
    return { content: '', provider: 'local', error: (e as Error).message };
  }
}

async function callGemini(prompt: string): Promise<AIResult> {
  const geminiKey = import.meta.env.VITE_GEMINI_API_KEY;

  if (!geminiKey) {
    throw new Error('VITE_GEMINI_API_KEY no configurada.');
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: 'Eres un abogado consultor y analista jurídico experto en derecho colombiano. Realiza análisis profundos sobre los documentos e información del expediente proporcionado. Ofrece resúmenes cronológicos, alternativas procesales y recomendaciones claras sin inventar citas ni normas.',
            },
          ],
        },
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 2500 },
      }),
    }
  );

  if (!res.ok) {
    const errBody = await res.text();
    return { content: '', provider: 'gemini', error: `Gemini API Error (${res.status}): ${errBody}` };
  }

  const data = await res.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Sin respuesta de Gemini.';
  return { content, provider: 'gemini' };
}

async function callOpenAI(prompt: string): Promise<AIResult> {
  const openaiKey = import.meta.env.VITE_OPENAI_API_KEY;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Eres un asistente jurídico colombiano.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    }),
  });

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || '';
  return { content, provider: 'openai' };
}

  return { content: lines.join('\n'), provider: 'local' };
}
