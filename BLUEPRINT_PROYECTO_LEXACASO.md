# BLUEPRINT PROYECTO LEXACASO
## Documento de Continuidad / System Prompt

> **Propósito:** Este documento permite a cualquier instancia nueva de Bolt (o desarrollador) entender la arquitectura, base de datos, funcionalidades y reglas de modificación segura del proyecto LEXACASO, para iterar sobre él sin romper funcionalidades existentes ni perder datos.

---

## 1. RESUMEN DEL SISTEMA Y OBJETIVOS

### Qué es LEXACASO

LEXACASO es una plataforma web de gestión jurídica para abogados colombianos que permite administrar expedientes legales, documentos, análisis jurídicos con IA y comunicación con clientes. Está construida con React + TypeScript + Vite, usa Supabase como backend (Postgres, Auth, Storage, Edge Functions) y JSZip para manejo de archivos comprimidos.

### Módulos Clave

| Módulo | Descripción |
|--------|-------------|
| **Autenticación y Roles** | Dos roles: `admin` (abogado/admin) y `cliente`. Registro con autorización de datos personales (Ley 1581 de 2012). Email del primer admin se hardcodea en el trigger `handle_new_user`. |
| **Expedientes** | CRUD completo de casos legales con campos extendidos (pretensiones, actuaciones previas, entidad involucrada, fecha de hechos). Búsqueda, filtrado, paginación, exportación a DOCX/XLSX/CSV. |
| **Documentos** | Upload/descarga de archivos (PDF, DOC, DOCX, XLS, XLSX, ZIP, RAR, JPG, PNG) con bucket privado en Supabase Storage. Extracción automática de texto para análisis. Importación desde ZIP. |
| **Herramientas Jurídicas con IA** | 15 herramientas de análisis jurídico (analizar documentos, resumir hechos, identificar problemas jurídicos, jurisprudencia, normatividad, estrategias, etc.). Funcionan con API externa (OpenAI/Gemini) o con generador local de análisis estructurado. |
| **Análisis Jurídicos** | Almacenamiento de resultados de IA y análisis manuales en tabla `analisis_juridicos`. Tipos: `ia`, `estructurado`, `jurisprudencia`. |
| **Seguimientos y Observaciones** | Registro de actuaciones procesales con fechas de vencimiento y observaciones con control de visibilidad para el cliente. |
| **Comentarios** | Sistema de comentarios por expediente con visibilidad `cliente`, `interno` (solo admin) y `sistema`. |
| **Bitácora de Auditoría** | Registro automático de todas las acciones relevantes (creación de expedientes, cambios de estado, ejecución de herramientas, etc.) en `bitacora_auditoria`. |
| **Configuración** | Tablas lookup para categorías jurídicas, estados y tipos de actuación. Panel de mantenimiento con toggles para herramientas, configuración de WhatsApp y servicios externos. |
| **Notificaciones** | Envío de emails vía Edge Function + Resend API. Registro de notificaciones enviadas/fallidas en `notificaciones`. |
| **Portal del Cliente** | Vista dedicada donde el cliente expone su caso (wizard de 4 pasos), ve sus expedientes, descarga documentos recibidos del abogado, hace seguimiento y comenta. |

### Stack Tecnológico

| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| React | 18.3.1 | Framework frontend |
| TypeScript | 5.6.2 | Tipado estático |
| Vite | 5.4.8 | Bundler y dev server |
| Supabase JS | 2.45.4 | Cliente Supabase (Auth, DB, Storage) |
| JSZip | 3.10.1 | Manejo de archivos ZIP (import/export DOCX/XLSX) |
| Supabase (backend) | — | Postgres, Auth, Storage, Edge Functions (Deno) |

---

## 2. ESTRUCTURA DE BASE DE DATOS Y SUPABASE

### 2.1 Esquema Completo de Tablas (14 tablas)

#### `profiles`
Perfil de usuario vinculado a `auth.users`. Se crea automáticamente vía trigger al registrarse.

| Columna | Tipo | Constraints / Default |
|---------|------|----------------------|
| `id` | uuid | **PK**, FK → `auth.users(id) ON DELETE CASCADE` |
| `email` | text | NOT NULL |
| `nombre_completo` | text | NOT NULL |
| `cedula` | text | — |
| `celular` | text | — |
| `direccion` | text | — |
| `rol` | text | NOT NULL, DEFAULT `'cliente'` |
| `autorizacion_datos` | boolean | NOT NULL, DEFAULT `false` |
| `autorizacion_fecha` | timestamptz | — |
| `autorizacion_version` | text | DEFAULT `'1.0'` |
| `created_at` | timestamptz | DEFAULT `now()` |
| `updated_at` | timestamptz | DEFAULT `now()` |

**RLS (3 políticas):**
- `select_own_profile_or_admin` — SELECT: `auth.uid() = id OR is_admin()`
- `insert_own_profile` — INSERT: WC `auth.uid() = id`
- `update_own_profile_or_admin` — UPDATE: USING & WC `auth.uid() = id OR is_admin()`
- *(No hay política DELETE)*

#### `expedientes`
Casos legales. Cada expediente pertenece a un usuario (cliente).

| Columna | Tipo | Constraints / Default |
|---------|------|----------------------|
| `id` | uuid | PK, DEFAULT `gen_random_uuid()` |
| `user_id` | uuid | NOT NULL, DEFAULT `auth.uid()`, FK → `auth.users(id) ON DELETE CASCADE`, FK → `profiles(id) ON DELETE CASCADE` |
| `numero_expediente` | text | UNIQUE |
| `numero_radicado` | text | — |
| `titulo` | text | NOT NULL |
| `descripcion` | text | — |
| `area_juridica` | text | — |
| `estado` | text | NOT NULL, DEFAULT `'Recibido'` |
| `prioridad` | text | NOT NULL, DEFAULT `'Media'` |
| `entidad_involucrada` | text | — *(añadida en migración 005)* |
| `fecha_hechos` | date | — *(añadida en migración 005)* |
| `pretensiones` | text | — *(añadida en migración 005)* |
| `actuaciones_previas` | text | — *(añadida en migración 005)* |
| `observaciones_adicionales` | text | — *(añadida en migración 005)* |
| `created_at` | timestamptz | DEFAULT `now()` |
| `updated_at` | timestamptz | DEFAULT `now()` |

**RLS (4 políticas — todas `TO authenticated`):**
- `select_own_expedientes` — SELECT: `auth.uid() = user_id OR is_admin()`
- `insert_own_expedientes` — INSERT: WC `auth.uid() = user_id OR is_admin()`
- `update_own_expedientes` — UPDATE: USING & WC `auth.uid() = user_id OR is_admin()`
- `delete_own_expedientes` — DELETE: `auth.uid() = user_id OR is_admin()`

