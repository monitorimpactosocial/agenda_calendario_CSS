function doGet() {
  try { safeAutoInit_(); } catch (e) {}
  return HtmlService
    .createTemplateFromFile('Index')
    .evaluate()
    .setTitle(APP_CONFIG.APP_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getSpreadsheetUrl(token) {
  getSession_(token); // valida sesión
  return {
    url: 'https://docs.google.com/spreadsheets/d/' + APP_CONFIG.SPREADSHEET_ID + '/edit'
  };
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function nowIso_() {
  return Utilities.formatDate(new Date(), APP_CONFIG.TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss");
}

function todayIso_() {
  return Utilities.formatDate(new Date(), APP_CONFIG.TIMEZONE, 'yyyy-MM-dd');
}

function toDateOnly_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, APP_CONFIG.TIMEZONE, 'yyyy-MM-dd');
  }
  var str = String(value).trim();
  if (!str) return '';
  var m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[0] : '';
}

function parseDate_(value) {
  var iso = toDateOnly_(value);
  return iso ? new Date(iso + 'T00:00:00') : null;
}

function diffDays_(a, b) {
  var ad = parseDate_(a);
  var bd = parseDate_(b);
  if (!ad || !bd) return null;
  return Math.round((bd.getTime() - ad.getTime()) / 86400000);
}

function toId_(prefix) {
  return prefix + '_' + Utilities.getUuid().replace(/-/g, '').slice(0, 12);
}

function normalizeText_(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeCsvList_(value) {
  var arr = Array.isArray(value) ? value : String(value || '').split(',');
  var seen = {};
  return arr.map(function(x) { return normalizeText_(x); }).filter(function(x) {
    if (!x) return false;
    var k = x.toLowerCase();
    if (seen[k]) return false;
    seen[k] = true;
    return true;
  }).join(', ');
}

function asBool_(value) {
  if (value === true || value === false) return value;
  var s = String(value || '').trim().toLowerCase();
  return ['true', '1', 'si', 'sí', 'yes', 'y', 'verdadero', 'v', 'activo', 'a'].indexOf(s) >= 0;
}

function asNumber_(value, defaultValue) {
  var n = Number(value);
  return isNaN(n) ? defaultValue : n;
}

function withScriptLock_(callback) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return callback();
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function getSpreadsheet_() {
  return SpreadsheetApp.openById(APP_CONFIG.SPREADSHEET_ID);
}

function getScriptProperties_() {
  return PropertiesService.getScriptProperties();
}

function getSecretSalt_() {
  return getScriptProperties_().getProperty(APP_CONFIG.SALT_PROPERTY_KEY) || APP_CONFIG.FALLBACK_SALT;
}

function initializeSecrets_() {
  var props = getScriptProperties_();
  if (!props.getProperty(APP_CONFIG.SALT_PROPERTY_KEY)) {
    props.setProperty(APP_CONFIG.SALT_PROPERTY_KEY, Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''));
  }
}

function getOrCreateSheet_(name, headers) {
  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  ensureSheetSchema_(name, headers, sh);
  return sh;
}

function ensureSheetSchema_(name, headers, sh) {
  sh = sh || getSpreadsheet_().getSheetByName(name);
  if (!sh) sh = getSpreadsheet_().insertSheet(name);
  var lastCol = Math.max(sh.getLastColumn(), headers.length, 1);
  var lastRow = Math.max(sh.getLastRow(), 1);
  var currentHeaders = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function(v) { return normalizeText_(v); });
  var same = headers.every(function(h, i) { return currentHeaders[i] === h; });

  if (!same) {
    var existingData = [];
    if (lastRow > 1) existingData = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
    var headerIndex = {};
    currentHeaders.forEach(function(h, i) { if (h && headerIndex[h] === undefined) headerIndex[h] = i; });
    var migrated = existingData.map(function(row) {
      return headers.map(function(h) { return headerIndex[h] !== undefined ? row[headerIndex[h]] : ''; });
    });
    sh.clearContents();
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    if (migrated.length) sh.getRange(2, 1, migrated.length, headers.length).setValues(migrated);
  }
  if (sh.getFrozenRows() < 1) sh.setFrozenRows(1);
  autoResize_(sh, headers.length);
  return sh;
}

