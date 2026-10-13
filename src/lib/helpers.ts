import { supabase, STORAGE_BUCKET, ALLOWED_EXTENSIONS, MAX_FILE_SIZE } from './supabase';
import type { Expediente, Documento, Profile } from '../types';
import JSZip from 'jszip';
import Tesseract from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';

// Configurar Worker de PDF.js desde CDN oficial
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

// ============================================
// OCR AUTOMÁTICO (Extracción de Escaneos, PDFs e Imágenes)
// ============================================

export async function extraerTextoDeArchivo(file: File): Promise<string> {
  try {
    let textoExtraido = '';

    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const numPaginas = Math.min(pdf.numPages, 10);

      for (let i = 1; i <= numPaginas; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const textPage = textContent.items.map((item: any) => item.str).join(' ');

        if (textPage.trim().length > 30) {
          textoExtraido += `\n--- Página ${i} ---\n` + textPage;
        } else {
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          canvas.height = viewport.height;
          canvas.width = viewport.width;

          if (context) {
            await page.render({ canvasContext: context, viewport }).promise;
            const result = await Tesseract.recognize(canvas, 'spa');
            if (result.data.text.trim()) {
              textoExtraido += `\n--- Página ${i} (OCR) ---\n` + result.data.text;
            }
          }
        }
      }
    } else if (file.type.startsWith('image/')) {
      const result = await Tesseract.recognize(file, 'spa');
      textoExtraido = result.data.text;
    }

    return textoExtraido.trim();
  } catch (e) {
    console.error('Error al procesar el archivo con OCR:', e);
    return '';
  }
}

// ============================================
// AUDIT LOG (Exportación única y exacta)
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
    // Silent fail - don't block user actions on audit
  }
}

// ============================================
// FILE UPLOAD & VALIDATION (CORREGIDO)
// ============================================

export function getFileExtension(filename: string): string {
  const parts = filename.trim().split('.');
  return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
}

export function validateFile(file: File): { valid: boolean; error?: string } {
  if (!file) {
    return { valid: false, error: 'Archivo no proporcionado' };
  }

  // 1. Validar tamaño
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: 'Archivo demasiado grande. Máximo: 50MB' };
  }

  // 2. Normalizar extensión limpia
  const extClean = getFileExtension(file.name);
  const extWithDot = `.${extClean}`;

  // 3. Normalizar la lista global de extensiones permitidas
  const allowedClean = (ALLOWED_EXTENSIONS || []).map((e) => e.toLowerCase().replace('.', ''));
  const allowedDisplay = allowedClean.map((e) => `.${e}`).join(', ');

  // 4. Comprobación flexible por extensión o por tipo MIME
  const isExtAllowed = allowedClean.includes(extClean);
  const isMimeAllowed =
    file.type === 'application/pdf' ||
    file.type.startsWith('image/') ||
    file.type.includes('document') ||
    file.type.includes('sheet') ||
    file.type.includes('zip') ||
    file.type.includes('compressed');

  if (!isExtAllowed && !isMimeAllowed) {
    return {
      valid: false,
      error: `Extensión ${extWithDot || 'desconocida'} no permitida. Formatos válidos: ${allowedDisplay}`,
    };
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

// ============================================
// FILE DELETE (Borrado seguro: Storage + DB)
// ============================================

export async function deleteDocument(doc: Documento): Promise<{ success: boolean; error?: string }> {
  try {
    const { error: storageError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove([doc.ruta_storage]);

    if (storageError) {
      return { success: false, error: `Error al eliminar archivo: ${storageError.message}` };
    }

    const { error: dbError } = await supabase
      .from('documentos')
      .delete()
      .eq('id', doc.id);

    if (dbError) {
      return { success: false, error: `Error al eliminar registro: ${dbError.message}` };
    }

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
// ZIP PREVIEW & EXTRACTION
// ============================================

export async
