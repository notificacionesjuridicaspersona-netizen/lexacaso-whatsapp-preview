import { useState, useEffect, useCallback } from 'react';
import { supabase, PRIORIDADES } from '../../lib/supabase';
import type { Expediente, Documento, Profile, Observacion, Seguimiento, HistorialEntry, ConfigEstado } from '../../types';
import {
  searchExpedientes,
  uploadDocument,
  downloadDocument,
  exportExpedienteToDocx,
  exportExpedientesToXlsx,
  exportExpedientesToCsv,
  exportDocumentosToZip,
  previewZipContents,
  extractAndUploadZipFiles,
  logAuditoria,
  formatBytes,
  getFileExtension,
  validateFile,
  sendNotification,
} from '../../lib/helpers';
import Modal from '../ui/Modal';

export default function AdminExpedientes() {
  // Search & filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [filterCliente, setFilterCliente] = useState('');
  const [filterFechaDesde, setFilterFechaDesde] = useState('');
  const [filterFechaHasta, setFilterFechaHasta] = useState('');
  const [page, setPage] = useState(1);
  const [perPage] = useState(20);

  // Results
  const [expedientes, setExpedientes] = useState<(Expediente & { profiles?: Profile })[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Clientes list for filter
  const [clientes, setClientes] = useState<Profile[]>([]);
  const [estados, setEstados] = useState<ConfigEstado[]>([]);

  // Detail modal
  const [selectedExp, setSelectedExp] = useState<(Expediente & { profiles?: Profile }) | null>(null);
  const [expDocumentos, setExpDocumentos] = useState<Documento[]>([]);
  const [expObservaciones, setExpObservaciones] = useState<Observacion[]>([]);
  const [expSeguimientos, setExpSeguimientos] = useState<Seguimiento[]>([]);
  const [expHistorial, setExpHistorial] = useState<HistorialEntry[]>([]);
  const [detailTab, setDetailTab] = useState<'info' | 'documentos' | 'seguimientos' | 'observaciones' | 'historial'>('info');
  const [detailLoading, setDetailLoading] = useState(false);

  // New expediente modal
  const [showNewModal, setShowNewModal] = useState(false);
  const [newExp, setNewExp] = useState({
    user_id: '',
    titulo: '',
    descripcion: '',
    area_juridica: '',
    numero_expediente: '',
    numero_radicado: '',
    estado: 'Recibido',
    prioridad: 'Media',
  });

  // Import modal
  const [showImportModal, setShowImportModal] = useState(false);
  const [importTarget, setImportTarget] = useState<Expediente | null>(null);
  const [importFiles, setImportFiles] = useState<File[]>([]);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number; name: string; status: 'pending' | 'success' | 'error'; error?: string }[]>([]);
  const [importRunning, setImportRunning] = useState(false);

  // ZIP preview
  const [zipPreview, setZipPreview] = useState<{ name: string; size: number }[] | null>(null);
  const [zipSelectedFiles, setZipSelectedFiles] = useState<string[]>([]);
  const [zipFileName, setZipFileName] = useState('');

  // Export modal
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportTarget, setExportTarget] = useState<(Expediente & { profiles?: Profile }) | null>(null);
  const [exportOptions, setExportOptions] = useState({
    incluirDocumentos: true,
    incluirSeguimientos: true,
    incluirObservaciones: true,
    incluirHistorial: true,
    incluirAnalisis: false,
  });

  // Send document modal
  const [showSendDocModal, setShowSendDocModal] = useState(false);
  const [sendDocFile, setSendDocFile] = useState<File | null>(null);
  const [sendDocMessage, setSendDocMessage] = useState('');
  const [sendDocClasificacion, setSendDocClasificacion] = useState<'entregable' | 'interno'>('entregable');

  // Edit expediente
  const [editingExp, setEditingExp] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Expediente>>({});

  // Observacion form
  const [newObservacion, setNewObservacion] = useState('');
  const [obsVisible, setObsVisible] = useState(false);

  // Seguimiento form
  const [newSeguimiento, setNewSeguimiento] = useState({
    tipo_actuacion: '',
    descripcion: '',
    fecha_actuacion: new Date().toISOString().split('T')[0],
    fecha_vencimiento: '',
    estado: 'Pendiente',
  });
  const [tiposActuacion, setTiposActuacion] = useState<string[]>([]);

  // Client profile modal
  const [clientProfile, setClientProfile] = useState<Profile | null>(null);
  const [clientExpedientes, setClientExpedientes] = useState<Expediente[]>([]);

  const loadInitialData = useCallback(async () => {
    try {
      const [clientesRes, estadosRes, tiposRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('rol', 'cliente').order('nombre_completo'),
        supabase.from('config_estados').select('*').order('orden'),
        supabase.from('config_tipos_actuacion').select('nombre').order('orden'),
      ]);
      if (clientesRes.data) setClientes(clientesRes.data as Profile[]);
      if (estadosRes.data) setEstados(estadosRes.data as ConfigEstado[]);
      if (tiposRes.data) setTiposActuacion(tiposRes.data.map((t) => t.nombre));
    } catch (e) {
      // ignore
    }
  }, []);

  const doSearch = useCallback(async () => {
    setLoading(true);
    setError(null);
    setHasSearched(true);

    const result = await searchExpedientes({
      query: searchQuery,
      clienteId: filterCliente || undefined,
      estado: filterEstado || undefined,
      fechaDesde: filterFechaDesde || undefined,
      fechaHasta: filterFechaHasta || undefined,
      page,
      perPage,
    });

    if (result.error) {
      setError(result.error);
      setExpedientes([]);
      setTotal(0);
    } else {
      setExpedientes(result.data);
      setTotal(result.total);
    }
    setLoading(false);
  }, [searchQuery, filterCliente, filterEstado, filterFechaDesde, filterFechaHasta, page, perPage]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  useEffect(() => {
    doSearch();
  }, [doSearch]);

  const handleSearch = () => {
    setPage(1);
    doSearch();
  };

  const handleClear = () => {
    setSearchQuery('');
    setFilterEstado('');
    setFilterCliente('');
    setFilterFechaDesde('');
    setFilterFechaHasta('');
    setPage(1);
  };

  const openExpedienteDetail = async (exp: Expediente & { profiles?: Profile }) => {
    setSelectedExp(exp);
    setDetailTab('info');
    setDetailLoading(true);
    setEditingExp(false);
    setEditForm(exp);

    try {
      const [docRes, obsRes, segRes, histRes] = await Promise.all([
        supabase.from('documentos').select('*').eq('expediente_id', exp.id).order('created_at', { ascending: false }),
        supabase.from('observaciones').select('*, autor:profiles!observaciones_autor_id_fkey(*)').eq('expediente_id', exp.id).order('created_at', { ascending: false }),
        supabase.from('seguimientos').select('*').eq('expediente_id', exp.id).order('fecha_actuacion', { ascending: false }),
        supabase.from('historial_expedientes').select('*').eq('expediente_id', exp.id).order('created_at', { ascending: false }),
      ]);

      if (docRes.data) setExpDocumentos(docRes.data as Documento[]);
      if (obsRes.data) setExpObservaciones(obsRes.data as Observacion[]);
      if (segRes.data) setExpSeguimientos(segRes.data as Seguimiento[]);
      if (histRes.data) setExpHistorial(histRes.data as HistorialEntry[]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCreateExpediente = async () => {
    if (!newExp.user_id || !newExp.titulo) {
      setError('Cliente y título son obligatorios');
      return;
    }

    const { data, error } = await supabase
      .from('expedientes')
      .insert({
        user_id: newExp.user_id,
        titulo: newExp.titulo,
        descripcion: newExp.descripcion || null,
        area_juridica: newExp.area_juridica || null,
        numero_expediente: newExp.numero_expediente || null,
        numero_radicado: newExp.numero_radicado || null,
        estado: newExp.estado,
        prioridad: newExp.prioridad,
      })
      .select('*, profiles!expedientes_user_id_fkey(*)')
      .single();

    if (error) {
      setError(error.message);
      return;
    }

    await logAuditoria('crear_expediente', `Expediente: ${newExp.titulo}`, 'expediente', data.id);

    // Send notification to client
    const client = clientes.find((c) => c.id === newExp.user_id);
    if (client) {
      await sendNotification(
        client.email,
        'Nuevo expediente creado',
        `Se ha creado el expediente "${newExp.titulo}" en su cuenta de LEXACASO.`
      );
    }

    setShowNewModal(false);
    setNewExp({
      user_id: '', titulo: '', descripcion: '', area_juridica: '',
      numero_expediente: '', numero_radicado: '', estado: 'Recibido', prioridad: 'Media',
    });
    doSearch();
  };

  const handleSaveEdit = async () => {
    if (!selectedExp) return;
    const updates: Record<string, unknown> = {};
    if (editForm.titulo !== selectedExp.titulo) updates.titulo = editForm.titulo;
    if (editForm.estado !== selectedExp.estado) {
      updates.estado = editForm.estado;
      // Log history
      await supabase.from('historial_expedientes').insert({
        expediente_id: selectedExp.id,
        campo: 'estado',
        valor_anterior: selectedExp.estado,
        valor_nuevo: editForm.estado,
      });
    }
    if (editForm.prioridad !== selectedExp.prioridad) {
      updates.prioridad = editForm.prioridad;
      await supabase.from('historial_expedientes').insert({
        expediente_id: selectedExp.id,
        campo: 'prioridad',
        valor_anterior: selectedExp.prioridad,
        valor_nuevo: editForm.prioridad,
      });
    }
    if (editForm.descripcion !== selectedExp.descripcion) updates.descripcion = editForm.descripcion;
    if (editForm.area_juridica !== selectedExp.area_juridica) updates.area_juridica = editForm.area_juridica;
    if (editForm.numero_radicado !== selectedExp.numero_radicado) updates.numero_radicado = editForm.numero_radicado;

    if (Object.keys(updates).length > 0) {
      const { error } = await supabase.from('expedientes').update(updates).eq('id', selectedExp.id);
      if (error) {
        setError(error.message);
        return;
      }
      await logAuditoria('editar_expediente', `Expediente: ${selectedExp.titulo}`, 'expediente', selectedExp.id);
    }

    setEditingExp(false);
    openExpedienteDetail({ ...selectedExp, ...editForm } as Expediente & { profiles?: Profile });
    doSearch();
  };

  const handleImportFiles = async () => {
    if (!importTarget || importFiles.length === 0) return;
    setImportRunning(true);
    const userId = importTarget.user_id;
    const progress: typeof importProgress = importFiles.map((f) => ({
      current: 0, total: importFiles.length, name: f.name, status: 'pending' as const,
    }));
    setImportProgress(progress);

    for (let i = 0; i < importFiles.length; i++) {
      const file = importFiles[i];
      const ext = getFileExtension(file.name);

      // Update progress
      setImportProgress((prev) => prev.map((p, idx) => idx === i ? { ...p, status: 'pending' as const } : p));

      if (ext === 'zip') {
        // Handle ZIP: extract and upload
        const result = await extractAndUploadZipFiles(file, importTarget.id, userId, null);
        setImportProgress((prev) => prev.map((p, idx) =>
          idx === i ? { ...p, status: result.failed === 0 ? 'success' as const : 'error' as const, error: result.errors.join('; ') || undefined } : p
        ));
      } else {
        const result = await uploadDocument(file, importTarget.id, userId);
        setImportProgress((prev) => prev.map((p, idx) =>
          idx === i ? { ...p, status: result.success ? 'success' as const : 'error' as const, error: result.error } : p
        ));
      }
    }

    setImportRunning(false);
    // Refresh documentos if detail open
    if (selectedExp?.id === importTarget.id) {
      const { data } = await supabase.from('documentos').select('*').eq('expediente_id', importTarget.id).order('created_at', { ascending: false });
      if (data) setExpDocumentos(data as Documento[]);
    }
    await logAuditoria('importar_documentos', `${importFiles.length} archivo(s) al expediente: ${importTarget.titulo}`, 'expediente', importTarget.id);
    doSearch();
  };

  const handleZipPreview = async (file: File) => {
    const result = await previewZipContents(file);
    if (result.error) {
      setError(result.error);
      setZipPreview(null);
      return;
    }
    setZipPreview(result.entries);
    setZipSelectedFiles(result.entries.map((e) => e.name));
    setZipFileName(file.name);
  };

  const handleDownloadDoc = async (doc: Documento) => {
    const result = await downloadDocument(doc);
    if (!result.success) {
      setError(result.error || 'Error al descargar');
    } else {
      await logAuditoria('descargar_documento', `Documento: ${doc.nombre}`, 'documento', doc.id);
    }
  };

  const handleExportDocx = async () => {
    if (!exportTarget) return;
    // Load full data for export
    const [docRes, obsRes, segRes, histRes] = await Promise.all([
      supabase.from('documentos').select('*').eq('expediente_id', exportTarget.id).order('created_at', { ascending: false }),
      supabase.from('observaciones').select('*').eq('expediente_id', exportTarget.id).order('created_at', { ascending: false }),
      supabase.from('seguimientos').select('*').eq('expediente_id', exportTarget.id).order('fecha_actuacion', { ascending: false }),
      supabase.from('historial_expedientes').select('*').eq('expediente_id', exportTarget.id).order('created_at', { ascending: false }),
    ]);

    const fullExp = {
      ...exportTarget,
      documentos: docRes.data || [],
      observaciones: (obsRes.data || []) as Observacion[],
      seguimientos: (segRes.data || []) as Seguimiento[],
      historial: (histRes.data || []) as HistorialEntry[],
    };

    await exportExpedienteToDocx(fullExp, exportOptions);
    await logAuditoria('exportar_docx', `Expediente: ${exportTarget.titulo}`, 'expediente', exportTarget.id);
    setShowExportModal(false);
  };

  const handleExportXlsx = async () => {
    await exportExpedientesToXlsx(expedientes);
    await logAuditoria('exportar_xlsx', `${expedientes.length} expedientes`, 'expediente', null);
  };

  const handleExportZip = async () => {
    if (!exportTarget) return;
    const docs = expDocumentos.length > 0 ? expDocumentos : [];
    if (docs.length === 0) {
      const { data } = await supabase.from('documentos').select('*').eq('expediente_id', exportTarget.id);
      if (data) {
        const result = await exportDocumentosToZip(data as Documento[], exportTarget.titulo);
        if (!result.success) setError(result.error || 'Error');
      }
    } else {
      const result = await exportDocumentosToZip(docs, exportTarget.titulo);
      if (!result.success) setError(result.error || 'Error');
    }
    await logAuditoria('exportar_zip', `Documentos del expediente: ${exportTarget.titulo}`, 'expediente', exportTarget.id);
  };

  const handleAddObservacion = async () => {
    if (!selectedExp || !newObservacion.trim()) return;
    const { error } = await supabase.from('observaciones').insert({
      expediente_id: selectedExp.id,
      contenido: newObservacion,
      visible_cliente: obsVisible,
    });
    if (error) {
      setError(error.message);
      return;
    }
    setNewObservacion('');
    setObsVisible(false);
    // Refresh
    const { data } = await supabase.from('observaciones').select('*, autor:profiles!observaciones_autor_id_fkey(*)').eq('expediente_id', selectedExp.id).order('created_at', { ascending: false });
    if (data) setExpObservaciones(data as Observacion[]);
  };

  const handleAddSeguimiento = async () => {
    if (!selectedExp || !newSeguimiento.tipo_actuacion || !newSeguimiento.descripcion) return;
    const { error } = await supabase.from('seguimientos').insert({
      expediente_id: selectedExp.id,
      tipo_actuacion: newSeguimiento.tipo_actuacion,
      descripcion: newSeguimiento.descripcion,
      fecha_actuacion: newSeguimiento.fecha_actuacion,
      fecha_vencimiento: newSeguimiento.fecha_vencimiento || null,
      estado: newSeguimiento.estado,
    });
    if (error) {
      setError(error.message);
      return;
    }
    setNewSeguimiento({
      tipo_actuacion: '', descripcion: '',
      fecha_actuacion: new Date().toISOString().split('T')[0],
      fecha_vencimiento: '', estado: 'Pendiente',
    });
    const { data } = await supabase.from('seguimientos').select('*').eq('expediente_id', selectedExp.id).order('fecha_actuacion', { ascending: false });
    if (data) setExpSeguimientos(data as Seguimiento[]);
  };

  const handleSendDocument = async () => {
    if (!sendDocFile || !selectedExp) return;
    const validation = validateFile(sendDocFile);
    if (!validation.valid) {
      setError(validation.error || 'Error de validación');
      return;
    }

    const ext = getFileExtension(sendDocFile.name);
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const filePath = `${selectedExp.user_id}/${selectedExp.id}/${timestamp}-${random}.${ext}`;

    const { error: uploadError } = await supabase.storage.from('documentos').upload(filePath, sendDocFile);
    if (uploadError) {
      setError(uploadError.message);
      return;
    }

    const { error: dbError } = await supabase.from('documentos').insert({
      expediente_id: selectedExp.id,
      user_id: selectedExp.user_id,
      nombre: sendDocFile.name,
      ruta_storage: filePath,
      tipo_mime: sendDocFile.type || 'application/octet-stream',
      tamano_bytes: sendDocFile.size,
      extension: ext,
      visible_cliente: sendDocClasificacion === 'entregable',
      remitente_id: selectedExp.user_id,
      mensaje_admin: sendDocMessage || null,
    });

    if (dbError) {
      await supabase.storage.from('documentos').remove([filePath]);
      setError(dbError.message);
      return;
    }

    await logAuditoria('enviar_documento', `Documento: ${sendDocFile.name} al expediente: ${selectedExp.titulo}`, 'documento', null);

    // Send notification to client
    const client = selectedExp.profiles;
    if (client && sendDocClasificacion === 'entregable') {
      await sendNotification(
        client.email,
        'Nuevo documento disponible',
        `Tiene un nuevo documento "${sendDocFile.name}" en su expediente "${selectedExp.titulo}". ${sendDocMessage || ''}`
      );
    }

    setShowSendDocModal(false);
    setSendDocFile(null);
    setSendDocMessage('');
    setSendDocClasificacion('entregable');

    // Refresh documentos
    const { data } = await supabase.from('documentos').select('*').eq('expediente_id', selectedExp.id).order('created_at', { ascending: false });
    if (data) setExpDocumentos(data as Documento[]);
  };

  const viewClientProfile = async (profile: Profile) => {
    setClientProfile(profile);
    const { data } = await supabase.from('expedientes').select('*').eq('user_id', profile.id).order('created_at', { ascending: false });
    if (data) setClientExpedientes(data as Expediente[]);
  };

  const totalPages = Math.ceil(total / perPage);

  return (
    <div className="admin-expedientes">
      <div className="page-header">
        <h1>Gestión de Expedientes</h1>
        <p>Busque, filtre y administre todos los expedientes</p>
      </div>

      {error && (
        <div className="alert alert-error">
          {error}
          <button className="alert-close" onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Search & Filters Bar */}
      <div className="search-bar">
        <div className="search-row">
          <input
            type="text"
            className="search-input"
            placeholder="Buscar por título, descripción, número de expediente, radicado, nombre o cédula del cliente…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
        </div>
        <div className="filter-row">
          <select value={filterCliente} onChange={(e) => setFilterCliente(e.target.value)} className="filter-select">
            <option value="">Todos los clientes</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre_completo}</option>
            ))}
          </select>
          <select value={filterEstado} onChange={(e) => setFilterEstado(e.target.value)} className="filter-select">
            <option value="">Todos los estados</option>
            {estados.map((e) => (
              <option key={e.id} value={e.nombre}>{e.nombre}</option>
            ))}
          </select>
          <input type="date" value={filterFechaDesde} onChange={(e) => setFilterFechaDesde(e.target.value)} className="filter-date" title="Desde" />
          <input type="date" value={filterFechaHasta} onChange={(e) => setFilterFechaHasta(e.target.value)} className="filter-date" title="Hasta" />
          <button className="btn btn-primary btn-sm" onClick={handleSearch} disabled={loading}>Buscar</button>
          <button className="btn btn-secondary btn-sm" onClick={handleClear}>Limpiar</button>
        </div>
        <div className="action-row">
          <button className="btn btn-secondary btn-sm" onClick={() => { setImportTarget(null); setImportFiles([]); setShowImportModal(true); }}>
            Importar documentos
          </button>
          <button className="btn btn-secondary btn-sm" onClick={handleExportXlsx} disabled={expedientes.length === 0}>
            Exportar XLSX
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => exportExpedientesToCsv(expedientes)} disabled={expedientes.length === 0}>
            Exportar CSV
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowNewModal(true)}>
            Nuevo expediente
          </button>
        </div>
      </div>

      {/* Results count */}
      <div className="results-info">
        {loading ? 'Buscando…' : `${total} resultado(s)`}
      </div>

      {/* Results table */}
      {loading ? (
        <div className="loading-state">Cargando expedientes…</div>
      ) : expedientes.length === 0 ? (
        <div className="empty-state">
          <p>{hasSearched ? 'No se encontraron expedientes con los criterios especificados.' : 'No hay expedientes registrados.'}</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Título</th>
                <th>Cliente</th>
                <th>N° Expediente</th>
                <th>N° Radicado</th>
                <th>Estado</th>
                <th>Prioridad</th>
                <th>Documentos</th>
                <th>Fecha</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {expedientes.map((exp) => (
                <tr key={exp.id}>
                  <td className="cell-title">{exp.titulo}</td>
                  <td>
                    <button className="link-btn" onClick={() => viewClientProfile(exp.profiles!)}>
                      {exp.profiles?.nombre_completo || '—'}
                    </button>
                  </td>
                  <td>{exp.numero_expediente || '—'}</td>
                  <td>{exp.numero_radicado || '—'}</td>
                  <td>
                    <span className="badge badge-status" style={{
                      backgroundColor: estados.find((e) => e.nombre === exp.estado)?.color || '#6b7280'
                    }}>
                      {exp.estado}
                    </span>
                  </td>
                  <td>
                    <span className={`badge badge-priority priority-${exp.prioridad.toLowerCase()}`}>{exp.prioridad}</span>
                  </td>
                  <td>—</td>
                  <td>{new Date(exp.created_at).toLocaleDateString('es-CO')}</td>
                  <td className="actions-cell">
                    <button className="btn-icon" title="Ver expediente" onClick={() => openExpedienteDetail(exp)}>Ver</button>
                    <button className="btn-icon" title="Importar documentos" onClick={() => {
                      setImportTarget(exp);
                      setImportFiles([]);
                      setShowImportModal(true);
                    }}>Importar</button>
                    <button className="btn-icon" title="Exportar" onClick={() => {
                      setExportTarget(exp);
                      setShowExportModal(true);
                    }}>Exportar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="pagination">
          <button disabled={page === 1} onClick={() => setPage(page - 1)}>Anterior</button>
          <span>Página {page} de {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Siguiente</button>
        </div>
      )}

      {/* Detail Modal */}
      <Modal open={!!selectedExp} onClose={() => setSelectedExp(null)} title={selectedExp?.titulo || ''} size="xl">
        {selectedExp && (
          <div className="expediente-detail">
            <div className="detail-tabs">
              <button className={detailTab === 'info' ? 'active' : ''} onClick={() => setDetailTab('info')}>Información</button>
              <button className={detailTab === 'documentos' ? 'active' : ''} onClick={() => setDetailTab('documentos')}>Documentos ({expDocumentos.length})</button>
              <button className={detailTab === 'seguimientos' ? 'active' : ''} onClick={() => setDetailTab('seguimientos')}>Actuaciones ({expSeguimientos.length})</button>
              <button className={detailTab === 'observaciones' ? 'active' : ''} onClick={() => setDetailTab('observaciones')}>Observaciones ({expObservaciones.length})</button>
              <button className={detailTab === 'historial' ? 'active' : ''} onClick={() => setDetailTab('historial')}>Historial ({expHistorial.length})</button>
            </div>

            {detailLoading ? (
              <div className="loading-state">Cargando detalle…</div>
            ) : (
              <>
                {/* INFO TAB */}
                {detailTab === 'info' && (
                  <div className="detail-section">
                    {editingExp ? (
                      <div className="edit-form">
                        <div className="form-group">
                          <label>Título</label>
                          <input value={editForm.titulo || ''} onChange={(e) => setEditForm({ ...editForm, titulo: e.target.value })} />
                        </div>
                        <div className="form-row">
                          <div className="form-group">
                            <label>Estado</label>
                            <select value={editForm.estado || ''} onChange={(e) => setEditForm({ ...editForm, estado: e.target.value })}>
                              {estados.map((e) => <option key={e.id} value={e.nombre}>{e.nombre}</option>)}
                            </select>
                          </div>
                          <div className="form-group">
                            <label>Prioridad</label>
                            <select value={editForm.prioridad || ''} onChange={(e) => setEditForm({ ...editForm, prioridad: e.target.value })}>
                              {PRIORIDADES.map((p) => <option key={p} value={p}>{p}</option>)}
                            </select>
                          </div>
                        </div>
                        <div className="form-row">
                          <div className="form-group">
                            <label>N° Radicado</label>
                            <input value={editForm.numero_radicado || ''} onChange={(e) => setEditForm({ ...editForm, numero_radicado: e.target.value })} />
                          </div>
                          <div className="form-group">
                            <label>Área Jurídica</label>
                            <input value={editForm.area_juridica || ''} onChange={(e) => setEditForm({ ...editForm, area_juridica: e.target.value })} />
                          </div>
                        </div>
                        <div className="form-group">
                          <label>Descripción</label>
                          <textarea value={editForm.descripcion || ''} onChange={(e) => setEditForm({ ...editForm, descripcion: e.target.value })} rows={4} />
                        </div>
                        <div className="form-actions">
                          <button className="btn btn-primary btn-sm" onClick={handleSaveEdit}>Guardar</button>
                          <button className="btn btn-secondary btn-sm" onClick={() => { setEditingExp(false); setEditForm(selectedExp); }}>Cancelar</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="info-grid">
                          <div className="info-item">
                            <span className="info-label">Cliente</span>
                            <span className="info-value">
                              <button className="link-btn" onClick={() => selectedExp.profiles && viewClientProfile(selectedExp.profiles)}>
                                {selectedExp.profiles?.nombre_completo || '—'}
                              </button>
                            </span>
                          </div>
                          <div className="info-item">
                            <span className="info-label">N° Expediente</span>
                            <span className="info-value">{selectedExp.numero_expediente || '—'}</span>
                          </div>
                          <div className="info-item">
                            <span className="info-label">N° Radicado</span>
                            <span className="info-value">{selectedExp.numero_radicado || '—'}</span>
                          </div>
                          <div className="info-item">
                            <span className="info-label">Estado</span>
                            <span className="info-value">
                              <span className="badge badge-status" style={{ backgroundColor: estados.find((e) => e.nombre === selectedExp.estado)?.color || '#6b7280' }}>
                                {selectedExp.estado}
                              </span>
                            </span>
                          </div>
                          <div className="info-item">
                            <span className="info-label">Prioridad</span>
                            <span className="info-value">{selectedExp.prioridad}</span>
                          </div>
                          <div className="info-item">
                            <span className="info-label">Área Jurídica</span>
                            <span className="info-value">{selectedExp.area_juridica || '—'}</span>
                          </div>
                          <div className="info-item">
                            <span className="info-label">Fecha de creación</span>
                            <span className="info-value">{new Date(selectedExp.created_at).toLocaleDateString('es-CO')}</span>
                          </div>
                          <div className="info-item">
                            <span className="info-label">Última actualización</span>
                            <span className="info-value">{new Date(selectedExp.updated_at).toLocaleDateString('es-CO')}</span>
                          </div>
                        </div>
                        {selectedExp.descripcion && (
                          <div className="info-block">
                            <h4>Descripción</h4>
                            <p>{selectedExp.descripcion}</p>
                          </div>
                        )}
                        {selectedExp.profiles && (
                          <div className="info-block">
                            <h4>Datos del cliente</h4>
                            <div className="info-grid">
                              <div className="info-item">
                                <span className="info-label">Email</span>
                                <span className="info-value">{selectedExp.profiles.email}</span>
                              </div>
                              <div className="info-item">
                                <span className="info-label">Cédula</span>
                                <span className="info-value">{selectedExp.profiles.cedula || '—'}</span>
                              </div>
                              <div className="info-item">
                                <span className="info-label">Celular</span>
                                <span className="info-value">{selectedExp.profiles.celular || '—'}</span>
                              </div>
                              <div className="info-item">
                                <span className="info-label">Dirección</span>
                                <span className="info-value">{selectedExp.profiles.direccion || '—'}</span>
                              </div>
                            </div>
                          </div>
                        )}
                        <div className="form-actions">
                          <button className="btn btn-primary btn-sm" onClick={() => setEditingExp(true)}>Editar</button>
                          <button className="btn btn-secondary btn-sm" onClick={() => { setImportTarget(selectedExp); setImportFiles([]); setShowImportModal(true); }}>Importar documentos</button>
                          <button className="btn btn-secondary btn-sm" onClick={() => { setSendDocFile(null); setShowSendDocModal(true); }}>Enviar documento al cliente</button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* DOCUMENTOS TAB */}
                {detailTab === 'documentos' && (
                  <div className="detail-section">
                    <div className="section-actions">
                      <button className="btn btn-secondary btn-sm" onClick={() => {
                        setImportTarget(selectedExp);
                        setImportFiles([]);
                        setShowImportModal(true);
                      }}>Importar documentos</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => {
                        setExportTarget(selectedExp);
                        setShowExportModal(true);
                      }}>Exportar documentos (ZIP)</button>
                    </div>
                    {expDocumentos.length === 0 ? (
                      <div className="empty-state"><p>No hay documentos en este expediente.</p></div>
                    ) : (
                      <div className="documentos-list">
                        {expDocumentos.map((doc) => (
                          <div key={doc.id} className="documento-item">
                            <div className="doc-info">
                              <span className="doc-name">{doc.nombre}</span>
                              <span className="doc-meta">{formatBytes(doc.tamano_bytes)} · {doc.extension?.toUpperCase()} · {new Date(doc.created_at).toLocaleDateString('es-CO')}</span>
                              {doc.mensaje_admin && <span className="doc-message">Mensaje: {doc.mensaje_admin}</span>}
                              <span className="doc-badges">
                                {doc.visible_cliente ? (
                                  <span className="badge badge-green">Visible al cliente</span>
                                ) : (
                                  <span className="badge badge-gray">Interno</span>
                                )}
                                {doc.consultado ? (
                                  <span className="badge badge-blue">Consultado</span>
                                ) : (
                                  <span className="badge badge-orange">Nuevo</span>
                                )}
                              </span>
                            </div>
                            <button className="btn btn-secondary btn-sm" onClick={() => handleDownloadDoc(doc)}>Descargar</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* SEGUIMIENTOS TAB */}
                {detailTab === 'seguimientos' && (
                  <div className="detail-section">
                    <div className="inline-form">
                      <select value={newSeguimiento.tipo_actuacion} onChange={(e) => setNewSeguimiento({ ...newSeguimiento, tipo_actuacion: e.target.value })}>
                        <option value="">Tipo de actuación…</option>
                        {tiposActuacion.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <input type="text" placeholder="Descripción" value={newSeguimiento.descripcion} onChange={(e) => setNewSeguimiento({ ...newSeguimiento, descripcion: e.target.value })} />
                      <input type="date" value={newSeguimiento.fecha_actuacion} onChange={(e) => setNewSeguimiento({ ...newSeguimiento, fecha_actuacion: e.target.value })} />
                      <input type="date" placeholder="Vencimiento" value={newSeguimiento.fecha_vencimiento} onChange={(e) => setNewSeguimiento({ ...newSeguimiento, fecha_vencimiento: e.target.value })} />
                      <select value={newSeguimiento.estado} onChange={(e) => setNewSeguimiento({ ...newSeguimiento, estado: e.target.value })}>
                        <option value="Pendiente">Pendiente</option>
                        <option value="En proceso">En proceso</option>
                        <option value="Completado">Completado</option>
                      </select>
                      <button className="btn btn-primary btn-sm" onClick={handleAddSeguimiento}>Agregar</button>
                    </div>
                    {expSeguimientos.length === 0 ? (
                      <div className="empty-state"><p>No hay actuaciones registradas.</p></div>
                    ) : (
                      <div className="timeline">
                        {expSeguimientos.map((seg) => (
                          <div key={seg.id} className="timeline-item">
                            <div className="timeline-marker"></div>
                            <div className="timeline-content">
                              <div className="timeline-header">
                                <strong>{seg.tipo_actuacion}</strong>
                                <span className="badge badge-status" style={{ backgroundColor: seg.estado === 'Completado' ? '#10b981' : seg.estado === 'En proceso' ? '#f59e0b' : '#6b7280' }}>{seg.estado}</span>
                              </div>
                              <p>{seg.descripcion}</p>
                              <div className="timeline-meta">
                                <span>Fecha: {seg.fecha_actuacion}</span>
                                {seg.fecha_vencimiento && <span>Vencimiento: {seg.fecha_vencimiento}</span>}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* OBSERVACIONES TAB */}
                {detailTab === 'observaciones' && (
                  <div className="detail-section">
                    <div className="inline-form">
                      <input type="text" placeholder="Nueva observación…" value={newObservacion} onChange={(e) => setNewObservacion(e.target.value)} />
                      <label className="checkbox-inline">
                        <input type="checkbox" checked={obsVisible} onChange={(e) => setObsVisible(e.target.checked)} />
                        Visible al cliente
                      </label>
                      <button className="btn btn-primary btn-sm" onClick={handleAddObservacion}>Agregar</button>
                    </div>
                    {expObservaciones.length === 0 ? (
                      <div className="empty-state"><p>No hay observaciones.</p></div>
                    ) : (
                      <div className="observaciones-list">
                        {expObservaciones.map((obs) => (
                          <div key={obs.id} className="observacion-item">
                            <p>{obs.contenido}</p>
                            <div className="obs-meta">
                              <span>{obs.autor?.nombre_completo || 'Admin'}</span>
                              <span>{new Date(obs.created_at).toLocaleDateString('es-CO')}</span>
                              {obs.visible_cliente ? (
                                <span className="badge badge-green">Visible</span>
                              ) : (
                                <span className="badge badge-gray">Interna</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* HISTORIAL TAB */}
                {detailTab === 'historial' && (
                  <div className="detail-section">
                    {expHistorial.length === 0 ? (
                      <div className="empty-state"><p>No hay cambios registrados.</p></div>
                    ) : (
                      <div className="historial-list">
                        {expHistorial.map((h) => (
                          <div key={h.id} className="historial-item">
                            <span className="hist-field">{h.campo}</span>
                            <span className="hist-change">{h.valor_anterior || '(vacío)'} → {h.valor_nuevo || '(vacío)'}</span>
                            <span className="hist-date">{new Date(h.created_at).toLocaleDateString('es-CO')}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </Modal>

      {/* New Expediente Modal */}
      <Modal open={showNewModal} onClose={() => setShowNewModal(false)} title="Nuevo expediente" size="md">
        <div className="form-group">
          <label>Cliente *</label>
          <select value={newExp.user_id} onChange={(e) => setNewExp({ ...newExp, user_id: e.target.value })}>
            <option value="">Seleccione un cliente…</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre_completo} ({c.email})</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Título *</label>
          <input value={newExp.titulo} onChange={(e) => setNewExp({ ...newExp, titulo: e.target.value })} placeholder="Título del caso" />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>N° Expediente</label>
            <input value={newExp.numero_expediente} onChange={(e) => setNewExp({ ...newExp, numero_expediente: e.target.value })} />
          </div>
          <div className="form-group">
            <label>N° Radicado</label>
            <input value={newExp.numero_radicado} onChange={(e) => setNewExp({ ...newExp, numero_radicado: e.target.value })} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Estado</label>
            <select value={newExp.estado} onChange={(e) => setNewExp({ ...newExp, estado: e.target.value })}>
              {estados.map((e) => <option key={e.id} value={e.nombre}>{e.nombre}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Prioridad</label>
            <select value={newExp.prioridad} onChange={(e) => setNewExp({ ...newExp, prioridad: e.target.value })}>
              {PRIORIDADES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label>Área Jurídica</label>
          <input value={newExp.area_juridica} onChange={(e) => setNewExp({ ...newExp, area_juridica: e.target.value })} placeholder="Ej: Derecho Civil" />
        </div>
        <div className="form-group">
          <label>Descripción</label>
          <textarea value={newExp.descripcion} onChange={(e) => setNewExp({ ...newExp, descripcion: e.target.value })} rows={4} placeholder="Descripción del caso" />
        </div>
        <div className="form-actions">
          <button className="btn btn-primary" onClick={handleCreateExpediente}>Crear expediente</button>
          <button className="btn btn-secondary" onClick={() => setShowNewModal(false)}>Cancelar</button>
        </div>
      </Modal>

      {/* Import Modal */}
      <Modal open={showImportModal} onClose={() => !importRunning && setShowImportModal(false)} title={importTarget ? `Importar a: ${importTarget.titulo}` : 'Importar documentos'} size="lg">
        {!importTarget && (
          <div className="form-group">
            <label>Seleccione el expediente destino</label>
            <select onChange={(e) => {
              const exp = expedientes.find((ex) => ex.id === e.target.value);
              if (exp) setImportTarget(exp);
            }}>
              <option value="">Seleccione…</option>
              {expedientes.map((e) => <option key={e.id} value={e.id}>{e.titulo}</option>)}
            </select>
          </div>
        )}
        {importTarget && (
          <>
            <div className="import-zone">
              <input
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.xls,.xlsx,.zip,.rar,.jpg,.jpeg,.png"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  setImportFiles(files);
                  setImportProgress([]);
                  setZipPreview(null);
                  // If single ZIP, preview contents
                  if (files.length === 1 && getFileExtension(files[0].name) === 'zip') {
                    handleZipPreview(files[0]);
                  }
                }}
                disabled={importRunning}
              />
              <p className="import-hint">Formatos permitidos: PDF, DOC, DOCX, XLS, XLSX, ZIP, RAR, JPG, PNG (máx. 50MB)</p>
            </div>

            {/* ZIP Preview */}
            {zipPreview && (
              <div className="zip-preview">
                <h4>Contenido del ZIP: {zipFileName}</h4>
                <p>Seleccione los archivos a importar:</p>
                <div className="zip-file-list">
                  {zipPreview.map((entry) => (
                    <label key={entry.name} className="zip-file-item">
                      <input
                        type="checkbox"
                        checked={zipSelectedFiles.includes(entry.name)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setZipSelectedFiles([...zipSelectedFiles, entry.name]);
                          } else {
                            setZipSelectedFiles(zipSelectedFiles.filter((n) => n !== entry.name));
                          }
                        }}
                      />
                      <span>{entry.name}</span>
                      <span className="zip-file-size">{formatBytes(entry.size)}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Progress */}
            {importProgress.length > 0 && (
              <div className="import-progress">
                {importProgress.map((p, i) => (
                  <div key={i} className={`progress-item progress-${p.status}`}>
                    <span className="progress-name">{p.name}</span>
                    <span className="progress-status">
                      {p.status === 'pending' && '⏳ Procesando…'}
                      {p.status === 'success' && '✓ Subido'}
                      {p.status === 'error' && `✗ ${p.error || 'Error'}`}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="form-actions">
              <button
                className="btn btn-primary"
                onClick={handleImportFiles}
                disabled={importFiles.length === 0 || importRunning}
              >
                {importRunning ? 'Importando…' : `Importar ${importFiles.length} archivo(s)`}
              </button>
              <button className="btn btn-secondary" onClick={() => { if (!importRunning) setShowImportModal(false); }} disabled={importRunning}>
                Cerrar
              </button>
            </div>
          </>
        )}
      </Modal>

      {/* Export Modal */}
      <Modal open={showExportModal} onClose={() => setShowExportModal(false)} title={exportTarget ? `Exportar: ${exportTarget.titulo}` : 'Exportar'} size="md">
        {exportTarget && (
          <div className="export-options">
            <h4>Exportar a Word (DOCX)</h4>
            <p>Seleccione qué secciones incluir:</p>
            <label className="checkbox-label">
              <input type="checkbox" checked={exportOptions.incluirDocumentos} onChange={(e) => setExportOptions({ ...exportOptions, incluirDocumentos: e.target.checked })} />
              <span>Lista de documentos</span>
            </label>
            <label className="checkbox-label">
              <input type="checkbox" checked={exportOptions.incluirSeguimientos} onChange={(e) => setExportOptions({ ...exportOptions, incluirSeguimientos: e.target.checked })} />
              <span>Actuaciones / seguimientos</span>
            </label>
            <label className="checkbox-label">
              <input type="checkbox" checked={exportOptions.incluirObservaciones} onChange={(e) => setExportOptions({ ...exportOptions, incluirObservaciones: e.target.checked })} />
              <span>Observaciones visibles</span>
            </label>
            <label className="checkbox-label">
              <input type="checkbox" checked={exportOptions.incluirHistorial} onChange={(e) => setExportOptions({ ...exportOptions, incluirHistorial: e.target.checked })} />
              <span>Historial de cambios</span>
            </label>
            <div className="form-actions">
              <button className="btn btn-primary" onClick={handleExportDocx}>Exportar a Word</button>
              <button className="btn btn-secondary" onClick={handleExportZip}>Exportar documentos (ZIP)</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Send Document Modal */}
      <Modal open={showSendDocModal} onClose={() => setShowSendDocModal(false)} title="Enviar documento al cliente" size="md">
        <div className="form-group">
          <label>Archivo</label>
          <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.zip,.rar,.jpg,.jpeg,.png" onChange={(e) => setSendDocFile(e.target.files?.[0] || null)} />
        </div>
        <div className="form-group">
          <label>Clasificación</label>
          <select value={sendDocClasificacion} onChange={(e) => setSendDocClasificacion(e.target.value as 'entregable' | 'interno')}>
            <option value="entregable">Entregable (visible al cliente)</option>
            <option value="interno">Interno (no visible al cliente)</option>
          </select>
        </div>
        <div className="form-group">
          <label>Mensaje para el cliente</label>
          <textarea value={sendDocMessage} onChange={(e) => setSendDocMessage(e.target.value)} rows={3} placeholder="Mensaje opcional" />
        </div>
        <div className="form-actions">
          <button className="btn btn-primary" onClick={handleSendDocument} disabled={!sendDocFile}>Enviar</button>
          <button className="btn btn-secondary" onClick={() => setShowSendDocModal(false)}>Cancelar</button>
        </div>
      </Modal>

      {/* Client Profile Modal */}
      <Modal open={!!clientProfile} onClose={() => setClientProfile(null)} title={clientProfile?.nombre_completo || ''} size="md">
        {clientProfile && (
          <div className="client-profile">
            <div className="info-grid">
              <div className="info-item">
                <span className="info-label">Email</span>
                <span className="info-value">{clientProfile.email}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Cédula</span>
                <span className="info-value">{clientProfile.cedula || '—'}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Celular</span>
                <span className="info-value">{clientProfile.celular || '—'}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Dirección</span>
                <span className="info-value">{clientProfile.direccion || '—'}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Rol</span>
                <span className="info-value">{clientProfile.rol}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Registro</span>
                <span className="info-value">{new Date(clientProfile.created_at).toLocaleDateString('es-CO')}</span>
              </div>
            </div>
            <h4>Expedientes del cliente ({clientExpedientes.length})</h4>
            {clientExpedientes.length === 0 ? (
              <p>No tiene expedientes.</p>
            ) : (
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr><th>Título</th><th>Estado</th><th>Fecha</th><th></th></tr>
                  </thead>
                  <tbody>
                    {clientExpedientes.map((e) => (
                      <tr key={e.id}>
                        <td>{e.titulo}</td>
                        <td>{e.estado}</td>
                        <td>{new Date(e.created_at).toLocaleDateString('es-CO')}</td>
                        <td><button className="btn-icon" onClick={() => { setClientProfile(null); openExpedienteDetail({ ...e, profiles: clientProfile }); }}>Ver</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
