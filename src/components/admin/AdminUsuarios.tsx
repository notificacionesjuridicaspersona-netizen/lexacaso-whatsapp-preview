import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import type { Profile } from '../../types';
import { logAuditoria } from '../../lib/helpers';
import Modal from '../ui/Modal';

export default function AdminUsuarios() {
  const [usuarios, setUsuarios] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [editForm, setEditForm] = useState<Partial<Profile>>({});

  const loadUsuarios = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      setError(error.message);
    } else {
      setUsuarios(data as Profile[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadUsuarios();
  }, [loadUsuarios]);

  const handleSaveUser = async () => {
    if (!editingUser) return;
    const updates: Record<string, unknown> = {};
    if (editForm.nombre_completo !== editingUser.nombre_completo) updates.nombre_completo = editForm.nombre_completo;
    if (editForm.cedula !== editingUser.cedula) updates.cedula = editForm.cedula;
    if (editForm.celular !== editingUser.celular) updates.celular = editForm.celular;
    if (editForm.direccion !== editingUser.direccion) updates.direccion = editForm.direccion;

    if (Object.keys(updates).length > 0) {
      const { error } = await supabase.from('profiles').update(updates).eq('id', editingUser.id);
      if (error) {
        setError(error.message);
        return;
      }
    }

    // Role change via RPC
    if (editForm.rol && editForm.rol !== editingUser.rol) {
      const { error: roleError } = await supabase.rpc('set_user_role', {
        target_user_id: editingUser.id,
        new_role: editForm.rol,
      });
      if (roleError) {
        setError(roleError.message);
        return;
      }
      await logAuditoria('cambiar_rol', `Usuario: ${editingUser.email}, rol: ${editForm.rol}`, 'perfil', editingUser.id);
    }

    await logAuditoria('editar_usuario', `Usuario: ${editingUser.email}`, 'perfil', editingUser.id);
    setEditingUser(null);
    loadUsuarios();
  };

  const filtered = usuarios.filter((u) => {
    const q = search.toLowerCase();
    return u.nombre_completo.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.cedula || '').toLowerCase().includes(q);
  });

  return (
    <div className="admin-usuarios">
      <div className="page-header">
        <h1>Gestión de Usuarios</h1>
        <p>Administre los usuarios y sus roles</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="search-bar">
        <input
          type="text"
          className="search-input"
          placeholder="Buscar por nombre, email o cédula…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="loading-state">Cargando usuarios…</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state"><p>No se encontraron usuarios.</p></div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Email</th>
                <th>Cédula</th>
                <th>Celular</th>
                <th>Rol</th>
                <th>Registro</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id}>
                  <td>{u.nombre_completo}</td>
                  <td>{u.email}</td>
                  <td>{u.cedula || '—'}</td>
                  <td>{u.celular || '—'}</td>
                  <td>
                    <span className={`badge ${u.rol === 'admin' ? 'badge-gold' : 'badge-blue'}`}>{u.rol}</span>
                  </td>
                  <td>{new Date(u.created_at).toLocaleDateString('es-CO')}</td>
                  <td>
                    <button className="btn-icon" onClick={() => { setEditingUser(u); setEditForm(u); }}>Editar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!editingUser} onClose={() => setEditingUser(null)} title="Editar usuario" size="md">
        {editingUser && (
          <>
            <div className="form-group">
              <label>Nombre completo</label>
              <input value={editForm.nombre_completo || ''} onChange={(e) => setEditForm({ ...editForm, nombre_completo: e.target.value })} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Cédula</label>
                <input value={editForm.cedula || ''} onChange={(e) => setEditForm({ ...editForm, cedula: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Celular</label>
                <input value={editForm.celular || ''} onChange={(e) => setEditForm({ ...editForm, celular: e.target.value })} />
              </div>
            </div>
            <div className="form-group">
              <label>Dirección</label>
              <input value={editForm.direccion || ''} onChange={(e) => setEditForm({ ...editForm, direccion: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Rol</label>
              <select value={editForm.rol || 'cliente'} onChange={(e) => setEditForm({ ...editForm, rol: e.target.value as 'admin' | 'cliente' })}>
                <option value="cliente">Cliente</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
            <div className="form-actions">
              <button className="btn btn-primary" onClick={handleSaveUser}>Guardar</button>
              <button className="btn btn-secondary" onClick={() => setEditingUser(null)}>Cancelar</button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
