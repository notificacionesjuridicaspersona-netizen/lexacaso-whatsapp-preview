import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

export default function ClientProfile() {
  const { profile, refreshProfile } = useAuth();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    nombre_completo: profile?.nombre_completo || '',
    cedula: profile?.cedula || '',
    celular: profile?.celular || '',
    direccion: profile?.direccion || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Password change
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPass, setChangingPass] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    const { error } = await supabase
      .from('profiles')
      .update({
        nombre_completo: form.nombre_completo,
        cedula: form.cedula || null,
        celular: form.celular || null,
        direccion: form.direccion || null,
      })
      .eq('id', profile?.id);
    if (error) {
      setError(error.message);
    } else {
      setSuccess('Perfil actualizado correctamente');
      setEditing(false);
      await refreshProfile();
    }
    setSaving(false);
  };

  const handleChangePassword = async () => {
    setError(null);
    setSuccess(null);
    if (newPassword.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }
    setChangingPass(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setError(error.message);
    } else {
      setSuccess('Contraseña actualizada correctamente');
      setNewPassword('');
      setConfirmPassword('');
    }
    setChangingPass(false);
  };

  return (
    <div className="client-profile-page">
      <div className="page-header">
        <h1>Mi Perfil</h1>
        <p>Información personal y configuración de cuenta</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="profile-card">
        <div className="profile-section">
          <h3>Datos personales</h3>
          {editing ? (
            <>
              <div className="form-group">
                <label>Nombre completo</label>
                <input value={form.nombre_completo} onChange={(e) => setForm({ ...form, nombre_completo: e.target.value })} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Cédula</label>
                  <input value={form.cedula} onChange={(e) => setForm({ ...form, cedula: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Celular</label>
                  <input value={form.celular} onChange={(e) => setForm({ ...form, celular: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label>Dirección</label>
                <input value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} />
              </div>
              <div className="form-actions">
                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
                <button className="btn btn-secondary" onClick={() => setEditing(false)}>Cancelar</button>
              </div>
            </>
          ) : (
            <>
              <div className="info-grid">
                <div className="info-item">
                  <span className="info-label">Nombre</span>
                  <span className="info-value">{profile?.nombre_completo}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Email</span>
                  <span className="info-value">{profile?.email}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Cédula</span>
                  <span className="info-value">{profile?.cedula || '—'}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Celular</span>
                  <span className="info-value">{profile?.celular || '—'}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Dirección</span>
                  <span className="info-value">{profile?.direccion || '—'}</span>
                </div>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>Editar datos</button>
            </>
          )}
        </div>

        <div className="profile-section">
          <h3>Cambiar contraseña</h3>
          <div className="form-group">
            <label>Nueva contraseña</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
          </div>
          <div className="form-group">
            <label>Confirmar contraseña</label>
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          </div>
          <button className="btn btn-primary btn-sm" onClick={handleChangePassword} disabled={changingPass}>
            {changingPass ? 'Cambiando…' : 'Cambiar contraseña'}
          </button>
        </div>
      </div>
    </div>
  );
}
