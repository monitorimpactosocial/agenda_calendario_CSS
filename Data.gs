function getBootstrap(token) {
  const session = getSession_(token);
  const projectIds = getAccessibleProjectIds_(session);
  const projects = readTable_('projects').filter(function(p) {
    return projectIds.indexOf(String(p.project_id)) >= 0;
  });
  const users = readTable_('users').map(function(u) {
    return {
      user_id: u.user_id,
      username: u.username,
      display_name: u.display_name,
      email: u.email,
      role: u.role,
      active: u.active
    };
  });
  const memberships = readTable_('memberships').filter(function(m) {
    return projectIds.indexOf(String(m.project_id)) >= 0 && String(m.active).toUpperCase() !== 'FALSE';
  });
  const tasks = sortTasks_(readTable_('tasks').filter(function(t) {
    return projectIds.indexOf(String(t.project_id)) >= 0;
  }).map(function(t) {
    return Object.assign({}, t, computeTaskDecorators_(t), {status: inferStatus_(t)});
  }));
  const attachments = readTable_('attachments').filter(function(a) {
    return projectIds.indexOf(String(a.project_id)) >= 0;
  });
  const comments = readTable_('comments').filter(function(c) {
    return projectIds.indexOf(String(c.project_id)) >= 0;
  });
  const activity = readTable_('activity_log').filter(function(a) {
    return ['task', 'project', 'auth', 'comment', 'attachment', 'membership', 'user'].indexOf(String(a.entity_type)) >= 0;
  }).slice(-300);

  return {
    session: {
      user_id: session.user_id,
      username: session.username,
      display_name: session.display_name,
      email: session.email,
      role: session.role
    },
    projects: projects,
    users: users,
    memberships: memberships,
    tasks: tasks,
    attachments: attachments,
    comments: comments,
    activity: activity,
    dashboard: computeDashboard_(projects, tasks)
  };
}

function computeDashboard_(projects, tasks) {
  const today = todayIso_();
  const openTasks = tasks.filter(function(t) { return t.status !== 'Completada' && t.status !== 'Cancelada'; });
  const overdue = openTasks.filter(function(t) { return t.overdue; });
  const dueToday = openTasks.filter(function(t) { return t.due_date === today; });
  const urgent = openTasks.filter(function(t) { return t.urgent; });
  const blocked = openTasks.filter(function(t) { return t.status === 'Bloqueada'; });
  const progress = tasks.length ? Math.round(tasks.reduce(function(acc, t) { return acc + Number(t.progress || 0); }, 0) / tasks.length) : 0;
  return {
    projects: projects.length,
    tasks: tasks.length,
    open_tasks: openTasks.length,
    overdue: overdue.length,
    due_today: dueToday.length,
    urgent: urgent.length,
    blocked: blocked.length,
    avg_progress: progress,
    top_urgent: sortTasks_(urgent.slice()).slice(0, 12)
  };
}

function saveProject(token, payload) {
  const session = getSession_(token);
  if (session.role !== 'admin' && session.role !== 'manager') throw new Error('No autorizado para crear o editar proyectos.');

  const projectId = payload.project_id || toId_('prj');
  const projectName = normalizeText_(payload.project_name);
  if (!projectName) throw new Error('El nombre del proyecto es obligatorio.');

  const folder = getProjectFolder_(projectId, projectName);
  const existingProject = readTable_('projects').find(function(p) { return String(p.project_id) === String(projectId); });
  const row = {
    project_id: projectId,
    project_name: projectName,
    description: normalizeText_(payload.description),
    owner_user_id: payload.owner_user_id || (existingProject ? existingProject.owner_user_id : session.user_id),
    status: payload.status || (existingProject ? existingProject.status : 'Activo'),
    start_date: toDateOnly_(payload.start_date) || (existingProject ? toDateOnly_(existingProject.start_date) : ''),
    end_date: toDateOnly_(payload.end_date) || (existingProject ? toDateOnly_(existingProject.end_date) : ''),
    color: payload.color || (existingProject ? existingProject.color : APP_CONFIG.DEFAULT_PROJECT_COLOR),
    folder_url: payload.folder_url || (existingProject ? existingProject.folder_url : folder.getUrl()),
    created_at: existingProject ? existingProject.created_at : nowIso_(),
    updated_at: nowIso_()
  };
  upsertRow_('projects', 'project_id', row);

  const memberships = readTable_('memberships');
  const already = memberships.some(function(m) {
    return String(m.project_id) === projectId && String(m.user_id) === session.user_id && String(m.active).toUpperCase() !== 'FALSE';
  });
  if (!already) {
    appendRow_('memberships', HEADERS.memberships, {
      membership_id: toId_('m'),
      project_id: projectId,
      user_id: session.user_id,
      role: session.role === 'admin' ? 'admin' : 'manager',
      active: true,
      created_at: nowIso_()
    });
  }

  logActivity_('project', projectId, payload.project_id ? 'update' : 'create', row, session);
  return row;
}