**Doble FK:** `user_id` tiene dos foreign keys — una a `auth.users(id)` y otra a `profiles(id)`. Esto fue necesario para que Supabase descubra la relación para joins (migración 006).

#### `documentos`
Archivos adjuntos a expedientes. Se almacenan en Supabase Storage bucket `documentos`.

| Columna | Tipo | Constraints / Default |
|---------|------|----------------------|
| `id` | uuid | PK, DEFAULT `gen_random_uuid()` |
| `expediente_id` | uuid | NOT NULL, FK → `expedientes(id) ON DELETE CASCADE` |
| `user_id` | uuid | NOT NULL, DEFAULT `auth.uid()`, FK → `auth.users(id) ON DELETE CASCADE` |
| `nombre` | text | NOT NULL |
| `ruta_storage` | text | NOT NULL |
| `tipo_mime` | text | NOT NULL |
| `tamano_bytes` | bigint | NOT NULL, DEFAULT `0` |
| `extension` | text | — |
| `visible_cliente` | boolean | NOT NULL, DEFAULT `true` |
| `remitente_id` | uuid | FK → `auth.users(id) ON DELETE SET NULL` |
| `mensaje_admin` | text | — |
| `consultado` | boolean | NOT NULL, DEFAULT `false` |
| `created_at` | timestamptz | DEFAULT `now()` |

**RLS (4 políticas):**
- `select_own_documentos` — SELECT: `(auth.uid() = user_id AND visible_cliente = true) OR is_admin()`
- `insert_own_documentos` — INSERT: WC `auth.uid() = user_id OR is_admin()`
- `update_own_documentos` — UPDATE: USING & WC `is_admin()`
- `delete_own_documentos` — DELETE: `is_admin()`

**Path en Storage:** `{userId}/{expedienteId}/{timestamp}-{random}.{ext}`

#### `observaciones`
Notas internas del abogado sobre un expediente, con control de visibilidad.

| Columna | Tipo | Constraints / Default |
|---------|------|----------------------|
| `id` | uuid | PK |
| `expediente_id` | uuid | NOT NULL, FK → `expedientes(id) ON DELETE CASCADE` |
| `autor_id` | uuid | NOT NULL, DEFAULT `auth.uid()`, FK → `auth.users(id) ON DELETE CASCADE` |
| `contenido` | text | NOT NULL |
| `visible_cliente` | boolean | NOT NULL, DEFAULT `false` |
| `created_at` | timestamptz | DEFAULT `now()` |

**RLS (4 políticas):** SELECT visible para cliente si `visible_cliente=true`; INSERT/UPDATE/DELETE solo `is_admin()`.

#### `seguimientos`
Actuaciones procesales con fechas de vencimiento.

| Columna | Tipo | Constraints / Default |
|---------|------|----------------------|
| `id` | uuid | PK |
| `expediente_id` | uuid | NOT NULL, FK → `expedientes(id) ON DELETE CASCADE` |
| `autor_id` | uuid | NOT NULL, DEFAULT `auth.uid()`, FK → `auth.users(id) ON DELETE CASCADE` |
| `tipo_actuacion` | text | NOT NULL |
| `descripcion` | text | NOT NULL |
| `fecha_actuacion` | date | NOT NULL, DEFAULT `CURRENT_DATE` |
| `fecha_vencimiento` | date | — |
| `estado` | text | NOT NULL, DEFAULT `'Pendiente'` |
| `created_at` | timestamptz | DEFAULT `now()` |

**RLS (4 políticas):** SELECT visible si el expediente pertenece al usuario; INSERT/UPDATE/DELETE solo `is_admin()`.

#### `historial_expedientes`
Registro de cambios de estado y prioridad en expedientes.

| Columna | Tipo | Constraints / Default |
|---------|------|----------------------|
| `id` | uuid | PK |
| `expediente_id` | uuid | NOT NULL, FK → `expedientes(id) ON DELETE CASCADE` |
| `autor_id` | uuid | NOT NULL, DEFAULT `auth.uid()`, FK → `auth.users(id) ON DELETE CASCADE` |
| `campo` | text | NOT NULL |
| `valor_anterior` | text | — |
| `valor_nuevo` | text | — |
| `created_at` | timestamptz | DEFAULT `now()` |

**RLS (2 políticas):** SELECT e INSERT para usuarios que poseen el expediente o admin. No UPDATE/DELETE.

#### `bitacora_auditoria`
Log de auditoría de todas las acciones relevantes del sistema.

| Columna | Tipo | Constraints / Default |
|---------|------|----------------------|
| `id` | uuid | PK |
| `autor_id` | uuid | FK → `auth.users(id) ON DELETE SET NULL`, FK → `profiles(id) ON DELETE SET NULL` |
| `accion` | text | NOT NULL |
| `detalle` | text | — |
| `entidad` | text | — |
| `entidad_id` | uuid | — |
| `created_at` | timestamptz | DEFAULT `now()` |

**RLS (2 políticas):** SELECT solo `is_admin()`; INSERT `auth.uid() = autor_id`.

**Doble FK:** `autor_id` tiene FK a `auth.users(id)` y a `profiles(id)` (migración 007).

#### `analisis_juridicos`
Resultados de análisis de IA y análisis manuales.

| Columna | Tipo | Constraints / Default |
|---------|------|----------------------|
| `id` | uuid | PK |
| `expediente_id` | uuid | NOT NULL, FK → `expedientes(id) ON DELETE CASCADE` |
| `autor_id` | uuid | NOT NULL, DEFAULT `auth.uid()`, FK → `auth.users(id) ON DELETE CASCADE` |
| `documento_id` | uuid | FK → `documentos(id) ON DELETE SET NULL` |
| `tipo` | text | NOT NULL, DEFAULT `'estructurado'` (valores: `estructurado`, `ia`, `jurisprudencia`) |
| `titulo` | text | NOT NULL, DEFAULT `'Análisis jurídico'` |
| `contenido` | text | NOT NULL |
| `resumen` | text | — |
| `creado_en` | timestamptz | DEFAULT `now()` |
| `actualizado_en` | timestamptz | DEFAULT `now()` |

**RLS (4 políticas):** SELECT visible si el expediente pertenece al usuario o admin; INSERT/UPDATE/DELETE solo `is_admin()`.

#### `comentarios`
Comentarios en expedientes con control de visibilidad.

