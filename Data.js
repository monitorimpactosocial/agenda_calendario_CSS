function getBootstrap(token) {
  var session = getSession_(token);
  var projectIds = getAccessibleProjectIds_(session);
  var projects = readTable_('projects').filter(function(p) {
    return projectIds.indexOf(String(p.project_id)) >= 0;
  }).sort(function(a, b) {
    return String(a.project_name || '').localeCompare(String(b.project_name || ''), 'es');
  });

  var memberships = readTable_('memberships').filter(function(m) {
    return projectIds.indexOf(String(m.project_id)) >= 0 && asBool_(m.active);
  });

  var tasks = sortTasks_(readTable_('tasks').filter(function(t) {
    return projectIds.indexOf(String(t.project_id)) >= 0;
  }).map(function(t) {
    return Object.assign({}, t, computeTaskDecorators_(t), {status: inferStatus_(t)});
  }));

  var visibleUserIds = {};
  memberships.forEach(function(m) { visibleUserIds[String(m.user_id)] = true; });
  projects.forEach(function(p) { if (p.owner_user_id) visibleUserIds[String(p.owner_user_id)] = true; });
  tasks.forEach(function(t) { if (t.assignee_user_id) visibleUserIds[String(t.assignee_user_id)] = true; });
  visibleUserIds[String(session.user_id)] = true;

  var users = readTable_('users').filter(function(u) {
    return visibleUserIds[String(u.user_id)];
  }).map(function(u) {
    return {
      user_id: u.user_id,
      username: u.username,
      display_name: u.display_name,
      email: u.email,
      role: u.role,
      active: asBool_(u.active)
    };
  });

  var attachments = readTable_('attachments').filter(function(a) {
    return projectIds.indexOf(String(a.project_id)) >= 0;
  });
  var comments = readTable_('comments').filter(function(c) {
    return projectIds.indexOf(String(c.project_id)) >= 0;
  });
  var activity = readTable_('activity_log').filter(function(a) {
    var projectId = String(a.project_id || '');
    if (projectId && projectIds.indexOf(projectId) >= 0) return true;
    if (String(a.entity_type) === 'auth' && String(a.actor_id) === String(session.user_id)) return true;
    if (String(a.entity_type) === 'user' && session.role === 'admin') return true;
    return false;
  }).slice(-APP_CONFIG.MAX_ACTIVITY_ROWS);

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
  var today = todayIso_();
  var openTasks = tasks.filter(function(t) { return t.status !== 'Completada' && t.status !== 'Cancelada'; });
  var overdue = openTasks.filter(function(t) { return t.overdue; });
  var dueToday = openTasks.filter(function(t) { return t.due_date === today; });
  var urgent = openTasks.filter(function(t) { return t.urgent; });
  var blocked = openTasks.filter(function(t) { return t.status === 'Bloqueada'; });
  var progress = tasks.length ? Math.round(tasks.reduce(function(acc, t) { return acc + Number(t.progress || 0); }, 0) / tasks.length) : 0;
  return {
    projects: projects.length,
    tasks: tasks.length,
    open_tasks: openTasks.length,
    overdue: overdue.length,
    due_today: dueToday.length,
    urgent: urgent.length,
    blocked: blocked.length,
    avg_progress: progress,
    top_urgent: urgent.slice().sort(function(a, b) {
      var pa = priorityRank_(a.priority);
      var pb = priorityRank_(b.priority);
      if (pa !== pb) return pa - pb;
      var da = a.days_to_due === null ? 999999 : a.days_to_due;
      var db = b.days_to_due === null ? 999999 : b.days_to_due;
      if (da !== db) return da - db;
      return String(a.title || '').localeCompare(String(b.title || ''), 'es');
    }).slice(0, 12)
  };
}

function ensureMembershipForProject_(projectId, userId, role) {
  var rows = readTable_('memberships');
  var existing = rows.find(function(m) {
    return String(m.project_id) === String(projectId) && String(m.user_id) === String(userId);
  });
  var row = {
    membership_id: existing ? existing.membership_id : toId_('m'),
    project_id: projectId,
    user_id: userId,
    role: ENUMS.MEMBERSHIP_ROLES.indexOf(role) >= 0 ? role : 'member',
    active: true,
    created_at: existing ? existing.created_at : nowIso_()
  };
  upsertRow_('memberships', 'membership_id', row);
  return row;
}

