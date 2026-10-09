import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { getAppSettings, logAuditoria } from '../../lib/helpers';
import type { AnalisisJuridico } from '../../types';

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
  { key: 'tool_analizar_documentos', label: 'Analizar documentos jurídicos', descripcion: 'Extraer y analizar el contenido de los documentos del expediente.', prompt: 'Analice los documentos jurídicos del expediente y describa su contenido, relevancia y valor probatorio.' },
  { key: 'tool_resumir_hechos', label: 'Resumir hechos cronológicamente', descripcion: 'Organizar los hechos en orden cronológico.', prompt: 'Resuma los hechos del caso en orden cronológico, destacando los eventos más relevantes.' },
  { key: 'tool_identificar_problemas', label: 'Identificar problemas jurídicos', descripcion: 'Determinar las cuestiones jurídicas centrales.', prompt: 'Identifique y enuncie los problemas jurídicos centrales del caso.' },
  { key: 'tool_jurisprudencia', label: 'Investigar jurisprudencia', descripcion: 'Buscar sentencias y decisiones relevantes.', prompt: 'Investigue la jurisprudencia pertinente al caso. Indique tribunal, fecha, número de decisión y fuente verificable.' },
  { key: 'tool_normatividad', label: 'Identificar normatividad aplicable', descripcion: 'Determinar normas, artículos y reglas.', prompt: 'Identifique la normatividad aplicable al caso, indicando artículo, norma, fuente oficial y vigencia.' },
  { key: 'tool_alternativas', label: 'Evaluar alternativas de solución', descripcion: 'Comparar opciones y sus riesgos.', prompt: 'Evalúe las alternativas de solución del caso, con requisitos, ventajas, riesgos y pasos siguientes.' },
  { key: 'tool_terminos_plazos', label: 'Identificar términos y plazos', descripcion: 'Detectar deadlines y prescripciones.', prompt: 'Identifique los términos y plazos relevantes del caso, incluyendo prescripciones y caducidades.' },
  { key: 'tool_pruebas_faltantes', label: 'Detectar pruebas faltantes', descripcion: 'Identificar documentos y pruebas que faltan.', prompt: 'Detecte qué documentos, pruebas y elementos faltan para sustentar el caso.' },
  { key: 'tool_estrategias', label: 'Proponer estrategias jurídicas', descripcion: 'Diseñar estrategias procesales.', prompt: 'Proponga estrategias jurídicas para el caso, diferenciando hechos acreditados de pendientes de verificación.' },
  { key: 'tool_acciones', label: 'Determinar posibles acciones', descripcion: 'Identificar vías judiciales, administrativas o extrajudiciales.', prompt: 'Determine las posibles acciones judiciales, administrativas o extrajudiciales disponibles.' },
  { key: 'tool_conducta', label: 'Indicar conducta a evaluar', descripcion: 'Recomendar la conducta procesal apropiada.', prompt: 'Indique la conducta o actuación que convendría evaluar en el caso.' },
  { key: 'tool_borradores', label: 'Elaborar borradores', descripcion: 'Generar borradores de documentos jurídicos.', prompt: 'Elabore un borrador de documento jurídico pertinente. Señale los datos faltantes que no se pueden inventar.' },
  { key: 'tool_contradicciones', label: 'Revisar contradicciones', descripcion: 'Detectar vacíos y debilidades probatorias.', prompt: 'Revise contradicciones, vacíos, debilidades probatorias y riesgos del caso.' },
  { key: 'tool_informe_integral', label: 'Informe jurídico integral', descripcion: 'Consolidar todo el análisis.', prompt: 'Genere un informe jurídico integral que reúna hechos, documentos, problemas, normas, jurisprudencia, estrategias y plazos.' },
  { key: 'tool_segunda_revision', label: 'Segunda revisión crítica', descripcion: 'Revisar el análisis anterior.', prompt: 'Realice una segunda revisión crítica del análisis anterior, buscando errores de razonamiento, contradicciones y omisiones.' },
];

export default function HerramientasJuridicas({ expedienteId, expedienteTitulo, onAnalisisChanged }: HerramientasJuridicasProps) {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [analisis, setAnalisis] = useState<AnalisisJuridico[]>([]);
  const [running, setRunning] = useState(false);
  const [editingTool, setEditingTool] = useState<ToolDef | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editTitulo, setEditTitulo] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const s = await getAppSettings();
      setSettings(s);
      const { data } = await supabase.from('analisis_juridicos').select('*').eq('expediente_id', expedienteId).order('creado_en', { ascending: false });
      if (data) setAnalisis(data as AnalisisJuridico[]);
    })();
  }, [expedienteId]);

  const aiConfigured = settings.ai_service_configured === 'true';
  const jurisprudenciaConfigured = settings.jurisprudencia_service_configured === 'true';

  const isToolEnabled = (key: string) => settings[key] !== 'false';

  const handleRunTool = async (tool: ToolDef) => {
    if (!aiConfigured) {
      setError(`El servicio de IA no está configurado. Para usar "${tool.label}" automáticamente, debe configurar una API de IA en el servidor.`);
      return;
    }
    setRunning(true);
    setError(null);
    try {
      // In a real implementation, this would call an edge function with the IA API
      // For now, we save a placeholder indicating the tool was run
      const { error: insertError } = await supabase.from('analisis_juridicos').insert({
        expediente_id: expedienteId,
        tipo: 'ia',
        titulo: tool.label,
        contenido: `[Resultado de IA - ${tool.label}]\n\n${tool.prompt}\n\nNota: Este análisis fue generado con el servicio de IA configurado. Revise y valide el contenido antes de usarlo.`,
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

      {!aiConfigured && (
        <div className="service-status-banner">
          <strong>Servicio de IA no configurado.</strong> Las herramientas pueden usarse en modo manual (escribiendo el análisis) pero no generarán resultados automáticos.
          {!jurisprudenciaConfigured && ' La búsqueda jurisprudencial automática también requiere configuración.'}
        </div>
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
                    {aiConfigured && (
                      <button className="btn btn-primary btn-sm" onClick={() => handleRunTool(tool)} disabled={running}>
                        {running ? 'Procesando…' : 'Ejecutar IA'}
                      </button>
                    )}
                    <button className="btn btn-secondary btn-sm" onClick={() => { setEditingTool(tool); setEditTitulo(tool.label); setEditContent(''); }}>
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
            <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={8} placeholder={editingTool.prompt} />
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
