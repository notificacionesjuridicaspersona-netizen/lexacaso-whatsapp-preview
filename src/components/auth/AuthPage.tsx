import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

type Mode = 'login' | 'register' | 'recover';

export default function AuthPage() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nombreCompleto, setNombreCompleto] = useState('');
  const [cedula, setCedula] = useState('');
  const [celular, setCelular] = useState('');
  const [direccion, setDireccion] = useState('');
  const [autorizacion, setAutorizacion] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      if (mode === 'login') {
        const { error } = await signIn(email, password);
        if (error) setError(error);
      } else if (mode === 'register') {
        if (!autorizacion) {
          setError('Debe autorizar el tratamiento de sus datos personales para continuar.');
          setLoading(false);
          return;
        }
        const { error } = await signUp(email, password, {
          nombre_completo: nombreCompleto || email,
          cedula,
          celular,
          direccion,
          autorizacion_datos: true,
        });
        if (error) {
          setError(error);
        } else {
          setSuccess('Cuenta creada. Inicie sesión para continuar.');
          setMode('login');
          setPassword('');
        }
      } else if (mode === 'recover') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        });
        if (error) {
          setError(error.message);
        } else {
          setSuccess('Se ha enviado un enlace de recuperación a su correo.');
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-brand">
          <img src="/lexacaso.jpeg" alt="LEXACASO" className="auth-logo" />
          <h1>LEXACASO</h1>
          <p>Gestión Jurídica Integral</p>
        </div>

        <div className="auth-card">
          <h2>
            {mode === 'login' && 'Iniciar Sesión'}
            {mode === 'register' && 'Crear Cuenta'}
            {mode === 'recover' && 'Recuperar Contraseña'}
          </h2>

          {error && <div className="alert alert-error">{error}</div>}
          {success && <div className="alert alert-success">{success}</div>}

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-group">
              <label htmlFor="email">Correo electrónico</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="su@email.com"
              />
            </div>

            {mode === 'register' && (
              <>
                <div className="form-group">
                  <label htmlFor="nombre">Nombre completo</label>
                  <input
                    id="nombre"
                    type="text"
                    value={nombreCompleto}
                    onChange={(e) => setNombreCompleto(e.target.value)}
                    placeholder="Nombre y apellidos"
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="cedula">Cédula</label>
                    <input
                      id="cedula"
                      type="text"
                      value={cedula}
                      onChange={(e) => setCedula(e.target.value)}
                      placeholder="N° de identificación"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="celular">Celular</label>
                    <input
                      id="celular"
                      type="tel"
                      value={celular}
                      onChange={(e) => setCelular(e.target.value)}
                      placeholder="Teléfono"
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="direccion">Dirección</label>
                  <input
                    id="direccion"
                    type="text"
                    value={direccion}
                    onChange={(e) => setDireccion(e.target.value)}
                    placeholder="Dirección de residencia"
                  />
                </div>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={autorizacion}
                    onChange={(e) => setAutorizacion(e.target.checked)}
                  />
                  <span>Autorizo el tratamiento de mis datos personales conforme a la Ley 1581 de 2012.</span>
                </label>
              </>
            )}

            {mode !== 'recover' && (
              <div className="form-group">
                <label htmlFor="password">Contraseña</label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="Mínimo 6 caracteres"
                />
              </div>
            )}

            <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
              {loading ? 'Procesando…' : (
                mode === 'login' ? 'Ingresar' :
                mode === 'register' ? 'Registrarse' :
                'Enviar enlace'
              )}
            </button>
          </form>

          <div className="auth-links">
            {mode === 'login' && (
              <>
                <button className="link-btn" onClick={() => { setMode('register'); setError(null); setSuccess(null); }}>
                  ¿No tiene cuenta? Regístrese
                </button>
                <button className="link-btn" onClick={() => { setMode('recover'); setError(null); setSuccess(null); }}>
                  ¿Olvidó su contraseña?
                </button>
              </>
            )}
            {mode === 'register' && (
              <button className="link-btn" onClick={() => { setMode('login'); setError(null); setSuccess(null); }}>
                ¿Ya tiene cuenta? Inicie sesión
              </button>
            )}
            {mode === 'recover' && (
              <button className="link-btn" onClick={() => { setMode('login'); setError(null); setSuccess(null); }}>
                Volver a iniciar sesión
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