function saveUser(token, payload) {
  const session = getSession_(token);
  if (session.role !== 'admin') throw new Error('Solo el administrador puede gestionar usuarios.');

  const userId = payload.user_id || toId_('u');
  const username = normalizeText_(payload.username).toLowerCase();
  if (!username) throw new Error('El nombre de usuario es obligatorio.');

  const existing = readTable_('users').filter(function(u) { return String(u.user_id) !== String(userId); });
  if (existing.some(function(u) { return String(u.username).toLowerCase() === username; })) {
    throw new Error('El nombre de usuario ya existe.');
  }

  const previousUser = readTable_('users').find(function(u) { return String(u.user_id) === String(userId); });
  const row = {
    user_id: userId,
    username: username,
    password_hash: payload.password ? hashPassword_(payload.password) : (previousUser ? previousUser.password_hash : (payload.password_hash || '')),
    display_name: normalizeText_(payload.display_name),
    email: normalizeText_(payload.email),
    role: payload.role || (previousUser ? previousUser.role : 'member'),
    active: payload.active !== false,
    created_at: previousUser ? previousUser.created_at : nowIso_(),
    updated_at: nowIso_()
  };

  if (!row.password_hash) throw new Error('La contraseña es obligatoria para usuarios nuevos.');
  upsertRow_('users', 'user_id', row);
  logActivity_('user', userId, payload.user_id ? 'update' : 'create', {username: username, role: row.role}, session);
  return {
    user_id: row.user_id,
    username: row.username,
    display_name: row.display_name,
    email: row.email,
    role: row.role,
    active: row.active
  };
}

function saveMembership(token, payload) {
  const session = getSession_(token);
  if (!canAccessProject_(session, payload.project_id) && session.role !== 'admin') {
    throw new Error('No autorizado para gestionar este proyecto.');
  }

  const membershipId = payload.membership_id || toId_('m');
  const previousMembership = readTable_('memberships').find(function(m) { return String(m.membership_id) === String(membershipId); });
  const row = {
    membership_id: membershipId,
    project_id: payload.project_id,
    user_id: payload.user_id,
    role: payload.role || (previousMembership ? previousMembership.role : 'member'),
    active: payload.active !== false,
    created_at: previousMembership ? previousMembership.created_at : nowIso_()
  };
  upsertRow_('memberships', 'membership_id', row);
  logActivity_('membership', membershipId, payload.membership_id ? 'update' : 'create', row, session);
  return row;
}

