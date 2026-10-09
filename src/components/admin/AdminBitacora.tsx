import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import type { BitacoraEntry } from '../../types';

export default function AdminBitacora() {
  const [entries, setEntries] = useState<BitacoraEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const loadBitacora = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from('bitacora_auditoria')
      .select('*, autor:profiles!bitacora_auditoria_autor_id_profiles_fkey(nombre_completo, email)')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      // Fallback: query without join, then resolve autor names separately
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('bitacora_auditoria')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (fallbackError) {
        setError(fallbackError.message);
        setLoading(false);
        return;
      }

      const rows = fallbackData as BitacoraEntry[];
      const autorIds = [...new Set(rows.map((r) => r.autor_id).filter(Boolean))] as string[];
      const profileMap = new Map<string, { nombre_completo: string; email: string }>();

      if (autorIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, nombre_completo, email')
          .in('id', autorIds);
        if (profilesData) {
          for (const p of profilesData) {
            profileMap.set(p.id, { nombre_completo: p.nombre_completo, email: p.email });
          }
        }
      }

      setEntries(rows.map((r) => ({
        ...r,
        autor: r.autor_id ? profileMap.get(r.autor_id) : undefined,
      })) as BitacoraEntry[]);
    } else {
      setEntries(data as BitacoraEntry[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadBitacora();
  }, [loadBitacora]);

  const filtered = entries.filter((e) => {
    const q = search.toLowerCase();
    return e.accion.toLowerCase().includes(q) ||
      (e.detalle || '').toLowerCase().includes(q) ||
      (e.entidad || '').toLowerCase().includes(q);
  });

  return (
    <div className="admin-bitacora">
      <div className="page-header">
        <h1>Bitácora de Auditoría</h1>
        <p>Registro de acciones del sistema</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="search-bar">
        <input
          type="text"
          className="search-input"
          placeholder="Buscar en la bitácora…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="loading-state">Cargando bitácora…</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state"><p>No hay entradas en la bitácora.</p></div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Usuario</th>
                <th>Acción</th>
                <th>Detalle</th>
                <th>Entidad</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id}>
                  <td>{new Date(e.created_at).toLocaleString('es-CO')}</td>
                  <td>{e.autor?.nombre_completo || e.autor?.email || '—'}</td>
                  <td><span className="badge badge-blue">{e.accion}</span></td>
                  <td className="cell-detail">{e.detalle || '—'}</td>
                  <td>{e.entidad || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
