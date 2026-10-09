import { useState } from 'react';
import AuthPage from '../auth/AuthPage';

interface LandingPageProps {
  onIngresar: () => void;
}

export default function LandingPage({ onIngresar }: LandingPageProps) {
  const [showAuth, setShowAuth] = useState(false);

  if (showAuth) {
    return <AuthPage />;
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
        <button className="btn btn-secondary" onClick={() => setShowAuth(true)}>Ingresar</button>
      </header>

      <section className="landing-hero">
        <div className="hero-content">
          <h1>Expón tu caso. Ordena la información.</h1>
          <p className="hero-desc">
            Una plataforma sencilla para que los ciudadanos presenten sus casos y organicen
            su información jurídica. Adjunta documentos, registra los hechos, consulta el
            seguimiento y organiza la información necesaria para comprender tu situación
            y preparar las actuaciones correspondientes.
          </p>
          <div className="hero-actions">
            <button className="btn btn-primary btn-lg" onClick={() => setShowAuth(true)}>
              Exponer mi caso
            </button>
            <button className="btn btn-outline btn-lg" onClick={() => setShowAuth(true)}>
              Ingresar
            </button>
          </div>
          <p className="hero-disclaimer">
            LexaCaso ofrece herramientas de organización y orientación informativa. Sus
            análisis deben verificarse y no sustituyen la asesoría o representación profesional.
          </p>
        </div>
      </section>

      <section className="landing-cards">
        <div className="emblem-card">
          <div className="emblem-icon emblem-docs"></div>
          <h3>Documentos</h3>
          <p>Adjunta y organiza archivos relevantes de forma privada.</p>
        </div>
        <div className="emblem-card">
          <div className="emblem-icon emblem-analysis"></div>
          <h3>Análisis</h3>
          <p>Organiza hechos, documentos, problemas jurídicos y fuentes para revisión.</p>
        </div>
        <div className="emblem-card">
          <div className="emblem-icon emblem-privacy"></div>
          <h3>Privacidad</h3>
          <p>Protege la información y separa los expedientes de cada cuenta.</p>
        </div>
      </section>

      <footer className="landing-footer">
        <p>LEXACASO — Tu caso, en buenas manos.</p>
      </footer>
    </div>
  );
}
