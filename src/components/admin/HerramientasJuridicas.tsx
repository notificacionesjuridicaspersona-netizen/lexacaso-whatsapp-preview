import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { getAppSettings, logAuditoria } from '../../lib/helpers';
import { runAI } from '../../lib/ai';
import { extractSingleDocument, getExpedienteDocumentos, buildContextWithDocuments } from '../../lib/document-extract';
import type { AnalisisJuridico, Documento } from '../../types';

interface HerramientasJuridicasProps {
  expedienteId: string;
  expedienteTitulo: string;
  onAnalisisChanged: () => void;
}

interface ToolDef {
  key: string;
  label: string;
  descripcion: string;
  prompt: string;
}

const TOOLS: ToolDef[] = [
  { key: 'tool_analizar_documentos', label: 'Análisis forense de documentos', descripcion: 'Análisis forense exhaustivo: vicios, irregularidades, valor probatorio y debilidades.', prompt: 'Realice un análisis forense exhaustivo de cada documento del expediente. Para cada uno: (1) Identifique vicios de procedimiento, irregularidades formales o sustanciales y defectos que constituyan causales de controversia o nulidad. (2) Evalúe el valor probatorio, autenticidad y pertinencia. (3) Detecte debilidades probatorias o argumentativas utilizables contra la contraparte. (4) Indique si el documento cumple con los requisitos legales de forma y fondo.' },
  { key: 'tool_resumir_hechos', label: 'Cronología y reconstrucción fáctica', descripcion: 'Reconstrucción cronológica con análisis de cada hecho.', prompt: 'Reconstruya cronológicamente los hechos del caso. Para cada hecho, indique: fecha, fuente probatoria, nivel de acreditación (demostrado/presumido/por demostrar) y su relevancia procesal. Identifique vacíos en la cadena fáctica.' },
  { key: 'tool_identificar_problemas', label: 'Identificar problemas jurídicos centrales', descripcion: 'Cuestiones jurídicas centrales y controversias.', prompt: 'Identifique y enuncie los problemas jurídicos centrales del caso. Para cada problema: (1) Plantee la controversia jurídica. (2) Indique las posiciones posibles de la contraparte. (3) Cite las normas y principios en conflicto. (4) Evalúe la solidez de cada posición.' },
  { key: 'tool_jurisprudencia', label: 'Investigar jurisprudencia aplicable', descripcion: 'Sentencias y líneas jurisprudenciales relevantes.', prompt: 'Investigue la jurisprudencia pertinente al caso. Indique tribunal, fecha, número de decisión, ratio decidendi y cómo se aplica al caso concreto. Diferencie jurisprudencia vinculante de persuasiva.' },
  { key: 'tool_normatividad', label: 'Normatividad aplicable', descripcion: 'Normas, artículos y reglas vigentes.', prompt: 'Identifique toda la normatividad aplicable al caso. Para cada norma: artículo, número, fuente oficial, vigencia y cómo se aplica a los hechos. Incluya normas sustanciales y procesales.' },
  { key: 'tool_alternativas', label: 'Evaluar alternativas de solución', descripcion: 'Comparar opciones procesales y sus riesgos.', prompt: 'Evalúe las alternativas de solución del caso. Para cada alternativa: requisitos, ventajas, riesgos, probabilidad de éxito, costos y plazos. Recomiende la mejor opción fundamentadamente.' },
  { key: 'tool_terminos_plazos', label: 'Términos, plazos y prescripciones', descripcion: 'Deadlines, caducidades y prescripciones.', prompt: 'Identifique todos los términos y plazos relevantes del caso: prescripciones, caducidades, términos procesales para recursos, pruebas y audiencias. Indique si alguno está próximo a vencer y la consecuencia de su omisión.' },
  { key: 'tool_pruebas_faltantes', label: 'Detectar pruebas faltantes', descripcion: 'Documentos y pruebas necesarias.', prompt: 'Detecte qué documentos, pruebas y elementos faltan para sustentar el caso. Clasifíquelos por prioridad (urgente/importante/conveniente) e indique cómo obtenerlos.' },
  { key: 'tool_estrategias', label: 'Estrategias jurídicas de defensa/ataque', descripcion: 'Estrategias procesales altamente técnicas.', prompt: 'Estructure estrategias jurídicas de defensa o ataque procesal altamente técnicas. Diferencie hechos acreditados de pendientes de verificación. Para cada estrategia: fundamento normativo, jurisprudencial, pasos de ejecución y riesgos.' },
  { key: 'tool_acciones', label: 'Determinar posibles acciones', descripcion: 'Vías judiciales, administrativas o extrajudiciales.', prompt: 'Determine las posibles acciones judiciales, administrativas o extrajudiciales disponibles. Para cada acción: requisitos de procedibilidad, competencia, término y probabilidad de éxito.' },
  { key: 'tool_conducta', label: 'Conducta procesal recomendada', descripcion: 'Recomendar la conducta procesal apropiada.', prompt: 'Indique la conducta o actuación procesal que convendría evaluar en el caso. Fundamente la recomendación en el análisis forense previo.' },
  { key: 'tool_borradores', label: 'Elaborar borradores jurídicos', descripcion: 'Borradores de escritos y recursos.', prompt: 'Elabore un borrador de documento jurídico pertinente al caso (demanda, recurso, contestación, etc.). Señale expresamente los datos faltantes que no se pueden inventar. Estructúrelo con encabezado, hechos, fundamentos de derecho, pretensiones y solicitudes.' },
  { key: 'tool_contradicciones', label: 'Revisar contradicciones y debilidades', descripcion: 'Vacios, contradicciones y debilidades probatorias.', prompt: 'Revise contradicciones, vacíos y debilidades probatorias del caso. Identifique: (1) contradicciones internas en los hechos o pruebas. (2) debilidades argumentativas explotables por la contraparte. (3) riesgos procesales. (4) recomendaciones para neutralizar cada debilidad.' },
  { key: 'tool_informe_integral', label: 'Informe jurídico integral forense', descripcion: 'Consolidación completa del análisis forense.', prompt: 'Genere un informe jurídico integral forense que reúna: análisis de documentos, cronología, problemas jurídicos, normatividad, jurisprudencia, estrategias de defensa/ataque, términos y plazos, y un plan de acción claro y preciso sobre la ruta jurídica a seguir.' },
  { key: 'tool_segunda_revision', label: 'Segunda revisión crítica', descripcion: 'Revisión crítica del análisis anterior.', prompt: 'Realice una segunda revisión crítica del análisis anterior, buscando errores de razonamiento, contradicciones, omisiones y puntos débiles. Proponga correcciones y refuerzos argumentales.' },
];

