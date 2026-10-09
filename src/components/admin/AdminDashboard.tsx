import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import type { Expediente, Profile } from '../../types';

interface AdminDashboardProps {
  onNavigate: (tab: string) => void;
}

export default function AdminDashboard({ onNavigate }: AdminDashboardProps) {
  const [stats, setStats] = useState({
    totalExpedientes: 0,
    expedientesActivos: 0,
    totalClientes: 0,
    totalDocumentos: 0,
    pendientes: 0,
  });
  const [recentExpedientes, setRecentExpedientes] = useState<(Expediente & { profiles?: Profile })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [expRes, clientRes, docRes, recentRes] = await Promise.all([
        supabase.from('expedientes').select('*', { count: 'exact', head: false }),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('rol', 'cliente'),
        supabase.from('documentos').select('*', { count: 'exact', head: true }),
        supabase.from('expedientes').select('*, profiles!expedientes_user_id_profiles_fkey(*)').order('created_at', { ascending: false }).limit(5),
      ]);

      if (expRes.error) throw new Error(expRes.error.message);

      const allExp = expRes.data || [];
      const activos = allExp.filter((e) => !['Finalizado', 'Archivado'].includes(e.estado));
      const pendientes = allExp.filter((e) => ['Recibido', 'Pendiente documentacion'].includes(e.estado));

      setStats({
        totalExpedientes: allExp.length,
        expedientesActivos: activos.length,
        totalClientes: clientRes.count || 0,
        totalDocumentos: docRes.count || 0,
        pendientes: pendientes.length,
      });

      setRecentExpedientes((recentRes.data || []) as (Expediente & { profiles?: Profile })[]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  return (
    <div className="dashboard">
      <div className="page-header">
        <h1>Panel de Administración</h1>
        <p>Resumen general del despacho</p>
      </div>

      {error && <div className="alert alert-error">Error al cargar: {error}</div>}

      {loading ? (
        <div className="loading-state">Cargando estadísticas…</div>
      ) : (
        <>
          <div className="stats-grid">
            <div className="stat-card stat-blue">
              <div className="stat-value">{stats.totalExpedientes}</div>
              <div className="stat-label">Expedientes totales</div>
            </div>
            <div className="stat-card stat-green">
              <div className="stat-value">{stats.expedientesActivos}</div>
              <div className="stat-label">Expedientes activos</div>
            </div>
            <div className="stat-card stat-gold">
              <div className="stat-value">{stats.totalClientes}</div>
              <div className="stat-label">Clientes registrados</div>
            </div>
            <div className="stat-card stat-cyan">
              <div className="stat-value">{stats.totalDocumentos}</div>
              <div className="stat-label">Documentos almacenados</div>
            </div>
            <div className="stat-card stat-red">
              <div className="stat-value">{stats.pendientes}</div>
              <div className="stat-label">Pendientes de revisión</div>
            </div>
          </div>

          <div className="dashboard-section">
            <div className="section-header">
              <h2>Expedientes recientes</h2>
              <button className="btn btn-secondary btn-sm" onClick={() => onNavigate('expedientes')}>
                Ver todos
              </button>
            </div>

            {recentExpedientes.length === 0 ? (
              <div className="empty-state">
                <p>No hay expedientes registrados.</p>
                <button className="btn btn-primary" onClick={() => onNavigate('expedientes')}>
                  Gestionar expedientes
                </button>
              </div>
            ) : (
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Título</th>
                      <th>Cliente</th>
                      <th>Estado</th>
                      <th>Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentExpedientes.map((exp) => (
                      <tr key={exp.id}>
                        <td>{exp.titulo}</td>
                        <td>{exp.profiles?.nombre_completo || '—'}</td>
                        <td><span className="badge badge-status" style={{ backgroundColor: 'var(--color-blue)' }}>{exp.estado}</span></td>
                        <td>{new Date(exp.created_at).toLocaleDateString('es-CO')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
