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
      const result = await Tesseract.recognize(file, 'spa', {
        logger: (m) => console.log(`[OCR] ${m.status}: ${Math.round((m.progress || 0) * 100)}%`)
      });
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
// FILE UPLOAD
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
// EXPORT TO DOCX
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

  if (options.incluirDocumentos && expediente.documentos && expediente.documentos.length > 0) {
    sections.push(`<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>DOCUMENTOS</w:t></w:r></w:p>`);
    for (const doc of expediente.documentos) {
      sections.push(makeParagraph(`• ${doc.nombre} (${formatBytes(doc.tamano_bytes)}) - ${new Date(doc.created_at).toLocaleDateString('es-CO')}`));
    }
  }

  if (options.incluirSeguimientos && expediente.seguimientos && expediente.seguimientos.length > 0) {
    sections.push(`<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>ACTUACIONES</w:t></w:r></w:p>`);
    for (const seg of expediente.seguimientos) {
      sections.push(makeParagraph(`• [${seg.tipo_actuacion}] ${seg.descripcion} - ${seg.fecha_actuacion} (${seg.estado})`));
    }
  }

  if (options.incluirObservaciones && expediente.observaciones && expediente.observaciones.length > 0) {
    sections.push(`<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>OBSERVACIONES</w:t></w:r></w:p>`);
    for (const obs of expediente.observaciones) {
      if (obs.visible_cliente) {
        sections.push(makeParagraph(`• ${obs.contenido} - ${new Date(obs.created_at).toLocaleDateString('es-CO')}`));
      }
    }
  }

  if (options.incluirHistorial && expediente.historial && expediente.historial.length > 0) {
    sections.push(`<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>HISTORIAL DE CAMBIOS</w:t></w:r></w:p>`);
    for (const h of expediente.historial) {
      sections.push(makeParagraph(`• ${h.campo}: ${h.valor_anterior || '(vacío)'} → ${h.valor_nuevo || '(vacío)'} - ${new Date(h.created_at).toLocaleDateString('es-CO')}`));
    }
  }

  if (options.incluirAnalisis && expediente.analisis && expediente.analisis.length > 0) {
    sections.push(`<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>ANÁLISIS JURÍDICO</w:t></w:r></w:p>`);
    for (const a of expediente.analisis) {
      sections.push(`<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>${escapeXml(a.titulo)} (${a.tipo})</w:t></w:r></w:p>`);
      sections.push(makeParagraph(a.contenido));
      if (a.resumen) sections.push(makeParagraph(`Resumen: ${a.resumen}`));
      sections.push(makeParagraph(`Fecha: ${new Date(a.creado_en).toLocaleDateString('es-CO')}`));
    }
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

// ============================================
// EXPORT TO XLSX
// ============================================

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

  const blob = await zip.generateAsync({ type: 'blob', mimeType: '
