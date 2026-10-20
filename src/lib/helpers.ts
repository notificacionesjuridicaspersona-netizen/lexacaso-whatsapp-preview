import { supabase, STORAGE_BUCKET } from './supabase';

// Funciones auxiliares para manejo de archivos e IA en la aplicación
export async function extraerTextoDeArchivo(file: File): Promise<string> {
  try {
    return await file.text();
  } catch {
    return '';
  }
}