| Columna | Tipo | Constraints / Default |
|---------|------|----------------------|
| `id` | uuid | PK |
| `expediente_id` | uuid | NOT NULL, FK → `expedientes(id) ON DELETE CASCADE` |
| `autor_id` | uuid | NOT NULL, DEFAULT `auth.uid()`, FK → `auth.users(id) ON DELETE CASCADE` |
| `contenido` | text | NOT NULL |
| `visibilidad` | text | NOT NULL, DEFAULT `'cliente'`, CHECK `IN ('cliente','interno','sistema')` |
| `created_at` | timestamptz | DEFAULT `now()` |

**RLS (4 políticas):**
- SELECT: `is_admin() OR (expediente pertenece al usuario AND visibilidad IN ('cliente','sistema'))`
- INSERT: `is_admin() OR (expediente pertenece al usuario AND visibilidad = 'cliente')`
- UPDATE: `is_admin() OR (autor_id = auth.uid() AND visibilidad = 'cliente')`
- DELETE: `is_admin() OR (autor_id = auth.uid() AND visibilidad = 'cliente')`

#### `config_categorias`
Categorías jurídicas para clasificar expedientes.

| Columna | Tipo | Constraints / Default |
|---------|------|----------------------|
| `id` | uuid | PK |
| `nombre` | text | NOT NULL, UNIQUE |
| `descripcion` | text | — |
| `orden` | int | DEFAULT `0` |
| `created_at` | timestamptz | DEFAULT `now()` |

**RLS:** SELECT público (`true`); INSERT/UPDATE/DELETE solo `is_admin()`.

**Datos seed (6):** Derecho Civil, Penal, Laboral, Administrativo, Comercial, Familia.

#### `config_estados`
Estados de expedientes con colores para UI.

| Columna | Tipo | Constraints / Default |
|---------|------|----------------------|
| `id` | uuid | PK |
| `nombre` | text | NOT NULL, UNIQUE |
| `color` | text | DEFAULT `'#6b7280'` |
| `orden` | int | DEFAULT `0` |
| `created_at` | timestamptz | DEFAULT `now()` |

**RLS:** SELECT público; INSERT/UPDATE/DELETE solo `is_admin()`.

**Datos seed (11):** Recibido, En revisión, En estudio, Pendiente documentación, En proceso, En notificación, En audiencia, En apelación, Finalizado, Archivado, Suspendido.

#### `config_tipos_actuacion`
Tipos de actuaciones procesales.

| Columna | Tipo | Constraints / Default |
|---------|------|----------------------|
| `id` | uuid | PK |
| `nombre` | text | NOT NULL, UNIQUE |
| `descripcion` | text | — |
| `orden` | int | DEFAULT `0` |
| `created_at` | timestamptz | DEFAULT `now()` |

**RLS:** SELECT público; INSERT/UPDATE/DELETE solo `is_admin()`.

**Datos seed (7):** Revisión inicial, Demanda, Notificación, Audiencia, Recurso, Actualización, Cierre.

#### `app_settings`
Configuración global de la aplicación (clave-valor).

| Columna | Tipo | Constraints / Default |
|---------|------|----------------------|
| `id` | uuid | PK |
| `clave` | text | UNIQUE, NOT NULL |
| `valor` | text | — |
| `descripcion` | text | — |
| `created_at` | timestamptz | DEFAULT `now()` |
| `updated_at` | timestamptz | DEFAULT `now()` |

**RLS:** SELECT público (`true`); INSERT/UPDATE/DELETE solo `is_admin()`.

**Datos seed (21 claves):**
| Clave | Valor default | Descripción |
|-------|---------------|-------------|
| `admin_email` | — | Email del administrador para notificaciones |
| `whatsapp_enabled` | `'true'` | Mostrar botón de WhatsApp |
| `whatsapp_number` | `'573105603386'` | Número de WhatsApp |
| `tool_analizar_documentos` | `'true'` | Toggle herramienta IA |
| `tool_resumir_hechos` | `'true'` | Toggle herramienta IA |
| `tool_identificar_problemas` | `'true'` | Toggle herramienta IA |
| `tool_jurisprudencia` | `'true'` | Toggle herramienta IA |
| `tool_normatividad` | `'true'` | Toggle herramienta IA |
| `tool_alternativas` | `'true'` | Toggle herramienta IA |
| `tool_terminos_plazos` | `'true'` | Toggle herramienta IA |
| `tool_pruebas_faltantes` | `'true'` | Toggle herramienta IA |
| `tool_estrategias` | `'true'` | Toggle herramienta IA |
| `tool_acciones` | `'true'` | Toggle herramienta IA |
| `tool_conducta` | `'true'` | Toggle herramienta IA |
| `tool_borradores` | `'true'` | Toggle herramienta IA |
| `tool_contradicciones` | `'true'` | Toggle herramienta IA |
| `tool_informe_integral` | `'true'` | Toggle herramienta IA |
| `tool_segunda_revision` | `'true'` | Toggle herramienta IA |
| `ai_service_configured` | `'false'` | Estado del servicio de IA |
| `ocr_service_configured` | `'false'` | Estado del servicio OCR |
| `jurisprudencia_service_configured` | `'false'` | Estado del servicio de jurisprudencia |

#### `notificaciones`
Registro de notificaciones enviadas.

| Columna | Tipo | Constraints / Default |
|---------|------|----------------------|
| `id` | uuid | PK |
| `destinatario` | text | NOT NULL |
| `evento` | text | NOT NULL |
| `estado` | text | NOT NULL, DEFAULT `'pendiente'`, CHECK `IN ('pendiente','enviada','fallida')` |
| `resultado` | text | — |
| `created_at` | timestamptz | DEFAULT `now()` |

**RLS:** SELECT solo `is_admin()`; INSERT `true` (cualquiera autenticado); UPDATE/DELETE solo `is_admin()`.

### 2.2 Funciones PostgreSQL

| Función | Retorna | Security | Propósito |
|---------|---------|----------|-----------|
| `is_admin()` | boolean | SECURITY DEFINER, `search_path=public` | Verifica si el usuario actual tiene rol `admin` en `profiles`. |
| `update_updated_at()` | trigger | SECURITY DEFINER, `search_path=public` | Actualiza `updated_at = now()` antes de UPDATE. |
| `handle_new_user()` | trigger | SECURITY DEFINER, `search_path=public` | Crea automáticamente un registro en `profiles` al registrarse un nuevo usuario en `auth.users`. Asigna `rol='admin'` si el email es `notipersonales2026@gmail.com`, sino `rol='cliente'`. |
| `set_user_role(target_user_id uuid, new_role text)` | void | SECURITY DEFINER, `search_path=public` | Cambia el rol de un usuario. Solo admin puede invocarla. Valida que el rol sea `admin` o `cliente`. |
| `protect_rol_column()` | trigger | SECURITY DEFINER, `search_path=public` | Bloquea cambios de rol directos en `profiles` si no es admin (antes de UPDATE). |

