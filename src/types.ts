export type Rol = 'admin' | 'cliente';

export interface Profile {
  id: string;
  email: string;
  nombre_completo: string;
  cedula: string | null;
  celular: string | null;
  direccion: string | null;
  rol: Rol;
  autorizacion_datos: boolean;
  autorizacion_fecha: string | null;
  autorizacion_version: string | null;
  created_at: string;
  updated_at: string;
}

export interface Expediente {
  id: string;
  user_id: string;
  numero_expediente: string | null;
  numero_radicado: string | null;
  titulo: string;
  descripcion: string | null;
  area_juridica: string | null;
  estado: string;
  prioridad: string;
  created_at: string;
  updated_at: string;
  profiles?: Profile;
  documentos?: Documento[];
  observaciones?: Observacion[];
  seguimientos?: Seguimiento[];
  historial?: HistorialEntry[];
  analisis?: AnalisisJuridico[];
}

export interface Documento {
  id: string;
  expediente_id: string;
  user_id: string;
  nombre: string;
  ruta_storage: string;
  tipo_mime: string;
  tamano_bytes: number;
  extension: string | null;
  visible_cliente: boolean;
  remitente_id: string | null;
  mensaje_admin: string | null;
  consultado: boolean;
  created_at: string;
}

export interface Observacion {
  id: string;
  expediente_id: string;
  autor_id: string;
  contenido: string;
  visible_cliente: boolean;
  created_at: string;
  autor?: Profile;
}

export interface Seguimiento {
  id: string;
  expediente_id: string;
  autor_id: string;
  tipo_actuacion: string;
  descripcion: string;
  fecha_actuacion: string;
  fecha_vencimiento: string | null;
  estado: string;
  created_at: string;
}

export interface HistorialEntry {
  id: string;
  expediente_id: string;
  autor_id: string;
  campo: string;
  valor_anterior: string | null;
  valor_nuevo: string | null;
  created_at: string;
}

export interface BitacoraEntry {
  id: string;
  autor_id: string | null;
  accion: string;
  detalle: string | null;
  entidad: string | null;
  entidad_id: string | null;
  created_at: string;
  autor?: Profile;
}

export interface ConfigCategoria {
  id: string;
  nombre: string;
  descripcion: string | null;
  orden: number;
}

export interface ConfigEstado {
  id: string;
  nombre: string;
  color: string;
  orden: number;
}

export interface ConfigTipoActuacion {
  id: string;
  nombre: string;
  descripcion: string | null;
  orden: number;
}

export interface AnalisisJuridico {
  id: string;
  expediente_id: string;
  autor_id: string;
  documento_id: string | null;
  tipo: 'estructurado' | 'ia' | 'jurisprudencia';
  titulo: string;
  contenido: string;
  resumen: string | null;
  creado_en: string;
  actualizado_en: string;
}

export interface SearchResult {
  expedientes: (Expediente & { profiles?: Profile })[];
  total: number;
}