function saveProject(token, payload) {
  var session = getSession_(token);
  if (session.role !== 'admin' && session.role !== 'manager') throw new Error('No autorizado para crear o editar proyectos.');

  return withScriptLock_(function() {
    var projectId = payload.project_id || toId_('prj');
    var projectName = normalizeText_(payload.project_name);
    if (!projectName) throw new Error('El nombre del proyecto es obligatorio.');

    var existingProject = readTable_('projects').find(function(p) { return String(p.project_id) === String(projectId); });
    if (existingProject && session.role !== 'admin' && !canAccessProject_(session, projectId)) {
      throw new Error('No autorizado para editar este proyecto.');
    }

    var startDate = toDateOnly_(payload.start_date) || (existingProject ? toDateOnly_(existingProject.start_date) : '');
    var endDate = toDateOnly_(payload.end_date) || (existingProject ? toDateOnly_(existingProject.end_date) : '');
    if (startDate && endDate && parseDate_(endDate).getTime() < parseDate_(startDate).getTime()) {
      throw new Error('La fecha fin del proyecto no puede ser anterior a la fecha inicio.');
    }

    var ownerUserId = payload.owner_user_id || (existingProject ? existingProject.owner_user_id : session.user_id);
    if (!findUserById_(ownerUserId)) throw new Error('El usuario propietario del proyecto no existe.');

    var folder = getProjectFolder_(projectId, projectName);
    var row = {
      project_id: projectId,
      project_name: projectName,
      description: normalizeText_(payload.description),
      owner_user_id: ownerUserId,
      status: ENUMS.PROJECT_STATUSES.indexOf(payload.status) >= 0 ? payload.status : (existingProject ? existingProject.status : 'Activo'),
      start_date: startDate,
      end_date: endDate,
      color: payload.color || (existingProject ? existingProject.color : APP_CONFIG.DEFAULT_PROJECT_COLOR),
      folder_url: payload.folder_url || (existingProject ? existingProject.folder_url : folder.getUrl()),
      created_at: existingProject ? existingProject.created_at : nowIso_(),
      updated_at: nowIso_()
    };
    upsertRow_('projects', 'project_id', row);

    ensureMembershipForProject_(projectId, ownerUserId, session.role === 'admin' ? 'admin' : 'manager');
    ensureMembershipForProject_(projectId, session.user_id, session.role === 'admin' ? 'admin' : 'manager');

    logActivity_('project', projectId, payload.project_id ? 'update' : 'create', row, session, projectId);
    return row;
  });
}

function saveUser(token, payload) {
  var session = getSession_(token);
  if (session.role !== 'admin') throw new Error('Solo el administrador puede gestionar usuarios.');

  return withScriptLock_(function() {
    var userId = payload.user_id || toId_('u');
    var username = normalizeText_(payload.username).toLowerCase();
    if (!username) throw new Error('El nombre de usuario es obligatorio.');
    if (!normalizeText_(payload.display_name)) throw new Error('El nombre visible del usuario es obligatorio.');
    var role = ENUMS.USER_ROLES.indexOf(payload.role) >= 0 ? payload.role : 'member';

    var allUsers = readTable_('users');
    if (allUsers.some(function(u) {
      return String(u.user_id) !== String(userId) && String(u.username).toLowerCase() === username;
    })) {
      throw new Error('El nombre de usuario ya existe.');
    }

    var previousUser = allUsers.find(function(u) { return String(u.user_id) === String(userId); });
    var passwordHash = payload.password ? hashPassword_(payload.password) : (previousUser ? previousUser.password_hash : (payload.password_hash || ''));
    if (!passwordHash) throw new Error('La contraseña es obligatoria para usuarios nuevos.');

    var row = {
      user_id: userId,
      username: username,
      password_hash: passwordHash,
      display_name: normalizeText_(payload.display_name),
      email: normalizeText_(payload.email),
      role: role,
      active: payload.active === undefined ? (previousUser ? asBool_(previousUser.active) : true) : asBool_(payload.active),
      created_at: previousUser ? previousUser.created_at : nowIso_(),
      updated_at: nowIso_()
    };
    upsertRow_('users', 'user_id', row);
    logActivity_('user', userId, payload.user_id ? 'update' : 'create', {username: username, role: row.role}, session, '');
    return {
      user_id: row.user_id,
      username: row.username,
      display_name: row.display_name,
      email: row.email,
      role: row.role,
      active: row.active
    };
  });
}