function saveTask(token, payload) {
  const session = getSession_(token);
  const projectId = String(payload.project_id || '');
  if (!projectId) throw new Error('El proyecto es obligatorio.');
  if (!canAccessProject_(session, projectId)) throw new Error('No autorizado para este proyecto.');

  const taskId = payload.task_id || toId_('task');
  const previousTask = readTable_('tasks').find(function(t) { return String(t.task_id) === String(taskId); });
  const row = {
    task_id: taskId,
    project_id: projectId,
    parent_id: payload.parent_id || (previousTask ? previousTask.parent_id : ''),
    dependency_ids: normalizeCsvList_(payload.dependency_ids || (previousTask ? previousTask.dependency_ids : '')),
    type: ENUMS.TASK_TYPES.indexOf(payload.type) >= 0 ? payload.type : (previousTask ? previousTask.type : 'Actividad'),
    title: normalizeText_(payload.title),
    description: String(payload.description || '').trim(),
    status: payload.status || (previousTask ? previousTask.status : 'Pendiente'),
    priority: ENUMS.TASK_PRIORITIES.indexOf(payload.priority) >= 0 ? payload.priority : (previousTask ? previousTask.priority : 'Media'),
    progress: Math.max(0, Math.min(100, Number(payload.progress || 0))),
    start_date: toDateOnly_(payload.start_date) || (previousTask ? toDateOnly_(previousTask.start_date) : todayIso_()),
    due_date: toDateOnly_(payload.due_date) || toDateOnly_(payload.start_date) || (previousTask ? toDateOnly_(previousTask.due_date) : todayIso_()),
    assignee_user_id: payload.assignee_user_id || (previousTask ? previousTask.assignee_user_id : ''),
    assignee_name: normalizeText_(payload.assignee_name || (previousTask ? previousTask.assignee_name : '')),
    work_path: String(payload.work_path || (previousTask ? previousTask.work_path : '')).trim(),
    folder_url: String(payload.folder_url || (previousTask ? previousTask.folder_url : '')).trim(),
    tags: normalizeCsvList_(payload.tags || (previousTask ? previousTask.tags : '')),
    estimated_hours: payload.estimated_hours !== undefined ? payload.estimated_hours : (previousTask ? previousTask.estimated_hours : ''),
    actual_hours: payload.actual_hours !== undefined ? payload.actual_hours : (previousTask ? previousTask.actual_hours : ''),
    created_by: previousTask ? previousTask.created_by : session.user_id,
    created_at: previousTask ? previousTask.created_at : nowIso_(),
    updated_at: nowIso_()
  };

  if (!row.title) throw new Error('El título de la tarea es obligatorio.');
  if (parseDate_(row.due_date) && parseDate_(row.start_date) && parseDate_(row.due_date).getTime() < parseDate_(row.start_date).getTime()) {
    throw new Error('La fecha fin no puede ser anterior a la fecha inicio.');
  }

  row.status = inferStatus_(row);

  upsertRow_('tasks', 'task_id', row);
  logActivity_('task', taskId, payload.task_id ? 'update' : 'create', row, session);

  if (payload.comment_message) {
    saveComment(token, taskId, payload.comment_message);
  }

  return Object.assign({}, row, computeTaskDecorators_(row));
}

function deleteTask(token, taskId) {
  const session = getSession_(token);
  const tasks = readTable_('tasks');
  const task = tasks.find(function(t) { return String(t.task_id) === String(taskId); });
  if (!task) throw new Error('Tarea no encontrada.');
  if (!canAccessProject_(session, task.project_id)) throw new Error('No autorizado para eliminar esta tarea.');

  const descendants = getDescendantIds_(tasks, taskId);
  const toDelete = [String(taskId)].concat(descendants);
  writeTable_('tasks', tasks.filter(function(t) { return toDelete.indexOf(String(t.task_id)) < 0; }));
  writeTable_('attachments', readTable_('attachments').filter(function(a) { return toDelete.indexOf(String(a.task_id)) < 0; }));
  writeTable_('comments', readTable_('comments').filter(function(c) { return toDelete.indexOf(String(c.task_id)) < 0; }));
  logActivity_('task', taskId, 'delete', {deleted: toDelete}, session);
  return {ok: true, deleted: toDelete.length};
}

function getDescendantIds_(tasks, taskId) {
  const byParent = {};
  tasks.forEach(function(t) {
    const p = String(t.parent_id || '');
    if (!byParent[p]) byParent[p] = [];
    byParent[p].push(String(t.task_id));
  });
  const out = [];
  const stack = (byParent[String(taskId)] || []).slice();
  while (stack.length) {
    const current = stack.pop();
    if (out.indexOf(current) < 0) {
      out.push(current);
      (byParent[current] || []).forEach(function(child) { stack.push(child); });
    }
  }
  return out;
}

function getTaskDetail(token, taskId) {
  const session = getSession_(token);
  const task = readTable_('tasks').find(function(t) { return String(t.task_id) === String(taskId); });
  if (!task) throw new Error('Tarea inexistente.');
  if (!canAccessProject_(session, task.project_id)) throw new Error('No autorizado.');

  return {
    task: Object.assign({}, task, computeTaskDecorators_(task), {status: inferStatus_(task)}),
    attachments: readTable_('attachments').filter(function(a) { return String(a.task_id) === String(taskId); }),
    comments: readTable_('comments').filter(function(c) { return String(c.task_id) === String(taskId); }),
    related_tasks: sortTasks_(readTable_('tasks').filter(function(t) { return String(t.project_id) === String(task.project_id); }))
  };
}

