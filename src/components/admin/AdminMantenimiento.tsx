import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { getAppSettings, updateAppSetting, logAuditoria } from '../../lib/helpers';
import { sendNotification } from '../../lib/helpers';
import { isAIConfigured, getAIProvider } from '../../lib/ai';
import type { Notificacion, AppSetting } from '../../types';

type MaintTab = 'herramientas' | 'general' | 'notificaciones' | 'servicios';

const TOOL_LABELS: Record<string, string> = {
  tool_analizar_documentos: 'Analizar documentos jurídicos',
  tool_resumir_hechos: 'Resumir hechos cronológicamente',
  tool_identificar_problemas: 'Identificar problemas jurídicos',
  tool_jurisprudencia: 'Investigar jurisprudencia',
  tool_normatividad: 'Identificar normatividad aplicable',
  tool_alternativas: 'Evaluar alternativas de solución',
  tool_terminos_plazos: 'Identificar términos y plazos',
  tool_pruebas_faltantes: 'Detectar documentos y pruebas faltantes',
  tool_estrategias: 'Proponer estrategias jurídicas',
  tool_acciones: 'Determinar posibles acciones',
  tool_conducta: 'Indicar conducta a evaluar',
  tool_borradores: 'Elaborar borradores de documentos',
  tool_contradicciones: 'Revisar contradicciones y debilidades',
  tool_informe_integral: 'Generar informe jurídico integral',
  tool_segunda_revision: 'Segunda revisión crítica',
};

const TOOL_KEYS = Object.keys(TOOL_LABELS);