**Permisos EXECUTE:**
- `is_admin()`, `set_user_role()` → GRANT a `authenticated`, REVOKE de PUBLIC
- `handle_new_user()`, `protect_rol_column()` → REVOKE de PUBLIC, anon, authenticated (solo trigger)

### 2.3 Triggers

| Trigger | Tabla | Evento | Función |
|---------|-------|--------|---------|
| `trg_expedientes_updated_at` | expedientes | BEFORE UPDATE | `update_updated_at()` |
| `trg_profiles_updated_at` | profiles | BEFORE UPDATE | `update_updated_at()` |
| `on_auth_user_created` | `auth.users` | AFTER INSERT | `handle_new_user()` |
| `trg_protect_rol` | profiles | BEFORE UPDATE OF `rol` | `protect_rol_column()` |

### 2.4 Índices

| Índice | Tabla(Columna) |
|--------|----------------|
| `idx_expedientes_user_id` | `expedientes(user_id)` |
| `idx_expedientes_estado` | `expedientes(estado)` |
| `idx_documentos_expediente_id` | `documentos(expediente_id)` |
| `idx_documentos_user_id` | `documentos(user_id)` |
| `idx_seguimientos_expediente_id` | `seguimientos(expediente_id)` |
| `idx_historial_expediente_id` | `historial_expedientes(expediente_id)` |
| `idx_analisis_expediente_id` | `analisis_juridicos(expediente_id)` |

### 2.5 Storage Bucket

- **Bucket:** `documentos` (privado, `public=false`)
- **Path pattern:** `{userId}/{expedienteId}/{timestamp}-{random}.{ext}`
- **Extensiones permitidas:** `pdf, doc, docx, xls, xlsx, zip, rar, jpg, jpeg, png`
- **Tamaño máximo:** 50 MB

**Políticas de Storage (4, sobre `storage.objects` con `bucket_id='documentos'`):**
- SELECT: `auth.uid()::text = (storage.foldername(name))[1] OR is_admin()`
- INSERT: WC same as SELECT
- UPDATE: `is_admin()`
- DELETE: `is_admin()`

### 2.6 Historial de Migraciones

| # | Archivo | Descripción |
|---|---------|-------------|
| 001 | `001_create_initial_schema.sql` | Esquema base: 10 tablas, 5 funciones, 4 triggers, 32 políticas RLS, 6 índices, bucket storage, datos seed. |
| 002 | `002_add_analisis_juridicos.sql` | Tabla `analisis_juridicos` + 4 políticas RLS + 1 índice. |
| 003 | `003_fix_security_advisor_warnings.sql` | Revoca EXECUTE de funciones trigger a anon/authenticated. Recrea `update_updated_at()` con SECURITY DEFINER y search_path. |
| 004 | `004_fix_function_execute_grants.sql` | Revoca EXECUTE de PUBLIC en todas las funciones. Concede `is_admin()` y `set_user_role()` a authenticated. |
| 005 | `005_add_comentarios_settings_notificaciones.sql` | Añade 5 columnas a `expedientes`. Crea `comentarios`, `app_settings`, `notificaciones` + 12 políticas RLS + datos seed. |
| 006 | `006_fix_expedientes_profiles_fk.sql` | Añade FK `expedientes.user_id` → `profiles(id)` para que Supabase descubra la relación en joins. |
| 007 | `007_fix_bitacora_profiles_fk.sql` | Añade FK `bitacora_auditoria.autor_id` → `profiles(id)` para joins. |

### 2.7 Edge Function: `send-notification`

- **Archivo:** `supabase/functions/send-notification/index.ts`
- **Config:** `verify_jwt = true` en `supabase/config.toml`
- **Runtime:** Deno
- **Función:** Recibe POST `{ to, subject, message }` y envía email vía Resend API (`https://api.resend.com/emails`).
- **Secret requerido:** `RESEND_API_KEY` (configurado en Supabase Edge Functions secrets).
- **From address:** `onboarding@resend.dev` (sandbox de Resend).
- **CORS:** Headers estándar con `Access-Control-Allow-Origin: *`.

---

## 3. CONFIGURACIÓN DE VARIABLES DE ENTORNO (.env)

### Variables Requeridas (Obligatorias)

