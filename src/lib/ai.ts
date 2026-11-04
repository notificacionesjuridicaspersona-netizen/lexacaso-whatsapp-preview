import { GEMINI_CONFIG } from './supabase';

export interface GeminiResponse {
  content: string;
  error?: string;
}

interface GeminiModel {
  name?: string;
  baseModelId?: string;
}

interface GeminiModelsResponse {
  models?: GeminiModel[];
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

async function getAvailableModel(): Promise<string | null> {
  const response = await fetch(`${GEMINI_CONFIG.apiBaseUrl}/models?key=${GEMINI_CONFIG.apiKey}`);
  if (!response.ok) return null;

  const data = await response.json() as GeminiModelsResponse;
  const preferredIds = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite'];

  for (const preferredId of preferredIds) {
    const match = (data.models || []).find((model) => (
      model.baseModelId === preferredId || model.name === `models/${preferredId}`
    ));
    if (match?.name) return match.name.replace(/^models\//, '');
  }

  return null;
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

    let model = GEMINI_CONFIG.model;
    let response = await requestInteraction(model, input);

    if (response.status === 404) {
      const availableModel = await getAvailableModel();
      if (availableModel && availableModel !== model) {
        model = availableModel;
        response = await requestInteraction(model, input);
      }
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        content: '',
        error: `Gemini no pudo procesar el análisis (${response.status}). Verifique que la clave tenga acceso a un modelo Gemini vigente. ${JSON.stringify(errorData)}`,
      };
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