export default function AdminMantenimiento() {
  const [tab, setTab] = useState<MaintTab>('herramientas');
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [allSettings, setAllSettings] = useState<AppSetting[]>([]);
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [adminEmail, setAdminEmail] = useState('');
  const [whatsappEnabled, setWhatsappEnabled] = useState(true);
  const [whatsappNumber, setWhatsappNumber] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    const s = await getAppSettings();
    setSettings(s);
    setAdminEmail(s.admin_email || '');
    setWhatsappEnabled(s.whatsapp_enabled === 'true');
    setWhatsappNumber(s.whatsapp_number || '');
    const { data: settingRows } = await supabase.from('app_settings').select('*').order('clave');
    if (settingRows) setAllSettings(settingRows as AppSetting[]);
    const { data: notifRows } = await supabase.from('notificaciones').select('*').order('created_at', { ascending: false }).limit(50);
    if (notifRows) setNotificaciones(notifRows as Notificacion[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const toggleTool = async (key: string, currentVal: string) => {
    const newVal = currentVal === 'true' ? 'false' : 'true';
    const ok = await updateAppSetting(key, newVal);
    if (!ok) { setError('Error al actualizar'); return; }
    await logAuditoria('toggle_herramienta', `${TOOL_LABELS[key]}: ${newVal === 'true' ? 'activada' : 'desactivada'}`, 'config', null);
    setSettings({ ...settings, [key]: newVal });
  };

  const saveGeneral = async () => {
    setError(null);
    setSuccess(null);
    const ok1 = await updateAppSetting('admin_email', adminEmail);
    const ok2 = await updateAppSetting('whatsapp_enabled', whatsappEnabled ? 'true' : 'false');
    const ok3 = await updateAppSetting('whatsapp_number', whatsappNumber);
    if (ok1 && ok2 && ok3) {
      setSuccess('Configuración guardada correctamente.');
      await logAuditoria('editar_config_general', 'Configuración general actualizada', 'config', null);
    } else {
      setError('Error al guardar la configuración.');
    }
  };

  const testNotification = async () => {
    setError(null);
    setSuccess(null);
    const result = await sendNotification(adminEmail, 'Prueba de notificación LEXACASO', 'Esta es una notificación de prueba del sistema LEXACASO.');
    if (result.success) {
      setSuccess('Notificación enviada correctamente.');
    } else {
      setError(`Error al enviar: ${result.error}`);
    }
    loadData();
  };

  const aiConfigured = isAIConfigured() || settings.ai_service_configured === 'true';
  const aiProviderName = getAIProvider() === 'openai' ? 'OpenAI' : getAIProvider() === 'gemini' ? 'Gemini' : 'Local (sin API externa)';
  const ocrConfigured = isAIConfigured() || settings.ocr_service_configured === 'true';
  const jurisConfigured = isAIConfigured() || settings.jurisprudencia_service_configured === 'true';

  return (
    <div className="admin-config">
      <div className="page-header">
        <h1>Mantenimiento</h1>
        <p>Administre herramientas, configuración y servicios</p>
      </div>

      {error && <div className="alert alert-error">{error}<button className="alert-close" onClick={() => setError(null)}>×</button></div>}
      {success && <div className="alert alert-success">{success}<button className="alert-close" onClick={() => setSuccess(null)}>×</button></div>}

      <div className="config-tabs">
        <button className={tab === 'herramientas' ? 'active' : ''} onClick={() => setTab('herramientas')}>Herramientas</button>
        <button className={tab === 'general' ? 'active' : ''} onClick={() => setTab('general')}>General</button>
        <button className={tab === 'servicios' ? 'active' : ''} onClick={() => setTab('servicios')}>Servicios externos</button>
        <button className={tab === 'notificaciones' ? 'active' : ''} onClick={() => setTab('notificaciones')}>Notificaciones</button>
      </div>

      {loading ? (
        <div className="loading-state">Cargando…</div>
      ) : (
        <>
          {tab === 'herramientas' && (
            <div className="config-section">
              <p className="config-hint">Active o desactive las herramientas jurídicas. Al desactivar una herramienta, se oculta sin eliminar análisis existentes.</p>
              <div className="config-list">
                {TOOL_KEYS.map((key) => (
                  <div key={key} className="config-item">
                    <div>
                      <strong>{TOOL_LABELS[key]}</strong>
                    </div>
                    <label className="toggle-switch">
                      <input type="checkbox" checked={settings[key] !== 'false'} onChange={() => toggleTool(key, settings[key] || 'true')} />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'general' && (
            <div className="config-section">
              <div className="form-group">
                <label>Correo del administrador para notificaciones</label>
                <input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="admin@lexacaso.com" />
                <span className="config-desc">Recibe avisos cuando hay nuevos casos o clientes.</span>
              </div>
              <div className="form-group">
                <label className="checkbox-inline">
                  <input type="checkbox" checked={whatsappEnabled} onChange={(e) => setWhatsappEnabled(e.target.checked)} />
                  Mostrar botón de WhatsApp
                </label>
              </div>
              <div className="form-group">
                <label>Número de WhatsApp (formato internacional)</label>
                <input type="text" value={whatsappNumber} onChange={(e) => setWhatsappNumber(e.target.value)} placeholder="573105603386" />
              </div>
              <div className="form-actions">
                <button className="btn btn-primary" onClick={saveGeneral}>Guardar configuración</button>
                <button className="btn btn-secondary" onClick={testNotification}>Probar notificación</button>
              </div>
            </div>
          )}

          {tab === 'servicios' && (
            <div className="config-section">
              <p className="config-hint">Estado de los servicios externos. Para activarlos, configure las credenciales correspondientes en el servidor.</p>
              <div className="config-list">
                <div className="config-item">
                  <div>
                    <strong>Inteligencia Artificial</strong>
                    <span className="config-desc">Permite análisis automáticos, resúmenes y borradores generados por IA. {aiConfigured && aiProviderName ? `Proveedor activo: ${aiProviderName}.` : ''}</span>
                  </div>
                  <span className={`badge ${aiConfigured ? 'badge-green' : 'badge-orange'}`}>
                    {aiConfigured ? `Configurado y Activo` : 'No configurado'}
                  </span>
                </div>
                <div className="config-item">
                  <div>
                    <strong>OCR (reconocimiento de texto)</strong>
                    <span className="config-desc">Permite extraer texto de imágenes y PDF escaneados.</span>
                  </div>
                  <span className={`badge ${ocrConfigured ? 'badge-green' : 'badge-orange'}`}>
                    {ocrConfigured ? 'Configurado y Activo' : 'No configurado'}
                  </span>
                </div>
                <div className="config-item">
                  <div>
                    <strong>Búsqueda jurisprudencial</strong>
                    <span className="config-desc">Permite buscar sentencias y decisiones en bases externas.</span>
                  </div>
                  <span className={`badge ${jurisConfigured ? 'badge-green' : 'badge-orange'}`}>
                    {jurisConfigured ? 'Configurado y Activo' : 'No configurado'}
                  </span>
                </div>
              </div>
              <div className="service-setup-info">
                <h4>Cómo configurar los servicios</h4>
                <ul>
                  <li><strong>IA:</strong> Agregar la variable de entorno <code>VITE_OPENAI_API_KEY</code> o <code>VITE_GEMINI_API_KEY</code> para habilitar el modo automático. El sistema detecta automáticamente cuál está configurada.</li>
                  <li><strong>OCR:</strong> Agregar <code>OCR_API_KEY</code> con un proveedor como Google Vision o Tesseract en una función de borde.</li>
                  <li><strong>Jurisprudencia:</strong> Configurar acceso a una base de datos de jurisprudencia colombiana mediante una API o función de borde.</li>
                </ul>
              </div>
            </div>
          )}

          {tab === 'notificaciones' && (
            <div className="config-section">
              <p className="config-hint">Historial de notificaciones enviadas (últimas 50).</p>
              {notificaciones.length === 0 ? (
                <div className="empty-state"><p>No hay notificaciones registradas.</p></div>
              ) : (
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr><th>Destinatario</th><th>Evento</th><th>Estado</th><th>Fecha</th></tr>
                    </thead>
                    <tbody>
                      {notificaciones.map((n) => (
                        <tr key={n.id}>
                          <td>{n.destinatario}</td>
                          <td>{n.evento}</td>
                          <td>
                            <span className={`badge ${n.estado === 'enviada' ? 'badge-green' : n.estado === 'fallida' ? 'badge-red' : 'badge-orange'}`}>
                              {n.estado}
                            </span>
                          </td>
                          <td>{new Date(n.created_at).toLocaleDateString('es-CO', { hour: '2-digit', minute: '2-digit' })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
