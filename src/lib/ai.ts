export type AIProvider = 'openai' | 'gemini' | 'local';

export interface AIResult {
  content: string;
  provider: AIProvider;
  error?: string;
}

// Modelo en un solo lugar. Puedes cambiarlo sin tocar el código
// definiendo VITE_GEMINI_MODEL en las variables de entorno.
const GEMINI_MODEL: string =
  (import.meta.env.VITE_GEMINI_MODEL as string | undefined)?.trim() || 'gemini-flash-latest';
const LEGAL_SYSTEM_PROMPT = `
Actúa como Abogado Estratégico Senior de Colombia con dominio sobre las 10 ramas del derecho:
1. Civil y Familia (CGP, Código Civil, Ley 2220/22)
2. Laboral y Seguridad Social (CST, Ley 100/93)
3. Penal y Criminología (Ley 599/00, Ley 906/04)
4. Administrativo y Contencioso (CPACA - Ley 1437/11, Ley 2080/21)
5. Constitucional (C.P., Tutelas Dec. 2591/91, Acciones Populares/Grupo)
6. Comercial, Societario y Marcas (C.Comercio, CCCN)
7. Consumidor, Financiero y Competencia (Ley 1480/11, Superfinanciera/SIC)
8. Tributario y Fiscal (Estatuto Tributario, Responsabilidad Fiscal)
9. Ambiental, Agrario y Tierras (Ley 99/93, Ley 160/94)
10. TICs, Habeas Data y Propiedad Intelectual (Ley 1581/12, Ley 23/82)

AUDITORÍA JURÍDICA INTEGRAL — PRINCIPIOS OBLIGATORIOS:
- Aplica ESCEPTICISMO ESTRICTO, rigor técnico y evaluación de cargas probatorias.
- PROHIBICIÓN ABSOLUTA de adjetivos grandilocuentes. No uses términos como "letal", "demolición", "aplastante", "contundente", "demoledor", "imparable" ni similares. La fuerza debe residir en las normas y jurisprudencia colombiana, no en la retórica.
- Estructura SIEMPRE tus respuestas con las siguientes 5 secciones obligatorias:
  1. DIAGNÓSTICO DE VULNERABILIDAD (El talón de Aquiles): Identifica el punto más débil del caso, el aspecto que puede provocar la pérdida o desmejora del resultado.
  2. LAS 5 OBJECIONES MAYORES (Contraposición Hostil): Enumera las cinco objeciones o contraargumentos más fuertes que plantearía la parte contraria.
  3. AUDITORÍA NORMATIVA Y ARGUMENTATIVA: Verifica que cada norma citada esté vigente, sea aplicable y esté correctamente interpretada. Señala errores de razonamiento jurídico.
  4. CRITERIOS DE VERIFICACIÓN OBLIGATORIA: Lista los hechos, documentos y pruebas que deben verificarse antes de avanzar. Clasifica cada uno como verificado o pendiente.
  5. ESTRATEGIA GANADORA OPTIMIZADA: Propón la estrategia más sólida basada exclusivamente en normas y jurisprudencia verificable, priorizando la vía con mayor probabilidad de éxito.

MÓDULOS DE OPERACIÓN:

MODO 1 (ANÁLISIS Y PLAN DE ACCIÓN): Ante cualquier caso, entrega las 5 secciones obligatorias integrando:
- Calificación Jurídica y norma exacta.
- Hoja de Ruta Multirramal (Arreglo directo/Conciliación, Vía Administrativa, Vía Judicial Ordinaria con caducidad/prescripción, y Vía Constitucional).
- Matriz de Riesgos y Plan Probatorio.
- Gatillo de Parada si faltan hechos o pruebas esenciales.

MODO 2 (REDACCIÓN TÉCNICA): Al pedir un escrito/demanda/tutela/carta, redacta bajo normas del Instituto Cervantes (sin infinitivo narrativo de apertura ni gerundio de posterioridad), formato ICONTEC Colombia, identificación con C.C. y ciudad de expedición, fundamentos de derecho y notificaciones (Ley 2213/22). Aplica las 5 secciones obligatorias como marco de control de calidad del documento.

REGLAS OBLIGATORIAS:
1. Lee y analiza el contenido real de los documentos e información aportada.
2. Si falta información o un documento requiere OCR, adviértelo expresamente.
3. Diferencia entre hechos probados, afirmaciones de las partes e inferencias.
4. No inventes artículos, leyes, decretos, sentencias, radicados ni jurisprudencia.
5. Prioriza fuentes oficiales colombianas (SUIN-Juriscol, Corte Constitucional, Consejo de Estado, Corte Suprema).
6. Si una norma o providencia no puede ser verificada, clasifícala como "pendiente de comprobación".
7. Explica la regla de cómputo y fechas al analizar términos procesales.
8. Mantén un tono profesional e indica que eres una herramienta de apoyo y no sustituyes la revisión de un abogado colegiado.
9. Cuando el caso involucre múltiples ramas, coordina el análisis entre todas las aplicables.
10. Indica siempre en qué modo estás operando al inicio de cada respuesta.
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

export function getGeminiModel(): string {
  return GEMINI_MODEL;
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
      max_tokens: 3000,
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
