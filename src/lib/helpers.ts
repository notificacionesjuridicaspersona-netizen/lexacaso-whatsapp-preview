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

export async function previewZipContents(file: File): Promise<{ entries: { name: string; size: number }[]; error?: string }> {
  try {
    const zip = new JSZip();
    const content = await zip.loadAsync(file);
    const entries: { name: string; size: number }[] = [];
    for (const filename in content.files) {
      const entry = content.files[filename];
      if (!entry.dir) {
        const blob = await entry.async('blob');
        entries.push({ name: filename, size: blob.size });
      }
    }
    return { entries };
  } catch (e) {
    return { entries: [], error: `Error al leer ZIP: ${(e as Error).message}` };
  }
}

export async function extractAndUploadZipFiles(
  file: File,
  expedienteId: string,
  userId: string,
  selectedFiles: string[] | null
): Promise<{ success: number; failed: number; errors: string[] }> {
  try {
    const zip = new JSZip();
    const content = await zip.loadAsync(file);
    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const filename in content.files) {
      const entry = content.files[filename];
      if (entry.dir) continue;
      if (selectedFiles && !selectedFiles.includes(filename)) continue;

      const ext = getFileExtension(filename);
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        errors.push(`${filename}: extensión .${ext} no permitida`);
        failed++;
        continue;
      }

      const safeName = filename.split('/').pop() || filename;

      try {
        const blob = await entry.async('blob');
        if (blob.size > MAX_FILE_SIZE) {
          errors.push(`${safeName}: archivo demasiado grande`);
          failed++;
          continue;
        }

        const extractedFile = new File([blob], safeName, { type: blob.type || 'application/octet-stream' });
        const result = await uploadDocument(extractedFile, expedienteId, userId);
        if (result.success) {
          success++;
        } else {
          errors.push(`${safeName}: ${result.error}`);
          failed++;
        }
      } catch (e) {
        errors.push(`${safeName}: ${(e as Error).message}`);
        failed++;
      }
    }

    return { success, failed, errors };
  } catch (e) {
    return { success: 0, failed: 1, errors: [`Error al procesar ZIP: ${(e as Error).message}`] };
  }
}