function saveMembership(token, payload) {
  var session = getSession_(token);
  var projectId = String(payload.project_id || '');
  if (!projectId) throw new Error('El proyecto es obligatorio.');
  if (!findProjectById_(projectId)) throw new Error('El proyecto no existe.');
  if (!findUserById_(payload.user_id)) throw new Error('El usuario no existe.');
  if (session.role !== 'admin' && !canAccessProject_(session, projectId)) {
    throw new Error('No autorizado para gestionar este proyecto.');
  }

  return withScriptLock_(function() {
    var role = ENUMS.MEMBERSHIP_ROLES.indexOf(payload.role) >= 0 ? payload.role : 'member';
    var all = readTable_('memberships');
    var previousMembership = all.find(function(m) {
      return String(m.membership_id) === String(payload.membership_id || '') ||
        (String(m.project_id) === projectId && String(m.user_id) === String(payload.user_id));
    });

    var row = {
      membership_id: previousMembership ? previousMembership.membership_id : (payload.membership_id || toId_('m')),
      project_id: projectId,
      user_id: payload.user_id,
      role: role,
      active: payload.active === undefined ? true : asBool_(payload.active),
      created_at: previousMembership ? previousMembership.created_at : nowIso_()
    };
    upsertRow_('memberships', 'membership_id', row);
    logActivity_('membership', row.membership_id, previousMembership ? 'update' : 'create', row, session, projectId);
    return row;
  });
}

function wouldCreateParentCycle_(tasks, taskId, parentId) {
  var parentMap = {};
  tasks.forEach(function(t) { parentMap[String(t.task_id)] = String(t.parent_id || ''); });
  parentMap[String(taskId)] = String(parentId || '');
  var visited = {};
  var current = String(parentId || '');
  while (current) {
    if (current === String(taskId)) return true;
    if (visited[current]) return true;
    visited[current] = true;
    current = parentMap[current] || '';
  }
  return false;
}

