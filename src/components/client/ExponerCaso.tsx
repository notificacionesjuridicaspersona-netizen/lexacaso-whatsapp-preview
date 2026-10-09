import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { uploadDocument, logAuditoria, sendNotification, validateFile, formatBytes } from '../../lib/helpers';
import type { ConfigCategoria } from '../../types';

interface ExponerCasoProps {
  onComplete: () => void;
  onCancel: () => void;
}

export default function ExponerCaso({ onComplete, onCancel }: ExponerCasoProps) {
  const { profile } = useAuth();
  const [step, setStep] = useState(1);
  const [categorias, setCategorias] = useState<ConfigCategoria[]>([]);
  const [loadingCats, setLoadingCats] = useState(true);

  const [formData, setFormData] = useState({
    categoria: '',
    titulo: '',
    descripcion: '',
    numero_radicado: '',
  });
  const [files, setFiles] = useState<File[]>([]);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useState(() => {
    (async () => {
      const { data } = await supabase.from('config_categorias').select('*').order('orden');
      if (data) setCategorias(data as ConfigCategoria[]);
      setLoadingCats(false);
    })();
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    const valid: File[] = [];
    const errors: string[] = [];

    for (const file of selected) {
      const v = validateFile(file);
      if (v.valid) {
        valid.push(file);
      } else {
        errors.push(`${file.name}: ${v.error}`);
      }
    }

    setFiles([...files, ...valid]);
    setFileErrors(errors);
  };

  const removeFile = (idx: number) => {
    setFiles(files.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!profile?.id) return;
    if (!formData.titulo) {
      setError('El título es obligatorio');
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      const { data: expData, error: expError } = await supabase
        .from('expedientes')
        .insert({
          user_id: profile.id,
          titulo: formData.titulo,
          descripcion: formData.descripcion || null,
          area_juridica: formData.categoria || null,
          numero_radicado: formData.numero_radicado || null,
          estado: 'Recibido',
          prioridad: 'Media',
        })
        .select()
        .single();

      if (expError) throw new Error(expError.message);
      if (!expData) throw new Error('No se pudo crear el expediente');

      // Upload files
      for (const file of files) {
        const result = await uploadDocument(file, expData.id, profile.id);
        if (!result.success) {
          // Continue even if some files fail
        }
      }

      await logAuditoria('crear_expediente_cliente', `Expediente: ${formData.titulo}`, 'expediente', expData.id);

      // Notify admin
      await sendNotification(
        'notipersonales2026@gmail.com',
        'Nuevo caso expuesto',
        `El cliente ${profile.nombre_completo} ha expuesto un nuevo caso: "${formData.titulo}".`
      );

      onComplete();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="exponer-caso">
      <div className="page-header">
        <h1>Exponer mi caso</h1>
        <p>Complete la información para presentar su caso</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Step indicator */}
      <div className="step-indicator">
        <div className={`step ${step >= 1 ? 'active' : ''}`}>
          <span className="step-num">1</span>
          <span className="step-label">Categoría</span>
        </div>
        <div className={`step ${step >= 2 ? 'active' : ''}`}>
          <span className="step-num">2</span>
          <span className="step-label">Relato</span>
        </div>
        <div className={`step ${step >= 3 ? 'active' : ''}`}>
          <span className="step-num">3</span>
          <span className="step-label">Documentos</span>
        </div>
        <div className={`step ${step >= 4 ? 'active' : ''}`}>
          <span className="step-num">4</span>
          <span className="step-label">Revisión</span>
        </div>
      </div>

      <div className="form-card">
        {/* Step 1: Category */}
        {step === 1 && (
          <div className="form-step">
            <h3>¿Qué tipo de caso desea exponer?</h3>
            {loadingCats ? (
              <p>Cargando categorías…</p>
            ) : (
              <div className="category-grid">
                {categorias.map((cat) => (
                  <button
                    key={cat.id}
                    className={`category-card ${formData.categoria === cat.nombre ? 'selected' : ''}`}
                    onClick={() => setFormData({ ...formData, categoria: cat.nombre })}
                  >
                    <strong>{cat.nombre}</strong>
                    {cat.descripcion && <span>{cat.descripcion}</span>}
                  </button>
                ))}
              </div>
            )}
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={onCancel}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => setStep(2)} disabled={!formData.categoria}>Siguiente</button>
            </div>
          </div>
        )}

        {/* Step 2: Description */}
        {step === 2 && (
          <div className="form-step">
            <h3>Cuéntenos sobre su caso</h3>
            <div className="form-group">
              <label>Título del caso *</label>
              <input
                type="text"
                value={formData.titulo}
                onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
                placeholder="Resumen breve del caso"
              />
            </div>
            {formData.numero_radicado !== undefined && (
              <div className="form-group">
                <label>Número de radicado (si lo conoce)</label>
                <input
                  type="text"
                  value={formData.numero_radicado}
                  onChange={(e) => setFormData({ ...formData, numero_radicado: e.target.value })}
                  placeholder="N° de proceso judicial o administrativo"
                />
              </div>
            )}
            <div className="form-group">
              <label>Descripción detallada *</label>
              <textarea
                value={formData.descripcion}
                onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                rows={6}
                placeholder="Describa los hechos, fechas relevantes, personas involucradas y cualquier información que considere importante."
              />
            </div>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setStep(1)}>Atrás</button>
              <button className="btn btn-primary" onClick={() => setStep(3)} disabled={!formData.titulo}>Siguiente</button>
            </div>
          </div>
        )}

        {/* Step 3: Documents */}
        {step === 3 && (
          <div className="form-step">
            <h3>Adjunte documentos (opcional)</h3>
            <div className="import-zone">
              <input
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.xls,.xlsx,.zip,.rar,.jpg,.jpeg,.png"
                onChange={handleFileChange}
              />
              <p className="import-hint">PDF, DOC, DOCX, XLS, XLSX, ZIP, RAR, JPG, PNG (máx. 50MB)</p>
            </div>
            {fileErrors.length > 0 && (
              <div className="alert alert-error">
                {fileErrors.map((e, i) => <div key={i}>{e}</div>)}
              </div>
            )}
            {files.length > 0 && (
              <div className="file-list">
                {files.map((f, i) => (
                  <div key={i} className="file-item">
                    <span>{f.name}</span>
                    <span className="file-size">{formatBytes(f.size)}</span>
                    <button className="btn-icon btn-danger" onClick={() => removeFile(i)}>Quitar</button>
                  </div>
                ))}
              </div>
            )}
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setStep(2)}>Atrás</button>
              <button className="btn btn-primary" onClick={() => setStep(4)}>Siguiente</button>
            </div>
          </div>
        )}

        {/* Step 4: Review */}
        {step === 4 && (
          <div className="form-step">
            <h3>Revise la información</h3>
            <div className="review-section">
              <div className="review-item">
                <span className="review-label">Categoría:</span>
                <span>{formData.categoria}</span>
              </div>
              <div className="review-item">
                <span className="review-label">Título:</span>
                <span>{formData.titulo}</span>
              </div>
              {formData.numero_radicado && (
                <div className="review-item">
                  <span className="review-label">N° Radicado:</span>
                  <span>{formData.numero_radicado}</span>
                </div>
              )}
              <div className="review-item">
                <span className="review-label">Descripción:</span>
                <span>{formData.descripcion || '—'}</span>
              </div>
              <div className="review-item">
                <span className="review-label">Documentos:</span>
                <span>{files.length} archivo(s)</span>
              </div>
            </div>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setStep(3)}>Atrás</button>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
                {submitting ? 'Enviando…' : 'Enviar caso'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