| Variable | Descripción |
|----------|-------------|
| `VITE_SUPABASE_URL` | URL del proyecto Supabase (ej: `https://xxxxx.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | Clave anónima de Supabase para el cliente |

### Variables Opcionales (Servicios de IA)

| Variable | Descripción |
|----------|-------------|
| `VITE_OPENAI_API_KEY` | API key de OpenAI para análisis jurídico con GPT. Si está presente, se usa como proveedor primario. |
| `VITE_GEMINI_API_KEY` | API key de Google Gemini. Se usa si no hay OpenAI key. |

**Comportamiento sin API keys:** Si ninguna de las dos está configurada, el sistema usa un **generador de análisis local** (`generateLocalAnalysis` en `src/lib/ai.ts`) que produce análisis estructurados basados en el contenido de los documentos y datos del expediente. El botón "Ejecutar IA" siempre funciona, nunca se bloquea.

### Secrets de Edge Functions (no en .env, configurados en Supabase)

| Secret | Descripción |
|--------|-------------|
| `RESEND_API_KEY` | API key de Resend para envío de emails desde la Edge Function `send-notification` |

### Declaración de Tipos

Las variables de entorno están declaradas en `src/vite-env.d.ts`:
```typescript
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_OPENAI_API_KEY?: string;
  readonly VITE_GEMINI_API_KEY?: string;
}
```

---

## 4. MAPEO DE RUTAS Y COMPONENTES

### 4.1 Estructura de Archivos

```
project/
├── index.html                      # Entry point HTML
├── vite.config.ts                  # Config Vite (host: true, port: 5173)
├── package.json                    # Dependencias y scripts
├── tsconfig.json                   # Config TypeScript
├── .env                            # Variables de entorno
├── lexacaso.jpeg                   # Logo de la aplicación
├── BLUEPRINT_PROYECTO_LEXACASO.md  # Este documento
├── supabase/
│   ├── config.toml                 # Config de Edge Functions
│   ├── functions/
│   │   └── send-notification/
│   │       └── index.ts           # Edge Function para emails
│   └── migrations/
│       ├── 001_create_initial_schema.sql
│       ├── 002_add_analisis_juridicos.sql
│       ├── 003_fix_security_advisor_warnings.sql
│       ├── 004_fix_function_execute_grants.sql
│       ├── 005_add_comentarios_settings_notificaciones.sql
│       ├── 006_fix_expedientes_profiles_fk.sql
│       └── 007_fix_bitacora_profiles_fk.sql
└── src/
    ├── main.tsx                    # Entry point React
    ├── App.tsx                     # Router principal (admin/cliente)
    ├── index.css                   # Estilos globales
    ├── types.ts                    # Tipos TypeScript de todas las entidades
    ├── vite-env.d.ts               # Declaración de variables de entorno
    ├── context/
    │   └── AuthContext.tsx         # Context de autenticación (signUp, signIn, signOut, fetchProfile)
    ├── lib/
    │   ├── supabase.ts             # Cliente Supabase, constantes (bucket, extensions, limits)
    │   ├── helpers.ts              # Utilidades: logAuditoria, upload/download, search, export DOCX/XLSX/CSV/ZIP, notifications, app_settings
    │   ├── ai.ts                   # Motor de IA: OpenAI, Gemini, o generador local
    │   └── document-extract.ts     # Extracción de texto de documentos (PDF, Word, Excel, texto plano)
    └── components/
        ├── auth/
        │   └── AuthPage.tsx        # Login, registro, recuperación de contraseña
        ├── landing/
        │   └── LandingPage.tsx     # Landing page de marketing
        ├── admin/
        │   ├── AdminDashboard.tsx       # Panel principal con estadísticas
        │   ├── AdminExpedientes.tsx     # Gestión completa de expedientes (CRUD, tabs, export)
        │   ├── AdminUsuarios.tsx        # Gestión de usuarios y roles
        │   ├── AdminConfig.tsx          # Configuración de categorías, estados, tipos
        │   ├── AdminBitacora.tsx        # Visualización de auditoría
        │   ├── AdminMantenimiento.tsx   # Toggles de herramientas, WhatsApp, servicios
        │   └── HerramientasJuridicas.tsx # 15 herramientas de análisis jurídico con IA
        ├── client/
        │   ├── ClientDashboard.tsx      # Lista de expedientes del cliente
        │   ├── ExponerCaso.tsx          # Wizard de 4 pasos para exponer un caso
        │   ├── DocumentosRecibidos.tsx  # Documentos que el abogado envió al cliente
        │   ├── ClientCaseTracking.tsx   # Modal con seguimiento del expediente (6 tabs)
        │   └── ClientProfile.tsx        # Perfil del cliente y cambio de contraseña
        ├── shared/
        │   └── Comentarios.tsx          # Sistema de comentarios con visibilidad
        └── ui/
            └── Modal.tsx                # Modal reutilizable (sm/md/lg/xl)
```

### 4.2 Flujo de Navegación (App.tsx)

```
App.tsx
├── loading → Pantalla de carga con logo
├── !profile → LandingPage (con AuthPage integrada)
├── profile.rol === 'admin'
│   ├── tab='dashboard'   → AdminDashboard
│   ├── tab='expedientes' → AdminExpedientes (con HerramientasJuridicas embebidas)
│   ├── tab='usuarios'    → AdminUsuarios
│   ├── tab='config'      → AdminConfig
│   ├── tab='mantenimiento' → AdminMantenimiento
│   └── tab='bitacora'    → AdminBitacora
└── profile.rol === 'cliente'
    ├── tab='dashboard' && !showExponer → ClientDashboard
    ├── tab='dashboard' && showExponer  → ExponerCaso
    ├── tab='documentos' → DocumentosRecibidos
    ├── tab='perfil'     → ClientProfile
    └── viewingExp != null → ClientCaseTracking (modal overlay)