function saveTask(token, payload) {
  var session = getSession_(token);
  var projectId = String(payload.project_id || '');
  if (!projectId) throw new Error('El proyecto es obligatorio.');
  if (!findProjectById_(projectId)) throw new Error('El proyecto no existe.');
  if (!canAccessProject_(session, projectId)) throw new Error('No autorizado para este proyecto.');

  return withScriptLock_(function() {
    var allTasks = readTable_('tasks');
    var taskId = payload.task_id || toId_('task');
    var previousTask = allTasks.find(function(t) { return String(t.task_id) === String(taskId); });
    var type = ENUMS.TASK_TYPES.indexOf(payload.type) >= 0 ? payload.type : (previousTask ? previousTask.type : 'Actividad');
    var status = ENUMS.TASK_STATUSES.indexOf(payload.status) >= 0 ? payload.status : (previousTask ? previousTask.status : 'Pendiente');
    var priority = ENUMS.TASK_PRIORITIES.indexOf(payload.priority) >= 0 ? payload.priority : (previousTask ? previousTask.priority : 'Media');
    var parentId = String(payload.parent_id || (previousTask ? previousTask.parent_id : '') || '');
    var startDate = toDateOnly_(payload.start_date) || (previousTask ? toDateOnly_(previousTask.start_date) : todayIso_());
    var dueDate = toDateOnly_(payload.due_date) || (previousTask ? toDateOnly_(previousTask.due_date) : startDate || todayIso_());
    var assigneeUserId = String(payload.assignee_user_id || (previousTask ? previousTask.assignee_user_id : '') || '');

    if (!normalizeText_(payload.title)) throw new Error('El título de la tarea es obligatorio.');
    if (parseDate_(dueDate) && parseDate_(startDate) && parseDate_(dueDate).getTime() < parseDate_(startDate).getTime()) {
      throw new Error('La fecha fin no puede ser anterior a la fecha inicio.');
    }
    if (parentId === String(taskId)) throw new Error('Una tarea no puede ser padre de sí misma.');

    if (parentId) {
      var parentTask = allTasks.find(function(t) { return String(t.task_id) === parentId; });
      if (!parentTask) throw new Error('La tarea padre indicada no existe.');
      if (String(parentTask.project_id) !== projectId) throw new Error('La tarea padre debe pertenecer al mismo proyecto.');
      if (wouldCreateParentCycle_(allTasks, taskId, parentId)) throw new Error('La relación padre-hijo genera un ciclo inválido.');
    }

    var dependencies = normalizeCsvList_(payload.dependency_ids || (previousTask ? previousTask.dependency_ids : ''));
    dependencies.split(',').map(function(x) { return normalizeText_(x); }).filter(String).forEach(function(dep) {
      if (dep === String(taskId)) throw new Error('Una tarea no puede depender de sí misma.');
      var depTask = allTasks.find(function(t) { return String(t.task_id) === dep; });
      if (depTask && String(depTask.project_id) !== projectId) throw new Error('Las dependencias por ID deben pertenecer al mismo proyecto.');
    });

    if (assigneeUserId && !userHasProjectAccess_(assigneeUserId, projectId)) {
      throw new Error('El responsable seleccionado no pertenece al proyecto o no tiene acceso.');
    }

    var row = {
      task_id: taskId,
      project_id: projectId,
      parent_id: parentId,
      dependency_ids: dependencies,
      type: type,
      title: normalizeText_(payload.title),
      description: String(payload.description || (previousTask ? previousTask.description : '') || '').trim(),
      status: status,
      priority: priority,
      progress: Math.max(0, Math.min(100, Math.round(asNumber_(payload.progress, previousTask ? previousTask.progress : 0) || 0))),
      start_date: startDate,
      due_date: dueDate,
      assignee_user_id: assigneeUserId,
      assignee_name: normalizeText_(payload.assignee_name || (previousTask ? previousTask.assignee_name : '')),
      work_path: String(payload.work_path || (previousTask ? previousTask.work_path : '') || '').trim(),
      folder_url: String(payload.folder_url || (previousTask ? previousTask.folder_url : '') || '').trim(),
      tags: normalizeCsvList_(payload.tags || (previousTask ? previousTask.tags : '')),
      estimated_hours: payload.estimated_hours === '' ? '' : asNumber_(payload.estimated_hours, previousTask ? previousTask.estimated_hours : ''),
      actual_hours: payload.actual_hours === '' ? '' : asNumber_(payload.actual_hours, previousTask ? previousTask.actual_hours : ''),
      created_by: previousTask ? previousTask.created_by : session.user_id,
      created_at: previousTask ? previousTask.created_at : nowIso_(),
      updated_at: nowIso_()
    };

    row.status = inferStatus_(row);
    upsertRow_('tasks', 'task_id', row);
    logActivity_('task', taskId, previousTask ? 'update' : 'create', row, session, projectId);

    if (payload.comment_message) {
      appendCommentForTask_(session, row, payload.comment_message);
    }

    return Object.assign({}, row, computeTaskDecorators_(row));
  });
}

function appendCommentForTask_(session, task, message) {
  var msg = String(message || '').trim();
  if (!msg) return null;
  var row = {
    comment_id: toId_('c'),
    task_id: task.task_id,
    project_id: task.project_id,
    author_id: session.user_id,
    author_name: session.display_name,
    message: msg,
    created_at: nowIso_()
  };
  appendRow_('comments', HEADERS.comments, row);
  logActivity_('comment', row.comment_id, 'create', row, session, task.project_id);
  return row;
}

function deleteTask(token, taskId) {
  var session = getSession_(token);
  return withScriptLock_(function() {
    var tasks = readTable_('tasks');
    var task = tasks.find(function(t) { return String(t.task_id) === String(taskId); });
    if (!task) throw new Error('Tarea no encontrada.');
    if (!canAccessProject_(session, task.project_id)) throw new Error('No autorizado para eliminar esta tarea.');

    var descendants = getDescendantIds_(tasks, taskId);
    var toDelete = [String(taskId)].concat(descendants);
    var attachments = readTable_('attachments');
    attachments.filter(function(a) { return toDelete.indexOf(String(a.task_id)) >= 0; }).forEach(function(a) {
      try { DriveApp.getFileById(a.file_id).setTrashed(true); } catch (e) {}
    });

    writeTable_('tasks', tasks.filter(function(t) { return toDelete.indexOf(String(t.task_id)) < 0; }));
    writeTable_('attachments', attachments.filter(function(a) { return toDelete.indexOf(String(a.task_id)) < 0; }));
    writeTable_('comments', readTable_('comments').filter(function(c) { return toDelete.indexOf(String(c.task_id)) < 0; }));
    logActivity_('task', taskId, 'delete', {deleted: toDelete}, session, task.project_id);
    return {ok: true, deleted: toDelete.length};
  });
}

