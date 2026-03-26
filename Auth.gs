function login(username, password) {
  var u = normalizeText_(username).toLowerCase();
  var rows = readTable_('users');
  var found = rows.find(function(row) {
    return String(row.username || '').toLowerCase() === u && asBool_(row.active);
  });
  if (!found) throw new Error('Usuario no encontrado o inactivo.');

  var incoming = hashPassword_(password);
  var stored = String(found.password_hash || '');
  if (incoming !== stored && password !== stored && String(found.password) !== password) {
    throw new Error('Contraseña inválida.');
  }

  var session = createSession_(found);
  logActivity_('auth', found.user_id, 'login', {username: found.username}, session, '');
  return {
    token: session.token,
    user: {
      user_id: found.user_id,
      username: found.username,
      display_name: found.display_name,
      email: found.email,
      role: found.role
    }
  };
}

function logout(token) {
  var session = getSession_(token);
  logActivity_('auth', session.user_id, 'logout', {username: session.username}, session, '');
  destroySession_(token);
  return {ok: true};
}

function getCurrentSession(token) {
  var session = getSession_(token);
  return {
    token: token,
    user: {
      user_id: session.user_id,
      username: session.username,
      display_name: session.display_name,
      email: session.email,
      role: session.role
    }
  };
}
