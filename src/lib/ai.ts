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
    const geminiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (provider === 'gemini' || (geminiKey && geminiKey.trim() !== '')) {
      return await callGemini(fullPrompt);
    } else if (provider === 'openai') {
      return await callOpenAI(fullPrompt);
    } else {
      return generateLocalAnalysis(prompt, context);
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

  // Se utiliza la versión estable v1 y el modelo alias oficial gemini-1.5-flash
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `Eres un abogado consultor y analista jurídico experto en derecho colombiano. Proporciona resúmenes claros, estructurados y detallados sin inventar leyes ni sentencias.\n\n${prompt}`,
              },
            ],
          },
        ],
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

  if (!res.ok) {
    const errBody = await res.text();
    return { content: '', provider: 'openai', error: `OpenAI Error (${res.status}): ${errBody}` };
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || '';
  return { content, provider: 'openai' };
}

function generateLocalAnalysis(prompt: string, context: string): AIResult {
  const lines: string[] = [];

  lines.push('ANÁLISIS JURÍDICO REGISTRADO');
  lines.push('='.repeat(50));
  lines.push('');
  lines.push(`Fecha de registro: ${new Date().toLocaleString('es-CO')}`);
  lines.push('');

  if (context) {
    lines.push('INFORMACIÓN DEL EXPEDIENTE:');
    lines.push(context);
  }

  return { content: lines.join('\n'), provider: 'local' };
}
