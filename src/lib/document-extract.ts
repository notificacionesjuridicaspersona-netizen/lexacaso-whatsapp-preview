import { supabase, STORAGE_BUCKET } from './supabase';
import JSZip from 'jszip';
import type { Documento } from '../types';

const TEXT_EXTENSIONS = ['txt', 'csv', 'json', 'xml', 'html', 'htm', 'md'];
const MAX_DOC_CHARS = 8000;
const MAX_DOCS = 10;

interface ExtractedDoc {
  nombre: string;
  extension: string;
  contenido: string;
  metodo: 'directo' | 'pdf' | 'ocr-pendiente' | 'binario' | 'error';
}

export async function extractExpedienteDocumentText(expedienteId: string): Promise<{
  documentos: ExtractedDoc[];
  resumen: string;
}> {
  const { data: docs } = await supabase
    .from('documentos')
    .select('*')
    .eq('expediente_id', expedienteId)
    .order('created_at', { ascending: false })
    .limit(MAX_DOCS);

  if (!docs || docs.length === 0) {
    return { documentos: [], resumen: 'No hay documentos cargados en el expediente.' };
  }

  const resultados: ExtractedDoc[] = [];

  for (const doc of docs as Documento[]) {
    const ext = (doc.extension || '').toLowerCase();
    try {
      const { data: signedUrlData, error: urlError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(doc.ruta_storage, 120);

      if (urlError || !signedUrlData?.signedUrl) {
        resultados.push({
          nombre: doc.nombre,
          extension: ext,
          contenido: '[No se pudo acceder al archivo]',
          metodo: 'error',
        });
        continue;
      }

      const response = await fetch(signedUrlData.signedUrl);
      if (!response.ok) {
        resultados.push({
          nombre: doc.nombre,
          extension: ext,
          contenido: `[Error al descargar: ${response.status}]`,
          metodo: 'error',
        });
        continue;
      }

      if (TEXT_EXTENSIONS.includes(ext)) {
        const text = await response.text();
        const truncated = text.substring(0, MAX_DOC_CHARS);
        resultados.push({
          nombre: doc.nombre,
          extension: ext,
          contenido: truncated,
          metodo: 'directo',
        });
      } else if (ext === 'pdf') {
        const text = await extractPdfText(await response.blob());
        if (text) {
          resultados.push({
            nombre: doc.nombre,
            extension: ext,
            contenido: text.substring(0, MAX_DOC_CHARS),
            metodo: 'pdf',
          });
        } else {
          resultados.push({
            nombre: doc.nombre,
            extension: ext,
            contenido: '[PDF escaneado o sin texto embebido. Requiere OCR para extraer el contenido. Pendiente de configurar servicio OCR avanzado.]',
            metodo: 'ocr-pendiente',
          });
        }
      } else if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext)) {
        resultados.push({
          nombre: doc.nombre,
          extension: ext,
          contenido: '[Imagen. El reconocimiento de texto en imágenes (OCR) está identificado como pendiente hasta configurar y probar un servicio compatible.]',
          metodo: 'ocr-pendiente',
        });
      } else if (['doc', 'docx', 'xls', 'xlsx'].includes(ext)) {
        const text = await extractOfficeText(await response.blob(), ext);
        resultados.push({
          nombre: doc.nombre,
          extension: ext,
          contenido: text.substring(0, MAX_DOC_CHARS),
          metodo: text ? 'directo' : 'binario',
        });
      } else {
        resultados.push({
          nombre: doc.nombre,
          extension: ext,
          contenido: `[Formato ${ext} no procesable automáticamente. Documento disponible para descarga.]`,
          metodo: 'binario',
        });
      }
    } catch {
      resultados.push({
        nombre: doc.nombre,
        extension: ext,
        contenido: '[Error al procesar el archivo]',
        metodo: 'error',
      });
    }
  }

  const partes = resultados.map((r) => {
    if (r.metodo === 'directo' || r.metodo === 'pdf') {
      return `--- Documento: ${r.nombre} ---\n${r.contenido}`;
    }
    return `--- Documento: ${r.nombre} ---\n${r.contenido}`;
  });

  return {
    documentos: resultados,
    resumen: partes.join('\n\n'),
  };
}

