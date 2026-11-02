import { supabase, STORAGE_BUCKET } from './supabase';

export async function ensureBucket() {
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    const exists = buckets?.some(b => b.name === STORAGE_BUCKET);
    if (!exists) {
      await supabase.storage.createBucket(STORAGE_BUCKET, { public: true });
    }
  } catch (e) {
    console.error('Error asegurando el bucket:', e);
  }
}

export async function uploadDocument(file: File, expedienteId: string) {
  await ensureBucket();
  const fileExt = file.name.split('.').pop();
  const fileName = `${expedienteId}/${Date.now()}-${Math.random().toString(36.substring(2))}.${fileExt}`;
  
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(fileName, file);

  if (error) throw error;

  const { data: { publicUrl } } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(fileName);

  return { path: data.path, url: publicUrl };
}

export async function deleteDocument(path: string) {
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .remove([path]);
  if (error) throw error;
}

export async function downloadDocument(path: string) {
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .download(path);
  if (error) throw error;
  
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = path.split('/').pop() || 'documento';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportExpedientesToCsv(expedientes: any[]) {
  const headers = ['ID', 'Titulo', 'Cliente', 'Estado', 'Prioridad', 'Fecha Creacion'];
  const rows = expedientes.map(e => [
    e.id,
    `"${(e.titulo || '').replace(/"/g, '""')}"`,
    `"${(e.cliente_nombre || '').replace(/"/g, '""')}"`,
    e.estado,
    e.prioridad,
    e.created_at
  ]);

  const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `expedientes_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}