export default function HerramientasJuridicas({ expedienteId, expedienteTitulo, onAnalisisChanged }: HerramientasJuridicasProps) {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [analisis, setAnalisis] = useState<AnalisisJuridico[]>([]);
  const [running, setRunning] = useState(false);
  const [editingTool, setEditingTool] = useState<ToolDef | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editTitulo, setEditTitulo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [docContext, setDocContext] = useState<string>('');
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState('');

  useEffect(() => {
    (async () => {
      const [s, docs, analysisResult] = await Promise.all([
        getAppSettings(),
        getExpedienteDocumentos(expedienteId),
        supabase.from('analisis_juridicos').select('*').eq('expediente_id', expedienteId).order('creado_en', { ascending: false }),
      ]);
      setSettings(s);
      setDocumentos(docs);
      setSelectedDocumentId(docs[0]?.id || '');
      if (analysisResult.data) setAnalisis(analysisResult.data as AnalisisJuridico[]);
    })();
  }, [expedienteId]);

  const aiConfigured = true;
  const jurisprudenciaConfigured = true;

  const isToolEnabled = (key: string) => settings[key] !== 'false';

  const loadDocumentContext = async (): Promise<string> => {
    if (!selectedDocumentId) {
      throw new Error('Seleccione el documento a analizar.');
    }

    setLoadingDocs(true);
    try {
      const { data: exp, error: expError } = await supabase
        .from('expedientes')
        .select('titulo, descripcion, area_juridica, estado, pretensiones, actuaciones_previas, observaciones_adicionales')
        .eq('id', expedienteId)
        .maybeSingle();
      if (expError) throw new Error('No se pudo cargar el expediente.');

      const selectedDocument = documentos.find((documento) => documento.id === selectedDocumentId);
      if (!selectedDocument) throw new Error('El documento seleccionado ya no está disponible.');

      const extracted = await extractSingleDocument(selectedDocument);
      const documentText = `--- Documento seleccionado: ${extracted.nombre} ---\n${extracted.contenido}`;
      const context = buildContextWithDocuments(exp, documentText);
      setDocContext(context);
      return context;
    } finally {
      setLoadingDocs(false);
    }
  };

  const handleRunTool = async (tool: ToolDef) => {
    if (!selectedDocumentId) {
      setError('Seleccione el documento a analizar antes de ejecutar una herramienta.');
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const context = await loadDocumentContext();

      const content = await runAI(tool.prompt, context);

      const { error: insertError } = await supabase.from('analisis_juridicos').insert({
        expediente_id: expedienteId,
        tipo: 'ia',
        titulo: tool.label,
        contenido: content,
      });
      if (insertError) throw new Error(insertError.message);
      await logAuditoria('ejecutar_herramienta_ia', `Herramienta: ${tool.label} en expediente: ${expedienteTitulo}`, 'analisis', null);
      const { data } = await supabase.from('analisis_juridicos').select('*').eq('expediente_id', expedienteId).order('creado_en', { ascending: false });
      if (data) setAnalisis(data as AnalisisJuridico[]);
      onAnalisisChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  const handleOpenManual = async (tool: ToolDef) => {
    if (!selectedDocumentId) {
      setError('Seleccione el documento a analizar antes de abrir el análisis manual.');
      return;
    }
    setEditingTool(tool);
    setEditTitulo(tool.label);
    setError(null);
    setLoadingDocs(true);
    try {
      const context = await loadDocumentContext();
      const docSummary = context
        ? `\n\n--- CONTENIDO EXTRAÍDO DE LOS DOCUMENTOS DEL EXPEDIENTE ---\n${context}\n\n--- FIN DEL CONTENIDO DE DOCUMENTOS ---\n\nEscriba aquí su análisis basado en el contenido de los documentos y los datos del expediente:\n`
        : '';
      setEditContent(docSummary);
    } catch {
      setEditContent('');
    } finally {
      setLoadingDocs(false);
    }
  };

  const handleSaveManual = async () => {
    if (!editingTool || !editContent.trim()) return;
    const { error: insertError } = await supabase.from('analisis_juridicos').insert({
      expediente_id: expedienteId,
      tipo: 'estructurado',
      titulo: editTitulo || editingTool.label,
      contenido: editContent,
    });
    if (insertError) {
      setError(insertError.message);
      return;
    }
    await logAuditoria('crear_analisis_manual', `Análisis: ${editTitulo || editingTool.label}`, 'analisis', null);
    setEditingTool(null);
    setEditContent('');
    setEditTitulo('');
    const { data } = await supabase.from('analisis_juridicos').select('*').eq('expediente_id', expedienteId).order('creado_en', { ascending: false });
    if (data) setAnalisis(data as AnalisisJuridico[]);
    onAnalisisChanged();
  };

  const handleDelete = async (id: string) => {
    const { error: delError } = await supabase.from('analisis_juridicos').delete().eq('id', id);
    if (delError) { setError(delError.message); return; }
    setAnalisis(analisis.filter((a) => a.id !== id));
    onAnalisisChanged();
  };

  return (
    <div className="herramientas-juridicas">
      {error && <div className="alert alert-error">{error}<button className="alert-close" onClick={() => setError(null)}>×</button></div>}

      <div className="form-group document-selector">
        <label htmlFor="documento-ia">Seleccione el documento a analizar</label>
        <select
          id="documento-ia"
          value={selectedDocumentId}
          onChange={(event) => setSelectedDocumentId(event.target.value)}
          disabled={running || loadingDocs || documentos.length === 0}
        >
          <option value="">Seleccione el documento a analizar</option>
          {documentos.map((documento) => (
            <option key={documento.id} value={documento.id}>{documento.nombre}</option>
          ))}
        </select>
        {documentos.length === 0 && <span className="form-hint">Este expediente no tiene documentos disponibles.</span>}
      </div>

      {loadingDocs && (
        <div className="alert alert-info">Leyendo el documento seleccionado…</div>
      )}

      <div className="tools-grid">
        {TOOLS.map((tool) => {
          const enabled = isToolEnabled(tool.key);
          const needsJurisprudencia = tool.key === 'tool_jurisprudencia';
          const blockedByJurisprudencia = needsJurisprudencia && !jurisprudenciaConfigured;
          return (
            <div key={tool.key} className={`tool-card ${!enabled ? 'tool-disabled' : ''}`}>
              <div className="tool-info">
                <strong>{tool.label}</strong>
                <span className="tool-desc">{tool.descripcion}</span>
              </div>
              <div className="tool-actions">
                {!enabled ? (
                  <span className="badge badge-gray">Deshabilitada</span>
                ) : blockedByJurisprudencia ? (
                  <span className="badge badge-orange">Requiere configuración</span>
                ) : (
                  <>
                    <button className="btn btn-primary btn-sm" onClick={() => handleRunTool(tool)} disabled={running}>
                      {running ? 'Procesando…' : 'Ejecutar IA'}
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => handleOpenManual(tool)}>
                      Manual
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {editingTool && (
        <div className="manual-editor">
          <h4>Análisis manual: {editingTool.label}</h4>
          <div className="form-group">
            <label>Título</label>
            <input value={editTitulo} onChange={(e) => setEditTitulo(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Contenido del análisis</label>
            <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={12} placeholder={editingTool.prompt} />
          </div>
          <div className="form-actions">
            <button className="btn btn-primary btn-sm" onClick={handleSaveManual}>Guardar análisis</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setEditingTool(null)}>Cancelar</button>
          </div>
        </div>
      )}

      {analisis.length > 0 && (
        <div className="analisis-results">
          <h4>Análisis guardados ({analisis.length})</h4>
          <div className="analisis-list">
            {analisis.map((a) => (
              <div key={a.id} className="analisis-item">
                <div className="analisis-header">
                  <strong>{a.titulo}</strong>
                  <span className={`badge ${a.tipo === 'ia' ? 'badge-gold' : a.tipo === 'jurisprudencia' ? 'badge-blue' : 'badge-green'}`}>{a.tipo}</span>
                </div>
                <p className="analisis-content">{a.contenido}</p>
                <div className="analisis-meta">
                  <span>{new Date(a.creado_en).toLocaleDateString('es-CO')}</span>
                  <button className="btn-icon btn-danger" onClick={() => handleDelete(a.id)}>Eliminar</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}