function saveComment(token, taskId, message) {
  const session = getSession_(token);
  const task = readTable_('tasks').find(function(t) { return String(t.task_id) === String(taskId); });
  if (!task) throw new Error('Tarea inexistente.');
  if (!canAccessProject_(session, task.project_id)) throw new Error('No autorizado.');
  const msg = String(message || '').trim();
  if (!msg) throw new Error('El comentario está vacío.');

  const row = {
    comment_id: toId_('c'),
    task_id: taskId,
    project_id: task.project_id,
    author_id: session.user_id,
    author_name: session.display_name,
    message: msg,
    created_at: nowIso_()
  };
  appendRow_('comments', HEADERS.comments, row);
  logActivity_('comment', row.comment_id, 'create', row, session);
  return row;
}

function uploadAttachment(token, taskId, fileName, mimeType, base64Data) {
  const session = getSession_(token);
  const task = readTable_('tasks').find(function(t) { return String(t.task_id) === String(taskId); });
  if (!task) throw new Error('Tarea inexistente.');
  if (!canAccessProject_(session, task.project_id)) throw new Error('No autorizado.');
  if (!base64Data) throw new Error('No se recibió contenido de archivo.');

  const bytes = Utilities.base64Decode(base64Data);
  if (bytes.length > APP_CONFIG.MAX_UPLOAD_BYTES) {
    throw new Error('El archivo excede el tamaño máximo permitido por la aplicación.');
  }

  const projects = readTable_('projects');
  const project = projects.find(function(p) { return String(p.project_id) === String(task.project_id); });
  const folder = getProjectFolder_(project.project_id, project.project_name);
  const safeName = normalizeText_(fileName || 'adjunto').replace(/[\\/:*?"<>|]+/g, '_');
  const blob = Utilities.newBlob(bytes, mimeType || 'application/octet-stream', safeName);
  const file = folder.createFile(blob);

  const row = {
    attachment_id: toId_('att'),
    task_id: taskId,
    project_id: task.project_id,
    file_id: file.getId(),
    file_name: file.getName(),
    mime_type: file.getMimeType(),
    file_url: file.getUrl(),
    uploaded_by: session.display_name,
    uploaded_at: nowIso_()
  };
  appendRow_('attachments', HEADERS.attachments, row);
  logActivity_('attachment', row.attachment_id, 'create', row, session);
  return row;
}

function getDigestPreview(token) {
  const session = getSession_(token);
  if (session.role !== 'admin' && session.role !== 'manager') throw new Error('No autorizado.');
  return buildUrgentDigest_();
}

function buildUrgentDigest_() {
  const projects = readTable_('projects');
  const tasks = readTable_('tasks').map(function(t) {
    return Object.assign({}, t, computeTaskDecorators_(t), {status: inferStatus_(t)});
  });
  const users = readTable_('users');
  const userMap = {};
  users.forEach(function(u) { userMap[u.user_id] = u; });
  const projectMap = {};
  projects.forEach(function(p) { projectMap[p.project_id] = p; });

  const urgent = tasks.filter(function(t) {
    return t.status !== 'Completada' && t.status !== 'Cancelada' && (
      t.priority === 'Crítica' ||
      t.overdue ||
      (t.days_to_due !== null && t.days_to_due <= 2)
    );
  });

  const grouped = {};
  urgent.forEach(function(t) {
    const k = String(t.project_id);
    if (!grouped[k]) grouped[k] = [];
    grouped[k].push(t);
  });

  const lines = [];
  lines.push('Resumen automático de tareas urgentes');
  lines.push('');
  if (!urgent.length) {
    lines.push('No existen tareas urgentes pendientes al momento de la ejecución.');
  } else {
    Object.keys(grouped).sort().forEach(function(projectId) {
      const p = projectMap[projectId];
      lines.push('Proyecto: ' + (p ? p.project_name : projectId));
      sortTasks_(grouped[projectId]).slice(0, 20).forEach(function(t, idx) {
        const dueText = t.due_date ? (' | Vence: ' + t.due_date) : '';
        const resp = t.assignee_name || (userMap[t.assignee_user_id] ? userMap[t.assignee_user_id].display_name : '');
        const overdueText = t.overdue ? ' | ATRASADA' : '';
        lines.push(
          (idx + 1) + '. [' + t.priority + '] ' + t.title +
          (resp ? ' | Responsable: ' + resp : '') +
          dueText +
          ' | Estado: ' + t.status +
          overdueText +
          ' | Avance: ' + t.progress + '%'
        );
      });
      lines.push('');
    });
  }

  return {
    count: urgent.length,
    subject: 'PARACEL · Tareas urgentes pendientes',
    text: lines.join('\n')
  };
}
