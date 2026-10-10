export type AIProvider = 'openai' | 'gemini' | 'local';

export interface AIResult {
  content: string;
  provider: AIProvider;
  error?: string;
}

// Modelo en un solo lugar. Puedes cambiarlo sin tocar el código
// definiendo VITE_GEMINI_MODEL en las variables de entorno.
const GEMINI_MODEL: string =
  (import.meta.env.VITE_GEMINI_MODEL as string | undefined)?.trim() || 'gemini-3.5-flash';

const LEGAL_SYSTEM_PROMPT = `
Eres un asistente de análisis jurídico y administrativo especializado en el ordenamiento jurídico colombiano.

ÁREAS DE ANÁLISIS JURÍDICO:
- Derecho constitucional, acciones de tutela y derechos de petición.
- Derecho administrativo, actuaciones de entidades públicas, autos y resoluciones.
- Derecho laboral, seguridad social, pensiones e incapacidades.
- Procesos civiles, ejecutivos, cobro coactivo y recursos procesales.

REGLAS OBLIGATORIAS DE ANÁLISIS:
1. Lee y analiza el contenido real de los documentos e información aportada.
2. Si falta información o un documento requiere OCR, adviértelo expresamente.
3. Diferencia entre hechos probados, afirmaciones de las partes e inferencias.
4. No inventes artículos, leyes, decretos, sentencias, radicados ni jurisprudencia.
5. Prioriza fuentes oficiales colombianas (SUIN-Juriscol, Corte Constitucional, Consejo de Estado, Corte Suprema).
6. Si una norma o providencia no puede ser verificada, clasifícala como "pendiente de comprobación".
7. Explica la regla de cómputo y fechas al analizar términos procesales.
8. Mantén un tono profesional e indica que eres una herramienta de apoyo y no sustituyes la revisión de un abogado colegiado.
`;

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

export async function runAI(prompt: string, context: string = ''): Promise<AIResult> {
  const provider = getAIProvider();

  const fullPrompt = context
    ? `INFORMACIÓN Y DOCUMENTOS DEL EXPEDIENTE:\n${context}\n\nINSTRUCCIÓN DE ANÁLISIS:\n${prompt}`
    : prompt;

  try {
    if (provider === 'gemini') {
      return await callGemini(fullPrompt);
    } else if (provider === 'openai') {
      return await callOpenAI(fullPrompt);
    } else {
      return generateLocalAnalysis(prompt, context);
    }
  } catch (e) {
    return {
      content: '',
      provider: 'local',
      error: (e as Error).message || 'Error al procesar la solicitud.',
    };
  }
}

export async function callGemini(prompt: string): Promise<AIResult> {
  const geminiKey = import.meta.env.VITE_GEMINI_API_KEY;

  if (!geminiKey || geminiKey.trim() === '') {
    throw new Error('VITE_GEMINI_API_KEY no configurada.');
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': geminiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: LEGAL_SYSTEM_PROMPT }],
        },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 8192,
        },
      }),
    }
  );

  if (!res.ok) {
    const errBody = await res.text();
    return {
      content: '',
      provider: 'gemini',
      error: `Gemini API Error (${res.status}): ${errBody}`,
    };
  }

  const data = await res.json();
  const candidate = data.candidates?.[0];
  const content = ((candidate?.content?.parts ?? []) as Array<{ text?: string }>)
    .map((p) => p.text ?? '')
    .join('')
    .trim();

  if (!content) {
    return {
      content: '',
      provider: 'gemini',
      error: `Gemini no devolvió texto (finishReason: ${candidate?.finishReason ?? 'desconocido'}).`,
    };
  }

  return { content, provider: 'gemini' };
}

export async function callOpenAI(prompt: string): Promise<AIResult> {
  const openaiKey = import.meta.env.VITE_OPENAI_API_KEY;

  if (!openaiKey || openaiKey.trim() === '') {
    throw new Error('VITE_OPENAI_API_KEY no configurada.');
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: LEGAL_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 2500,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    const safeErr = errBody.replace(openaiKey, '***');
    return {
      content: '',
      provider: 'openai',
      error: `OpenAI Error (${res.status}): ${safeErr}`,
    };
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || 'Sin respuesta de OpenAI.';

  return { content, provider: 'openai' };
}

function generateLocalAnalysis(prompt: string, context: string): AIResult {
  const lines: string[] = [];

  lines.push('ANÁLISIS JURÍDICO REGISTRADO (MODO LOCAL)');
  lines.push('='.repeat(50));
  lines.push('');
  lines.push(`Fecha: ${new Date().toLocaleString('es-CO')}`);
  lines.push('');

  if (context) {
    lines.push('INFORMACIÓN REGISTRADA EN EL EXPEDIENTE:');
    lines.push(context);
    lines.push('');
  }

  lines.push('INSTRUCCIÓN:');
  lines.push(prompt);
  lines.push('');
  lines.push('Nota: Configura VITE_GEMINI_API_KEY para habilitar la IA en vivo.');

  return { content: lines.join('\n'), provider: 'local' };
}
