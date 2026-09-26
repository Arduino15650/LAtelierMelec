(function () {
  'use strict';
  const URL = 'https://bcvhuziwdwaorkxqsrch.supabase.co';
  const KEY = 'sb_publishable_B95li1RB6XAlzRY7KvmyiA_kgpD1FcW';
  const SESSION_KEY = 'melec-cloud-session-v1';
  let current = null;
  let refreshPromise = null;
  try { current = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch { /* session invalide */ }

  async function decode(response) {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.msg || data.error_description || data.message || data.error || `Erreur ${response.status}`);
    return data;
  }
  function remember(session) {
    current = session;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }
  const redirectTokens = new URLSearchParams(location.hash.slice(1));
  if (redirectTokens.has('access_token') && redirectTokens.has('refresh_token')) {
    remember({ access_token: redirectTokens.get('access_token'), refresh_token: redirectTokens.get('refresh_token'),
      expires_at: Math.floor(Date.now()/1000) + Number(redirectTokens.get('expires_in') || 3600) });
    history.replaceState(null, '', location.pathname + location.search);
  }
  async function signIn(email, password) {
    const data = await decode(await fetch(URL + '/auth/v1/token?grant_type=password', {
      method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    }));
    remember(data);
    return data;
  }
  async function signUp(fields) {
    return decode(await fetch(URL + '/auth/v1/signup?redirect_to=' + encodeURIComponent(location.origin + location.pathname.replace(/[^/]*$/, 'eleve.html')), {
      method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: fields.email, password: fields.password,
        data: { last_name: fields.lastName, first_name: fields.firstName, requested_class: fields.className }
      })
    }));
  }
  async function token() {
    try {
      const stored = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
      if (stored?.access_token && stored.access_token !== current?.access_token) current = stored;
    } catch { /* session invalide */ }
    if (!current) throw new Error('Veuillez vous connecter.');
    if (Number(current.expires_at) * 1000 > Date.now() + 60000) return current.access_token;
    if (!refreshPromise) {
      refreshPromise = (async () => {
        const data = await decode(await fetch(URL + '/auth/v1/token?grant_type=refresh_token', {
          method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: current.refresh_token })
        }));
        remember(data);
        return data.access_token;
      })().finally(() => { refreshPromise = null; });
    }
    return refreshPromise;
  }
  async function user() {
    return decode(await fetch(URL + '/auth/v1/user', {
      headers: { apikey: KEY, Authorization: 'Bearer ' + await token() }
    }));
  }
  async function rest(path, options = {}) {
    const response = await fetch(URL + '/rest/v1/' + path, {
      ...options,
      headers: { apikey: KEY, Authorization: 'Bearer ' + await token(), ...(options.headers || {}) }
    });
    if (response.status === 204) return null;
    return decode(response);
  }
  async function invoke(name, body, authenticated = true) {
    const headers = { apikey: KEY, 'Content-Type': 'application/json' };
    if (authenticated) headers.Authorization = 'Bearer ' + await token();
    return decode(await fetch(URL + '/functions/v1/' + name, {
      method: 'POST', headers, body: JSON.stringify(body)
    }));
  }
  async function upload(path, file) {
    const response = await fetch(URL + '/storage/v1/object/melec-private/' + path.split('/').map(encodeURIComponent).join('/'), {
      method: 'POST',
      headers: { apikey: KEY, Authorization: 'Bearer ' + await token(), 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'false' },
      body: file
    });
    return decode(response);
  }
  async function download(path) {
    const response = await fetch(URL + '/storage/v1/object/authenticated/melec-private/' + path.split('/').map(encodeURIComponent).join('/'), {
      headers: { apikey: KEY, Authorization: 'Bearer ' + await token() }
    });
    if (!response.ok) throw new Error('Document indisponible ou accès expiré.');
    return response.blob();
  }
  async function removeFiles(paths) {
    if (!Array.isArray(paths) || !paths.length) return [];
    const removed = [];
    for (let index = 0; index < paths.length; index += 1000) {
      const batch = paths.slice(index, index + 1000);
      const response = await fetch(URL + '/storage/v1/object/melec-private', {
        method: 'DELETE',
        headers: { apikey: KEY, Authorization: 'Bearer ' + await token(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: batch })
      });
      const result = await decode(response);
      if (Array.isArray(result)) removed.push(...result);
    }
    return removed;
  }
  async function signOut() {
    try {
      if (current) await fetch(URL + '/auth/v1/logout', {
        method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + await token() }
      });
    } catch { /* effacer la session locale même hors ligne */ }
    current = null;
    sessionStorage.removeItem(SESSION_KEY);
  }
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }
  window.MelecPortal = { URL, KEY, signIn, signUp, token, user, rest, invoke, upload, download, removeFiles, signOut, escapeHtml };
})();
