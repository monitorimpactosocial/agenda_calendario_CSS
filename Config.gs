const APP_CONFIG = {
  APP_NAME: 'PARACEL · Gestor Colaborativo de Proyectos',
  APP_VERSION: '3.0.0',
  TIMEZONE: 'America/Asuncion',
  SPREADSHEET_ID: '1p-vyQa11EupfhNf4mVEBdlb6gsC3FkOoCUNL5dy1NeA',
  ROOT_FOLDER_ID: '1LTdgB_mXLD8_9tIUF2yRylJU7nj-haPm',
  DIGEST_RECIPIENT: 'diego.meza@paracel.com.py',
  DIGEST_HOUR: 7,
  DIGEST_MINUTE: 30,
  SESSION_TTL_SECONDS: 21600,
  SESSION_PROPERTY_PREFIX: 'session:',
  SESSION_CACHE_PREFIX: 'session:',
  SALT_PROPERTY_KEY: 'PARACEL_GESTOR_APP_SALT',
  FALLBACK_SALT: 'PARACEL_GESTOR_2026_SALT_CAMBIAR_EN_PROPIEDADES',
  DEFAULT_PROJECT_COLOR: '#14532d',
  MAX_TOOLTIP_DESC: 280,
  MAX_UPLOAD_BYTES: 8 * 1024 * 1024,
  MAX_ACTIVITY_ROWS: 400
};

const SHEETS = {
  USERS: 'users',
  PROJECTS: 'projects',
  MEMBERSHIPS: 'memberships',
  TASKS: 'tasks',
  ATTACHMENTS: 'attachments',
  COMMENTS: 'comments',
  ACTIVITY: 'activity_log'
};

const HEADERS = {
  users: [
    'user_id', 'username', 'password_hash', 'display_name', 'email', 'role',
    'active', 'created_at', 'updated_at'
  ],
  projects: [
    'project_id', 'project_name', 'description', 'owner_user_id', 'status',
    'start_date', 'end_date', 'color', 'folder_url', 'created_at', 'updated_at'
  ],
  memberships: [
    'membership_id', 'project_id', 'user_id', 'role', 'active', 'created_at'
  ],
  tasks: [
    'task_id', 'project_id', 'parent_id', 'dependency_ids', 'type', 'title',
    'description', 'status', 'priority', 'progress', 'start_date', 'due_date',
    'assignee_user_id', 'assignee_name', 'work_path', 'folder_url', 'tags',
    'estimated_hours', 'actual_hours', 'created_by', 'created_at', 'updated_at'
  ],
  attachments: [
    'attachment_id', 'task_id', 'project_id', 'file_id', 'file_name', 'mime_type',
    'file_url', 'uploaded_by', 'uploaded_at'
  ],
  comments: [
    'comment_id', 'task_id', 'project_id', 'author_id', 'author_name', 'message',
    'created_at'
  ],
  activity_log: [
    'log_id', 'project_id', 'entity_type', 'entity_id', 'action', 'payload_json',
    'actor_id', 'actor_name', 'created_at'
  ]
};

const ENUMS = {
  TASK_TYPES: ['Tema', 'Subtema', 'Actividad', 'Hito'],
  TASK_STATUSES: ['Pendiente', 'En curso', 'Bloqueada', 'Completada', 'Atrasada', 'Cancelada'],
  TASK_PRIORITIES: ['Crítica', 'Alta', 'Media', 'Baja'],
  PROJECT_STATUSES: ['Activo', 'Pausado', 'Cerrado'],
  USER_ROLES: ['admin', 'manager', 'member'],
  MEMBERSHIP_ROLES: ['admin', 'manager', 'member']
};