function getSheetData_(name, headers) {
  var sh = getOrCreateSheet_(name, headers);
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  var values = sh.getRange(2, 1, lastRow - 1, headers.length).getValues();
  return values.map(function(row) {
    var obj = {};
    headers.forEach(function(h, idx) {
      var val = row[idx];
      if (Object.prototype.toString.call(val) === '[object Date]') {
        val = Utilities.formatDate(val, APP_CONFIG.TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss");
      }
      obj[h] = val;
    });
    return obj;
  });
}

function setSheetData_(name, headers, rows) {
  var sh = getOrCreateSheet_(name, headers);
  var totalCols = Math.max(headers.length, sh.getLastColumn(), 1);
  var lastRow = sh.getLastRow();
  if (lastRow > 1) sh.getRange(2, 1, lastRow - 1, totalCols).clearContent();
  if (rows.length) {
    var matrix = rows.map(function(obj) { return headers.map(function(h) { return obj[h] !== undefined ? obj[h] : ''; }); });
    sh.getRange(2, 1, matrix.length, headers.length).setValues(matrix);
  }
  autoResize_(sh, headers.length);
}

function appendRow_(name, headers, rowObj) {
  var sh = getOrCreateSheet_(name, headers);
  sh.appendRow(headers.map(function(h) { return rowObj[h] !== undefined ? rowObj[h] : ''; }));
}

function autoResize_(sheet, cols) {
  try { sheet.autoResizeColumns(1, cols); } catch (err) {}
}

function hashPassword_(password) {
  var raw = getSecretSalt_() + '|' + String(password || '');
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
  return bytes.map(function(b) {
    var v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

function getCache_() {
  return CacheService.getScriptCache();
}

function buildSessionPropertyKey_(token) {
  return APP_CONFIG.SESSION_PROPERTY_PREFIX + token;
}

function createSession_(user) {
  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  var payload = {
    token: token,
    user_id: user.user_id,
    username: user.username,
    display_name: user.display_name,
    email: user.email,
    role: user.role,
    active: user.active,
    created_at: nowIso_(),
    expires_at_ms: Date.now() + APP_CONFIG.SESSION_TTL_SECONDS * 1000
  };
  var raw = JSON.stringify(payload);
  getCache_().put(APP_CONFIG.SESSION_CACHE_PREFIX + token, raw, APP_CONFIG.SESSION_TTL_SECONDS);
  getScriptProperties_().setProperty(buildSessionPropertyKey_(token), raw);
  return payload;
}

function getSession_(token) {
  if (!token) throw new Error('Sesión inexistente.');
  var cacheKey = APP_CONFIG.SESSION_CACHE_PREFIX + token;
  var raw = getCache_().get(cacheKey) || getScriptProperties_().getProperty(buildSessionPropertyKey_(token));
  if (!raw) throw new Error('La sesión expiró. Inicie sesión nuevamente.');
  var payload = JSON.parse(raw);
  if (!payload.expires_at_ms || Number(payload.expires_at_ms) < Date.now()) {
    destroySession_(token);
    throw new Error('La sesión expiró. Inicie sesión nuevamente.');
  }
  getCache_().put(cacheKey, raw, APP_CONFIG.SESSION_TTL_SECONDS);
  return payload;
}

function destroySession_(token) {
  if (!token) return true;
  getCache_().remove(APP_CONFIG.SESSION_CACHE_PREFIX + token);
  getScriptProperties_().deleteProperty(buildSessionPropertyKey_(token));
  return true;
}

function readTable_(sheetName) { return getSheetData_(sheetName, HEADERS[sheetName]); }
function writeTable_(sheetName, rows) { setSheetData_(sheetName, HEADERS[sheetName], rows); }

function upsertRow_(sheetName, keyField, rowObj) {
  var rows = readTable_(sheetName);
  var idx = rows.findIndex(function(r) { return String(r[keyField]) === String(rowObj[keyField]); });
  if (idx >= 0) rows[idx] = Object.assign({}, rows[idx], rowObj);
  else rows.push(rowObj);
  writeTable_(sheetName, rows);
  return rowObj;
}

function removeRow_(sheetName, keyField, keyValue) {
  var rows = readTable_(sheetName).filter(function(r) { return String(r[keyField]) !== String(keyValue); });
  writeTable_(sheetName, rows);
}

function findUserById_(userId) {
  return readTable_('users').find(function(u) { return String(u.user_id) === String(userId); }) || null;
}

function findProjectById_(projectId) {
  return readTable_('projects').find(function(p) { return String(p.project_id) === String(projectId); }) || null;
}

function userHasProjectAccess_(userId, projectId) {
  var user = findUserById_(userId);
  if (!user) return false;
  if (String(user.role) === 'admin') return true;
  var project = findProjectById_(projectId);
  if (project && String(project.owner_user_id) === String(userId)) return true;
  return readTable_('memberships').some(function(m) {
    return String(m.project_id) === String(projectId) && String(m.user_id) === String(userId) && asBool_(m.active);
  });
}

function canAccessProject_(session, projectId) {
  if (session.role === 'admin') return true;
  var project = findProjectById_(projectId);
  if (!project) return false;
  if (String(project.owner_user_id) === String(session.user_id)) return true;
  return readTable_('memberships').some(function(m) {
    return String(m.project_id) === String(projectId) && String(m.user_id) === String(session.user_id) && asBool_(m.active);
  });
}

function getAccessibleProjectIds_(session) {
  if (session.role === 'admin') {
    return readTable_('projects').map(function(p) { return String(p.project_id); });
  }
  var out = {};
  readTable_('projects').forEach(function(p) { if (String(p.owner_user_id) === String(session.user_id)) out[String(p.project_id)] = true; });
  readTable_('memberships').forEach(function(m) { if (String(m.user_id) === String(session.user_id) && asBool_(m.active)) out[String(m.project_id)] = true; });
  return Object.keys(out);
}

function inferStatus_(task) {
  var progress = asNumber_(task.progress, 0);
  var due = parseDate_(task.due_date);
  var today = parseDate_(todayIso_());
  var status = normalizeText_(task.status);
  if (status === 'Cancelada') return 'Cancelada';
  if (status === 'Bloqueada') return 'Bloqueada';
  if (progress >= 100 || status === 'Completada') return 'Completada';
  if (due && due.getTime() < today.getTime()) return 'Atrasada';
  if (status === 'En curso' || progress > 0) return 'En curso';
  return 'Pendiente';
}

function computeTaskDecorators_(task) {
  var inferredStatus = inferStatus_(task);
  var due = toDateOnly_(task.due_date);
  var start = toDateOnly_(task.start_date);
  var daysToDue = due ? diffDays_(todayIso_(), due) : null;
  var overdue = daysToDue !== null && daysToDue < 0 && inferredStatus !== 'Completada' && inferredStatus !== 'Cancelada';
  var urgent = inferredStatus !== 'Completada' && inferredStatus !== 'Cancelada' && (String(task.priority) === 'Crítica' || overdue || (daysToDue !== null && daysToDue <= 2));
  return {
    days_to_due: daysToDue,
    overdue: overdue,
    urgent: urgent,
    inferred_status: inferredStatus,
    duration_days: start && due ? Math.max(0, diffDays_(start, due)) + 1 : 1
  };
}

function priorityRank_(priority) {
  var ranks = {'Crítica': 0, 'Alta': 1, 'Media': 2, 'Baja': 3};
  return ranks[priority] !== undefined ? ranks[priority] : 99;
}

function compareTaskSiblings_(a, b) {
  var typeOrder = {Tema: 0, Subtema: 1, Actividad: 2, Hito: 3};
  var ta = typeOrder[a.type] !== undefined ? typeOrder[a.type] : 99;
  var tb = typeOrder[b.type] !== undefined ? typeOrder[b.type] : 99;
  if (ta !== tb) return ta - tb;
  var sa = toDateOnly_(a.start_date) || '9999-12-31';
  var sb = toDateOnly_(b.start_date) || '9999-12-31';
  if (sa !== sb) return sa < sb ? -1 : 1;
  var da = toDateOnly_(a.due_date) || '9999-12-31';
  var db = toDateOnly_(b.due_date) || '9999-12-31';
  if (da !== db) return da < db ? -1 : 1;
  var pa = priorityRank_(a.priority);
  var pb = priorityRank_(b.priority);
  if (pa !== pb) return pa - pb;
  return String(a.title || '').localeCompare(String(b.title || ''), 'es');
}

function sortTasks_(rows) {
  var all = rows.slice();
  var byId = {};
  all.forEach(function(t) { byId[String(t.task_id)] = t; });
  var grouped = {};
  all.forEach(function(t) {
    var pid = String(t.project_id || '');
    var parent = String(t.parent_id || '');
    if (parent && !byId[parent]) parent = '';
    var key = pid + '||' + parent;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(t);
  });
  Object.keys(grouped).forEach(function(k) { grouped[k].sort(compareTaskSiblings_); });
  var projectIds = Array.from(new Set(all.map(function(t) { return String(t.project_id || ''); }))).sort();
  var out = [];
  projectIds.forEach(function(projectId) {
    var visited = {};
    var walk = function(parentId) {
      var key = projectId + '||' + parentId;
      (grouped[key] || []).forEach(function(task) {
        var taskId = String(task.task_id);
        if (visited[taskId]) return;
        visited[taskId] = true;
        out.push(task);
        walk(taskId);
      });
    };
    walk('');
    all.filter(function(t) { return String(t.project_id) === projectId && !visited[String(t.task_id)]; }).sort(compareTaskSiblings_).forEach(function(task) {
      var taskId = String(task.task_id);
      if (!visited[taskId]) {
        visited[taskId] = true;
        out.push(task);
        walk(taskId);
      }
    });
  });
  return out;
}

function logActivity_(entityType, entityId, action, payload, session, projectId) {
  appendRow_('activity_log', HEADERS.activity_log, {
    log_id: toId_('log'),
    project_id: projectId || (payload && payload.project_id) || '',
    entity_type: entityType,
    entity_id: entityId,
    action: action,
    payload_json: JSON.stringify(payload || {}),
    actor_id: session ? session.user_id : '',
    actor_name: session ? session.display_name : 'Sistema',
    created_at: nowIso_()
  });
}

function sanitizeHtmlText_(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function safeFileName_(value) {
  return normalizeText_(value || 'archivo').replace(/[\/:*?"<>|#%{}~&]+/g, '_').slice(0, 120);
}

function truncateText_(value, maxLen) {
  var text = String(value || '');
  return text.length > maxLen ? text.slice(0, maxLen - 1) + '…' : text;
}

function getProjectFolder_(projectId, projectName) {
  var root = DriveApp.getFolderById(APP_CONFIG.ROOT_FOLDER_ID);
  var folderName = safeFileName_(projectId + ' - ' + projectName);
  var folders = root.getFoldersByName(folderName);
  if (folders.hasNext()) return folders.next();
  return root.createFolder(folderName);
}

function getTaskFolder_(project, task) {
  var projectFolder = getProjectFolder_(project.project_id, project.project_name);
  var tasksFolders = projectFolder.getFoldersByName('Tareas');
  var tasksRoot = tasksFolders.hasNext() ? tasksFolders.next() : projectFolder.createFolder('Tareas');
  var folderName = safeFileName_(task.task_id + ' - ' + truncateText_(task.title || 'Tarea', 70));
  var folders = tasksRoot.getFoldersByName(folderName);
  if (folders.hasNext()) return folders.next();
  return tasksRoot.createFolder(folderName);
}
