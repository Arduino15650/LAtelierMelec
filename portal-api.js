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
      // Limite de Supabase atteinte (connexions trop nombreuses depuis le même réseau, ex. une salle de classe).
      const busy = response.status === 429 ? 'Trop de connexions en même temps depuis ce réseau. Patientez une à deux minutes, puis réessayez.' : '';
      const error = new Error(busy || data.msg || data.error_description || data.message || data.error || `Erreur ${response.status}`);
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
  // Jeton anti-robot (Cloudflare Turnstile) vérifié par Supabase Auth à chaque connexion et inscription.
  const security = captchaToken => captchaToken ? { gotrue_meta_security: { captcha_token: captchaToken } } : {};
  async function signIn(email, password, captchaToken) {
    const data = await boundedDecode(URL + '/auth/v1/token?grant_type=password', {
      method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, ...security(captchaToken) })
    });
    remember(data);
    return data;
  }
  async function signUp(fields) {
    // Collègue de l'équipe magasin : pas de classe demandée ; le lien de confirmation ramène à l'accueil du site.
    const team = fields.accountType === 'team';
    return boundedDecode(URL + '/auth/v1/signup?redirect_to=' + encodeURIComponent(location.origin + location.pathname.replace(/[^/]*$/, team ? '' : 'eleve.html')), {
      method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: fields.email, password: fields.password,
        data: team ? { last_name: fields.lastName, first_name: fields.firstName, account_type: 'team' }
          : { last_name: fields.lastName, first_name: fields.firstName, requested_class: fields.className },
        ...security(fields.captchaToken)
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
  // Identifiant du compte connecté, lu dans la session (réponse de connexion ou jeton)
  // sans requête supplémentaire. Le jeton est d'abord validé ou renouvelé par token() ;
  // les droits restent contrôlés côté Supabase à chaque lecture.
  function tokenSubject(accessToken) {
    try {
      const part = String(accessToken).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = part + '='.repeat((4 - part.length % 4) % 4);
      return JSON.parse(atob(padded)).sub || '';
    } catch { return ''; }
  }
  async function userId() {
    const accessToken = await token();
    const id = (current && current.access_token === accessToken && current.user && current.user.id) || tokenSubject(accessToken);
    if (id) return id;
    return (await user()).id;
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
  // Lit le fichier au fil de l'eau : chaque morceau reçu relance le délai de 30 s et indique la progression.
  async function readBody(response, controller, onProgress, setTimer) {
    const reader = response.body && typeof response.body.getReader === 'function' ? response.body.getReader() : null;
    if (!reader) return response.blob();
    const total = Number(response.headers?.get?.('content-length')) || 0;
    const type = response.headers?.get?.('content-type') || 'application/octet-stream';
    const chunks = [];
    let received = 0;
    const watch = () => setTimer(setTimeout(() => controller.abort(), 30000));
    watch();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.byteLength;
        watch();
        if (onProgress) { try { onProgress(received, total); } catch { /* l'affichage ne bloque pas le transfert */ } }
      }
    } catch (error) {
      try { reader.cancel(); } catch { /* flux déjà fermé */ }
      throw error;
    } finally { setTimer(0); }
    return new Blob(chunks, { type });
  }
  async function download(path, options = {}) {
    const url = URL + '/storage/v1/object/authenticated/melec-private/' + path.split('/').map(encodeURIComponent).join('/');
    const attempts = options.retryTransient ? 3 : 1;
    // Le renouvellement de session ne doit pas consommer le délai réservé au fichier.
    const accessToken = await token();
    for (let attempt = 0; attempt < attempts; attempt++) {
      let response;
      const controller = new AbortController();
      // 15 s pour que le serveur commence à répondre. Ensuite, un gros dossier peut mettre plusieurs
      // minutes sur le réseau partagé d'une salle : on n'abandonne que si plus rien n'arrive.
      let timer = setTimeout(() => controller.abort(), 15000);
      try {
        response = await fetch(url, {
          headers: { apikey: KEY, Authorization: 'Bearer ' + accessToken },
          cache: attempt ? 'reload' : 'default', signal: controller.signal
        });
        clearTimeout(timer);
        if (response.ok) return await readBody(response, controller, options.onProgress, next => { clearTimeout(timer); timer = next; });
      } catch (error) {
        if (attempt === attempts - 1) throw controller.signal.aborted ? new Error('Document indisponible : le transfert s’est interrompu (réseau saturé ou coupé). Réessayez dans un instant.') : error;
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
  // ---- Double authentification (application Authenticator, codes TOTP à 6 chiffres) ----
  function claims(accessToken) {
    try {
      const part = String(accessToken).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(part + '='.repeat((4 - part.length % 4) % 4)));
    } catch { return {}; }
  }
  // Niveau de la session : aal1 = mot de passe seul, aal2 = mot de passe + code Authenticator.
  async function assuranceLevel() { return claims(await token()).aal || 'aal1'; }
  async function authFetch(path, options = {}) {
    return boundedDecode(URL + '/auth/v1/' + path, {
      ...options,
      headers: { apikey: KEY, Authorization: 'Bearer ' + await token(), 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
  }
  async function mfaFactors() {
    const account = await user();
    return (account.factors || []).filter(factor => factor.factor_type === 'totp');
  }
  async function mfaEnroll(friendlyName) {
    const data = await authFetch('factors', { method: 'POST', body: JSON.stringify({ factor_type: 'totp', friendly_name: friendlyName, issuer: 'L’Atelier MELEC' }) });
    const svg = String(data?.totp?.qr_code || '');
    if (svg && !svg.startsWith('data:')) data.totp.qr_code = 'data:image/svg+xml;utf-8,' + encodeURIComponent(svg);
    return data;
  }
  async function mfaVerify(factorId, code) {
    const challenge = await authFetch('factors/' + encodeURIComponent(factorId) + '/challenge', { method: 'POST', body: '{}' });
    const data = await authFetch('factors/' + encodeURIComponent(factorId) + '/verify', {
      method: 'POST', body: JSON.stringify({ challenge_id: challenge.id, code: String(code).replace(/\s/g, '') })
    });
    // La vérification renvoie une nouvelle session de niveau aal2 : elle remplace la précédente.
    if (data?.access_token) remember({ ...data, expires_at: data.expires_at || Math.floor(Date.now() / 1000) + Number(data.expires_in || 3600) });
    return data;
  }
  async function mfaUnenroll(factorId) {
    return authFetch('factors/' + encodeURIComponent(factorId), { method: 'DELETE' });
  }
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }
  window.MelecPortal = { URL, KEY, signIn, signUp, token, user, userId, rest, invoke, upload, download, removeFiles, signOut, escapeHtml,
    assuranceLevel, mfaFactors, mfaEnroll, mfaVerify, mfaUnenroll };
})();

