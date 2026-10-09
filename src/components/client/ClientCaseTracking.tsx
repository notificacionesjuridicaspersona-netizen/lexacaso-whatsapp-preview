import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { downloadDocument, formatBytes } from '../../lib/helpers';
import type { Expediente, Documento, Seguimiento, Observacion, AnalisisJuridico } from '../../types';
import Modal from '../ui/Modal';

interface ClientCaseTrackingProps {
  expediente: Expediente | null;
  onClose: () => void;
}

export default function ClientCaseTracking({ expediente, onClose }: ClientCaseTrackingProps) {
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [seguimientos, setSeguimientos] = useState<Seguimiento[]>([]);
  const [observaciones, setObservaciones] = useState<Observacion[]>([]);
  const [analisis, setAnalisis] = useState<AnalisisJuridico[]>([]);
  const [tab, setTab] = useState<'info' | 'documentos' | 'seguimientos' | 'observaciones' | 'analisis'>('info');
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    if (!expediente) return;
    setLoading(true);
    const [docRes, segRes, obsRes, anaRes] = await Promise.all([
      supabase.from('documentos').select('*').eq('expediente_id', expediente.id).eq('visible_cliente', true).order('created_at', { ascending: false }),
      supabase.from('seguimientos').select('*').eq('expediente_id', expediente.id).order('fecha_actuacion', { ascending: false }),
      supabase.from('observaciones').select('*').eq('expediente_id', expediente.id).eq('visible_cliente', true).order('created_at', { ascending: false }),
      supabase.from('analisis_juridicos').select('*').eq('expediente_id', expediente.id).order('creado_en', { ascending: false }),
    ]);
    if (docRes.data) setDocumentos(docRes.data as Documento[]);
    if (segRes.data) setSeguimientos(segRes.data as Seguimiento[]);
    if (obsRes.data) setObservaciones(obsRes.data as Observacion[]);
    if (anaRes.data) setAnalisis(anaRes.data as AnalisisJuridico[]);
    setLoading(false);
  }, [expediente]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDownload = async (doc: Documento) => {
    const result = await downloadDocument(doc);
    if (!result.success) {
      // Error handled silently for client
    }
  };

  return (
    <Modal open={!!expediente} onClose={onClose} title={expediente?.titulo || ''} size="lg">
      {expediente && (
        <div className="case-tracking">
          <div className="detail-tabs">
            <button className={tab === 'info' ? 'active' : ''} onClick={() => setTab('info')}>Información</button>
            <button className={tab === 'documentos' ? 'active' : ''} onClick={() => setTab('documentos')}>Documentos ({documentos.length})</button>
            <button className={tab === 'seguimientos' ? 'active' : ''} onClick={() => setTab('seguimientos')}>Actuaciones ({seguimientos.length})</button>
            <button className={tab === 'observaciones' ? 'active' : ''} onClick={() => setTab('observaciones')}>Observaciones ({observaciones.length})</button>
            <button className={tab === 'analisis' ? 'active' : ''} onClick={() => setTab('analisis')}>Análisis ({analisis.length})</button>
          </div>

          {loading ? (
            <div className="loading-state">Cargando…</div>
          ) : (
            <>
              {tab === 'info' && (
                <div className="info-grid">
                  <div className="info-item">
                    <span className="info-label">Estado</span>
                    <span className="info-value"><span className="badge badge-status" style={{ backgroundColor: '#3b82f6' }}>{expediente.estado}</span></span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Prioridad</span>
                    <span className="info-value">{expediente.prioridad}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Área Jurídica</span>
                    <span className="info-value">{expediente.area_juridica || '—'}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">N° Expediente</span>
                    <span className="info-value">{expediente.numero_expediente || '—'}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">N° Radicado</span>
                    <span className="info-value">{expediente.numero_radicado || '—'}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Fecha de creación</span>
                    <span className="info-value">{new Date(expediente.created_at).toLocaleDateString('es-CO')}</span>
                  </div>
                </div>
              )}

              {tab === 'documentos' && (
                documentos.length === 0 ? (
                  <div className="empty-state"><p>No hay documentos disponibles.</p></div>
                ) : (
                  <div className="documentos-list">
                    {documentos.map((doc) => (
                      <div key={doc.id} className="documento-item">
                        <div className="doc-info">
                          <span className="doc-name">{doc.nombre}</span>
                          <span className="doc-meta">{formatBytes(doc.tamano_bytes)} · {doc.extension?.toUpperCase()} · {new Date(doc.created_at).toLocaleDateString('es-CO')}</span>
                          {doc.mensaje_admin && <span className="doc-message">Mensaje: {doc.mensaje_admin}</span>}
                        </div>
                        <button className="btn btn-secondary btn-sm" onClick={() => handleDownload(doc)}>Descargar</button>
                      </div>
                    ))}
                  </div>
                )
              )}

              {tab === 'seguimientos' && (
                seguimientos.length === 0 ? (
                  <div className="empty-state"><p>No hay actuaciones registradas.</p></div>
                ) : (
                  <div className="timeline">
                    {seguimientos.map((seg) => (
                      <div key={seg.id} className="timeline-item">
                        <div className="timeline-marker"></div>
                        <div className="timeline-content">
                          <div className="timeline-header">
                            <strong>{seg.tipo_actuacion}</strong>
                            <span className="badge badge-status" style={{ backgroundColor: seg.estado === 'Completado' ? '#10b981' : seg.estado === 'En proceso' ? '#f59e0b' : '#6b7280' }}>{seg.estado}</span>
                          </div>
                          <p>{seg.descripcion}</p>
                          <div className="timeline-meta">
                            <span>Fecha: {seg.fecha_actuacion}</span>
                            {seg.fecha_vencimiento && <span>Vencimiento: {seg.fecha_vencimiento}</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}

              {tab === 'observaciones' && (
                observaciones.length === 0 ? (
                  <div className="empty-state"><p>No hay observaciones disponibles.</p></div>
                ) : (
                  <div className="observaciones-list">
                    {observaciones.map((obs) => (
                      <div key={obs.id} className="observacion-item">
                        <p>{obs.contenido}</p>
                        <div className="obs-meta">
                          <span>{new Date(obs.created_at).toLocaleDateString('es-CO')}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}

              {tab === 'analisis' && (
                analisis.length === 0 ? (
                  <div className="empty-state"><p>No hay análisis jurídicos disponibles.</p></div>
                ) : (
                  <div className="analisis-list">
                    {analisis.map((a) => (
                      <div key={a.id} className="analisis-item">
                        <div className="analisis-header">
                          <strong>{a.titulo}</strong>
                          <span className={`badge ${a.tipo === 'ia' ? 'badge-gold' : a.tipo === 'jurisprudencia' ? 'badge-blue' : 'badge-green'}`}>{a.tipo}</span>
                        </div>
                        <p className="analisis-content">{a.contenido}</p>
                        {a.resumen && <p className="analisis-resumen"><strong>Resumen:</strong> {a.resumen}</p>}
                        <div className="analisis-meta">
                          <span>{new Date(a.creado_en).toLocaleDateString('es-CO')}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