```

### 4.3 Componentes Clave — Detalle

#### AdminExpedientes.tsx
El componente más complejo. Renderiza:
- Barra de búsqueda/filtrado (texto, cliente, estado, rango de fechas)
- Tabla paginada de resultados
- Modal de detalle con 8 pestañas: Información, Documentos, Actuaciones, Observaciones, Historial, Análisis, Comentarios, Herramientas
- Modales adicionales: nuevo expediente, importar archivos, exportar, enviar documento al cliente, ver perfil del cliente

**Tablas que interactúa:** `expedientes`, `profiles`, `documentos`, `observaciones`, `seguimientos`, `historial_expedientes`, `analisis_juridicos`, `config_estados`, `config_tipos_actuacion`, `bitacora_auditoria`, `comentarios`, Storage `documentos`.

#### HerramientasJuridicas.tsx
15 herramientas de IA jurídica embebidas en el detalle del expediente:
1. Analizar documentos jurídicos
2. Resumir hechos cronológicamente
3. Identificar problemas jurídicos
4. Investigar jurisprudencia
5. Identificar normatividad aplicable
6. Evaluar alternativas de solución
7. Identificar términos y plazos
8. Detectar pruebas faltantes
9. Proponer estrategias jurídicas
10. Determinar posibles acciones
11. Indicar conducta a evaluar
12. Elaborar borradores
13. Revisar contradicciones
14. Informe jurídico integral
15. Segunda revisión crítica

**Flujo de "Ejecutar IA":**
1. `loadDocumentContext()` descarga y extrae texto de los documentos del expediente
2. `buildContextWithDocuments()` combina datos del expediente + texto de documentos
3. `runAI(prompt, context)` envía a OpenAI/Gemini o genera análisis local
4. Resultado se guarda en `analisis_juridicos` con `tipo='ia'`
5. Se registra en `bitacora_auditoria`
6. Se muestra en la lista "Análisis guardados"

**Nota importante:** `aiConfigured` y `jurisprudenciaConfigured` están hardcodeados a `true` (líneas 59-60) para que el botón siempre funcione.

#### ExponerCaso.tsx
Wizard de 4 pasos para que el cliente cree un expediente:
1. Seleccionar categoría jurídica (de `config_categorias`)
2. Detalles del caso (título, descripción, radicado, entidad, fecha, pretensiones, actuaciones, observaciones)
3. Adjuntar documentos (con validación de extensión y tamaño)
4. Revisar y enviar

Al completar: inserta en `expedientes`, sube archivos a Storage, envía notificación al admin.

#### AuthContext.tsx
- `signUp(email, password, metadata)` — Registra usuario en Supabase Auth. El trigger `handle_new_user` crea automáticamente el perfil en `profiles`.
- `signIn(email, password)` — Login con email/password.
- `signOut()` — Cierra sesión.
- `fetchProfile(userId)` — Obtiene el perfil de `profiles`. Si no existe (trigger aún no completó), reintenta tras 1.5s.
- `onAuthStateChange` — Listener que actualiza el estado de sesión.

### 4.4 Librerías Clave

#### `src/lib/ai.ts`
- `getAIProvider()` — Retorna `'openai'`, `'gemini'`, o `'local'` según las API keys disponibles.
- `isAIConfigured()` — Siempre retorna `true` (el sistema nunca se bloquea).
- `runAI(prompt, context)` — Ejecuta el análisis. Si hay API key, llama al proveedor externo. Si no, usa `generateLocalAnalysis()`.
- `generateLocalAnalysis(prompt, context)` — Genera análisis estructurado en español basado en el contenido de los documentos y datos del expediente. Detecta el tipo de herramienta por keywords en el prompt y produce secciones específicas (análisis de documentos, resumen cronológico, problemas jurídicos, normatividad, estrategias, borradores, etc.).

#### `src/lib/document-extract.ts`
- `extractExpedienteDocumentText(expedienteId)` — Descarga hasta 10 documentos del expediente, extrae texto de:
  - **Texto plano** (.txt, .csv, .json, .xml, .html, .md) — lectura directa
  - **PDF** — extracción de texto embebido (BT/ET markers, TJ arrays). Si no hay texto, marca como OCR-pendiente.
  - **Word/Excel** (.docx, .xlsx) — descompresión ZIP + extracción de XML (word/document.xml, xl/sharedStrings.xml)
  - **Word/Excel binario** (.doc, .xls) — filtrado de caracteres imprimibles
  - **Imágenes** — marca como OCR-pendiente
- `buildContextWithDocuments(expedienteData, documentosTexto)` — Combina datos del expediente + texto extraído en un contexto unificado para enviar a la IA.

#### `src/lib/helpers.ts`
Funciones principales:
- `logAuditoria(accion, detalle, entidad, entidadId)` — Registra en `bitacora_auditoria`. Fallar silenciosamente (no bloquea la acción del usuario).
- `validateFile(file)` — Valida extensión y tamaño.
- `uploadDocument(file, expedienteId, userId)` — Sube a Storage + registra en `documentos`.
- `downloadDocument(doc)` — Genera signed URL, descarga, marca como consultado.
- `searchExpedientes(params)` — Búsqueda con filtros (texto, cliente, estado, fechas, paginación). Búsqueda adicional por nombre/cédula/email del cliente.
- `exportExpedienteToDocx(expediente, options)` — Exporta un expediente a .docx (XML + ZIP).
- `exportExpedientesToXlsx(expedientes)` — Exporta lista a .xlsx.
- `exportExpedientesToCsv(expedientes)` — Exporta lista a .csv.
- `exportDocumentosToZip(documentos, titulo)` — Descarga todos los documentos en un .zip.
- `extractAndUploadZipFiles(file, expedienteId, userId, selectedFiles)` — Extrae archivos de un ZIP y los sube individualmente.
- `sendNotification(to, subject, message)` — Llama a la Edge Function `send-notification` y registra el resultado en `notificaciones`.
- `getAppSettings()` — Lee todas las configuraciones de `app_settings` como mapa clave-valor.
- `updateAppSetting(clave, valor)` — Actualiza una configuración.

---

## 5. REGLAS DE MODIFICACIÓN SEGURA (PRESERVACIÓN DE DATOS)

> **INSTRUCCIONES CRÍTICAS PARA CUALQUIER INSTANCIA DE BOLT O DESARROLLADOR:**

### 5.1 Reglas Absolutas

1. **NUNCA elimines ni sobrescribas tablas existentes.** Usa `ALTER TABLE ... ADD COLUMN` para nuevos campos. Nunca uses `DROP TABLE` ni `DROP COLUMN`.

2. **NUNCA cambies el tipo de una columna existente.** Si necesitas un tipo diferente, añade una columna nueva y migra los datos gradualmente.

3. **NUNCA elimines datos existentes.** No ejecutes `DELETE` masivos ni `TRUNCATE`. Las operaciones de borrado deben ser siempre a nivel de fila individual y controladas por la aplicación.

4. **NUNCA elimines ni renombres columnas existentes.** Esto rompería el código que las referencia. Si necesitas renombrar, añade una columna nueva y desvía el código gradualmente.

5. **NUNCA elimines políticas RLS existentes.** Si necesitas modificar una política, usa `DROP POLICY IF EXISTS` seguido de `CREATE POLICY` en la misma migración, asegurando que la nueva política sea igual o más restrictiva.

6. **NUNCA elimines funciones, triggers o índices existentes** sin verificar que nada los referencia.

7. **Siempre aplica cambios incrementales o de adición.** Las migraciones nuevas deben ser aditivas (`ADD COLUMN`, `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, etc.).

8. **NUNCA uses `BEGIN`, `COMMIT`, `ROLLBACK`** en migraciones. Las migraciones de Supabase se ejecutan en su propia transacción. Sí se permite `DO $$ ... END $$` para bloques PL/pgSQL.

9. **NUNCA uses sentencias DDL que requieran bloqueo exclusivo** durante horas pico. Programa migraciones pesadas para ventanas de mantenimiento.

10. **Siempre habilita RLS en nuevas tablas:**
    ```sql
    ALTER TABLE <nombre> ENABLE ROW LEVEL SECURITY;
    ```
    Y crea 4 políticas separadas (una por cada verbo CRUD). Nunca uses `FOR ALL`.

### 5.2 Patrón de Migración Segura

```sql
-- Ejemplo: añadir una nueva columna
ALTER TABLE public.expedientes ADD COLUMN IF NOT EXISTS nueva_columna text;

-- Ejemplo: crear una nueva tabla
CREATE TABLE IF NOT EXISTS public.nueva_tabla (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id uuid NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  contenido text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.nueva_tabla ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_nueva_tabla" ON public.nueva_tabla FOR SELECT
  TO authenticated USING (auth.uid() = user_id OR is_admin());
CREATE POLICY "insert_own_nueva_tabla" ON public.nueva_tabla FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id OR is_admin());
CREATE POLICY "update_own_nueva_tabla" ON public.nueva_tabla FOR UPDATE
  TO authenticated USING (auth.uid() = user_id OR is_admin()) WITH CHECK (auth.uid() = user_id OR is_admin());
CREATE POLICY "delete_own_nueva_tabla" ON public.nueva_tabla FOR DELETE
  TO authenticated USING (auth.uid() = user_id OR is_admin());

CREATE INDEX IF NOT EXISTS idx_nueva_tabla_expediente_id ON public.nueva_tabla(expediente_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nueva_tabla TO authenticated;
```

### 5.3 Reglas para Componentes React

