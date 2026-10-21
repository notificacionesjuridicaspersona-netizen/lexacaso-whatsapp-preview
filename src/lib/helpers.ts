import { supabase, STORAGE_BUCKET } from './supabase';

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

export async function logAuditoria(accion: string, detalle: string, modulo: string, usuarioId?: string | null): Promise<void> {
  try {
    await supabase.from('auditoria').insert({
      accion,
      detalle,
      modulo,
      usuario_id: usuarioId || null,
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
  const maxSize = 50 * 1024 * 1024; // 50MB
  if (file.size > maxSize) {
    return { valid: false, error: 'El archivo supera el tamaño máximo permitido de 50MB.' };
  }
  return { valid: true };
}

export async function uploadDocument(file: File, expedienteId: string): Promise<{ path: string; error?: string }> {
  try {
    const fileExt = file.name.split('.').pop() || '';
    const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
    const filePath = `${expedienteId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, file);

    if (uploadError) {
      return { path: '', error: uploadError.message };
    }

    return { path: filePath };
  } catch (e) {
    return { path: '', error: (e as Error).message };
  }
}

export async function downloadDocument(rutaStorage: string, nombreArchivo: string): Promise<void> {
  try {
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(rutaStorage, 60);

    if (error || !data?.signedUrl) {
      throw new Error('No se pudo generar el enlace de descarga.');
    }

    const a = document.createElement('a');
    a.href = data.signedUrl;
    a.download = nombreArchivo;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch (e) {
    console.error('Error al descargar:', e);
  }
}

export async function deleteDocument(documentoId: string, rutaStorage: string): Promise<boolean> {
  try {
    await supabase.storage.from(STORAGE_BUCKET).remove([rutaStorage]);
    const { error } = await supabase.from('documentos').delete().eq('id', documentoId);
    return !error;
  } catch {
    return false;
  }
}

export async function sendNotification(mensaje: string, usuarioId?: string): Promise<void> {
  try {
    await supabase.from('notificaciones').insert({
      mensaje,
      usuario_id: usuarioId || null,
    });
  } catch {
    // Error silencioso
  }
}