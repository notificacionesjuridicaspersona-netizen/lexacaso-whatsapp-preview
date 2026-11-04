import { useState, useEffect } from 'react';
import AuthPage from '../auth/AuthPage';
import { getAppSettings } from '../../lib/helpers';

interface LandingPageProps {
  onIngresar: () => void;
}

export default function LandingPage(_props: LandingPageProps) {
  const [authMode, setAuthMode] = useState<'login' | 'register' | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [settings, setSettings] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const s = await getAppSettings();
      setSettings(s);
    })();
  }, []);

  const whatsappEnabled = settings.whatsapp_enabled !== 'false';
  const whatsappNumber = settings.whatsapp_number || '573105603386';

  if (authMode) {
    return <AuthPage initialMode={authMode} />;
  }

  return (
    <div className="landing-page">
      <header className="landing-header">
        <div className="landing-brand">
          <img src="/lexacaso.jpeg" alt="LEXACASO" className="landing-logo" />
          <div>
            <strong>LEXACASO</strong>
            <span>Tu caso, en buenas manos.</span>
          </div>
        </div>
        <div className="header-user">
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
          <button className="btn btn-secondary" onClick={() => setAuthMode('login')}>Ingresar</button>
        </div>
      </header>

      <section className="landing-hero">
        <div className="hero-content">
          <span className="hero-kicker">Orientación y organización jurídica</span>
          <h1>Expón tu caso. Ordena la información.</h1>
          <p className="hero-desc">
            Una plataforma sencilla para presentar casos, adjuntar documentos y consultar el seguimiento de forma privada.
          </p>
          <div className="hero-actions">
            <button className="btn btn-primary btn-lg" onClick={() => setAuthMode('register')}>
              Crear cuenta cliente
            </button>
            <button className="btn btn-outline btn-lg" onClick={() => setAuthMode('login')}>
              Ingresar
            </button>
          </div>
          <button className="guide-toggle" onClick={() => setShowGuide(!showGuide)} aria-expanded={showGuide}>
            {showGuide ? 'Ocultar manual de uso' : 'Ver manual de uso rápido'}
          </button>
          <p className="hero-disclaimer">
            LexaCaso ofrece herramientas de organización y orientación informativa. Sus análisis deben verificarse y no sustituyen la asesoría o representación profesional.
          </p>
        </div>
      </section>

      {showGuide && (
        <section className="landing-guide" aria-label="Manual de uso de LexaCaso">
          <div className="section-heading">
            <span className="hero-kicker">Primeros pasos</span>
            <h2>Cómo crear y usar su cuenta</h2>
            <p>Complete estos pasos para empezar sin complicaciones.</p>
          </div>
          <div className="guide-grid">
            <article className="guide-step"><span>1</span><div><h3>Crear la cuenta</h3><p>Seleccione “Crear cuenta cliente”, complete sus datos y acepte las autorizaciones solicitadas.</p></div></article>
            <article className="guide-step"><span>2</span><div><h3>Ingresar</h3><p>Use su correo y contraseña. Si no recuerda la contraseña, elija “Recuperar acceso” y revise su correo.</p></div></article>
            <article className="guide-step"><span>3</span><div><h3>Exponer el caso</h3><p>Desde “Mis Expedientes”, cree un caso, describa los hechos y adjunte documentos legibles.</p></div></article>
            <article className="guide-step"><span>4</span><div><h3>Consultar avances</h3><p>Revise documentos recibidos, actuaciones, observaciones y mensajes del equipo jurídico.</p></div></article>
          </div>
          <button className="btn btn-primary" onClick={() => setAuthMode('register')}>Crear mi cuenta cliente</button>
        </section>
      )}

      <section className="landing-cards">
        <div className="emblem-card"><div className="emblem-icon emblem-docs"></div><h3>Documentos</h3><p>Adjunta y organiza archivos relevantes de forma privada.</p></div>
        <div className="emblem-card"><div className="emblem-icon emblem-analysis"></div><h3>Seguimiento</h3><p>Consulta el avance de tu caso y las actuaciones registradas.</p></div>
        <div className="emblem-card"><div className="emblem-icon emblem-privacy"></div><h3>Privacidad</h3><p>Protege la información y separa los expedientes de cada cuenta.</p></div>
      </section>

      <footer className="landing-footer"><p>LEXACASO — Tu caso, en buenas manos.</p></footer>
    </div>
  );
}