function getDescendantIds_(tasks, taskId) {
  var byParent = {};
  tasks.forEach(function(t) {
    var p = String(t.parent_id || '');
    if (!byParent[p]) byParent[p] = [];
    byParent[p].push(String(t.task_id));
  });
  var out = [];
  var stack = (byParent[String(taskId)] || []).slice();
  while (stack.length) {
    var current = stack.pop();
    if (out.indexOf(current) < 0) {
      out.push(current);
      (byParent[current] || []).forEach(function(child) { stack.push(child); });
    }
  }
  return out;
}

function getTaskDetail(token, taskId) {
  var session = getSession_(token);
  var task = readTable_('tasks').find(function(t) { return String(t.task_id) === String(taskId); });
  if (!task) throw new Error('Tarea inexistente.');
  if (!canAccessProject_(session, task.project_id)) throw new Error('No autorizado.');

  return {
    task: Object.assign({}, task, computeTaskDecorators_(task), {status: inferStatus_(task)}),
    attachments: readTable_('attachments').filter(function(a) { return String(a.task_id) === String(taskId); }).sort(function(a, b) {
      return String(b.uploaded_at || '').localeCompare(String(a.uploaded_at || ''));
    }),
    comments: readTable_('comments').filter(function(c) { return String(c.task_id) === String(taskId); }).sort(function(a, b) {
      return String(a.created_at || '').localeCompare(String(b.created_at || ''));
    }),
    related_tasks: sortTasks_(readTable_('tasks').filter(function(t) { return String(t.project_id) === String(task.project_id); }))
  };
}

function saveComment(token, taskId, message) {
  var session = getSession_(token);
  return withScriptLock_(function() {
    var task = readTable_('tasks').find(function(t) { return String(t.task_id) === String(taskId); });
    if (!task) throw new Error('Tarea inexistente.');
    if (!canAccessProject_(session, task.project_id)) throw new Error('No autorizado.');
    var row = appendCommentForTask_(session, task, message);
    if (!row) throw new Error('El comentario está vacío.');
    return row;
  });
}

