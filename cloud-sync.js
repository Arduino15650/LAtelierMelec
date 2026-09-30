(function () {
  'use strict';

  const DATA_KEY = 'melec-evaluation-v1';
  const DATA_OWNER_KEY = 'melec-evaluation-owner-v1';
  const REVISION_PREFIX = 'melec-evaluation-revision-v1-';
  const SESSION_KEY = 'melec-cloud-session-v1';
  const ORIGINAL_KEY = 'melec-original-before-cloud-v1';
  const PENDING_PREFIX = 'melec-cloud-pending-v1-';
  const byId = id => document.getElementById(id);
  const gate = byId('cloudGate');
  const gateStatus = byId('cloudGateStatus');
  const retryButton = byId('cloudRetrySession');
  const toolbar = document.querySelector('.cloud-toolbar');
  const syncStatus = byId('cloudSyncStatus');
  let session = null;
  let userId = '';
  let revision = 0;
  let ready = false;
  let sending = false;
  let refreshing = false;
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
    document.documentElement.classList.remove('cloud-resuming');
    retryButton.hidden = true;
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
    localStorage.setItem(DATA_OWNER_KEY, userId);
    localStorage.setItem(REVISION_PREFIX + userId, String(revision));
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
  async function api(path, options = {}) {
    return window.MelecPortal.rest(path, options);
  }
  async function identify() {
    const user = await window.MelecPortal.user();
    if (!user.id) throw new Error('Compte non reconnu.');
    userId = user.id;
    session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
  }
  async function cloudRow() {
    const rows = await api('melec_state?user_id=eq.' + encodeURIComponent(userId) + '&select=data,revision');
    return rows && rows[0] || null;
  }
  async function cloudRevision() {
    const rows = await api('melec_state?user_id=eq.' + encodeURIComponent(userId) + '&select=revision');
    return rows && rows[0] || null;
  }
  async function ensureTeacher() {
    const rows = await api('teacher_accounts?user_id=eq.' + encodeURIComponent(userId) + '&select=user_id');
    if (!rows || rows.length !== 1) {
      throw new Error('Accès réservé à l’enseignant. Utilisez l’espace élève si vous êtes inscrit comme élève.');
    }
  }
  function showImport() {
    document.documentElement.classList.remove('cloud-resuming');
    byId('cloudLoginPane').hidden = true;
    byId('cloudImportPane').hidden = false;
    byId('cloudSignOutGate').hidden = false;
    gateMessage('Choisissez la source de vos données. Aucun import automatique.');
  }
  async function begin() {
    lock();
    gateMessage('Connexion et vérification des données…');
    await identify();
    // Lire d'abord la petite révision ; la sauvegarde complète n'est nécessaire que si elle a changé.
    const [, remote] = await Promise.all([ensureTeacher(), cloudRevision()]);
    if (!remote) {
      showImport();
      return;
    }
    revision = Number(remote.revision);
    const pending = readPending();
    if (pending) {
      if (pending.revision !== revision) {
        document.documentElement.classList.remove('cloud-resuming');
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
    if (localStorage.getItem(DATA_OWNER_KEY) === userId &&
        localStorage.getItem(REVISION_PREFIX + userId) === String(revision)) {
      try {
        const cached = localStorage.getItem(DATA_KEY);
        if (cached) { installData(parseState(cached)); unlock(); return; }
      } catch { /* cache absent ou invalide : relire la sauvegarde cloud */ }
    }
    gateMessage('Chargement des données actualisées…');
    const row = await cloudRow();
    if (!row) throw new Error('Sauvegarde cloud introuvable.');
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
      try { localStorage.setItem(REVISION_PREFIX + userId, String(revision)); } catch { /* la copie cloud reste la référence */ }
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
    if (!ready || sending || conflicted || refreshing) return;
    if (!document.querySelector('#editorView.hidden')) {
      status('Terminez ou annulez l’activité en cours avant d’actualiser.', true);
      return;
    }
    if (readPending()) { scheduleUpload(); return; }
    refreshing = true;
    try {
      const latest = await cloudRevision();
      if (!latest) throw new Error('Données cloud introuvables.');
      if (Number(latest.revision) <= revision) { status('Synchronisé'); return; }
      const row = await cloudRow();
      if (!row) throw new Error('Données cloud introuvables.');
      if (Number(row.revision) > revision) {
        revision = Number(row.revision);
        installData(row.data);
        status('Données actualisées');
      }
    } catch (error) { status('Actualisation impossible : ' + error.message, true); }
    finally { refreshing = false; }
  }
  save = function () {
    try { if (userId) localStorage.removeItem(REVISION_PREFIX + userId); } catch { /* ne pas bloquer la sauvegarde */ }
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
      const value = await window.MelecPortal.signIn(byId('cloudEmail').value.trim(), byId('cloudPassword').value);
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
  byId('cloudSyncNow').addEventListener('click', () => {
    // Ne pas quitter un éditeur ouvert : il peut contenir des modifications non sauvegardées.
    if (document.querySelector('#editorView.hidden')) window.resetToHome?.();
    refreshFromCloud();
  });
  function signOut(force) {
    if (!force && readPending()) return alert('Des modifications ne sont pas encore synchronisées. Attendez la confirmation « Synchronisé ».');
    clearSession();
    userId = '';
    revision = 0;
    conflicted = false;
    if (!force) {
      ready = false;
      window.location.replace('./index.html');
      return;
    }
    lock();
    document.documentElement.classList.remove('cloud-resuming');
    byId('cloudLoginPane').hidden = false;
    byId('cloudImportPane').hidden = true;
    byId('cloudSignOutGate').hidden = true;
    gateMessage('Vous êtes déconnecté.');
  }
  byId('cloudSignOut').addEventListener('click', () => signOut(false));
  byId('cloudSignOutGate').addEventListener('click', () => signOut(true));
  retryButton.addEventListener('click', () => {retryButton.hidden = true;begin().catch(handleResumeError);});
  function handleResumeError(error) {
    document.documentElement.classList.remove('cloud-resuming');
    const invalid = [400, 401].includes(error.status) && /refresh|token|session|grant|jwt|expir/i.test(error.code || error.message);
    if (invalid) {
      clearSession();
      byId('cloudLoginPane').hidden = false;
      retryButton.hidden = true;
      gateMessage('La session a réellement expiré. Reconnectez-vous ; vos brouillons locaux sont conservés.', 'error');
      return;
    }
    byId('cloudLoginPane').hidden = true;
    retryButton.hidden = false;
    gateMessage('Connexion momentanément indisponible : ' + error.message + ' Réessayez sans effacer votre session.', 'error');
  }
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
      begin().catch(handleResumeError);
    }
  } catch { clearSession(); document.documentElement.classList.remove('cloud-resuming'); }
})();
