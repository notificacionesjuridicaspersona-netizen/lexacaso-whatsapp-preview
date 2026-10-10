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
    if (provider === 'gemini') {
      return await callGemini(fullPrompt);
    } else if (provider === 'openai') {
      return await callOpenAI(fullPrompt);
    } else {
      // Intento forzado a Gemini si la variable VITE_GEMINI_API_KEY existe en runtime
      const geminiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (geminiKey && geminiKey.trim() !== '') {
        return await callGemini(fullPrompt);
      }
      return generateLocalAnalysis(prompt, context);
    }
  } catch (e) {
    return { content: '', provider: 'local', error: (e as Error).message };
  }
}

async function callGemini(prompt: string): Promise<AIResult> {
  const geminiKey = import.meta.env.VITE_GEMINI_API_KEY;

  if (!geminiKey) {
    throw new Error('VITE_GEMINI_API_KEY no está disponible en las variables de entorno.');
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
              text: 'Eres un asistente jurídico colombiano. Proporciona análisis claros, estructurados y basados en el derecho colombiano. Ofrece resúmenes detallados de los documentos e indica las pretensiones y estrategias correspondientes. No inventes sentencias ni artículos.',
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
    return { content: '', provider: 'gemini', error: `Error en API Gemini (${res.status}): ${errBody}` };
  }

  const data = await res.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No se obtuvo respuesta de Gemini.';
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
        {
          role: 'system',
          content: 'Eres un asistente jurídico colombiano. Proporciona análisis claros, estructurados y basados en el derecho colombiano.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    return { content: '', provider: 'openai', error: `OpenAI error (${res.status}): ${errBody}` };
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