function uploadAttachment(token, taskId, fileName, mimeType, base64Data) {
  var session = getSession_(token);
  return withScriptLock_(function() {
    var task = readTable_('tasks').find(function(t) { return String(t.task_id) === String(taskId); });
    if (!task) throw new Error('Tarea inexistente.');
    if (!canAccessProject_(session, task.project_id)) throw new Error('No autorizado.');
    if (!base64Data) throw new Error('No se recibió contenido de archivo.');

    var bytes = Utilities.base64Decode(base64Data);
    if (bytes.length > APP_CONFIG.MAX_UPLOAD_BYTES) throw new Error('El archivo excede el tamaño máximo permitido por la aplicación.');

    var project = findProjectById_(task.project_id);
    if (!project) throw new Error('El proyecto asociado a la tarea no existe.');
    var folder = getTaskFolder_(project, task);
    var safeName = safeFileName_(fileName || 'adjunto');
    var blob = Utilities.newBlob(bytes, mimeType || 'application/octet-stream', safeName);
    var file = folder.createFile(blob);

    var row = {
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
    logActivity_('attachment', row.attachment_id, 'create', row, session, task.project_id);
    return row;
  });
}

function getDigestPreview(token) {
  var session = getSession_(token);
  if (session.role !== 'admin' && session.role !== 'manager') throw new Error('No autorizado.');
  return buildUrgentDigest_();
}

function buildUrgentDigest_() {
  var projects = readTable_('projects');
  var projectMap = {};
  projects.forEach(function(p) { projectMap[String(p.project_id)] = p; });
  var users = readTable_('users');
  var userMap = {};
  users.forEach(function(u) { userMap[String(u.user_id)] = u; });

  var urgent = readTable_('tasks').map(function(t) {
    return Object.assign({}, t, computeTaskDecorators_(t), {status: inferStatus_(t)});
  }).filter(function(t) {
    return t.status !== 'Completada' && t.status !== 'Cancelada' && (t.priority === 'Crítica' || t.overdue || (t.days_to_due !== null && t.days_to_due <= 2));
  }).sort(function(a, b) {
    var projectCmp = String((projectMap[a.project_id] || {}).project_name || a.project_id).localeCompare(String((projectMap[b.project_id] || {}).project_name || b.project_id), 'es');
    if (projectCmp !== 0) return projectCmp;
    var pa = priorityRank_(a.priority);
    var pb = priorityRank_(b.priority);
    if (pa !== pb) return pa - pb;
    var da = a.days_to_due === null ? 999999 : a.days_to_due;
    var db = b.days_to_due === null ? 999999 : b.days_to_due;
    if (da !== db) return da - db;
    return String(a.title || '').localeCompare(String(b.title || ''), 'es');
  });

  var grouped = {};
  urgent.forEach(function(t) {
    var k = String(t.project_id);
    if (!grouped[k]) grouped[k] = [];
    grouped[k].push(t);
  });

  var textLines = [];
  var htmlSections = [];
  textLines.push('Resumen automático de tareas urgentes');
  textLines.push('Fecha de generación: ' + nowIso_());
  textLines.push('');

  if (!urgent.length) {
    textLines.push('No existen tareas urgentes pendientes al momento de la ejecución.');
    htmlSections.push('<p>No existen tareas urgentes pendientes al momento de la ejecución.</p>');
  } else {
    Object.keys(grouped).sort(function(a, b) {
      return String((projectMap[a] || {}).project_name || a).localeCompare(String((projectMap[b] || {}).project_name || b), 'es');
    }).forEach(function(projectId) {
      var p = projectMap[projectId];
      var projectName = p ? p.project_name : projectId;
      textLines.push('Proyecto: ' + projectName);
      var htmlList = ['<h3 style="margin:18px 0 8px;color:#14532d">' + sanitizeHtmlText_(projectName) + '</h3><ul>'];
      grouped[projectId].slice(0, 25).forEach(function(t, idx) {
        var resp = t.assignee_name || (userMap[t.assignee_user_id] ? userMap[t.assignee_user_id].display_name : '');
        var dueText = t.due_date ? (' | Vence: ' + t.due_date) : '';
        var overdueText = t.overdue ? ' | ATRASADA' : '';
        textLines.push((idx + 1) + '. [' + t.priority + '] ' + t.title + (resp ? ' | Responsable: ' + resp : '') + dueText + ' | Estado: ' + t.status + overdueText + ' | Avance: ' + t.progress + '%');
        htmlList.push('<li><strong>[' + sanitizeHtmlText_(t.priority) + ']</strong> ' + sanitizeHtmlText_(t.title) + (resp ? ' <span style="color:#475569">· Responsable: ' + sanitizeHtmlText_(resp) + '</span>' : '') + (t.due_date ? ' <span style="color:#475569">· Vence: ' + sanitizeHtmlText_(t.due_date) + '</span>' : '') + ' <span style="color:#475569">· Estado: ' + sanitizeHtmlText_(t.status) + '</span>' + (t.overdue ? ' <span style="color:#b91c1c;font-weight:700">· ATRASADA</span>' : '') + ' <span style="color:#475569">· Avance: ' + sanitizeHtmlText_(String(t.progress)) + '%</span></li>');
      });
      textLines.push('');
      htmlList.push('</ul>');
      htmlSections.push(htmlList.join(''));
    });
  }

  return {
    count: urgent.length,
    subject: 'PARACEL · Tareas urgentes pendientes',
    text: textLines.join('\n'),
    html: '<div style="font-family:Segoe UI,Arial,sans-serif;font-size:13px;line-height:1.55"><h2 style="color:#14532d;margin:0 0 12px">PARACEL · Resumen de tareas urgentes</h2><p><strong>Fecha de generación:</strong> ' + sanitizeHtmlText_(nowIso_()) + '</p>' + htmlSections.join('') + '</div>'
  };
}
