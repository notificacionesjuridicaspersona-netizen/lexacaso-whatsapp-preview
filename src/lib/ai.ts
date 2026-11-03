import { GEMINI_CONFIG, getGeminiEndpoint } from './supabase';

export interface GeminiResponse {
  content: string;
  error?: string;
}

interface GeminiModel {
  name?: string;
  baseModelId?: string;
  supportedGenerationMethods?: string[];
}

interface GeminiModelsResponse {
  models?: GeminiModel[];
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

async function getAvailableGenerationModel(): Promise<string | null> {
  const response = await fetch(`${GEMINI_CONFIG.apiBaseUrl}/models?key=${GEMINI_CONFIG.apiKey}`);
  if (!response.ok) return null;

  const data = await response.json() as GeminiModelsResponse;
  const models = (data.models || []).filter((model) => model.supportedGenerationMethods?.includes('generateContent'));
  const preferredIds = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3-flash-preview'];

  for (const preferredId of preferredIds) {
    const match = models.find((model) => model.baseModelId === preferredId || model.name === `models/${preferredId}`);
    if (match?.name) return match.name.replace(/^models\//, '');
  }

  const firstModel = models.find((model) => model.name?.startsWith('models/gemini-'));
  return firstModel?.name?.replace(/^models\//, '') || null;
}

async function requestGemini(model: string, fullPrompt: string): Promise<Response> {
  return fetch(getGeminiEndpoint(model), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: fullPrompt }] }],
      generationConfig: GEMINI_CONFIG.generationConfig,
    }),
  });
}

export async function callGemini(prompt: string, context?: string): Promise<GeminiResponse> {
  try {
    if (!GEMINI_CONFIG.apiKey) {
      return {
        content: '',
        error: 'La clave de API de Gemini no está configurada.',
      };
    }

    const fullPrompt = context
      ? `${SYSTEM_PROMPT}\n\n--- CONTEXTO DEL EXPEDIENTE ---\n${context}\n\n--- CONSULTA ---\n${prompt}`
      : `${SYSTEM_PROMPT}\n\n--- CONSULTA ---\n${prompt}`;

    let model = GEMINI_CONFIG.model;
    let response = await requestGemini(model, fullPrompt);

    if (response.status === 404) {
      const availableModel = await getAvailableGenerationModel();
      if (availableModel && availableModel !== model) {
        model = availableModel;
        response = await requestGemini(model, fullPrompt);
      }
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        content: '',
        error: `Gemini no pudo procesar el análisis (${response.status}). Verifique que la clave tenga un modelo compatible habilitado. ${JSON.stringify(errorData)}`,
      };
    }

    const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!candidateText) {
      return { content: '', error: 'Gemini devolvió una respuesta vacía.' };
    }

    return { content: candidateText };
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
