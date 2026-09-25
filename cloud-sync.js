(function () {
  'use strict';

  const PROJECT = 'https://bcvhuziwdwaorkxqsrch.supabase.co';
  const PUBLIC_KEY = 'sb_publishable_B95li1RB6XAlzRY7KvmyiA_kgpD1FcW';
  const DATA_KEY = 'melec-evaluation-v1';
  const SESSION_KEY = 'melec-cloud-session-v1';
  const ORIGINAL_KEY = 'melec-original-before-cloud-v1';
  const PENDING_PREFIX = 'melec-cloud-pending-v1-';
  const byId = id => document.getElementById(id);
  const gate = byId('cloudGate');
  const gateStatus = byId('cloudGateStatus');
  const toolbar = document.querySelector('.cloud-toolbar');
  const syncStatus = byId('cloudSyncStatus');
  let session = null;
  let userId = '';
  let revision = 0;
  let ready = false;
  let sending = false;
  let conflicted = false;
  let timer = null;
  let serial = 0;
  const originalSave = save;

  function status(message, error) {
    syncStatus.textContent = message;
    syncStatus.classList.toggle('cloud-sync-error', !!error);
  }
  function gateMessage(message, kind) {
    gateStatus.textContent = message;
    gateStatus.className = 'cloud-status' + (kind ? ' ' + kind : '');
  }
  function lock() {
    ready = false;
    document.body.classList.add('cloud-locked');
    gate.hidden = false;
    toolbar.hidden = true;
  }
  function unlock() {
    ready = true;
    gate.hidden = true;
    toolbar.hidden = false;
    document.body.classList.remove('cloud-locked');
    status('Synchronisé');
  }
  function pendingKey() { return PENDING_PREFIX + userId; }
  function readPending() {
    try { return JSON.parse(localStorage.getItem(pendingKey()) || 'null'); }
    catch { return null; }
  }
  function parseState(raw) {
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data) ||
        (data.activities !== undefined && !Array.isArray(data.activities)) ||
        (data.students !== undefined && !Array.isArray(data.students))) {
      throw new Error('Le fichier ne contient pas une sauvegarde LAtelierMelec valide.');
    }
    return data;
  }
  function preserveOriginal() {
    const raw = localStorage.getItem(DATA_KEY);
    if (raw && !localStorage.getItem(ORIGINAL_KEY)) {
      localStorage.setItem(ORIGINAL_KEY, raw);
    }
  }
  function installData(data) {
    preserveOriginal();
    localStorage.setItem(DATA_KEY, JSON.stringify(data));
    state = load();
    if (typeof renderHome === 'function') renderHome();
    show('home');
  }
  function saveSession(value) {
    session = value;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(value));
  }
  function clearSession() {
    session = null;
    sessionStorage.removeItem(SESSION_KEY);
  }
  async function authRequest(path, body) {
    const response = await fetch(PROJECT + path, {
      method: 'POST',
      headers: { apikey: PUBLIC_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.msg || data.error_description || data.message || 'Connexion refusée.');
    return data;
  }
  async function validAccessToken() {
    try {
      const stored = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
      if (stored?.access_token && stored.access_token !== session?.access_token) session = stored;
    } catch { /* session invalide */ }
    if (!session) throw new Error('Session absente.');
    if (Date.now() < Number(session.expires_at) * 1000 - 60000) return session.access_token;
    const refreshed = await authRequest('/auth/v1/token?grant_type=refresh_token', {
      refresh_token: session.refresh_token
    });
    saveSession(refreshed);
    return refreshed.access_token;
  }
  async function api(path, options = {}) {
    const token = await validAccessToken();
    const response = await fetch(PROJECT + '/rest/v1/' + path, {
      ...options,
      headers: {
        apikey: PUBLIC_KEY,
        Authorization: 'Bearer ' + token,
        ...(options.headers || {})
      }
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.message || payload.hint || 'Erreur de synchronisation (' + response.status + ').');
    }
    return response.status === 204 ? null : response.json();
  }
  async function identify() {
    const token = await validAccessToken();
    const response = await fetch(PROJECT + '/auth/v1/user', {
      headers: { apikey: PUBLIC_KEY, Authorization: 'Bearer ' + token }
    });
    if (!response.ok) throw new Error('Session expirée. Connectez-vous à nouveau.');
    const user = await response.json();
    if (!user.id) throw new Error('Compte non reconnu.');
    userId = user.id;
  }
  async function cloudRow() {
    const rows = await api('melec_state?user_id=eq.' + encodeURIComponent(userId) + '&select=data,revision');
    return rows && rows[0] || null;
  }
  async function ensureTeacher() {
    const rows = await api('teacher_accounts?user_id=eq.' + encodeURIComponent(userId) + '&select=user_id');
    if (!rows || rows.length !== 1) {
      throw new Error('Accès réservé à l’enseignant. Utilisez l’espace élève si vous êtes inscrit comme élève.');
    }
  }
  function showImport() {
    byId('cloudLoginPane').hidden = true;
    byId('cloudImportPane').hidden = false;
    byId('cloudSignOutGate').hidden = false;
    gateMessage('Choisissez la source de vos données. Aucun import automatique.');
  }
  async function begin() {
    lock();
    gateMessage('Connexion et vérification des données…');
    await identify();
    await ensureTeacher();
    const row = await cloudRow();
    if (!row) {
      showImport();
      return;
    }
    revision = Number(row.revision);
    const pending = readPending();
    if (pending) {
      if (pending.revision !== revision) {
        conflicted = true;
        gateMessage('Deux versions différentes existent. Vos changements locaux sont conservés dans ce navigateur. Ne réimportez pas : contactez-nous avant de continuer.', 'error');
        byId('cloudSignOutGate').hidden = false;
        return;
      }
      installData(pending.data);
      unlock();
      status('Modifications en attente d’envoi…');
      scheduleUpload();
      return;
    }
    installData(row.data);
    unlock();
  }
  async function createFirstData(data) {
    const actions = [byId('cloudImportFile'), byId('cloudImportLocal'), byId('cloudStartEmpty')];
    actions.forEach(button => button.disabled = true);
    try {
      gateMessage('Envoi sécurisé de la sauvegarde…');
      parseState(JSON.stringify(data));
      const rows = await api('melec_state?select=revision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ user_id: userId, data })
      });
      revision = Number(rows[0].revision);
      installData(data);
      unlock();
    } catch (error) {
      gateMessage(error.message, 'error');
    } finally {
      actions.forEach(button => button.disabled = false);
    }
  }
  function scheduleUpload() {
    clearTimeout(timer);
    timer = setTimeout(upload, 700);
  }
  async function upload() {
    if (!ready || sending || conflicted) return;
    const pending = readPending();
    if (!pending) return;
    if (pending.revision !== revision) {
      conflicted = true;
      status('Conflit : données locales préservées. Rechargez sans modifier.', true);
      return;
    }
    sending = true;
    const startedSerial = serial;
    status('Enregistrement…');
    try {
      const rows = await api('melec_state?user_id=eq.' + encodeURIComponent(userId) +
        '&revision=eq.' + revision + '&select=revision', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ data: pending.data, revision: revision + 1,
          updated_at: new Date().toISOString() })
      });
      if (!rows || rows.length !== 1) {
        conflicted = true;
        status('Une autre version existe. Données locales préservées.', true);
        return;
      }
      revision = Number(rows[0].revision);
      if (serial === startedSerial) {
        localStorage.removeItem(pendingKey());
        status('Synchronisé');
      } else {
        const next = readPending();
        if (next) localStorage.setItem(pendingKey(), JSON.stringify({ data: next.data, revision }));
        status('Nouvelles modifications en attente…');
      }
    } catch (error) {
      status('En attente : ' + error.message, true);
    } finally {
      sending = false;
      if (readPending() && !conflicted) setTimeout(upload, 5000);
    }
  }
  async function refreshFromCloud() {
    if (!ready || sending || conflicted) return;
    if (!document.querySelector('#editorView.hidden')) {
      status('Terminez ou annulez l’activité en cours avant d’actualiser.', true);
      return;
    }
    if (readPending()) { scheduleUpload(); return; }
    try {
      const row = await cloudRow();
      if (!row) throw new Error('Données cloud introuvables.');
      if (Number(row.revision) > revision) {
        revision = Number(row.revision);
        installData(row.data);
        status('Données actualisées');
      } else status('Synchronisé');
    } catch (error) { status('Actualisation impossible : ' + error.message, true); }
  }
  save = function () {
    originalSave();
    if (!ready || !userId) return;
    try {
      serial++;
      localStorage.setItem(pendingKey(), JSON.stringify({ data: state, revision }));
      status(conflicted ? 'Conflit : données locales préservées.' : 'Modifications en attente…', conflicted);
      if (!conflicted) scheduleUpload();
    } catch (error) {
      status('Stockage local indisponible. Vérifiez l’espace libre.', true);
    }
  };

  byId('cloudLoginForm').addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.target.querySelector('button[type=submit]');
    button.disabled = true;
    gateMessage('Connexion…');
    try {
      const value = await authRequest('/auth/v1/token?grant_type=password', {
        email: byId('cloudEmail').value.trim(), password: byId('cloudPassword').value
      });
      byId('cloudPassword').value = '';
      saveSession(value);
      await begin();
    } catch (error) { gateMessage(error.message, 'error'); }
    finally { button.disabled = false; }
  });
  byId('cloudImportFile').addEventListener('click', async () => {
    const file = byId('cloudBackupFile').files[0];
    if (!file) return gateMessage('Choisissez d’abord votre fichier de sauvegarde JSON.', 'error');
    try { await createFirstData(parseState(await file.text())); }
    catch (error) { gateMessage(error.message, 'error'); }
  });
  byId('cloudImportLocal').addEventListener('click', async () => {
    const raw = localStorage.getItem(DATA_KEY);
    if (!raw) return gateMessage('Aucune donnée trouvée dans ce navigateur. Choisissez votre fichier JSON.', 'error');
    try { await createFirstData(parseState(raw)); }
    catch (error) { gateMessage(error.message, 'error'); }
  });
  byId('cloudStartEmpty').addEventListener('click', () => {
    if (confirm('Commencer avec une base vide ? Votre sauvegarde existante ne sera pas importée.')) {
      createFirstData({ activities: [], students: [] });
    }
  });
  byId('cloudSyncNow').addEventListener('click', refreshFromCloud);
  function signOut(force) {
    if (!force && readPending()) return alert('Des modifications ne sont pas encore synchronisées. Attendez la confirmation « Synchronisé ».');
    clearSession();
    userId = '';
    revision = 0;
    conflicted = false;
    lock();
    byId('cloudLoginPane').hidden = false;
    byId('cloudImportPane').hidden = true;
    byId('cloudSignOutGate').hidden = true;
    gateMessage('Vous êtes déconnecté.');
  }
  byId('cloudSignOut').addEventListener('click', () => signOut(false));
  byId('cloudSignOutGate').addEventListener('click', () => signOut(true));
  window.addEventListener('online', () => { if (ready) upload(); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && ready) refreshFromCloud();
  });
  setInterval(() => {
    if (!document.hidden && ready && document.querySelector('#editorView.hidden')) refreshFromCloud();
  }, 30000);
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) {
      session = JSON.parse(raw);
      begin().catch(error => {
        clearSession();
        byId('cloudLoginPane').hidden = false;
        byId('cloudImportPane').hidden = true;
        gateMessage(error.message, 'error');
      });
    }
  } catch { clearSession(); }
})();