1. **NUNCA elimines componentes existentes** sin migrar toda la funcionalidad a un reemplazo.

2. **NUNCA cambies la firma (props) de un componente** sin actualizar todos los call sites.

3. **Mantén la coherencia de tipos.** Cualquier cambio en `types.ts` debe ser aditivo (nuevos campos opcionales) o acompañado de actualizaciones en todos los consumidores.

4. **Preserva los imports.** Todo símbolo usado debe tener su import correspondiente. No asumas que algo está disponible sin verificarlo.

5. **No rompas el flujo de autenticación.** El `AuthContext` es crítico. Cambios aquí pueden bloquear a todos los usuarios.

6. **Preserva las funciones de auditoría.** `logAuditoria()` debe mantenerse en todas las mutaciones. No eliminar las llamadas existentes.

7. **Mantén el control de visibilidad.** Las flags `visible_cliente` en documentos y observaciones, y `visibilidad` en comentarios, son críticas para la separación admin/cliente. No eliminar estos filtros.

---

## 6. COMPATIBILIDAD CON PROYECTOS PUBLICADOS Y DESPLIEGUES EN PRODUCCIÓN

### 6.1 Estado de Despliegue

- El proyecto está desplegado en Supabase con las 7 migraciones aplicadas.
- La Edge Function `send-notification` está desplegada con `verify_jwt = true`.
- El storage bucket `documentos` está creado y operativo con sus 4 políticas.
- Los datos seed (categorías, estados, tipos, settings) ya están insertados.

### 6.2 Consideraciones para Producción

1. **Email de admin hardcoded:** El trigger `handle_new_user` asigna `rol='admin'` solo al email `notipersonales2026@gmail.com`. Para cambiar el admin, se debe:
   - Opción A: Modificar el trigger (migración nueva) para usar un email diferente.
   - Opción B: Usar la función `set_user_role(uuid, text)` desde una sesión admin existente.

2. **API Keys de IA:** Las variables `VITE_OPENAI_API_KEY` y `VITE_GEMINI_API_KEY` son opcionales. Sin ellas, el sistema funciona con el generador local. Si se configuran, el sistema las usará preferentemente. Al desplegar en producción, añadir estas variables al entorno de build.

3. **Resend API:** La Edge Function usa `onboarding@resend.dev` como remitente (sandbox de Resend). Para producción, configurar un dominio verificado en Resend y actualizar el `from` en `supabase/functions/send-notification/index.ts`.

4. **Confirmación de email:** Está desactivada por defecto (no se requiere confirmación de email al registrarse). Esto es intencional para facilitar el flujo de registro.

5. **Construcción (build):** El proyecto se construye con `npm run build` (ejecuta `tsc -b && vite build`). El output va a `dist/`. El bundle actual es de ~611KB (168KB gzip). Se recomienda code-splitting para reducir el tamaño si se añaden más funcionalidades.

6. **Migraciones futuras:** Toda nueva migración debe:
   - Ser aditiva (no destructiva).
   - Usar `IF NOT EXISTS` en CREATEs.
   - Incluir RLS en nuevas tablas.
   - Conceder permisos a `authenticated`.
   - No usar transacciones explícitas (BEGIN/COMMIT/ROLLBACK).
   - Ser aplicada vía `mcp__supabase__apply_migration` (no SQL directo ni CLI).

### 6.3 Checklist de Despliegue Seguro

