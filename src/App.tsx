import { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import AuthPage from './components/auth/AuthPage';
import AdminDashboard from './components/admin/AdminDashboard';
import AdminExpedientes from './components/admin/AdminExpedientes';
import AdminUsuarios from './components/admin/AdminUsuarios';
import AdminConfig from './components/admin/AdminConfig';
import AdminBitacora from './components/admin/AdminBitacora';
import AdminMantenimiento from './components/admin/AdminMantenimiento';
import ClientDashboard from './components/client/ClientDashboard';
import ExponerCaso from './components/client/ExponerCaso';
import DocumentosRecibidos from './components/client/DocumentosRecibidos';
import ClientCaseTracking from './components/client/ClientCaseTracking';
import ClientProfile from './components/client/ClientProfile';
import { getAppSettings } from './lib/helpers';
import type { Expediente } from './types';

type AdminTab = 'dashboard' | 'expedientes' | 'usuarios' | 'config' | 'bitacora' | 'mantenimiento';
type ClientTab = 'dashboard' | 'documentos' | 'perfil';

export default function App() {
  const { profile, loading, signOut } = useAuth();
  const [adminTab, setAdminTab] = useState<AdminTab>('dashboard');
  const [clientTab, setClientTab] = useState<ClientTab>('dashboard');
  const [showExponer, setShowExponer] = useState(false);
  const [viewingExp, setViewingExp] = useState<Expediente | null>(null);
  const [settings, setSettings] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const s = await getAppSettings();
      setSettings(s);
    })();
  }, []);

  if (loading) {
    return (
      <div className="app-loading">
        <div className="app-loading-content">
          <img src="/lexacaso.jpeg" alt="LEXACASO" className="loading-logo" />
          <p>Cargando LEXACASO…</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return <AuthPage />;
  }

  const isAdmin = profile.rol === 'admin';
  const whatsappEnabled = settings.whatsapp_enabled !== 'false';
  const whatsappNumber = settings.whatsapp_number || '573105603386';

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-brand">
          <img src="/lexacaso.jpeg" alt="LEXACASO" className="header-logo" />
          <div>
            <strong>LEXACASO</strong>
            <span>{isAdmin ? 'Panel Administrativo' : 'Portal del Cliente'}</span>
          </div>
        </div>
        <div className="header-user">
          <span className="user-name">{profile.nombre_completo}</span>
          <span className={`user-role badge ${isAdmin ? 'badge-gold' : 'badge-blue'}`}>{profile.rol}</span>
          {whatsappEnabled && (
            <a
              href={`https://wa.me/${whatsappNumber}?text=Hola%2C%20me%20gustar%C3%ADa%20contactar%20con%20LexaCaso`}
              target="_blank"
              rel="noopener noreferrer"
              className="whatsapp-btn"
              title="Contactar por WhatsApp"
            >
              WhatsApp
            </a>
          )}
          <button className="btn btn-secondary btn-sm" onClick={signOut}>Cerrar sesión</button>
        </div>
      </header>

      <div className="app-body">
        <nav className="app-sidebar">
          {isAdmin ? (
            <>
              <button className={adminTab === 'dashboard' ? 'active' : ''} onClick={() => setAdminTab('dashboard')}>Panel</button>
              <button className={adminTab === 'expedientes' ? 'active' : ''} onClick={() => setAdminTab('expedientes')}>Expedientes</button>
              <button className={adminTab === 'usuarios' ? 'active' : ''} onClick={() => setAdminTab('usuarios')}>Usuarios</button>
              <button className={adminTab === 'config' ? 'active' : ''} onClick={() => setAdminTab('config')}>Configuración</button>
              <button className={adminTab === 'mantenimiento' ? 'active' : ''} onClick={() => setAdminTab('mantenimiento')}>Mantenimiento</button>
              <button className={adminTab === 'bitacora' ? 'active' : ''} onClick={() => setAdminTab('bitacora')}>Auditoría</button>
            </>
          ) : (
            <>
              <button className={clientTab === 'dashboard' ? 'active' : ''} onClick={() => { setClientTab('dashboard'); setShowExponer(false); }}>Mis Expedientes</button>
              <button className={clientTab === 'documentos' ? 'active' : ''} onClick={() => setClientTab('documentos')}>Documentos Recibidos</button>
              <button className={clientTab === 'perfil' ? 'active' : ''} onClick={() => setClientTab('perfil')}>Mi Perfil</button>
            </>
          )}
        </nav>

        <main className="app-content">
          {isAdmin ? (
            <>
              {adminTab === 'dashboard' && <AdminDashboard onNavigate={(t) => setAdminTab(t as AdminTab)} />}
              {adminTab === 'expedientes' && <AdminExpedientes />}
              {adminTab === 'usuarios' && <AdminUsuarios />}
              {adminTab === 'config' && <AdminConfig />}
              {adminTab === 'mantenimiento' && <AdminMantenimiento />}
              {adminTab === 'bitacora' && <AdminBitacora />}
            </>
          ) : (
            <>
              {clientTab === 'dashboard' && !showExponer && (
                <ClientDashboard onExponerCaso={() => setShowExponer(true)} onViewExpediente={(exp) => setViewingExp(exp)} />
              )}
              {clientTab === 'dashboard' && showExponer && (
                <ExponerCaso onComplete={() => { setShowExponer(false); setClientTab('dashboard'); }} onCancel={() => setShowExponer(false)} />
              )}
              {clientTab === 'documentos' && <DocumentosRecibidos />}
              {clientTab === 'perfil' && <ClientProfile />}
            </>
          )}
        </main>
      </div>

      <ClientCaseTracking expediente={viewingExp} onClose={() => setViewingExp(null)} />
    </div>
  );
}