export async function exportDocumentosToZip(
  documentos: Documento[],
  expedienteTitulo: string
): Promise<{ success: boolean; error?: string }> {
  const zip = new JSZip();
  const usedNames = new Set<string>();

  for (const doc of documentos) {
    try {
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(doc.ruta_storage, 300);

      if (error || !data) continue;

      const response = await fetch(data.signedUrl);
      if (!response.ok) continue;

      const blob = await response.blob();
      let name = doc.nombre;
      let counter = 1;
      while (usedNames.has(name)) {
        const ext = getFileExtension(name);
        const base = ext ? name.slice(0, -ext.length - 1) : name;
        name = `${base}_${counter}.${ext}`;
        counter++;
      }
      usedNames.add(name);
      zip.file(name, blob);
    } catch (e) {
      // Skip failed files
    }
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  triggerBlobDownload(blob, sanitizeFilename(`documentos_${expedienteTitulo}.zip`));
  return { success: true };
}

// ============================================
// EXPORT HELPERS (DOCX, XLSX, CSV)
// ============================================

export async function exportExpedienteToDocx(
  expediente: Expediente & { profiles?: Profile },
  options: {
    incluirDocumentos: boolean;
    incluirSeguimientos: boolean;
    incluirObservaciones: boolean;
    incluirHistorial: boolean;
    incluirAnalisis?: boolean;
  }
): Promise<void> {
  const zip = new JSZip();
  const sections: string[] = [];

  sections.push(`<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>EXPEDIENTE: ${escapeXml(expediente.titulo)}</w:t></w:r></w:p>`);

  if (expediente.profiles) {
    const p = expediente.profiles;
    sections.push(`<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>DATOS DEL CLIENTE</w:t></w:r></w:p>`);
    sections.push(makeParagraph(`Nombre: ${p.nombre_completo}`));
    sections.push(makeParagraph(`Email: ${p.email}`));
    if (p.cedula) sections.push(makeParagraph(`Cédula: ${p.cedula}`));
    if (p.celular) sections.push(makeParagraph(`Celular: ${p.celular}`));
    if (p.direccion) sections.push(makeParagraph(`Dirección: ${p.direccion}`));
  }

  sections.push(`<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>INFORMACIÓN DEL EXPEDIENTE</w:t></w:r></w:p>`);
  if (expediente.numero_expediente) sections.push(makeParagraph(`Número de expediente: ${expediente.numero_expediente}`));
  if (expediente.numero_radicado) sections.push(makeParagraph(`Número de radicado: ${expediente.numero_radicado}`));
  sections.push(makeParagraph(`Estado: ${expediente.estado}`));
  sections.push(makeParagraph(`Prioridad: ${expediente.prioridad}`));
  if (expediente.area_juridica) sections.push(makeParagraph(`Área jurídica: ${expediente.area_juridica}`));
  sections.push(makeParagraph(`Fecha de creación: ${new Date(expediente.created_at).toLocaleDateString('es-CO')}`));
  sections.push(makeParagraph(`Última actualización: ${new Date(expediente.updated_at).toLocaleDateString('es-CO')}`));
  if (expediente.descripcion) {
    sections.push(`<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Descripción</w:t></w:r></w:p>`);
    sections.push(makeParagraph(expediente.descripcion));
  }

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
${sections.join('\n')}
<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
</w:body>
</w:document>`;

  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);

  zip.folder('_rels')!.file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

  zip.folder('word')!.file('document.xml', documentXml);

  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  triggerBlobDownload(blob, sanitizeFilename(`expediente_${expediente.titulo}.docx`));
}

export async function exportExpedientesToXlsx(
  expedientes: (Expediente & { profiles?: Profile })[]
): Promise<void> {
  const zip = new JSZip();

  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`);

  zip.folder('_rels')!.file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`);

  zip.folder('xl')!.file('workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>
<sheet name="Expedientes" sheetId="1" r:id="rId1"/>
</sheets>
</workbook>`);

  zip.folder('xl')!.folder('_rels')!.file('workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);

  const headerCells = ['N° Expediente','N° Radicado','Título','Descripción','Área Jurídica','Estado','Prioridad','Cliente','Cédula','Email','Celular','Fecha Creación','Última Actualización']
    .map((h) => `<c t="inlineStr"><is><t>${escapeXml(h)}</t></is></c>`)
    .join('');

  const dataRows = expedientes.map((e, idx) => {
    const p = e.profiles;
    const cells = [
      e.numero_expediente || '',
      e.numero_radicado || '',
      e.titulo,
      e.descripcion || '',
      e.area_juridica || '',
      e.estado,
      e.prioridad,
      p?.nombre_completo || '',
      p?.cedula || '',
      p?.email || '',
      p?.celular || '',
      new Date(e.created_at).toLocaleDateString('es-CO'),
      new Date(e.updated_at).toLocaleDateString('es-CO'),
    ];
    const rowCells = cells.map((c) => `<c t="inlineStr"><is><t>${escapeXml(c)}</t></is></c>`).join('');
    return `<row r="${idx + 2}">${rowCells}</row>`;
  }).join('\n');

  zip.folder('xl')!.folder('worksheets')!.file('sheet1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetData>
<row r="1">${headerCells}</row>
${dataRows}
</sheetData>
</worksheet>`);

  zip.folder('xl')!.file('styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="1"><fill><patternFill patternType="none"/></fill></fills>
<borders count="1"><border/></borders>
<cellStyleXfs count="1"><xf/></cellStyleXfs>
<cellXfs count="1"><xf/></cellXfs>
</styleSheet>`);

  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerBlobDownload(blob, 'expedientes.xlsx');
}

export function exportExpedientesToCsv(expedientes: (Expediente & { profiles?: Profile })[]): void {
  const headers = ['N° Expediente', 'N° Radicado', 'Título', 'Estado', 'Prioridad', 'Cliente', 'Cédula', 'Email', 'Fecha Creación'];
  const rows = expedientes.map((e) => {
    const p = e.profiles;
    return [
      e.numero_expediente || '',
      e.numero_radicado || '',
      e.titulo,
      e.estado,
      e.prioridad,
      p?.nombre_completo || '',
      p?.cedula || '',
      p?.email || '',
      new Date(e.created_at).toLocaleDateString('es-CO'),
    ];
  });

  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  triggerBlobDownload(blob, 'expedientes.csv');
}

// ============================================
// UTILITIES & NOTIFICATIONS
// ============================================

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

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function makeParagraph(text: string): string {
  return `<w:p><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
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
        destinatario: to,
        evento: subject,
        estado: 'fallida',
        resultado: data.error || `Error ${response.status}`,
      });
      return { success: false, error: data.error || `Error ${response.status}` };
    }

    await supabase.from('notificaciones').insert({
      destinatario: to,
      evento: subject,
      estado: 'enviada',
      resultado: data.id || 'OK',
    });
    return { success: true };
  } catch (e) {
    await supabase.from('notificaciones').insert({
      destinatario: to,
      evento: subject,
      estado: 'fallida',
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
  const { error } = await supabase
    .from('app_settings')
    .update({ valor, updated_at: new Date().toISOString() })
    .eq('clave', clave);
  return !error;
}
