import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { logAuditoria } from '../../lib/helpers';
import type { Comentario } from '../../types';

interface ComentariosProps {
  expedienteId: string;
  isAdmin: boolean;
}

export default function Comentarios({ expedienteId, isAdmin }: ComentariosProps) {
  const { profile } = useAuth();
  const [comentarios, setComentarios] = useState<Comentario[]>([]);
  const [newComentario, setNewComentario] = useState('');
  const [visibilidad, setVisibilidad] = useState<'cliente' | 'interno'>(isAdmin ? 'interno' : 'cliente');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadComentarios = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('comentarios')
      .select('*, autor:profiles!comentarios_autor_id_fkey(*)')
      .eq('expediente_id', expedienteId)
      .order('created_at', { ascending: true });
    if (error) {
      setError(error.message);
    } else {
      setComentarios(data as Comentario[]);
    }
    setLoading(false);
  }, [expedienteId]);

  useEffect(() => {
    loadComentarios();
  }, [loadComentarios]);

  const handleAdd = async () => {
    if (!newComentario.trim() || !profile?.id) return;
    setError(null);

    if (!isAdmin && visibilidad === 'interno') {
      setError('Los clientes no pueden crear notas internas');
      return;
    }

    const { error: insertError } = await supabase.from('comentarios').insert({
      expediente_id: expedienteId,
      autor_id: profile.id,
      contenido: newComentario,
      visibilidad,
    });

    if (insertError) {
      setError(insertError.message);
      return;
    }

    await logAuditoria('crear_comentario', `Comentario en expediente`, 'comentario', null);
    setNewComentario('');
    loadComentarios();
  };

  const handleDelete = async (id: string) => {
    const { error: delError } = await supabase.from('comentarios').delete().eq('id', id);
    if (delError) {
      setError(delError.message);
      return;
    }
    setComentarios(comentarios.filter((c) => c.id !== id));
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="comentarios-section">
      {error && <div className="alert alert-error">{error}</div>}

      <div className="comentarios-form">
        <textarea
          value={newComentario}
          onChange={(e) => setNewComentario(e.target.value)}
          rows={3}
          placeholder={isAdmin ? 'Escriba un comentario, solicitud o instrucción…' : 'Escriba una respuesta o aclaración…'}
        />
        {isAdmin && (
          <div className="comentarios-options">
            <label className="radio-inline">
              <input type="radio" checked={visibilidad === 'cliente'} onChange={() => setVisibilidad('cliente')} />
              Visible al cliente
            </label>
            <label className="radio-inline">
              <input type="radio" checked={visibilidad === 'interno'} onChange={() => setVisibilidad('interno')} />
              Nota interna (solo admin)
            </label>
          </div>
        )}
        <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={!newComentario.trim()}>
          {isAdmin ? 'Enviar comentario' : 'Responder'}
        </button>
      </div>

      {loading ? (
        <div className="loading-state">Cargando comentarios…</div>
      ) : comentarios.length === 0 ? (
        <div className="empty-state"><p>No hay comentarios.</p></div>
      ) : (
        <div className="comentarios-list">
          {comentarios.map((c) => {
            const isOwn = c.autor_id === profile?.id;
            const showVisibilidad = isAdmin || c.visibilidad !== 'interno';
            if (!showVisibilidad) return null;
            return (
              <div key={c.id} className={`comentario-item ${c.visibilidad === 'interno' ? 'comentario-interno' : 'comentario-cliente'} ${isOwn ? 'comentario-own' : ''}`}>
                <div className="comentario-header">
                  <strong>{c.autor?.nombre_completo || (c.visibilidad === 'sistema' ? 'Sistema' : 'Usuario')}</strong>
                  <span className="comentario-date">{formatDate(c.created_at)}</span>
                  {isAdmin && c.visibilidad === 'interno' && <span className="badge badge-gray">Interno</span>}
                  {c.visibilidad === 'sistema' && <span className="badge badge-blue">Sistema</span>}
                </div>
                <p className="comentario-content">{c.contenido}</p>
                {(isAdmin || (isOwn && c.visibilidad === 'cliente')) && (
                  <button className="btn-icon btn-danger comentario-delete" onClick={() => handleDelete(c.id)}>Eliminar</button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
