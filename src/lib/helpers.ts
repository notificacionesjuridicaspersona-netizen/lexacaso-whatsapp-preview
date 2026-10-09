import { supabase, STORAGE_BUCKET, ALLOWED_EXTENSIONS, MAX_FILE_SIZE } from './supabase';
import type { Expediente, Documento, Profile } from '../types';
import JSZip from 'jszip';
import Tesseract from 'tesseract.js';

// ============================================
// OCR AUTOMÁTICO (Extracción de Escaneos y CamScanner)
// ============================================

export async function extraerTextoDeArchivo(file: File): Promise<string> {
  try {
    let texto = await file.text().catch(() => '');
    const textoLimpio = texto.replace(/[^\x20-\x7E\xA0-\xFF\n\r]/g, '').trim();

    if (!textoLimpio || textoLimpio.length < 30) {
      console.log('Documento escaneado detectado. Iniciando OCR automático con Tesseract...');
      const result = await Tesseract.recognize(file, 'spa');
      texto = result.data.text;
    }

    return texto;
  } catch (e) {
    console.error('Error al procesar el archivo con OCR:', e);
    return '';
  }
}

// ============================================
// AUDIT LOG
// ============================================

export async function logAuditoria(
  accion: string,
  detalle?: string,
  entidad?: string,
  entidadId?: string | null
): Promise<void> {
  try {
    await supabase.from('bitacora_auditoria').insert({
      accion,
      detalle,
      entidad,
      entidad_id: entidadId,
    });
  } catch (e) {
    // Silent fail
  }
}

// ============================================
// FILE UPLOAD & VALIDATION
// ============================================

export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
}

export function validateFile(file: File): { valid: boolean; error?: string } {
  const ext = getFileExtension(file.name);
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return { valid: false, error: `Extensión .${ext} no permitida. Formatos válidos: ${ALLOWED_EXTENSIONS.join(', ')}` };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `Archivo demasiado grande. Máximo: 50MB` };
  }
  return { valid: true };
}

