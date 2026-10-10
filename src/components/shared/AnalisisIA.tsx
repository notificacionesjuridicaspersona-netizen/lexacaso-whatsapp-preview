import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { extraerTextoDeArchivo } from '../../lib/helpers';

interface DocumentoLocal {
  id: string;
  nombre: string;
  file?: File;
}

interface AnalisisIAProps {
  expedienteId?: string;
  documentos: DocumentoLocal[];
  onGuardarResultado?: (resultado: string) => void;
}

export const AnalisisIA: React.FC<AnalisisIAProps> = ({ expedienteId, documentos, onGuardarResultado }) => {
  const [cargando, setCargando] = useState(false);
  const [herramientaEnProceso, setHerramientaEnProceso] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string>('');

  // Estado para el Modal Manual
  const [modalManualOpen, setModalManualOpen] = useState(false);
  const [tipoManual, setTipoManual] = useState('');
  const [textoManual, setTextoManual] = useState('');
  const [guardandoManual, setGuardandoManual] = useState(false);

  // Abrir Modal Manual
  const abrirModalManual = (tipo: string) => {
    setTipoManual(tipo);
    setTextoManual('');
    setModalManualOpen(true);
  };

  // Guardar Análisis Manual en Supabase
  const guardarAnalisisManual = async () => {
    if (!textoManual.trim()) return;
    setGuardandoManual(true);

    try {
      if (expedienteId) {
        await supabase.from('analisis_expediente').insert({
          expediente_id: expedienteId,
          tipo: tipoManual,
          titulo: tipoManual,
          contenido: textoManual,
          es_manual: true
        });
      }

      const resTexto = `[ANÁLISIS MANUAL REGISTRADO - ${tipoManual.toUpperCase()}]\n\n${textoManual}`;
      setResultado(resTexto);
      if (onGuardarResultado) onGuardarResultado(resTexto);
      setModalManualOpen(false);
    } catch (e) {
      console.error('Error al guardar análisis manual:', e);
    } finally {
      setGuardandoManual(false);
    }
  };

  // Ejecutar Análisis con Gemini API y OCR
  const ejecutarAnalisisIA = async (tipoAnalisis: string) => {
    if (!documentos || documentos.length === 0) {
      setResultado('No hay documentos cargados en el expediente para analizar.');
      return;
    }

    setCargando(true);
    setHerramientaEnProceso(tipoAnalisis);
    setResultado('Procesando extracción OCR y consultando a Google Gemini...');

    try {
      let textoConsolidado = '';

      for (const doc of documentos) {
        if (doc.file) {
          const textoExtraido = await extraerTextoDeArchivo(doc.file);
          if (textoExtraido.trim()) {
            textoConsolidado += `\n--- DOCUMENTO: ${doc.nombre} ---\n${textoExtraido}\n`;
          }
        }
      }

      if (!textoConsolidado.trim()) {
        setResultado('No se pudo extraer texto legible de los documentos.');
        setCargando(false);
        setHerramientaEnProceso(null);
        return;
      }

      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) {
        setResultado('Error: La variable VITE_GEMINI_API_KEY no está configurada.');
        setCargando(false);
        setHerramientaEnProceso(null);
        return;
      }

      const prompt = `Actúa como un abogado consultor y analista jurídico experto.

Analiza la información de los siguientes documentos extraídos de un expediente.

INSTRUCCIONES:
1. SÍNTESIS INICIAL: Resume brevemente el objeto del documento/expediente.
2. ANÁLISIS ESPECÍFICO: Desarrolla a profundidad el requerimiento de: "${tipoAnalisis}".
3. CONCLUSIONES Y RECOMENDACIONES: Ofrece recomendaciones procesales claras.

DOCUMENTOS EXTRAÍDOS:
${textoConsolidado}`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
          })
        }
      );

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message || `Error ${response.status} en la API de Gemini`);
      }

      const respuestaTexto = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Sin respuesta de Gemini.';
      
      setResultado(respuestaTexto);

      if (expedienteId) {
        await supabase.from('analisis_expediente').insert({
          expediente_id: expedienteId,
          tipo: tipoAnalisis,
          titulo: tipoAnalisis,
          contenido: respuestaTexto,
          es_manual: false
        });
      }

      if (onGuardarResultado) onGuardarResultado(respuestaTexto);
    } catch (e) {
      console.error(e);
      setResultado(`Error al ejecutar el análisis: ${(e as Error).message}`);
    } finally {
      setCargando(false);
      setHerramientaEnProceso(null);
    }
  };

  const HERRAMIENTAS = [
    { key: 'tool_analizar_documentos', label: 'Analizar documentos jurídicos' },
    { key: 'tool_resumir_hechos', label: 'Resumir hechos cronológicamente' },
    { key: 'tool_identificar_problemas', label: 'Identificar problemas jurídicos' },
    { key: 'tool_jurisprudencia', label: 'Investigar jurisprudencia' },
    { key: 'tool_normatividad', label: 'Identificar normatividad aplicable' },
    { key: 'tool_alternativas', label: 'Evaluar alternativas de solución' },
    { key: 'tool_terminos_plazos', label: 'Identificar términos y plazos' },
    { key: 'tool_pruebas_faltantes', label: 'Detectar pruebas faltantes' },
    { key: 'tool_estrategias', label: 'Proponer estrategias jurídicas' }
  ];

  return (
    <div className="p-4 bg-white rounded-lg shadow border border-gray-200">
      <h3 className="text-lg font-bold mb-4 text-slate-800">Herramientas de Análisis</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {HERRAMIENTAS.map((h) => (
          <div key={h.key} className="p-3 border rounded-lg bg-slate-50 flex flex-col justify-between">
            <span className="font-semibold text-slate-700 text-sm mb-3">{h.label}</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => ejecutarAnalisisIA(h.label)}
                disabled={cargando}
                className="px-3 py-1.5 bg-slate-800 text-white text-xs rounded hover:bg-slate-900 disabled:opacity-50 font-medium"
              >
                {cargando && herramientaEnProceso === h.label ? 'Procesando...' : 'Ejecutar IA'}
              </button>

              <button
                type="button"
                onClick={() => abrirModalManual(h.label)}
                disabled={cargando}
                className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 text-xs rounded hover:bg-slate-100 disabled:opacity-50 font-medium"
              >
                Manual
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* MODAL MANUAL */}
      {modalManualOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full shadow-xl">
            <h4 className="text-md font-bold mb-2 text-slate-800">Análisis Manual: {tipoManual}</h4>
            <p className="text-xs text-slate-500 mb-4">Escriba o pegue el análisis para registrarlo manualmente en el expediente.</p>

            <textarea
              value={textoManual}
              onChange={(e) => setTextoManual(e.target.value)}
              rows={6}
              className="w-full p-2 border rounded text-sm mb-4 focus:ring-2 focus:ring-blue-500"
              placeholder="Ingrese las observaciones, resumen o hallazgos..."
            />

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalManualOpen(false)}
                className="px-4 py-2 border text-slate-600 rounded text-sm hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={guardarAnalisisManual}
                disabled={guardandoManual || !textoManual.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {guardandoManual ? 'Guardando...' : 'Guardar Análisis'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RESULTADO */}
      {resultado && (
        <div className="mt-4 p-4 bg-slate-50 rounded border text-sm whitespace-pre-wrap leading-relaxed text-slate-800 font-sans">
          {resultado}
        </div>
      )}
    </div>
  );
};

export default AnalisisIA;
