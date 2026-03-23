function doGet() {
  return HtmlService
    .createTemplateFromFile('Index')
    .evaluate()
    .setTitle(APP_CONFIG.APP_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
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
  const str = String(value).trim();
  if (!str) return '';
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[0] : '';
}

function parseDate_(value) {
  const iso = toDateOnly_(value);
  return iso ? new Date(iso + 'T00:00:00') : null;
}

function diffDays_(a, b) {
  const ad = parseDate_(a);
  const bd = parseDate_(b);
  if (!ad || !bd) return null;
  const ms = bd.getTime() - ad.getTime();
  return Math.round(ms / 86400000);
}

function toId_(prefix) {
  return prefix + '_' + Utilities.getUuid().replace(/-/g, '').slice(0, 12);
}

function normalizeText_(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeCsvList_(value) {
  if (Array.isArray(value)) return value.map(function(x) { return normalizeText_(x); }).filter(String).join(', ');
  return normalizeText_(value);
}

function getSpreadsheet_() {
  return SpreadsheetApp.openById(APP_CONFIG.SPREADSHEET_ID);
}

function getOrCreateSheet_(name, headers) {
  const ss = getSpreadsheet_();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  const currentHeaders = sh.getLastColumn() > 0 ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] : [];
  const same = currentHeaders.length === headers.length && currentHeaders.every(function(v, i) { return v === headers[i]; });
  if (!same) {
    sh.clear();
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
  }
  if (sh.getFrozenRows() < 1) sh.setFrozenRows(1);
  return sh;
}

function getSheetData_(name, headers) {
  const sh = getOrCreateSheet_(name, headers);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  const values = sh.getRange(2, 1, lastRow - 1, headers.length).getValues();
  return values.map(function(row) {
    const obj = {};
    headers.forEach(function(h, idx) { obj[h] = row[idx]; });
    return obj;
  });
}

function setSheetData_(name, headers, rows) {
  const sh = getOrCreateSheet_(name, headers);
  sh.clearContents();
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  sh.setFrozenRows(1);
  if (rows.length) {
    const matrix = rows.map(function(obj) {
      return headers.map(function(h) { return obj[h] !== undefined ? obj[h] : ''; });
    });
    sh.getRange(2, 1, matrix.length, headers.length).setValues(matrix);
  }
  autoResize_(sh, headers.length);
}

function appendRow_(name, headers, rowObj) {
  const sh = getOrCreateSheet_(name, headers);
  sh.appendRow(headers.map(function(h) { return rowObj[h] !== undefined ? rowObj[h] : ''; }));
}

function autoResize_(sheet, cols) {
  try { sheet.autoResizeColumns(1, cols); } catch (err) {}
}

function hashPassword_(password) {
  const raw = APP_CONFIG.SALT + '|' + String(password || '');
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
  return bytes.map(function(b) {
    const v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

function getCache_() {
  return CacheService.getScriptCache();
}

function createSession_(user) {
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  const payload = {
    token: token,
    user_id: user.user_id,
    username: user.username,
    display_name: user.display_name,
    email: user.email,
    role: user.role,
    active: user.active,
    created_at: nowIso_()
  };
  getCache_().put('session:' + token, JSON.stringify(payload), APP_CONFIG.SESSION_TTL_SECONDS);
  return payload;
}

function getSession_(token) {
  if (!token) throw new Error('Sesión inexistente.');
  const raw = getCache_().get('session:' + token);
  if (!raw) throw new Error('La sesión expiró. Inicie sesión nuevamente.');
  return JSON.parse(raw);
}

function destroySession_(token) {
  if (token) getCache_().remove('session:' + token);
  return true;
}

function readTable_(sheetName) {
  return getSheetData_(sheetName, HEADERS[sheetName]);
}

function writeTable_(sheetName, rows) {
  setSheetData_(sheetName, HEADERS[sheetName], rows);
}

function upsertRow_(sheetName, keyField, rowObj) {
  const rows = readTable_(sheetName);
  const idx = rows.findIndex(function(r) { return String(r[keyField]) === String(rowObj[keyField]); });
  if (idx >= 0) rows[idx] = Object.assign({}, rows[idx], rowObj);
  else rows.push(rowObj);
  writeTable_(sheetName, rows);
  return rowObj;
}

function removeRow_(sheetName, keyField, keyValue) {
  const rows = readTable_(sheetName).filter(function(r) { return String(r[keyField]) !== String(keyValue); });
  writeTable_(sheetName, rows);
}

function canAccessProject_(session, projectId) {
  if (session.role === 'admin') return true;
  const memberships = readTable_('memberships');
  return memberships.some(function(m) {
    return String(m.project_id) === String(projectId) &&
      String(m.user_id) === String(session.user_id) &&
      String(m.active).toUpperCase() === 'TRUE';
  });
}

function getAccessibleProjectIds_(session) {
  if (session.role === 'admin') {
    return readTable_('projects').filter(function(p) {
      return String(p.status || 'Activo') !== 'Cerrado';
    }).map(function(p) { return String(p.project_id); });
  }
  const memberships = readTable_('memberships').filter(function(m) {
    return String(m.user_id) === String(session.user_id) && String(m.active).toUpperCase() === 'TRUE';
  });
  return memberships.map(function(m) { return String(m.project_id); });
}

function inferStatus_(task) {
  const progress = Number(task.progress || 0);
  const due = parseDate_(task.due_date);
  const today = parseDate_(todayIso_());
  if (String(task.status) === 'Bloqueada') return 'Bloqueada';
  if (String(task.status) === 'Cancelada') return 'Cancelada';
  if (progress >= 100) return 'Completada';
  if (due && due.getTime() < today.getTime()) return 'Atrasada';
  if (progress > 0) return 'En curso';
  return 'Pendiente';
}

function computeTaskDecorators_(task) {
  const today = todayIso_();
  const due = toDateOnly_(task.due_date);
  const start = toDateOnly_(task.start_date);
  const daysToDue = due ? diffDays_(today, due) : null;
  const overdue = daysToDue !== null && daysToDue < 0 && task.status !== 'Completada';
  const urgent = task.status !== 'Completada' && (
    task.priority === 'Crítica' ||
    overdue ||
    (daysToDue !== null && daysToDue <= 2)
  );
  return {
    days_to_due: daysToDue,
    overdue: overdue,
    urgent: urgent,
    inferred_status: inferStatus_(task),
    duration_days: start && due ? Math.max(0, diffDays_(start, due)) + 1 : 1
  };
}

function logActivity_(entityType, entityId, action, payload, session) {
  appendRow_('activity_log', HEADERS.activity_log, {
    log_id: toId_('log'),
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
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function sortTasks_(rows) {
  const typeOrder = {Tema: 0, Subtema: 1, Actividad: 2, Hito: 3};
  return rows.sort(function(a, b) {
    const ta = typeOrder[a.type] !== undefined ? typeOrder[a.type] : 99;
    const tb = typeOrder[b.type] !== undefined ? typeOrder[b.type] : 99;
    if (ta !== tb) return ta - tb;
    const sa = toDateOnly_(a.start_date) || '9999-12-31';
    const sb = toDateOnly_(b.start_date) || '9999-12-31';
    if (sa !== sb) return sa < sb ? -1 : 1;
    const da = toDateOnly_(a.due_date) || '9999-12-31';
    const db = toDateOnly_(b.due_date) || '9999-12-31';
    if (da !== db) return da < db ? -1 : 1;
    return String(a.title || '').localeCompare(String(b.title || ''), 'es');
  });
}

function getProjectFolder_(projectId, projectName) {
  const root = DriveApp.getFolderById(APP_CONFIG.ROOT_FOLDER_ID);
  const folders = root.getFoldersByName(projectId + ' - ' + projectName);
  if (folders.hasNext()) return folders.next();
  return root.createFolder(projectId + ' - ' + projectName);
}
