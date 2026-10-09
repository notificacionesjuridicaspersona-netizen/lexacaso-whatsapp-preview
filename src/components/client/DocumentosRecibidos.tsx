import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { downloadDocument, formatBytes } from '../../lib/helpers';
import type { Documento, Expediente } from '../../types';

export default function DocumentosRecibidos() {
  const { profile } = useAuth();
  const [documentos, setDocumentos] = useState<(Documento & { expedientes?: Expediente })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterExp, setFilterExp] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [expedientes, setExpedientes] = useState<Expediente[]>([]);

  const loadDocumentos = useCallback(async () => {
    setLoading(true);
    setError(null);
    let query = supabase
      .from('documentos')
      .select('*, expedientes!documentos_expediente_id_fkey(*)')
      .eq('user_id', profile?.id)
      .eq('visible_cliente', true)
      .order('created_at', { ascending: false });

    if (filterExp) query = query.eq('expediente_id', filterExp);
    if (filterEstado === 'Nuevo') query = query.eq('consultado', false);
    if (filterEstado === 'Consultado') query = query.eq('consultado', true);

    const { data, error } = await query;
    if (error) {
      setError(error.message);
    } else {
      setDocumentos(data as (Documento & { expedientes?: Expediente })[]);
    }
    setLoading(false);
  }, [profile?.id, filterExp, filterEstado]);

  useEffect(() => {
    if (profile?.id) {
      supabase.from('expedientes').select('*').eq('user_id', profile.id).order('created_at', { ascending: false })
        .then(({ data }) => { if (data) setExpedientes(data as Expediente[]); });
    }
  }, [profile?.id]);

  useEffect(() => {
    if (profile?.id) loadDocumentos();
  }, [profile?.id, loadDocumentos]);

  const handleDownload = async (doc: Documento) => {
    const result = await downloadDocument(doc);
    if (!result.success) setError(result.error || 'Error al descargar');
  };

  return (
    <div className="documentos-recibidos">
      <div className="page-header">
        <h1>Documentos Recibidos</h1>
        <p>Documentos enviados por el despacho</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="filter-row">
        <select value={filterExp} onChange={(e) => setFilterExp(e.target.value)} className="filter-select">
          <option value="">Todos los expedientes</option>
          {expedientes.map((e) => <option key={e.id} value={e.id}>{e.titulo}</option>)}
        </select>
        <select value={filterEstado} onChange={(e) => setFilterEstado(e.target.value)} className="filter-select">
          <option value="">Todos</option>
          <option value="Nuevo">Nuevos</option>
          <option value="Consultado">Consultados</option>
        </select>
      </div>

      {loading ? (
        <div className="loading-state">Cargando documentos…</div>
      ) : documentos.length === 0 ? (
        <div className="empty-state"><p>No tiene documentos recibidos.</p></div>
      ) : (
        <div className="documentos-list">
          {documentos.map((doc) => (
            <div key={doc.id} className="documento-item">
              <div className="doc-info">
                <span className="doc-name">{doc.nombre}</span>
                <span className="doc-meta">
                  {formatBytes(doc.tamano_bytes)} · {doc.extension?.toUpperCase()} · {new Date(doc.created_at).toLocaleDateString('es-CO')}
                </span>
                {doc.expedientes && <span className="doc-exp">Expediente: {doc.expedientes.titulo}</span>}
                {doc.mensaje_admin && <span className="doc-message">Mensaje: {doc.mensaje_admin}</span>}
                <span className="doc-badges">
                  {doc.consultado ? (
                    <span className="badge badge-blue">Consultado</span>
                  ) : (
                    <span className="badge badge-orange">Nuevo</span>
                  )}
                </span>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => handleDownload(doc)}>Descargar</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
