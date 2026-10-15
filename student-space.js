(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const api = MelecPortal;
  $('studentSignupForm').reset();
  $('contactForm').reset();
  window.addEventListener('pageshow', () => {
    $('studentSignupForm').reset();
    $('contactForm').reset();
  });
  function showContact(show) {
    $('studentContactPanel').hidden = !show;
    $('studentContactTab').classList.toggle('active', show && !authPane.hidden);
    if (show) {
      $('contactForm').reset();
      $('contactCount').textContent = '0 / 500 caractères';
      $('contactStatus').textContent = '';
      $('studentContactPanel').scrollIntoView({block:'nearest'});
    }
  }
  let profile = null;
  let cleanupViewer = null;
  let assignments = [], tpItems = [], activeTp = null, selectedContentTab = 'tp';
  let tpItemsLoadedAt = 0, tpItemsKey = '', tpListSignature = '';
  const documentCache = new Map();
  let documentCacheBytes = 0;
  const MAX_DOCUMENT_CACHE_BYTES = 24 * 1024 * 1024;
  function clearDocumentCache() {
    documentCache.clear();
    documentCacheBytes = 0;
  }
  async function loadDocument(asset, onProgress) {
    const cached = documentCache.get(asset.object_path);
    if (cached) return cached;
    const pending = api.download(asset.object_path, {retryTransient:true, onProgress});
    documentCache.set(asset.object_path, pending);
    try {
      const blob = await pending;
      if (documentCache.get(asset.object_path) === pending) {
        if (blob.size <= MAX_DOCUMENT_CACHE_BYTES) {
          while (documentCacheBytes + blob.size > MAX_DOCUMENT_CACHE_BYTES && documentCache.size > 1) {
            const oldest = documentCache.keys().next().value;
            if (oldest === asset.object_path) break;
            const previous = documentCache.get(oldest);
            if (previous instanceof Blob) documentCacheBytes -= previous.size;
            documentCache.delete(oldest);
          }
          documentCache.set(asset.object_path, blob);
          documentCacheBytes += blob.size;
        } else documentCache.delete(asset.object_path);
      }
      return blob;
    } catch (error) {
      if (documentCache.get(asset.object_path) === pending) documentCache.delete(asset.object_path);
      throw error;
    }
  }
  function tpEnd(assignment) {
    if (assignment.validated_at) return 0;
    return assignment.reactivated_at
      ? Date.parse(assignment.reactivated_until || '') || 0
      : assignment.started_at ? Date.parse(assignment.started_at) + 210 * 60000 : 0;
  }
  function clearTpViewer() {
    tpPdfCleanup?.(); tpPdfCleanup = null;
    window.MelecPdfPreview?.close();
    $('studentTpViewer')?.remove();
  }
  let tpPdfCleanup = null;
  function updateLearningLock() {
    const locked=Boolean(activeTp);
    $('studentContentTabs').dataset.tpActive=String(locked);
  }
  function switchContentTab(next) {
    selectedContentTab = 'tp';
    $('studentTpTab').classList.add('active');
    $('studentTpPane').hidden = false;
  }
  $('studentTpTab').onclick = () => switchContentTab('tp');
  const authPane = $('studentAuth');
  const dashboard = $('studentDashboard');
  const authStatus = $('studentAuthStatus');
  function message(target, text, error = false) {
    target.textContent = text;
    target.classList.toggle('error', error);
  }
  // Contrôle anti-robot affiché uniquement sur le formulaire visible.
  function mountCaptcha() {
    if (!window.MelecCaptcha || authPane.hidden || document.documentElement.classList.contains('student-resuming')) return;
    [$('studentLoginForm'), $('studentSignupForm')].forEach(form => { if (!form.hidden) window.MelecCaptcha.mount(form); });
  }
  const captchaMessage = error => /captcha/i.test(error.code || error.message) ? 'Le contrôle anti-robot a expiré. Validez-le à nouveau.' : error.message;
  function switchTab(tab) {
    if (tab === 'signup') $('studentSignupForm').reset();
    $('studentLoginForm').hidden = tab !== 'login';
    $('studentSignupForm').hidden = tab !== 'signup';
    $('studentLoginTab').classList.toggle('active', tab === 'login');
    $('studentSignupTab').classList.toggle('active', tab === 'signup');
    $('studentAuthTitle').textContent = tab === 'signup' ? 'Créer un compte élève' : tab === 'contact' ? 'Besoin d’aide ?' : 'Connexion élève';
    showContact(tab === 'contact');
    message(authStatus, '');
    mountCaptcha();
  }
  $('studentLoginTab').onclick = () => switchTab('login');
  $('studentSignupTab').onclick = () => switchTab('signup');
  $('studentContactTab').onclick = () => switchTab('contact');
  $('studentContactButton').onclick = () => showContact($('studentContactPanel').hidden);
  $('studentLoginForm').onsubmit = async event => {
    event.preventDefault();
    const form = event.currentTarget, button = form.querySelector('button[type=submit]');
    button.disabled = true;
    message(authStatus, 'Connexion…');
    try {
      const captchaToken = window.MelecCaptcha ? await window.MelecCaptcha.waitToken(form, () => message(authStatus, 'Vérification anti-robot en cours… Si la case « Vérifiez que vous êtes humain » apparaît, cochez-la : l’envoi partira toute seule.')) : '';
      message(authStatus, 'Connexion…');
      await api.signIn(form.elements.email.value.trim(), form.elements.password.value, captchaToken);
      form.elements.password.value = '';
      await openDashboard();
    } catch (error) { message(authStatus, captchaMessage(error), true); }
    finally { button.disabled = false; window.MelecCaptcha?.reset(form); }
  };
  $('studentSignupForm').onsubmit = async event => {
    event.preventDefault();
    const form = event.currentTarget, button = form.querySelector('button[type=submit]');
    if (form.elements.password.value.length < 12) return message(authStatus, 'Le mot de passe doit contenir au moins 12 caractères.', true);
    button.disabled = true;
    message(authStatus, 'Création du compte…');
    try {
      const captchaToken = window.MelecCaptcha ? await window.MelecCaptcha.waitToken(form, () => message(authStatus, 'Vérification anti-robot en cours… Si la case « Vérifiez que vous êtes humain » apparaît, cochez-la : l’envoi partira toute seule.')) : '';
      message(authStatus, 'Création du compte…');
      await api.signUp({ lastName: form.elements.lastName.value.trim(), firstName: form.elements.firstName.value.trim(),
        className: form.elements.className.value.trim(), email: form.elements.email.value.trim(),
        password: form.elements.password.value, captchaToken });
      form.reset();
      message(authStatus, 'Vérifiez votre boîte e-mail pour confirmer l’adresse, puis revenez vous connecter. L’accès reste soumis à la validation de l’enseignant.');
    } catch (error) { message(authStatus, captchaMessage(error), true); }
    finally { button.disabled = false; window.MelecCaptcha?.reset(form); }
  };
  async function openDashboard() {
    const user = { id: await api.userId() };
    const [teacher, profiles] = await Promise.all([
      api.rest('teacher_accounts?user_id=eq.' + encodeURIComponent(user.id) + '&select=user_id'),
      api.rest('student_profiles?user_id=eq.' + encodeURIComponent(user.id) + '&select=*')
    ]);
    if (teacher.length) { location.href = './enseignant.html'; return; }
    if (!profiles.length) throw new Error('Profil élève introuvable. Contactez votre enseignant.');
    const dashboardWasVisible = Boolean(profile) && !dashboard.hidden;
    profile = profiles[0];
    rememberView(user.id, profile);
    authPane.hidden = true; dashboard.hidden = false;
    document.documentElement.classList.remove('student-resuming');
    showContact(false);
    const intro = $('studentProfileStatus');
    intro.textContent = `Bonjour ${profile.first_name} ${profile.last_name}.`;
    const approved = Boolean(profile.approved_at && profile.class_id && !profile.blocked_at);
    const classLabel = $('studentClassName');
    classLabel.hidden = !approved;
    let classNamePromise = Promise.resolve();
    if (approved) {
      classLabel.textContent = 'Classe attribuée : chargement…';
      classNamePromise = api.rest('teaching_classes?id=eq.' + encodeURIComponent(profile.class_id) + '&select=name').then(assigned => {
        classLabel.textContent = assigned.length ? 'Classe attribuée : ' + assigned[0].name : 'Classe attribuée : nom indisponible';
      }).catch(() => { classLabel.textContent = 'Classe attribuée : nom indisponible'; });
    }
    if (!dashboardWasVisible) {
      $('studentTpPane').hidden = true;
    }
    $('studentContentTabs').hidden = !approved;
    if (!approved) {
      intro.textContent += ' Votre inscription est en attente de validation par l’enseignant.';
      return;
    }
    await loadTpAssignments();
    if (activeTp) {
      if (cleanupViewer) { cleanupViewer(); cleanupViewer=null; }
      updateLearningLock();switchContentTab('tp');
    }
    else {updateLearningLock();switchContentTab(selectedContentTab);}
  }
  async function loadTpAssignments(preserveViewer = false) {
    const previousActiveId = activeTp?.id;
    assignments = await api.rest('tp_assignments?student_id=eq.' + encodeURIComponent(profile.user_id) + '&select=*');
    const assignedIds = [...new Set(assignments.map(row => row.tp_id).filter(Boolean))].sort();
    const nextItemsKey = assignedIds.join(',');
    const refreshItems = !preserveViewer || !tpItemsLoadedAt || Date.now() - tpItemsLoadedAt > 120000 || nextItemsKey !== tpItemsKey;
    if (refreshItems) {
      tpItems = assignedIds.length
        ? await api.rest('learning_items?id=in.(' + assignedIds.join(',') + ')&kind=eq.tp&published=is.true&select=id,title')
        : [];
      tpItemsKey = nextItemsKey;
      tpItemsLoadedAt = Date.now();
    }
    activeTp = assignments.find(row => tpEnd(row) > Date.now()) || null;
    if (previousActiveId !== activeTp?.id) clearDocumentCache();
    if (preserveViewer && previousActiveId && activeTp?.id === previousActiveId) return;
    // Actualisation automatique : la liste n'est reconstruite que si les TP ont changé (évite le scintillement toutes les 30 s).
    const signature = JSON.stringify([activeTp?.id || null,
      assignments.map(row => [row.id, row.tp_id, row.tp_title, row.started_at, row.validated_at, row.reactivated_at, row.reactivated_until]),
      tpItems.map(item => [item.id, item.title])]);
    if (preserveViewer && signature === tpListSignature && $('studentTpList').childNodes.length) return;
    tpListSignature = signature;
    clearTpViewer();
    const list = $('studentTpList'); list.replaceChildren();
    $('studentTpNotice').textContent = activeTp ? 'Un TP est en cours. Les autres rubriques restent verrouillées jusqu’à la fin du chronomètre.' : 'Ouvrir un TP démarre immédiatement un chronomètre de 3 h 30. Après son expiration, demandez une prolongation à l’enseignant.';
    const visible = activeTp ? assignments.filter(row => row.id === activeTp.id) : assignments;
    for (const row of visible) {
      const item = tpItems.find(candidate => candidate.id === row.tp_id) || {id:row.tp_id,title:row.tp_title};
      if (!item.title) continue;
      const card = document.createElement('article'); card.className = 'student-tp-card';
      const heading = document.createElement('h3'); heading.textContent = item.title; card.append(heading);
      const info = document.createElement('p'); info.className = 'portal-small'; card.append(info);
      if (row.id === activeTp?.id) {
        info.textContent = 'Temps restant : ' + formatDuration(tpEnd(row) - Date.now());
        const open = document.createElement('button'); open.type='button'; open.textContent='Ouvrir les documents du TP';
        open.onclick = () => openTpFiles(item,card); card.append(open);
      } else if (!row.started_at) {
        info.textContent = 'Non commencé · durée initiale 3 h 30';
        const start = document.createElement('button'); start.type='button'; start.textContent='Ouvrir le TP et démarrer 3 h 30';
        start.onclick = async () => {
          start.disabled = true;
          try {
            const changed = await api.rest('tp_assignments?id=eq.' + encodeURIComponent(row.id) + '&started_at=is.null&select=*',{
              method:'PATCH',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({started_at:new Date().toISOString()})
            });
            if (!Array.isArray(changed) || changed.length !== 1) throw new Error('Le démarrage du TP n’a pas été confirmé. Actualisez la page.');
            clearTpViewer(); await openDashboard();
            const current = tpItems.find(candidate => candidate.id === row.tp_id);
            if (current) await openTpFiles(current,$('studentTpList').querySelector('.student-tp-card'));
          } catch (error) { alert(error.message); start.disabled = false; }
        }; card.append(start);
      } else info.textContent = 'Temps écoulé · TP verrouillé. Demandez une prolongation à l’enseignant.';
      list.append(card);
    }
    if (!list.children.length) list.textContent = 'Aucun TP attribué pour le moment.';
  }
  function formatDuration(ms) {
    const seconds = Math.max(0,Math.ceil(ms/1000));
    return [Math.floor(seconds/3600),Math.floor(seconds%3600/60),seconds%60].map(number => String(number).padStart(2,'0')).join(':');
  }
  async function openTpFiles(item,card) {
    if (!activeTp || activeTp.tp_id !== item.id || tpEnd(activeTp) <= Date.now()) return openDashboard();
    clearTpViewer();
    const assets = await api.rest('learning_assets?item_id=eq.' + encodeURIComponent(item.id) + '&select=id,object_path,file_name,mime_type,asset_role');
    const viewer = document.createElement('div'); viewer.id='studentTpViewer'; viewer.className='student-tp-viewer';
    for (const role of ['main','technical']) {
      const group = document.createElement('section');
      const heading = document.createElement('h4'); heading.textContent = role === 'main' ? 'Document du TP' : 'Dossier technique'; group.append(heading);
      const files = assets.filter(asset => (asset.asset_role || 'main') === role);
      for (const asset of files) {
        const button = document.createElement('button'); button.type='button'; button.textContent=asset.file_name;
        button.onclick = async () => {
          if (tpEnd(activeTp) <= Date.now()) { clearTpViewer(); await openDashboard(); return; }
          const opened = viewer.querySelector('.student-pdf-mount');
          if (opened?.dataset.assetId === asset.id) {
            try { await tpPdfCleanup?.flush?.(); }
            catch (error) { alert('Réponses non enregistrées : ' + error.message); return; }
            tpPdfCleanup?.(); tpPdfCleanup = null; opened.remove();
            button.textContent = asset.file_name; button.setAttribute('aria-expanded','false'); return;
          }
          button.disabled=true;
          // Gros dossiers : la progression montre que le téléchargement avance.
          const showProgress = (received, total) => { if (total) button.textContent = 'Chargement… ' + Math.min(99, Math.floor(received * 100 / total)) + ' % · ' + asset.file_name; };
          try {
            const blob = await loadDocument(asset, showProgress);
            if (!viewer.isConnected || !activeTp || tpEnd(activeTp) <= Date.now()) throw new Error('L’accès à ce TP a expiré.');
            await tpPdfCleanup?.flush?.();
            tpPdfCleanup?.(); tpPdfCleanup = null;
            viewer.querySelector('.student-pdf-mount')?.remove();
            viewer.querySelectorAll('button[aria-expanded="true"]').forEach(other => {
              other.textContent = other.dataset.fileName; other.setAttribute('aria-expanded','false');
            });
            if (asset.mime_type !== 'application/pdf' && !/\.pdf$/i.test(asset.file_name || '')) {
              MelecPdfPreview.open(blob, asset.file_name, role === 'main' ? 'Travaux pratiques' : 'Dossier technique');
              return;
            }
            const mount = document.createElement('div'); mount.className='student-pdf-mount'; mount.dataset.assetId=asset.id; group.append(mount);
            try {
              const mayRead = () => Boolean(activeTp && tpEnd(activeTp) > Date.now());
              if (role === 'technical') {
                tpPdfCleanup = await MelecStudentPdf.render(blob,mount,mayRead);
              } else {
                const responsePath = 'tp_document_responses?student_id=eq.' + encodeURIComponent(profile.user_id) + '&asset_id=eq.' + encodeURIComponent(asset.id);
                const existing = await api.rest(responsePath + '&select=answers');
                let hasResponse = existing.length > 0;
                const formOptions = {
                  entries: existing[0]?.answers?.entries || [],
                  save: async entries => {
                    if (!activeTp || activeTp.tp_id !== item.id || tpEnd(activeTp) <= Date.now()) throw new Error('Le temps du TP est écoulé.');
                    const answers = {entries};
                    if (hasResponse) {
                      const updated = await api.rest(responsePath + '&select=asset_id', {method:'PATCH',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({answers})});
                      if (updated.length !== 1) throw new Error('Réponse non enregistrée : accès refusé ou document introuvable.');
                    } else {
                      const created = await api.rest('tp_document_responses?select=asset_id', {method:'POST',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({student_id:profile.user_id,tp_id:item.id,asset_id:asset.id,answers})});
                      if (created.length !== 1) throw new Error('Réponse non enregistrée.');
                      hasResponse = true;
                    }
                  }
                };
                tpPdfCleanup = await MelecStudentPdf.render(blob,mount,mayRead,formOptions);
              }
            } catch (error) { mount.remove(); throw error; }
            button.dataset.fileName=asset.file_name; button.textContent='Réduire · '+asset.file_name; button.setAttribute('aria-expanded','true');
          } catch(error) { button.textContent = asset.file_name; alert(error.message); } finally { button.disabled=false; if (/^Chargement… /.test(button.textContent)) button.textContent = asset.file_name; }
        };
        group.append(button);
      }
      if (files.length) viewer.append(group);
    }
    card.append(viewer);
  }
  $('studentRefresh').onclick = async () => {
    const button = $('studentRefresh');
    const status = $('studentRefreshStatus');
    button.disabled = true;
    button.textContent = 'Actualisation…';
    message(status, 'Mise à jour des TP en cours…');
    try {
      await openDashboard();
      message(status, 'Contenus actualisés.');
    } catch (error) {
      message(status, error.message, true);
    } finally {
      button.disabled = false;
      button.textContent = '↻ Actualiser';
    }
  };
  // Actualisation de la page : l'en-tête de l'élève s'affiche tout de suite à partir de la dernière
  // visite dans cet onglet, pendant que la session est vérifiée par Supabase. Seuls le prénom, le nom
  // et l'état d'inscription sont gardés ; tout contenu reste chargé et contrôlé par le serveur.
  const VIEW_KEY = 'melec-student-view-v1';
  function sessionSubject() {
    try {
      const part = JSON.parse(sessionStorage.getItem('melec-cloud-session-v1') || 'null')?.access_token?.split('.')[1] || '';
      return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - part.length % 4) % 4))).sub || '';
    } catch { return ''; }
  }
  function rememberView(id, p) {
    try { sessionStorage.setItem(VIEW_KEY, JSON.stringify({ id, first_name: p.first_name, last_name: p.last_name, approved: Boolean(p.approved_at && p.class_id && !p.blocked_at) })); } catch { /* stockage indisponible */ }
  }
  function forgetView() { try { sessionStorage.removeItem(VIEW_KEY); } catch { /* stockage indisponible */ } }
  function paintFromLastVisit() {
    try {
      const view = JSON.parse(sessionStorage.getItem(VIEW_KEY) || 'null');
      if (!view || !view.id || view.id !== sessionSubject()) return;
      authPane.hidden = true; dashboard.hidden = false;
      document.documentElement.classList.remove('student-resuming');
      $('studentProfileStatus').textContent = `Bonjour ${view.first_name} ${view.last_name}.`;
      $('studentClassName').hidden = !view.approved;
      if (view.approved) $('studentClassName').textContent = 'Classe attribuée : chargement…';
      $('studentContentTabs').hidden = true;
    } catch { /* affichage normal après vérification */ }
  }
  $('studentLogout').onclick = async () => {
    forgetView();
    if (cleanupViewer) cleanupViewer();
    clearTpViewer(); clearDocumentCache(); activeTp=null; assignments=[]; tpItems=[]; tpItemsLoadedAt=0; tpItemsKey='';
    await api.signOut();
    dashboard.hidden = true; authPane.hidden = false; profile = null; tpListSignature = '';
    switchTab('login');
  };
  setInterval(() => {
    if (!activeTp) return;
    const remaining = tpEnd(activeTp) - Date.now();
    const info = $('studentTpList').querySelector('.student-tp-card .portal-small');
    if (info) info.textContent = remaining > 0 ? 'Temps restant : ' + formatDuration(remaining) : 'Temps écoulé · TP verrouillé.';
    if (remaining <= 0) { clearTpViewer(); clearDocumentCache(); activeTp=null; selectedContentTab='tp'; openDashboard().catch(error => message($('studentTpNotice'),error.message,true)); }
  },1000);
  let accessRefreshInProgress = false;
  async function refreshStudentAccess() {
    if (!profile || dashboard.hidden || document.visibilityState === 'hidden' || accessRefreshInProgress) return;
    accessRefreshInProgress = true;
    try {
    try {
      const current = await api.rest('student_profiles?user_id=eq.' + encodeURIComponent(profile.user_id) + '&select=approved_at,class_id,blocked_at');
      if (current[0]) profile = { ...profile, ...current[0] };
    } catch { /* Les requêtes de contenu restent protégées par RLS même hors réseau. */ }
    if ((!profile.approved_at || !profile.class_id || profile.blocked_at) && !$('studentContentTabs').hidden) {
      if (cleanupViewer) cleanupViewer();
      $('studentTpPane').hidden = true;
      $('studentContentTabs').hidden = true;
      clearTpViewer(); clearDocumentCache(); activeTp=null;
      $('studentProfileStatus').textContent = 'Votre accès a été suspendu ou révoqué par l’enseignant.';
    }
    if (profile.approved_at && profile.class_id && !profile.blocked_at) {
      if ($('studentContentTabs').hidden) {
        try { await openDashboard(); } catch { /* Réessayer au prochain rafraîchissement. */ }
        return;
      }
      const wasActive = activeTp?.id || null;
      try {
        await loadTpAssignments(true);
        if (activeTp) {
          if (!wasActive && cleanupViewer) { cleanupViewer(); cleanupViewer=null; }
          updateLearningLock();switchContentTab('tp');
        }
        else { updateLearningLock();if (wasActive) switchContentTab('tp'); }
      } catch { /* Les règles RLS continuent à protéger chaque accès aux documents. */ }
    }
    } finally { accessRefreshInProgress = false; }
  }
  setInterval(refreshStudentAccess, 30000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshStudentAccess();
  });
  window.addEventListener('pageshow', event => {
    if (event.persisted) refreshStudentAccess();
  });
  paintFromLastVisit();
  openDashboard().catch(error => {
    forgetView();
    authPane.hidden = false; dashboard.hidden = true;
    document.documentElement.classList.remove('student-resuming');
    if (api.sessionRejected(error)) {
      // Session illisible ou expirée : on l'oublie et on revient simplement au formulaire de connexion.
      api.forget();
      message(authStatus, 'Votre session a expiré. Reconnectez-vous.', true);
    } else if (sessionStorage.getItem('melec-cloud-session-v1'))
      message(authStatus, 'Le serveur ne répond pas correctement : ' + error.message + ' Votre session est conservée ; actualisez pour réessayer.', true);
    mountCaptcha();
  });
})();

