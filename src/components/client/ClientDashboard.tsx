import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import type { Expediente } from '../../types';

interface ClientDashboardProps {
  onExponerCaso: () => void;
  onViewExpediente: (exp: Expediente) => void;
}

export default function ClientDashboard({ onExponerCaso, onViewExpediente }: ClientDashboardProps) {
  const { profile } = useAuth();
  const [expedientes, setExpedientes] = useState<Expediente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadExpedientes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('expedientes')
        .select('*')
        .eq('user_id', profile?.id)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      setExpedientes(data as Expediente[]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => {
    if (profile?.id) loadExpedientes();
  }, [profile?.id, loadExpedientes]);

  return (
    <div className="client-dashboard">
      <div className="page-header">
        <h1>Mis Expedientes</h1>
        <p>Bienvenido, {profile?.nombre_completo}</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="client-actions">
        <button className="btn btn-primary" onClick={onExponerCaso}>
          Exponer mi caso
        </button>
      </div>

      {loading ? (
        <div className="loading-state">Cargando expedientes…</div>
      ) : expedientes.length === 0 ? (
        <div className="empty-state">
          <p>No tiene expedientes registrados.</p>
          <button className="btn btn-primary" onClick={onExponerCaso}>Exponer mi caso</button>
        </div>
      ) : (
        <div className="expedientes-grid">
          {expedientes.map((exp) => (
            <div key={exp.id} className="expediente-card" onClick={() => onViewExpediente(exp)}>
              <div className="card-header">
                <h3>{exp.titulo}</h3>
                <span className="badge badge-status" style={{ backgroundColor: '#3b82f6' }}>{exp.estado}</span>
              </div>
              {exp.descripcion && <p className="card-desc">{exp.descripcion.substring(0, 120)}{exp.descripcion.length > 120 ? '…' : ''}</p>}
              <div className="card-meta">
                <span>{exp.area_juridica || 'Sin área'}</span>
                <span>{new Date(exp.created_at).toLocaleDateString('es-CO')}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
