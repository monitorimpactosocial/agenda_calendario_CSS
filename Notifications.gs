function sendWeekdayUrgentDigest() {
  const now = new Date();
  const day = Number(Utilities.formatDate(now, APP_CONFIG.TIMEZONE, 'u'));
  if (day >= 6) {
    return {ok: true, skipped: true, reason: 'Fin de semana'};
  }

  const digest = buildUrgentDigest_();
  GmailApp.sendEmail(APP_CONFIG.DIGEST_RECIPIENT, digest.subject, digest.text);
  appendRow_('activity_log', HEADERS.activity_log, {
    log_id: toId_('log'),
    entity_type: 'notification',
    entity_id: 'weekday_digest',
    action: 'send_email',
    payload_json: JSON.stringify({recipient: APP_CONFIG.DIGEST_RECIPIENT, count: digest.count}),
    actor_id: '',
    actor_name: 'Sistema',
    created_at: nowIso_()
  });
  return {ok: true, sent: true, count: digest.count};
}
