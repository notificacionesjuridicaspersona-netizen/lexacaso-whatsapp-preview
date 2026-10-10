export type AIProvider = 'openai' | 'gemini' | 'local';

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

export interface AIResult {
  content: string;
  provider: AIProvider;
  error?: string;
}

export async function runAI(prompt: string, context: string): Promise<AIResult> {
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
      error: (e as Error).message || 'Error desconocido al procesar la solicitud de IA.' 
    };
  }
}

async function callGemini(prompt: string): Promise<AIResult> {
  const geminiKey = import.meta.env.VITE_GEMINI_API_KEY;

  if (!geminiKey || geminiKey.trim() === '') {
    throw new Error('VITE_GEMINI_API_KEY no está configurada.');
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: LEGAL_SYSTEM_PROMPT }],
        },
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { 
          temperature: 0.2, 
          maxOutputTokens: 3000 
        },
      }),
    }
  );

  if (!res.ok) {
    const errBody = await res.text();
    const safeErr = errBody.replace(geminiKey, '***');
    return { 
      content: '', 
      provider: 'gemini', 
      error: `Gemini API Error (${res.status}): ${safeErr}` 
    };
  }

  const data = await res.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Sin respuesta de Gemini.';
  
  return { content, provider: 'gemini' };
}

async function callOpenAI(prompt: string): Promise<AIResult> {
  const openaiKey = import.meta.env.VITE_OPENAI_API_KEY;

  if (!openaiKey || openaiKey.trim() === '') {
    throw new Error('VITE_OPENAI_API_KEY no está configurada.');
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
      error: `OpenAI Error (${res.status}): ${safeErr}` 
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
  lines
