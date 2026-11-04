import { supabase, STORAGE_BUCKET, ensureBucket } from './supabase';
import type { Documento, Expediente, Profile, Observacion, Seguimiento, HistorialEntry, AnalisisJuridico } from '../types';
import JSZip from 'jszip';

export async function extraerTextoDeArchivo(file: File): Promise<string> {
  try {
    return await file.text();
  } catch {
    return '';
  }
}

export async function getAppSettings(): Promise<Record<string, string>> {
  try {
    const { data } = await supabase.from('app_settings').select('*');
    const settings: Record<string, string> = {};
    if (data) {
      data.forEach((row: { clave: string; valor: string }) => {
        settings[row.clave] = row.valor;
      });
    }
    return settings;
  } catch {
    return {};
  }
}

export async function updateAppSetting(clave: string, valor: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('app_settings')
      .upsert({ clave, valor, updated_at: new Date().toISOString() }, { onConflict: 'clave' });
    return !error;
  } catch {
    return false;
  }
}

export async function logAuditoria(accion: string, detalle: string, entidad: string, entidadId?: string | null): Promise<void> {
  try {
    await supabase.from('bitacora_auditoria').insert({
      autor_id: (await supabase.auth.getUser()).data.user?.id || null,
      accion,
      detalle,
      entidad,
      entidad_id: entidadId || null,
    });
  } catch {
    // Error silencioso en auditoría para no interrumpir el flujo
  }
}

export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export function validateFile(file: File): { valid: boolean; error?: string } {
  const maxSize = 50 * 1024 * 1024;
  if (file.size > maxSize) {
    return { valid: false, error: 'El archivo supera el tamaño máximo permitido de 50MB.' };
  }
  return { valid: true };
}

export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop()?.toLowerCase() || '' : '';
}

