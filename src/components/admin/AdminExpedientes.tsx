import { useState, useEffect, useCallback } from 'react';
import { supabase, PRIORIDADES } from '../../lib/supabase';
import type { Expediente, Documento, Profile, Observacion, Seguimiento, HistorialEntry, ConfigEstado, AnalisisJuridico } from '../../types';
import Comentarios from '../shared/Comentarios';
import HerramientasJuridicas from './HerramientasJuridicas';
import {
  searchExpedientes,
  uploadDocument,
  downloadDocument,
  deleteDocument,
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
  const [expAnalisis, setExpAnalisis] = useState<AnalisisJuridico[]>([]);
  const [detailTab, setDetailTab] = useState<'info' | 'documentos' | 'seguimientos' | 'observaciones' | 'comentarios' | 'historial' | 'analisis' | 'herramientas'>('info');
  const [newAnalisis, setNewAnalisis] = useState({ tipo: 'estructurado' as 'estructurado' | 'ia' | 'jurisprudencia', titulo: '', contenido: '', resumen: '' });
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
      const [docRes, obsRes, segRes, histRes, anaRes] = await Promise.all([
        supabase.from('documentos').select('*').eq('expediente_id', exp.id).order('created_at', { ascending: false }),
        supabase.from('observaciones').select('*, autor:profiles!observaciones_autor_id_fkey(*)').eq('expediente_id', exp.id).order('created_at', { ascending: false }),
        supabase.from('seguimientos').select('*').eq('expediente_id', exp.id).order('fecha_actuacion', { ascending: false }),
        supabase.from('historial_expedientes').select('*').eq('expediente_id', exp.id).order('created_at', { ascending: false }),
        supabase.from('analisis_juridicos').select('*').eq('expediente_id', exp.id).order('creado_en', { ascending: false }),
      ]);

      if (docRes.data) setExpDocumentos(docRes.data as Documento[]);
      if (obsRes.data) setExpObservaciones(obsRes.data as Observacion[]);
      if (segRes.data) setExpSeguimientos(segRes.data as Seguimiento[]);
      if (histRes.data) setExpHistorial(histRes.data as HistorialEntry[]);
      if (anaRes.data) setExpAnalisis(anaRes.data as AnalisisJuridico[]);
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
      .select('*, profiles!expedientes_user_id_profiles_fkey(*)')
      .single();

    if (error) {
      setError(error.message);
      return;
    }

    await logAuditoria('crear_expediente', `Expediente: ${newExp.titulo}`, 'expediente', data.id);

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
    if (editForm.entidad_involucrada !== selectedExp.entidad_involucrada) updates.entidad_involucrada = editForm.entidad_involucrada;
    if (editForm.fecha_hechos !== selectedExp.fecha_hechos) updates.fecha_hechos = editForm.fecha_hechos;
    if (editForm.pretensiones !== selectedExp.pretensiones) updates.pretensiones = editForm.pretensiones;
    if (editForm.actuaciones_previas !== selectedExp.actuaciones_previas) updates.actuaciones_previas = editForm.actuaciones_previas;
    if (editForm.observaciones_adicionales !== selectedExp.observaciones_adicionales) updates.observaciones_adicionales = editForm.observaciones_adicionales;

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

    const progress = importFiles.map((f) => ({
      current: 0,
      total: importFiles.length,
      name: f.name,
      status: 'pending' as const,
      error: undefined as string | undefined,
    }));
    setImportProgress(progress);

    for (let i = 0; i < importFiles.length; i++) {
      const file = importFiles[i];
      const ext = getFileExtension(file.name).toLowerCase().replace('.', '');

      setImportProgress((prev) =>
        prev.map((p, idx) => (idx === i ? { ...p, status: 'pending' as const } : p))
      );

      const validation = validateFile(file);
      if (!validation.valid) {
        setImportProgress((prev) =>
          prev.map((p, idx) =>
            idx === i ? { ...p, status: 'error' as const, error: validation.error } : p
          )
        );
        continue;
      }

      if (ext === 'zip') {
        const result = await extractAndUploadZipFiles(file, importTarget.id, userId, null);
        setImportProgress((prev) =>
          prev.map((p, idx) =>
            idx ===
