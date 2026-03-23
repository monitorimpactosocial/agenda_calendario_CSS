function setupSystem() {
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
    folder_id: APP_CONFIG.ROOT_FOLDER_ID
  };
}

function resetDemoData() {
  Object.keys(SHEETS).forEach(function(key) {
    writeTable_(key, []);
  });
  return setupSystem();
}

function installWeekdayDigestTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(t) {
    if (t.getHandlerFunction() === 'sendWeekdayUrgentDigest') {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger('sendWeekdayUrgentDigest')
    .timeBased()
    .everyDays(1)
    .atHour(APP_CONFIG.DIGEST_HOUR)
    .create();

  return {ok: true};
}
