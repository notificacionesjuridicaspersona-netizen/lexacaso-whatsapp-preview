import React, { useState } from 'react';
import { extraerTextoDeArchivo } from '../../lib/helpers';

interface DocumentoLocal {
  id: string;
  nombre: string;
  file?: File;
}

interface AnalisisIAProps {
  documentos: DocumentoLocal[];
  onGuardarResultado?: (resultado: string) => void;
}

export const AnalisisIA: React.FC<AnalisisIAProps> = ({ documentos, onGuardarResultado }) => {
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState<string>('');

  const ejecutarAnalisis = async (tipoAnalisis: string) => {
    setCargando(true);
    setResultado('Procesando documentos con OCR y analizando con Gemini...');

    try {
      let textoConsolidado = '';

      for (const doc of documentos) {
        if (doc.file) {
          const textoExtraido = await extraerTextoDeArchivo(doc.file);
          textoConsolidado += `\n--- DOCUMENTO: ${doc.nombre} ---\n${textoExtraido}\n`;
        }
      }

      if (!textoConsolidado.trim()) {
        setResultado('No se pudo extraer texto de los documentos adjuntos.');
        setCargando(false);
        return;
      }

      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) {
        setResultado('Error: No se ha configurado VITE_GEMINI_API_KEY en las variables de entorno.');
        setCargando(false);
        return;
      }

      const prompt = `Actúa como un asistente jurídico experto. Realiza un análisis de tipo "${tipoAnalisis}" basándote en el siguiente contenido extraído de los documentos:\n\n${textoConsolidado}`;

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
      const respuestaTexto =
        data.candidates?.[0]?.content?.parts?.[0]?.text || 'No se obtuvo respuesta de Gemini.';

      setResultado(respuestaTexto);
      if (onGuardarResultado) {
        onGuardarResultado(respuestaTexto);
      }
    } catch (error) {
      console.error(error);
      setResultado('Error al procesar el análisis con IA.');
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="p-4 bg-white rounded-lg shadow border border-gray-200">
      <h3 className="text-lg font-bold mb-3 text-slate-800">Herramientas de IA</h3>
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => ejecutarAnalisis('Resumir hechos cronológicamente')}
          disabled={cargando}
          className="px-3 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
        >
          Resumir hechos cronológicamente
        </button>
        <button
          onClick={() => ejecutarAnalisis('Informe jurídico integral')}
          disabled={cargando}
          className="px-3 py-2 bg-emerald-600 text-white text-sm rounded hover:bg-emerald-700 disabled:opacity-50"
        >
          Informe jurídico integral
        </button>
      </div>

      {cargando && <p className="text-sm text-blue-600 font-medium">Procesando OCR e IA...</p>}

      {resultado && (
        <div className="mt-4 p-3 bg-gray-50 rounded border text-sm whitespace-pre-wrap font-mono">
          {resultado}
        </div>
      )}
    </div>
  );
};

export default AnalisisIA;
