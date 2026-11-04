import { GEMINI_CONFIG } from './supabase';

export interface GeminiResponse {
  content: string;
  error?: string;
}

interface GeminiInteractionResponse {
  output_text?: string;
  steps?: Array<{
    content?: Array<{ type?: string; text?: string }>;
  }>;
}

export function isAIConfigured(): boolean {
  return typeof GEMINI_CONFIG.apiKey === 'string' && GEMINI_CONFIG.apiKey.trim().length > 0;
}

export function getAIProvider(): string {
  return 'Google Gemini';
}

const SYSTEM_PROMPT = `Actúa estrictamente como Abogado Litigante Senior, Experto Forense y Auditor Jurídico. Analiza únicamente el documento que aparece como DOCUMENTO SELECCIONADO y no mezcles información de otros archivos.

No entregues un resumen descriptivo. Responde siempre en español y en Markdown enriquecido, usando obligatoriamente esta estructura exacta:

## 1. Naturaleza y Objeto del Documento
Identifica su tipología, autoría aparente, finalidad procesal, etapa del trámite y alcance jurídico.

## 2. Hallazgos Forenses y Vicios Detectados
Examina irregularidades formales o sustanciales, vicios de procedimiento, defectos de notificación, competencia, términos, autenticidad, integridad y causales posibles de controversia o nulidad. Si no puedes verificar algo, indícalo expresamente.

## 3. Análisis de Debilidades y Riesgos
Expón cargas probatorias, contradicciones lógicas o temporales, vacíos, inconsistencias, riesgos procesales y argumentos previsibles de la contraparte.

## 4. Estrategia Jurídica de Ataque o Defensa
Formula una línea argumentativa técnica con fundamentos procesales, normas y jurisprudencia solo cuando sean verificables. Diferencia hechos acreditados, inferencias y asuntos pendientes de prueba.

## 5. Plan de Acción Inmediato
Indica una ruta jurídica precisa, paso a paso, con documentos necesarios, actuaciones, términos que deben verificarse, prioridades y contingencias.

No inventes hechos, normas, sentencias, fechas ni fuentes. Cuando falte información, escribe “pendiente de verificación”.`;

function getInteractionsEndpoint(): string {
  return `${GEMINI_CONFIG.apiBaseUrl}/interactions`;
}

async function requestInteraction(model: string, input: string): Promise<Response> {
  return fetch(getInteractionsEndpoint(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': GEMINI_CONFIG.apiKey,
    },
    body: JSON.stringify({
      model,
      system_instruction: SYSTEM_PROMPT,
      input,
      generation_config: {
        temperature: GEMINI_CONFIG.generationConfig.temperature,
        max_output_tokens: GEMINI_CONFIG.generationConfig.maxOutputTokens,
      },
    }),
  });
}

function getInteractionText(data: GeminiInteractionResponse): string {
  if (data.output_text?.trim()) return data.output_text.trim();

  return (data.steps || [])
    .flatMap((step) => step.content || [])
    .filter((content) => content.type === 'text' && content.text)
    .map((content) => content.text as string)
    .join('\n')
    .trim();
}

export async function callGemini(prompt: string, context?: string): Promise<GeminiResponse> {
  try {
    if (!GEMINI_CONFIG.apiKey) {
      return {
        content: '',
        error: 'La clave de API de Gemini no está configurada.',
      };
    }

    const input = context
      ? `--- CONTEXTO DEL EXPEDIENTE ---\n${context}\n\n--- CONSULTA ---\n${prompt}`
      : prompt;

    const modelsToTry = [GEMINI_CONFIG.model, 'gemini-3.6-flash', 'gemini-3.5-flash-lite'];
    let response: Response | null = null;

    for (const model of modelsToTry) {
      response = await requestInteraction(model, input);
      if (response.ok) break;
    }

    if (!response?.ok) {
      if (response?.status === 503) {
        return { content: '', error: 'El servicio de Gemini está temporalmente saturado. Espere unos segundos y vuelva a intentarlo.' };
      }
      return { content: '', error: 'Gemini no pudo procesar el análisis. Intente nuevamente o revise el acceso de la clave al servicio.' };
    }

    const data = await response.json() as GeminiInteractionResponse;
    const content = getInteractionText(data);
    if (!content) return { content: '', error: 'Gemini devolvió una respuesta vacía.' };

    return { content };
  } catch (error) {
    return {
      content: '',
      error: error instanceof Error ? error.message : 'Error desconocido al conectar con Gemini.',
    };
  }
}

export async function runAI(prompt: string, context?: string): Promise<string> {
  const result = await callGemini(prompt, context);
  if (result.error) throw new Error(result.error);
  return result.content;
}