export async function uploadDocument(
  file: File,
  expedienteId: string,
  userId: string
): Promise<{ success: boolean; documento?: Documento; error?: string }> {
  const validation = validateFile(file);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const ext = getFileExtension(file.name);
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const filePath = `${userId}/${expedienteId}/${timestamp}-${random}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(filePath, file, {
      contentType: file.type || 'application/octet-stream',
    });

  if (uploadError) {
    return { success: false, error: `Error al subir: ${uploadError.message}` };
  }

  const { data, error: dbError } = await supabase
    .from('documentos')
    .insert({
      expediente_id: expedienteId,
      user_id: userId,
      nombre: file.name,
      ruta_storage: filePath,
      tipo_mime: file.type || 'application/octet-stream',
      tamano_bytes: file.size,
      extension: ext,
    })
    .select()
    .single();

  if (dbError) {
    await supabase.storage.from(STORAGE_BUCKET).remove([filePath]);
    return { success: false, error: `Error al registrar: ${dbError.message}` };
  }

  return { success: true, documento: data };
}

// ============================================
// FILE DOWNLOAD
// ============================================

export async function downloadDocument(doc: Documento): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(doc.ruta_storage, 300);

    if (error || !data) {
      return { success: false, error: `Error al generar enlace: ${error?.message || 'desconocido'}` };
    }

    if (!doc.consultado) {
      await supabase.from('documentos').update({ consultado: true }).eq('id', doc.id);
    }

    const response = await fetch(data.signedUrl);
    if (!response.ok) {
      return { success: false, error: `Error al descargar (${response.status})` };
    }
    const blob = await response.blob();
    triggerBlobDownload(blob, doc.nombre);
    return { success: true };
  } catch (e) {
    return { success: false, error: `Error: ${(e as Error).message}` };
  }
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

// ============================================
// SEARCH EXPEDIENTES
// ============================================

export interface SearchParams {
  query?: string;
  clienteId?: string;
  estado?: string;
  tipoActuacion?: string;
  fechaDesde?: string;
  fechaHasta?: string;
  page?: number;
  perPage?: number;
}

export async function searchExpedientes(params: SearchParams): Promise<{
  data: (Expediente & { profiles?: Profile })[];
  total: number;
  error?: string;
}> {
  const { query, clienteId, estado, fechaDesde, fechaHasta, page = 1, perPage = 20 } = params;
  const offset = (page - 1) * perPage;

  let dbQuery = supabase
    .from('expedientes')
    .select('*, profiles!expedientes_user_id_profiles_fkey(*)', { count: 'exact' });

  if (clienteId) {
    dbQuery = dbQuery.eq('user_id', clienteId);
  }
  if (estado) {
    dbQuery = dbQuery.eq('estado', estado);
  }
  if (fechaDesde) {
    dbQuery = dbQuery.gte('created_at', fechaDesde);
  }
  if (fechaHasta) {
    dbQuery = dbQuery.lte('created_at', fechaHasta + 'T23:59:59');
  }
  if (query && query.trim()) {
    const q = query.trim();
    dbQuery = dbQuery.or(
      `titulo.ilike.%${q}%,descripcion.ilike.%${q}%,numero_expediente.ilike.%${q}%,numero_radicado.ilike.%${q}%`
    );
  }

  dbQuery = dbQuery.order('created_at', { ascending: false }).range(offset, offset + perPage - 1);

  const { data, error, count } = await dbQuery;

  if (error) {
    return { data: [], total: 0, error: error.message };
  }

  let results = data || [];
  if (query && query.trim() && !clienteId) {
    const q = query.trim().toLowerCase();
    const { data: matchingProfiles } = await supabase
      .from('profiles')
      .select('id, nombre_completo, cedula, email')
      .or(`nombre_completo.ilike.%${q}%,cedula.ilike.%${q}%,email.ilike.%${q}%`);

    if (matchingProfiles && matchingProfiles.length > 0) {
      const matchingIds = matchingProfiles.map((p) => p.id);
      const { data: clientExpedientes } = await supabase
        .from('expedientes')
        .select('*, profiles!expedientes_user_id_profiles_fkey(*)')
        .in('user_id', matchingIds)
        .order('created_at', { ascending: false });

      if (clientExpedientes) {
        const existingIds = new Set(results.map((r) => r.id));
        for (const ce of clientExpedientes) {
          if (!existingIds.has(ce.id)) {
            results.push(ce);
            existingIds.add(ce.id);
          }
        }
      }
    }
  }

  return { data: results, total: count || results.length };
}

// ============================================
// EXPORT HELPERS
// ============================================

export async function exportExpedienteToDocx(
  expediente: Expediente & { profiles?: Profile },
  options: { incluirDocumentos: boolean; incluirSeguimientos: boolean }
): Promise<void> {
  const content = `EXPEDIENTE: ${expediente.titulo}\nEstado: ${expediente.estado}\nDescripción: ${expediente.descripcion || ''}`;
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  triggerBlobDownload(blob, `expediente_${expediente.titulo}.txt`);
}

export async function exportExpedientesToXlsx(
  expedientes: (Expediente & { profiles?: Profile })[]
): Promise<void> {
  const headers = ['N° Expediente', 'Título', 'Estado', 'Cliente'];
  const rows = expedientes.map((e) => [
    e.numero_expediente || '',
    e.titulo,
    e.estado,
    e.profiles?.nombre_completo || ''
  ]);
  const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  triggerBlobDownload(blob, 'expedientes.csv');
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-.]/g, '_').substring(0, 100);
}

export async function sendNotification(
  to: string,
  subject: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-notification`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ to, subject, message }),
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      await supabase.from('notificaciones').insert({
        destinatario: to, evento: subject, estado: 'fallida',
        resultado: data.error || `Error ${response.status}`,
      });
      return { success: false, error: data.error || `Error ${response.status}` };
    }

    await supabase.from('notificaciones').insert({
      destinatario: to, evento: subject, estado: 'enviada',
      resultado: data.id || 'OK',
    });
    return { success: true };
  } catch (e) {
    await supabase.from('notificaciones').insert({
      destinatario: to, evento: subject, estado: 'fallida',
      resultado: (e as Error).message,
    });
    return { success: false, error: (e as Error).message };
  }
}

export async function getAppSettings(): Promise<Record<string, string>> {
  const { data } = await supabase.from('app_settings').select('clave, valor');
  const map: Record<string, string> = {};
  if (data) {
    for (const row of data) {
      map[row.clave] = row.valor || '';
    }
  }
  return map;
}

export async function updateAppSetting(clave: string, valor: string): Promise<boolean> {
  const { error } = await supabase.from('app_settings').update({ valor, updated_at: new Date().toISOString() }).eq('clave', clave);
  return !error;
}
