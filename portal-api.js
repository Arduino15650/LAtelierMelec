(function () {
  'use strict';
  const URL = 'https://bcvhuziwdwaorkxqsrch.supabase.co';
  const KEY = 'sb_publishable_B95li1RB6XAlzRY7KvmyiA_kgpD1FcW';
  const SESSION_KEY = 'melec-cloud-session-v1';
  let current = null;
  let refreshPromise = null;
  try { current = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch { /* session invalide */ }

  async function boundedFetch(url, options = {}, timeoutMs = 12000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try { return await fetch(url, { ...options, signal: controller.signal }); }
    catch (error) {
      if (controller.signal.aborted) throw new Error('Le serveur ne répond pas après ' + Math.ceil(timeoutMs / 1000) + ' secondes. Réessayez.');
      throw error;
    }
    finally { clearTimeout(timer); }
  }

  async function decode(response) {
    let data;
    try { data = await response.json(); }
    catch (error) {
      if (error.name !== 'SyntaxError') throw error;
      data = {};
    }
    if (!response.ok) {
      const error = new Error(data.msg || data.error_description || data.message || data.error || `Erreur ${response.status}`);
      error.status = response.status;
      error.code = data.error_code || data.code || data.error || '';
      throw error;
    }
    return data;
  }
  async function boundedDecode(url, options = {}, timeoutMs = 12000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      return response.status === 204 ? null : await decode(response);
    } catch (error) {
      if (controller.signal.aborted) throw new Error('Le serveur ne répond pas après ' + Math.ceil(timeoutMs / 1000) + ' secondes. Réessayez.');
      throw error;
    } finally { clearTimeout(timer); }
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
    const data = await boundedDecode(URL + '/auth/v1/token?grant_type=password', {
      method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    remember(data);
    return data;
  }
  async function signUp(fields) {
    return boundedDecode(URL + '/auth/v1/signup?redirect_to=' + encodeURIComponent(location.origin + location.pathname.replace(/[^/]*$/, 'eleve.html')), {
      method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: fields.email, password: fields.password,
        data: { last_name: fields.lastName, first_name: fields.firstName, requested_class: fields.className }
      })
    }, 30000);
  }
  async function token() {
    try {
      const stored = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
      if (stored?.access_token && stored.access_token !== current?.access_token) current = stored;
      if (!stored) current = null;
    } catch { /* session invalide */ }
    if (!current) throw new Error('Veuillez vous connecter.');
    if (Number(current.expires_at) * 1000 > Date.now() + 60000) return current.access_token;
    if (!refreshPromise) {
      refreshPromise = (async () => {
        const data = await boundedDecode(URL + '/auth/v1/token?grant_type=refresh_token', {
          method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: current.refresh_token })
        });
        remember(data);
        return data.access_token;
      })().finally(() => { refreshPromise = null; });
    }
    return refreshPromise;
  }
  async function user() {
    return boundedDecode(URL + '/auth/v1/user', {
      headers: { apikey: KEY, Authorization: 'Bearer ' + await token() }
    });
  }
  async function rest(path, options = {}) {
    return boundedDecode(URL + '/rest/v1/' + path, {
      ...options,
      headers: { apikey: KEY, Authorization: 'Bearer ' + await token(), ...(options.headers || {}) }
    }, options.method && options.method.toUpperCase() !== 'GET' ? 60000 : 12000);
  }
  async function invoke(name, body, authenticated = true) {
    const headers = { apikey: KEY, 'Content-Type': 'application/json' };
    if (authenticated) headers.Authorization = 'Bearer ' + await token();
    return boundedDecode(URL + '/functions/v1/' + name, {
      method: 'POST', headers, body: JSON.stringify(body)
    }, 60000);
  }
  async function upload(path, file) {
    return boundedDecode(URL + '/storage/v1/object/melec-private/' + path.split('/').map(encodeURIComponent).join('/'), {
      method: 'POST',
      headers: { apikey: KEY, Authorization: 'Bearer ' + await token(), 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'false' },
      body: file
    }, 60000);
  }
  async function download(path, options = {}) {
    const url = URL + '/storage/v1/object/authenticated/melec-private/' + path.split('/').map(encodeURIComponent).join('/');
    const attempts = options.retryTransient ? 3 : 1;
    // Le renouvellement de session ne doit pas consommer le délai réservé au fichier.
    const accessToken = await token();
    for (let attempt = 0; attempt < attempts; attempt++) {
      let response;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      try {
        response = await fetch(url, {
          headers: { apikey: KEY, Authorization: 'Bearer ' + accessToken },
          cache: attempt ? 'reload' : 'default', signal: controller.signal
        });
        if (response.ok) return await response.blob();
      } catch (error) {
        if (attempt === attempts - 1) throw controller.signal.aborted ? new Error('Image indisponible : le serveur ne répond pas. Réessayez dans un instant.') : error;
        await new Promise(resolve => setTimeout(resolve, 300 * (attempt + 1)));
        continue;
      } finally { clearTimeout(timer); }
      // 544 est un délai dépassé de la passerelle Supabase, pas un refus RLS.
      if (!options.retryTransient || ![304, 429, 500, 502, 503, 504, 544].includes(response.status) || attempt === attempts - 1)
        throw new Error('Document indisponible ou accès expiré (HTTP ' + response.status + ').');
      await new Promise(resolve => setTimeout(resolve, 300 * (attempt + 1)));
    }
  }
  async function removeFiles(paths) {
    if (!Array.isArray(paths) || !paths.length) return [];
    const removed = [];
    for (let index = 0; index < paths.length; index += 1000) {
      const batch = paths.slice(index, index + 1000);
      const result = await boundedDecode(URL + '/storage/v1/object/melec-private', {
        method: 'DELETE',
        headers: { apikey: KEY, Authorization: 'Bearer ' + await token(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: batch })
      }, 60000);
      if (Array.isArray(result)) removed.push(...result);
    }
    return removed;
  }
  async function signOut() {
    try {
      if (current) await boundedFetch(URL + '/auth/v1/logout', {
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