- [ ] Variables de entorno configuradas (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
- [ ] API keys de IA configuradas (opcional, para funcionalidad avanzada)
- [ ] RESEND_API_KEY configurado en secrets de Edge Functions
- [ ] Build exitoso (`npm run build` sin errores)
- [ ] Migraciones aplicadas en orden
- [ ] Storage bucket `documentos` creado con políticas
- [ ] Trigger `handle_new_user` activo (verificar con registro de prueba)
- [ ] Usuario admin creado (verificar rol en `profiles`)
- [ ] Funciones `is_admin()`, `set_user_role()` con permisos correctos
- [ ] Edge Function `send-notification` desplegada y funcionando
- [ ] WhatsApp number correcto en `app_settings` (default: 573105603386)

---

## 7. PATRONES Y CONVENCIONES DEL CÓDIGO

### 7.1 Estilo de Código

- **Imports:** Imports absolutos desde `src/` usando rutas relativas (`../../lib/supabase`).
- **Tipos:** Todos los tipos de entidades están en `src/types.ts`. Los componentes importan desde ahí.
- **Estado:** React `useState` + `useEffect` para carga de datos. No se usa Redux ni Context adicional (solo AuthContext).
- **Supabase:** Cliente singleton en `src/lib/supabase.ts`, importado donde se necesita.
- **Errores:** Try/catch en todas las operaciones de Supabase. Errores se muestran al usuario en alerts.
- **Auditoría:** `logAuditoria()` se llama después de cada mutación exitosa. Fallar silenciosamente.
- **Constantes:** Extensiones permitidas, tamaño máximo, bucket name y prioridades en `src/lib/supabase.ts`.

### 7.2 Convenciones de Nomenclatura

- **Tablas:** snake_case plural (`expedientes`, `documentos`, `observaciones`).
- **Columnas:** snake_case (`user_id`, `created_at`, `numero_expediente`).
- **Políticas RLS:** `{verb}_{entity}_{scope}` (ej: `select_own_expedientes`, `insert_admin_analisis`).
- **Funciones SQL:** snake_case (`is_admin`, `handle_new_user`, `set_user_role`).
- **Componentes:** PascalCase (`AdminExpedientes`, `ClientDashboard`).
- **Archivos:** PascalCase para componentes, camelCase para librerías (`helpers.ts`, `supabase.ts`).
- **Tipos TypeScript:** PascalCase (`Expediente`, `Profile`, `AnalisisJuridico`).

### 7.3 Seguridad

- **RLS activada en todas las tablas.** Ninguna tabla es accesible sin políticas.
- **Funciones SECURITY DEFINER** con `search_path = public` para evitar inyección de search_path.
- **Permisos EXECUTE** revocados de PUBLIC en funciones sensibles.
- **Trigger de protección de rol:** `protect_rol_column` impide cambios de rol directos sin ser admin.
- **Storage privado:** El bucket `documentos` no es público. Acceso vía signed URLs.
- **Validación de archivos:** Extensiones permitidas y tamaño máximo (50MB) validados en cliente.
- **Path traversal:** Nombres de archivo en ZIP se sanitizan (`filename.split('/').pop()`).

---

## 8. FUNCIONALIDADES DETALLADAS POR ROL

### 8.1 Rol Admin (Abogado/Administrador)

| Funcionalidad | Componente | Descripción |
|---------------|------------|-------------|
| Panel principal | AdminDashboard | Estadísticas: total expedientes, activos, clientes, documentos, pendientes. Últimos 5 expedientes. |
| Gestión de expedientes | AdminExpedientes | CRUD completo, búsqueda, filtrado, paginación, exportación, importación ZIP, envío de documentos al cliente. |
| Pestañas del expediente | (dentro de AdminExpedientes) | Info, Documentos, Actuaciones, Observaciones, Historial, Análisis, Comentarios, Herramientas IA. |
| Herramientas jurídicas IA | HerramientasJuridicas | 15 herramientas con botón "Ejecutar IA" y "Manual". Resultados se guardan en `analisis_juridicos`. |
| Gestión de usuarios | AdminUsuarios | Lista, búsqueda, edición de perfil y cambio de rol (vía RPC `set_user_role`). |
| Configuración | AdminConfig | CRUD de categorías, estados (con colores) y tipos de actuación. |
| Mantenimiento | AdminMantenimiento | Toggles de 15 herramientas, configuración de WhatsApp y email, estado de servicios, historial de notificaciones. |
| Auditoría | AdminBitacora | Log de acciones con búsqueda (últimas 200 entradas). |

### 8.2 Rol Cliente

| Funcionalidad | Componente | Descripción |
|---------------|------------|-------------|
| Mis Expedientes | ClientDashboard | Tarjetas con los expedientes del cliente. Botón "Exponer mi caso". |
| Exponer caso | ExponerCaso | Wizard de 4 pasos: categoría, detalles, documentos, revisión. |
| Seguimiento | ClientCaseTracking | Modal con 6 pestañas: info, documentos, actuaciones, observaciones, comentarios, análisis. |
| Documentos recibidos | DocumentosRecibidos | Lista de documentos que el abogado envió (visible_cliente=true). Filtros y descarga. |
| Mi perfil | ClientProfile | Editar datos personales y cambiar contraseña. |

---

## 9. ENDPOINTS Y FLUJOS CRÍTICOS

### 9.1 Autenticación

```
Registro → supabase.auth.signUp(email, password, { data: metadata })
         → Trigger handle_new_user crea perfil en profiles
         → Si email = notipersonales2026@gmail.com → rol='admin'
         → Si no → rol='cliente'

Login → supabase.auth.signInWithPassword(email, password)
      → fetchProfile(userId) → obtener perfil de profiles
      → Si no existe perfil, reintentar tras 1.5s

Logout → supabase.auth.signOut()
```

### 9.2 Crear Expediente (Cliente)

```
ExponerCaso.tsx
1. Seleccionar categoría de config_categorias
2. Llenar formulario (título, descripción, radicado, entidad, fecha, pretensiones, actuaciones, observaciones)
3. Adjuntar archivos (validados)
4. Insertar en expedientes (estado='Recibido', prioridad='Media')
5. Subir archivos a Storage (path: userId/expedienteId/timestamp-random.ext)
6. Registrar en documentos
7. Enviar notificación al admin (sendNotification → Edge Function → Resend)
8. logAuditoria('crear_expediente', ...)
```

### 9.3 Ejecutar Herramienta IA

```
HerramientasJuridicas.tsx → handleRunTool(tool)
1. loadDocumentContext():
   a. SELECT expediente data (titulo, descripcion, area, pretensiones, actuaciones, observaciones)
   b. extractExpedienteDocumentText(expedienteId):
      - SELECT documentos WHERE expediente_id = X
      - Para cada documento: createSignedUrl → fetch → extraer texto según formato
   c. buildContextWithDocuments(expedienteData, documentosTexto)
2. runAI(tool.prompt, context):
   - Si VITE_OPENAI_API_KEY → callOpenAI(prompt)
   - Si VITE_GEMINI_API_KEY → callGemini(prompt)
   - Si no hay API key → generateLocalAnalysis(prompt, context)
3. INSERT resultado en analisis_juridicos (tipo='ia', titulo=tool.label, contenido=result.content)
4. logAuditoria('ejecutar_herramienta_ia', ...)
5. Recargar lista de análisis y mostrar resultado
```

### 9.4 Envío de Documento al Cliente

```
AdminExpedientes.tsx
1. Seleccionar archivo (validar extensión y tamaño)
2. Subir a Storage (path: userId/expedienteId/timestamp-random.ext)
3. INSERT en documentos (visible_cliente=true, remitente_id=admin, mensaje_admin=mensaje)
4. Si falla el INSERT → eliminar archivo de Storage (rollback)
5. Enviar notificación al cliente
6. logAuditoria('enviar_documento_cliente', ...)
```

### 9.5 Exportación de Expedientes

| Formato | Función | Descripción |
|---------|---------|-------------|
| DOCX | `exportExpedienteToDocx` | Documento Word con secciones: cliente, info, documentos, actuaciones, observaciones, historial, análisis. |
| XLSX | `exportExpedientesToXlsx` | Hoja de cálculo con columnas: expediente, radicado, título, estado, prioridad, cliente, cédula, email, fechas. |
| CSV | `exportExpedientesToCsv` | CSV plano con BOM UTF-8. |
| ZIP | `exportDocumentosToZip` | Descarga todos los documentos de un expediente en un ZIP. |

---

## 10. NOTAS FINALES Y CONSIDERACIONES

1. **El sistema de IA local es un fallback robusto.** Cuando no hay API keys configuradas, `generateLocalAnalysis` produce análisis estructurados y útiles basados en el contenido real de los documentos. No es un placeholder vacío.

2. **La extracción de documentos es limitada para PDFs escaneados e imágenes.** El sistema detecta estos casos y los marca como "OCR-pendiente". Un servicio OCR avanzado sería necesario para extraer texto de imágenes.

3. **El sistema de comentarios tiene control de visibilidad tanto en RLS como en cliente.** Los comentarios `interno` son invisibles para clientes en ambos niveles. Los comentarios `sistema` son visibles para ambos roles.

4. **El número de WhatsApp por defecto (573105603386) está en `app_settings`** y puede cambiarse desde el panel de Mantenimiento sin tocar código.

5. **Las 15 herramientas jurídicas pueden activarse/desactivarse individualmente** desde el panel de Mantenimiento. Los toggles se guardan en `app_settings` con claves `tool_*`.

6. **El proyecto no usa librerías de UI externas.** Todos los estilos están en `src/index.css`. Los componentes (botones, modales, tabs, badges) son CSS custom.

---

*Documento generado el 2026-10-09. Mantener actualizado al realizar cambios arquitectónicos significativos.*