export async function uploadDocument(
  file: File,
  expedienteId: string,
  userId: string
): Promise<{ success: boolean; error?: string; path?: string }> {
  try {
    await ensureBucket();
    const ext = getFileExtension(file.name);
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const filePath = `${userId}/${expedienteId}/${timestamp}-${random}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, file);

    if (uploadError) {
      return { success: false, error: uploadError.message };
    }

    const { error: dbError } = await supabase.from('documentos').insert({
      expediente_id: expedienteId,
      user_id: userId,
      nombre: file.name,
      ruta_storage: filePath,
      tipo_mime: file.type || 'application/octet-stream',
      tamano_bytes: file.size,
      extension: ext,
      visible_cliente: false,
    });

    if (dbError) {
      await supabase.storage.from(STORAGE_BUCKET).remove([filePath]);
      return { success: false, error: dbError.message };
    }

    return { success: true, path: filePath };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function downloadDocument(doc: Documento): Promise<{ success: boolean; error?: string }> {
  try {
    await ensureBucket();
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(doc.ruta_storage, 120);

    if (error || !data?.signedUrl) {
      return { success: false, error: 'No se pudo generar el enlace de descarga.' };
    }

    const response = await fetch(data.signedUrl);
    if (!response.ok) {
      return { success: false, error: `Error al descargar: ${response.status}` };
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.nombre;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    await supabase.from('documentos').update({ consultado: true }).eq('id', doc.id);

    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function deleteDocument(doc: Documento): Promise<{ success: boolean; error?: string }> {
  try {
    await supabase.storage.from(STORAGE_BUCKET).remove([doc.ruta_storage]);
    const { error } = await supabase.from('documentos').delete().eq('id', doc.id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function sendNotification(destinatario: string, evento: string, mensaje: string): Promise<void> {
  try {
    await supabase.from('notificaciones').insert({
      destinatario,
      evento,
      mensaje,
    });
  } catch {
    // Error silencioso
  }
}

export async function sendEmailNotification(to: string, subject: string, message: string): Promise<boolean> {
  try {
    const { error } = await supabase.functions.invoke('send-notification', {
      body: { to, subject, message },
    });
    return !error;
  } catch {
    return false;
  }
}

interface SearchResult {
  data: (Expediente & { profiles?: Profile })[];
  total: number;
  error?: string;
}

export async function searchExpedientes(params: {
  query?: string;
  clienteId?: string;
  estado?: string;
  fechaDesde?: string;
  fechaHasta?: string;
  page?: number;
  perPage?: number;
}): Promise<SearchResult> {
  try {
    const page = params.page || 1;
    const perPage = params.perPage || 20;
    const from = (page - 1) * perPage;
    const to = from + perPage - 1;

    let query = supabase
      .from('expedientes')
      .select('*, profiles!expedientes_user_id_profiles_fkey(*)', { count: 'exact' });

    if (params.query) {
      const q = params.query.trim();
      query = query.or(`titulo.ilike.%${q}%,descripcion.ilike.%${q}%,numero_expediente.ilike.%${q}%,numero_radicado.ilike.%${q}%`);
    }
    if (params.clienteId) query = query.eq('user_id', params.clienteId);
    if (params.estado) query = query.eq('estado', params.estado);
    if (params.fechaDesde) query = query.gte('created_at', params.fechaDesde);
    if (params.fechaHasta) query = query.lte('created_at', params.fechaHasta + 'T23:59:59');

    query = query.order('created_at', { ascending: false }).range(from, to);

    const { data, error, count } = await query;

    if (error) {
      return { data: [], total: 0, error: error.message };
    }

    return {
      data: (data || []) as (Expediente & { profiles?: Profile })[],
      total: count || 0,
    };
  } catch (e) {
    return { data: [], total: 0, error: (e as Error).message };
  }
}

export async function previewZipContents(file: File): Promise<{ entries: { name: string; size: number }[]; error?: string }> {
  try {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const entries: { name: string; size: number }[] = [];
    for (const filename of Object.keys(zip.files)) {
      const entry = zip.files[filename];
      if (!entry.dir) {
        const data = await entry.async('uint8array');
        entries.push({ name: filename, size: data.length });
      }
    }
    return { entries };
  } catch (e) {
    return { entries: [], error: (e as Error).message };
  }
}

export async function extractAndUploadZipFiles(
  file: File,
  expedienteId: string,
  userId: string,
  _unused: unknown
): Promise<{ failed: number; errors: string[] }> {
  try {
    await ensureBucket();
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const errors: string[] = [];
    let failed = 0;

    for (const filename of Object.keys(zip.files)) {
      const entry = zip.files[filename];
      if (entry.dir) continue;

      const blob = await entry.async('blob');
      const fakeFile = new File([blob], filename, { type: 'application/octet-stream' });
      const validation = validateFile(fakeFile);
      if (!validation.valid) {
        errors.push(`${filename}: ${validation.error}`);
        failed++;
        continue;
      }

      const result = await uploadDocument(fakeFile, expedienteId, userId);
      if (!result.success) {
        errors.push(`${filename}: ${result.error}`);
        failed++;
      }
    }

    return { failed, errors };
  } catch (e) {
    return { failed: 1, errors: [(e as Error).message] };
  }
}

export async function exportExpedientesToXlsx(expedientes: (Expediente & { profiles?: Profile })[]): Promise<void> {
  try {
    const XLSX = await import('xlsx');
    const rows = expedientes.map((exp) => ({
      Titulo: exp.titulo,
      Cliente: exp.profiles?.nombre_completo || '',
      Estado: exp.estado,
      Prioridad: exp.prioridad,
      Area: exp.area_juridica || '',
      'N° Expediente': exp.numero_expediente || '',
      'N° Radicado': exp.numero_radicado || '',
      Creado: new Date(exp.created_at).toLocaleDateString('es-CO'),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Expedientes');
    XLSX.writeFile(wb, 'expedientes.xlsx');
  } catch (e) {
    console.error('Error al exportar XLSX:', e);
  }
}

export async function exportExpedientesToCsv(expedientes: (Expediente & { profiles?: Profile })[]): Promise<void> {
  try {
    const headers = ['Titulo', 'Cliente', 'Estado', 'Prioridad', 'Area', 'N° Expediente', 'N° Radicado', 'Creado'];
    const rows = expedientes.map((exp) => [
      exp.titulo,
      exp.profiles?.nombre_completo || '',
      exp.estado,
      exp.prioridad,
      exp.area_juridica || '',
      exp.numero_expediente || '',
      exp.numero_radicado || '',
      new Date(exp.created_at).toLocaleDateString('es-CO'),
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'expedientes.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  } catch (e) {
    console.error('Error al exportar CSV:', e);
  }
}

export async function exportDocumentosToZip(docs: Documento[], titulo: string): Promise<{ success: boolean; error?: string }> {
  try {
    await ensureBucket();
    const zip = new JSZip();
    for (const doc of docs) {
      const { data, error } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(doc.ruta_storage, 120);
      if (error || !data?.signedUrl) continue;
      const response = await fetch(data.signedUrl);
      if (!response.ok) continue;
      const blob = await response.blob();
      zip.file(doc.nombre, blob);
    }
    const content = await zip.generateAsync({ type: 'blob' });
    const url = window.URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${titulo}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

interface FullExpediente extends Expediente {
  documentos?: Documento[];
  observaciones?: Observacion[];
  seguimientos?: Seguimiento[];
  historial?: HistorialEntry[];
  analisis?: AnalisisJuridico[];
}

export async function exportExpedienteToDocx(
  expediente: FullExpediente,
  options: {
    incluirDocumentos?: boolean;
    incluirSeguimientos?: boolean;
    incluirObservaciones?: boolean;
    incluirHistorial?: boolean;
    incluirAnalisis?: boolean;
  }
): Promise<void> {
  try {
    const { Document, Packer, Paragraph, HeadingLevel } = await import('docx');
    const paragraphs: Paragraph[] = [];

    paragraphs.push(new Paragraph({ text: expediente.titulo, heading: HeadingLevel.HEADING_1 }));
    paragraphs.push(new Paragraph({ text: `Estado: ${expediente.estado}` }));
    paragraphs.push(new Paragraph({ text: `Prioridad: ${expediente.prioridad}` }));
    paragraphs.push(new Paragraph({ text: `Cliente: ${expediente.profiles?.nombre_completo || ''}` }));
    paragraphs.push(new Paragraph({ text: `Área jurídica: ${expediente.area_juridica || '—'}` }));
    if (expediente.numero_expediente) paragraphs.push(new Paragraph({ text: `N° Expediente: ${expediente.numero_expediente}` }));
    if (expediente.numero_radicado) paragraphs.push(new Paragraph({ text: `N° Radicado: ${expediente.numero_radicado}` }));
    if (expediente.descripcion) {
      paragraphs.push(new Paragraph({ text: 'Descripción', heading: HeadingLevel.HEADING_2 }));
      paragraphs.push(new Paragraph({ text: expediente.descripcion }));
    }

    if (options.incluirDocumentos && expediente.documentos?.length) {
      paragraphs.push(new Paragraph({ text: 'Documentos', heading: HeadingLevel.HEADING_2 }));
      expediente.documentos.forEach((doc) => {
        paragraphs.push(new Paragraph({ text: `${doc.nombre} (${formatBytes(doc.tamano_bytes)})` }));
      });
    }

    if (options.incluirSeguimientos && expediente.seguimientos?.length) {
      paragraphs.push(new Paragraph({ text: 'Actuaciones / Seguimientos', heading: HeadingLevel.HEADING_2 }));
      expediente.seguimientos.forEach((seg) => {
        paragraphs.push(new Paragraph({ text: `${seg.tipo_actuacion} (${seg.fecha_actuacion}): ${seg.descripcion}` }));
      });
    }

    if (options.incluirObservaciones && expediente.observaciones?.length) {
      paragraphs.push(new Paragraph({ text: 'Observaciones', heading: HeadingLevel.HEADING_2 }));
      expediente.observaciones.forEach((obs) => {
        paragraphs.push(new Paragraph({ text: obs.contenido }));
      });
    }

    if (options.incluirHistorial && expediente.historial?.length) {
      paragraphs.push(new Paragraph({ text: 'Historial de cambios', heading: HeadingLevel.HEADING_2 }));
      expediente.historial.forEach((h) => {
        paragraphs.push(new Paragraph({ text: `${h.campo}: ${h.valor_anterior || '(vacío)'} → ${h.valor_nuevo || '(vacío)'}` }));
      });
    }

    if (options.incluirAnalisis && expediente.analisis?.length) {
      paragraphs.push(new Paragraph({ text: 'Análisis jurídico', heading: HeadingLevel.HEADING_2 }));
      expediente.analisis.forEach((a) => {
        paragraphs.push(new Paragraph({ text: a.titulo, heading: HeadingLevel.HEADING_3 }));
        paragraphs.push(new Paragraph({ text: a.contenido }));
      });
    }

    const doc = new Document({ sections: [{ children: paragraphs }] });
    const blob = await Packer.toBlob(doc);
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${expediente.titulo}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  } catch (e) {
    console.error('Error al exportar DOCX:', e);
  }
}
