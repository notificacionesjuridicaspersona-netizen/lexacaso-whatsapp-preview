import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import type { ConfigCategoria, ConfigEstado, ConfigTipoActuacion } from '../../types';

type ConfigTab = 'categorias' | 'estados' | 'tipos';

export default function AdminConfig() {
  const [tab, setTab] = useState<ConfigTab>('categorias');
  const [categorias, setCategorias] = useState<ConfigCategoria[]>([]);
  const [estados, setEstados] = useState<ConfigEstado[]>([]);
  const [tipos, setTipos] = useState<ConfigTipoActuacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New item forms
  const [newCat, setNewCat] = useState({ nombre: '', descripcion: '' });
  const [newEst, setNewEst] = useState({ nombre: '', color: '#3b82f6' });
  const [newTipo, setNewTipo] = useState({ nombre: '', descripcion: '' });

  const loadConfig = useCallback(async () => {
    setLoading(true);
    const [catRes, estRes, tipoRes] = await Promise.all([
      supabase.from('config_categorias').select('*').order('orden'),
      supabase.from('config_estados').select('*').order('orden'),
      supabase.from('config_tipos_actuacion').select('*').order('orden'),
    ]);
    if (catRes.data) setCategorias(catRes.data as ConfigCategoria[]);
    if (estRes.data) setEstados(estRes.data as ConfigEstado[]);
    if (tipoRes.data) setTipos(tipoRes.data as ConfigTipoActuacion[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const addCategoria = async () => {
    if (!newCat.nombre) return;
    const { error } = await supabase.from('config_categorias').insert({
      nombre: newCat.nombre,
      descripcion: newCat.descripcion || null,
      orden: categorias.length + 1,
    });
    if (error) { setError(error.message); return; }
    setNewCat({ nombre: '', descripcion: '' });
    loadConfig();
  };

  const addEstado = async () => {
    if (!newEst.nombre) return;
    const { error } = await supabase.from('config_estados').insert({
      nombre: newEst.nombre,
      color: newEst.color,
      orden: estados.length + 1,
    });
    if (error) { setError(error.message); return; }
    setNewEst({ nombre: '', color: '#3b82f6' });
    loadConfig();
  };

  const addTipo = async () => {
    if (!newTipo.nombre) return;
    const { error } = await supabase.from('config_tipos_actuacion').insert({
      nombre: newTipo.nombre,
      descripcion: newTipo.descripcion || null,
      orden: tipos.length + 1,
    });
    if (error) { setError(error.message); return; }
    setNewTipo({ nombre: '', descripcion: '' });
    loadConfig();
  };

  const deleteItem = async (table: string, id: string) => {
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) { setError(error.message); return; }
    loadConfig();
  };

  return (
    <div className="admin-config">
      <div className="page-header">
        <h1>Configuración</h1>
        <p>Administre categorías, estados y tipos de actuación</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="config-tabs">
        <button className={tab === 'categorias' ? 'active' : ''} onClick={() => setTab('categorias')}>Categorías</button>
        <button className={tab === 'estados' ? 'active' : ''} onClick={() => setTab('estados')}>Estados</button>
        <button className={tab === 'tipos' ? 'active' : ''} onClick={() => setTab('tipos')}>Tipos de Actuación</button>
      </div>

      {loading ? (
        <div className="loading-state">Cargando…</div>
      ) : (
        <>
          {tab === 'categorias' && (
            <div className="config-section">
              <div className="inline-form">
                <input type="text" placeholder="Nombre" value={newCat.nombre} onChange={(e) => setNewCat({ ...newCat, nombre: e.target.value })} />
                <input type="text" placeholder="Descripción" value={newCat.descripcion} onChange={(e) => setNewCat({ ...newCat, descripcion: e.target.value })} />
                <button className="btn btn-primary btn-sm" onClick={addCategoria}>Agregar</button>
              </div>
              <div className="config-list">
                {categorias.map((c) => (
                  <div key={c.id} className="config-item">
                    <div>
                      <strong>{c.nombre}</strong>
                      {c.descripcion && <span className="config-desc">{c.descripcion}</span>}
                    </div>
                    <button className="btn-icon btn-danger" onClick={() => deleteItem('config_categorias', c.id)}>Eliminar</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'estados' && (
            <div className="config-section">
              <div className="inline-form">
                <input type="text" placeholder="Nombre" value={newEst.nombre} onChange={(e) => setNewEst({ ...newEst, nombre: e.target.value })} />
                <input type="color" value={newEst.color} onChange={(e) => setNewEst({ ...newEst, color: e.target.value })} />
                <button className="btn btn-primary btn-sm" onClick={addEstado}>Agregar</button>
              </div>
              <div className="config-list">
                {estados.map((e) => (
                  <div key={e.id} className="config-item">
                    <div>
                      <span className="color-dot" style={{ backgroundColor: e.color }}></span>
                      <strong>{e.nombre}</strong>
                    </div>
                    <button className="btn-icon btn-danger" onClick={() => deleteItem('config_estados', e.id)}>Eliminar</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'tipos' && (
            <div className="config-section">
              <div className="inline-form">
                <input type="text" placeholder="Nombre" value={newTipo.nombre} onChange={(e) => setNewTipo({ ...newTipo, nombre: e.target.value })} />
                <input type="text" placeholder="Descripción" value={newTipo.descripcion} onChange={(e) => setNewTipo({ ...newTipo, descripcion: e.target.value })} />
                <button className="btn btn-primary btn-sm" onClick={addTipo}>Agregar</button>
              </div>
              <div className="config-list">
                {tipos.map((t) => (
                  <div key={t.id} className="config-item">
                    <div>
                      <strong>{t.nombre}</strong>
                      {t.descripcion && <span className="config-desc">{t.descripcion}</span>}
                    </div>
                    <button className="btn-icon btn-danger" onClick={() => deleteItem('config_tipos_actuacion', t.id)}>Eliminar</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
