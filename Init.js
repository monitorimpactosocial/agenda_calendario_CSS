function setupSystem() {
  return withScriptLock_(function() {
    initializeSecrets_();
    getOrCreateSheet_(SHEETS.USERS, HEADERS.users);
    getOrCreateSheet_(SHEETS.PROJECTS, HEADERS.projects);
    getOrCreateSheet_(SHEETS.MEMBERSHIPS, HEADERS.memberships);
    getOrCreateSheet_(SHEETS.TASKS, HEADERS.tasks);
    getOrCreateSheet_(SHEETS.ATTACHMENTS, HEADERS.attachments);
    getOrCreateSheet_(SHEETS.COMMENTS, HEADERS.comments);
    getOrCreateSheet_(SHEETS.ACTIVITY, HEADERS.activity_log);

    seedUsers_();
    seedProjectsAndMemberships_();
    seedLegacyTasks_();
    installWeekdayDigestTrigger();

    return {
      ok: true,
      message: 'Sistema inicializado correctamente.',
      spreadsheet_id: APP_CONFIG.SPREADSHEET_ID,
      folder_id: APP_CONFIG.ROOT_FOLDER_ID,
      version: APP_CONFIG.APP_VERSION
    };
  });
}

function resetDemoData() {
  return withScriptLock_(function() {
    Object.keys(SHEETS).forEach(function(key) {
      writeTable_(SHEETS[key], []);
    });
    return setupSystem();
  });
}

function installWeekdayDigestTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(t) {
    if (t.getHandlerFunction() === 'sendWeekdayUrgentDigest') ScriptApp.deleteTrigger(t);
  });

  ScriptApp.newTrigger('sendWeekdayUrgentDigest')
    .timeBased()
    .atHour(APP_CONFIG.DIGEST_HOUR)
    .nearMinute(APP_CONFIG.DIGEST_MINUTE)
    .everyDays(1)
    .inTimezone(APP_CONFIG.TIMEZONE)
    .create();

  return {ok: true};
}

function safeAutoInit_() {
  try {
    initializeSecrets_();
    var ss = getSpreadsheet_();
    var sh = ss.getSheetByName(SHEETS.USERS);
    if (!sh || sh.getLastRow() < 2) {
      setupSystem();
      return;
    }
    Object.keys(SHEETS).forEach(function(key) {
      getOrCreateSheet_(SHEETS[key], HEADERS[SHEETS[key]]);
    });
  } catch (e) {}
}
