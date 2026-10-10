import React, { useState } from 'react';
import { supabase, STORAGE_BUCKET } from '../../lib/supabase';
import { extraerTextoDeArchivo } from '../../lib/helpers';
import { runAI } from '../../lib/ai';

interface DocumentoLocal {
  id: string;
  nombre: string;
  ruta_storage?: string;
  contenido_texto?: string;
  tipo_mime?: string;
  file?: File;
}

interface AnalisisIAProps {
  expedienteId?: string;
  expedienteDatos?: {
    titulo?: string;
    descripcion?: string;
    area_juridica?: string;
    pretensiones?: string;
    actuaciones_previas?: string;
    observaciones?: string;
  };
  documentos: DocumentoLocal[];
  onGuardarResultado?: (resultado: string) => void;
}

export const AnalisisIA: React.FC<AnalisisIAProps> = ({
  expedienteId,
  expedienteDatos,
  documentos,
  onGuardarResultado,
}) => {
  const [cargando, setCargando] = useState(false);
  const [herramientaEnProceso, setHerramientaEnProceso] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string>('');

  // Modal Manual
  const [modalManualOpen, setModalManualOpen] = useState(false);
  const [tipoManual, setTipoManual] = useState('');
  const [textoManual, setTextoManual] = useState('');
  const [guardandoManual, setGuardandoManual] = useState(false);

  const abrirModalManual = (tipo: string) => {
    setTipoManual(tipo);
    setTextoManual('');
    setModalManualOpen(true);
  };

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
          es_manual: true,
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

  const ejecutarAnalisisIA = async (tipoAnalisis: string) => {
    setCargando(true);
    setHerramientaEnProceso(tipoAnalisis);
    setResultado('Extrayendo contenido de documentos con OCR y conectando con IA...');

    try {
      let textoDocumentos = '';

      for (const doc of documentos) {
        let textoDoc = doc.contenido_texto || '';

        // Si el texto está vacío o contiene la plantilla antigua de aviso, forzar la re-extracción OCR
        if (
          !textoDoc ||
          textoDoc.includes('Pendiente de configurar') ||
          textoDoc.includes('PDF escaneado')
        ) {
          if (doc.file) {
            textoDoc = await extraerTextoDeArchivo(doc.file);
          } else if (doc.ruta_storage) {
            const { data } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(doc.ruta_storage, 60);
            if (data?.signedUrl) {
              const resp = await fetch(data.signedUrl);
              const blob = await resp.blob();
              const file = new File([blob], doc.nombre, { type: doc.tipo_mime || 'application/pdf' });
              textoDoc = await extraerTextoDeArchivo(file);

              // Actualizar en Supabase para no repetir OCR
              if (textoDoc.trim()) {
                await supabase.from('documentos').update({ contenido_texto: textoDoc }).eq('id', doc.id);
              }
            }
          }
        }

        textoDocumentos += `\n--- DOCUMENTO: ${doc.nombre} ---\n${textoDoc.trim() || '(No se pudo extraer texto legible del documento)'}\n`;
      }

      // Preparar contexto completo
      const contexto = `
INFORMACIÓN DEL EXPEDIENTE:
Título: ${expedienteDatos?.titulo || 'N/A'}
Área Jurídica: ${expedienteDatos?.area_juridica || 'N/A'}
Descripción: ${expedienteDatos?.descripcion || 'N/A'}
Pretensiones: ${expedienteDatos?.pretensiones || 'N/A'}
Actuaciones previas: ${expedienteDatos?.actuaciones_previas || 'N/A'}

CONTENIDO DE LOS DOCUMENTOS DEL EXPEDIENTE:
${textoDocumentos}
`;

      const aiResponse = await runAI(tipoAnalisis, contexto);

      if (aiResponse.error) {
        setResultado(`Error al consultar IA: ${aiResponse.error}`);
      } else {
        setResultado(aiResponse.content);

        if (expedienteId) {
          await supabase.from('analisis_expediente').insert({
            expediente_id: expedienteId,
            tipo: tipoAnalisis,
            titulo: tipoAnalisis,
            contenido: aiResponse.content,
            es_manual: false,
          });
        }

        if (onGuardarResultado) onGuardarResultado(aiResponse.content);
      }
    } catch (e) {
      console.error(e);
      setResultado(`Error durante la ejecución del análisis: ${(e as Error).message}`);
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
    { key: 'tool_estrategias', label: 'Proponer estrategias jurídicas' },
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
