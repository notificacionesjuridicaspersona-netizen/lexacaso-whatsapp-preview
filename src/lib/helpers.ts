
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
      // Skip
    }
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  triggerBlobDownload(blob, sanitizeFilename(`documentos_${expedienteTitulo}.zip`));
  return { success: true };
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
    e.titulo || '',
    e.estado || '',
    e.profiles?.nombre_completo || ''
  ]);

  // Escapar correctamente cada celda para cumplir con el formato CSV.
  const escapeCsvCell = (value: unknown): string => {
    const cell = value == null ? '' : String(value);
    return `"${cell.replace(/"/g, '""')}"`;
  };

  const csv = [headers, ...rows]
    .map((row) => row.map(escapeCsvCell).join(','))
    .join('\r\n');

  // BOM para que Excel reconozca correctamente caracteres acentuados y la Ñ.
  const blob = new Blob(['\uFEFF', csv], {
    type: 'text/csv;charset=utf-8;'
  });

  triggerBlobDownload(
    blob,
    sanitizeFilename('expedientes.csv')
  );
}

/**
 * Elimina caracteres que no son apropiados para nombres de archivo.
 */
function sanitizeFilename(filename: string): string {
  const sanitized = filename
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/[. ]+$/g, '');

  return sanitized || 'descarga';
}