async function extractPdfText(blob: Blob): Promise<string | null> {
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    // Search for text between BT/ET markers (PDF text objects)
    const decoder = new TextDecoder('latin1');
    const raw = decoder.decode(bytes);

    const textos: string[] = [];
    const regex = /\(([^)]*)\)\s*Tj/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(raw)) !== null) {
      let t = match[1];
      // Decode PDF string escapes
      t = t.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t').replace(/\\\(/g, '(').replace(/\\\)/g, ')').replace(/\\\\/g, '\\');
      if (t.trim()) textos.push(t);
    }

    // Also try TJ arrays: [(text) -100 (more)]
    const tjRegex = /\[([^\]]*)\]\s*TJ/g;
    while ((match = tjRegex.exec(raw)) !== null) {
      const inner = match[1];
      const parts = inner.match(/\(([^)]*)\)/g);
      if (parts) {
        for (const p of parts) {
          const t = p.slice(1, -1).replace(/\\n/g, '\n').replace(/\\\(/g, '(').replace(/\\\)/g, ')').replace(/\\\\/g, '\\');
          if (t.trim()) textos.push(t);
        }
      }
    }

    const result = textos.join(' ').replace(/\s+/g, ' ').trim();
    return result.length > 20 ? result : null;
  } catch {
    return null;
  }
}

async function extractOfficeText(blob: Blob, ext: string): Promise<string> {
  try {
    // For .docx/.xlsx, they are ZIP files containing XML
    // We can try to read the XML and strip tags
    if (ext === 'docx' || ext === 'xlsx') {
      const arrayBuffer = await blob.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);
      const textos: string[] = [];

      const files = Object.keys(zip.files);
      const targetFiles = ext === 'docx'
        ? files.filter((f) => f.startsWith('word/document') || f.startsWith('word/header') || f.startsWith('word/footer'))
        : files.filter((f) => f.startsWith('xl/sharedStrings') || f.startsWith('xl/worksheets/sheet'));

      for (const fileName of targetFiles.slice(0, 5)) {
        const file = zip.file(fileName);
        if (!file) continue;
        const xml = await file.async('text');
        // Strip XML tags, keep text content
        const stripped = xml.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
        if (stripped) textos.push(stripped);
      }

      return textos.join('\n');
    }

    // For .doc/.xls (binary formats), limited extraction
    const decoder = new TextDecoder('latin1');
    const text = decoder.decode(await blob.arrayBuffer());
    // Filter to printable chars
    const filtered = text.replace(/[^\x20-\x7E\xA0-\xFF\n\r]/g, ' ').replace(/\s+/g, ' ').trim();
    return filtered.length > 50 ? filtered : '';
  } catch {
    return '';
  }
}

export function buildContextWithDocuments(
  expedienteData: Record<string, unknown> | null,
  documentosTexto: string
): string {
  const parts: string[] = [];

  if (expedienteData) {
    if (expedienteData.titulo) parts.push(`Título: ${expedienteData.titulo}`);
    if (expedienteData.descripcion) parts.push(`Descripción: ${expedienteData.descripcion}`);
    if (expedienteData.area_juridica) parts.push(`Área jurídica: ${expedienteData.area_juridica}`);
    if (expedienteData.pretensiones) parts.push(`Pretensiones: ${expedienteData.pretensiones}`);
    if (expedienteData.actuaciones_previas) parts.push(`Actuaciones previas: ${expedienteData.actuaciones_previas}`);
    if (expedienteData.observaciones_adicionales) parts.push(`Observaciones: ${expedienteData.observaciones_adicionales}`);
  }

  if (documentosTexto) {
    parts.push(`CONTENIDO DE DOCUMENTOS DEL EXPEDIENTE:\n${documentosTexto}`);
  }

  return parts.join('\n');
}
