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
  let assignments = [], tpItems = [], activeTp = null, selectedContentTab = 'manual';
  let tpItemsLoadedAt = 0;
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
    ['studentManualTab','studentTdTab'].forEach(id=>{$(id).disabled=locked;});
    if(locked)window.MelecManualStudent.clear();
  }
  function switchContentTab(next) {
    if (activeTp && next !== 'tp') return;
    if (['manual','td'].includes(selectedContentTab) && next !== selectedContentTab) window.MelecManualStudent.clear();
    selectedContentTab = next;
    $('studentManualTab').classList.toggle('active', next === 'manual');
    $('studentTdTab').classList.toggle('active', next === 'td');
    $('studentTpTab').classList.toggle('active', next === 'tp');
    $('studentManualPane').hidden = next !== 'manual';
    $('studentTdPane').hidden = next !== 'td';
    $('studentTpPane').hidden = next !== 'tp';
    if (['manual','td'].includes(next) && profile?.class_id) window.MelecManualStudent.load(profile.class_id,next);
  }
  $('studentManualTab').onclick = () => switchContentTab('manual');
  $('studentTdTab').onclick = () => switchContentTab('td');
  $('studentTpTab').onclick = () => switchContentTab('tp');
  const authPane = $('studentAuth');
  const dashboard = $('studentDashboard');
  const authStatus = $('studentAuthStatus');
  function message(target, text, error = false) {
    target.textContent = text;
    target.classList.toggle('error', error);
  }
  function switchTab(tab) {
    if (tab === 'signup') $('studentSignupForm').reset();
    $('studentLoginForm').hidden = tab !== 'login';
    $('studentSignupForm').hidden = tab !== 'signup';
    $('studentLoginTab').classList.toggle('active', tab === 'login');
    $('studentSignupTab').classList.toggle('active', tab === 'signup');
    $('studentAuthTitle').textContent = tab === 'signup' ? 'Créer un compte élève' : tab === 'contact' ? 'Besoin d’aide ?' : 'Connexion élève';
    showContact(tab === 'contact');
    message(authStatus, '');
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
      await api.signIn(form.elements.email.value.trim(), form.elements.password.value);
      form.elements.password.value = '';
      await openDashboard();
    } catch (error) { message(authStatus, error.message, true); }
    finally { button.disabled = false; }
  };
  $('studentSignupForm').onsubmit = async event => {
    event.preventDefault();
    const form = event.currentTarget, button = form.querySelector('button[type=submit]');
    if (form.elements.password.value.length < 12) return message(authStatus, 'Le mot de passe doit contenir au moins 12 caractères.', true);
    button.disabled = true;
    message(authStatus, 'Création du compte…');
    try {
      await api.signUp({ lastName: form.elements.lastName.value.trim(), firstName: form.elements.firstName.value.trim(),
        className: form.elements.className.value.trim(), email: form.elements.email.value.trim(),
        password: form.elements.password.value });
      form.reset();
      message(authStatus, 'Vérifiez votre boîte e-mail pour confirmer l’adresse, puis revenez vous connecter. L’accès reste soumis à la validation de l’enseignant.');
    } catch (error) { message(authStatus, error.message, true); }
    finally { button.disabled = false; }
  };
  async function openDashboard() {
    const user = await api.user();
    const [teacher, profiles] = await Promise.all([
      api.rest('teacher_accounts?user_id=eq.' + encodeURIComponent(user.id) + '&select=user_id'),
      api.rest('student_profiles?user_id=eq.' + encodeURIComponent(user.id) + '&select=*')
    ]);
    if (teacher.length) { location.href = './enseignant.html'; return; }
    if (!profiles.length) throw new Error('Profil élève introuvable. Contactez votre enseignant.');
    profile = profiles[0];
    authPane.hidden = true; dashboard.hidden = false;
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
    $('studentManualPane').hidden = true;
    $('studentTdPane').hidden = true;
    $('studentTpPane').hidden = true;
    $('studentContentTabs').hidden = !approved;
    if (!approved) {
      intro.textContent += ' Votre inscription est en attente de validation par l’enseignant.';
      return;
    }
    await Promise.all([classNamePromise, loadTpAssignments()]);
    if (activeTp) {
      if (cleanupViewer) { cleanupViewer(); cleanupViewer=null; }
      window.MelecManualStudent.clear();
      updateLearningLock();switchContentTab('tp');
    }
    else {updateLearningLock();switchContentTab(selectedContentTab);}
  }
  async function loadTpAssignments(preserveViewer = false) {
    const previousActiveId = activeTp?.id;
    const refreshItems = !preserveViewer || !tpItemsLoadedAt || Date.now() - tpItemsLoadedAt > 120000;
    [assignments,tpItems] = await Promise.all([
      api.rest('tp_assignments?student_id=eq.' + encodeURIComponent(profile.user_id) + '&select=*'),
      refreshItems ? api.rest('learning_items?kind=eq.tp&published=is.true&select=id,title')
        : Promise.resolve(tpItems)
    ]);
    if (refreshItems) tpItemsLoadedAt = Date.now();
    activeTp = assignments.find(row => tpEnd(row) > Date.now()) || null;
    if (preserveViewer && previousActiveId && activeTp?.id === previousActiveId) return;
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
          try {
            const blob = await api.download(asset.object_path);
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
          } catch(error) { alert(error.message); } finally { button.disabled=false; }
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
    message(status, 'Mise à jour du manuel numérique et des TP en cours…');
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
  $('studentLogout').onclick = async () => {
    if (cleanupViewer) cleanupViewer();
    clearTpViewer(); window.MelecManualStudent.clear(); activeTp=null; assignments=[]; tpItems=[]; tpItemsLoadedAt=0;
    await api.signOut();
    dashboard.hidden = true; authPane.hidden = false; profile = null;
    switchTab('login');
  };
  setInterval(() => {
    if (!activeTp) return;
    const remaining = tpEnd(activeTp) - Date.now();
    const info = $('studentTpList').querySelector('.student-tp-card .portal-small');
    if (info) info.textContent = remaining > 0 ? 'Temps restant : ' + formatDuration(remaining) : 'Temps écoulé · TP verrouillé.';
    if (remaining <= 0) { clearTpViewer(); activeTp=null; selectedContentTab='manual'; openDashboard().catch(error => message($('studentTpNotice'),error.message,true)); }
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
      window.MelecManualStudent.clear();
      $('studentManualPane').hidden = true;
      $('studentTdPane').hidden = true;
      $('studentTpPane').hidden = true;
      $('studentContentTabs').hidden = true;
      clearTpViewer(); activeTp=null;
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
        else { updateLearningLock();if (wasActive) switchContentTab('manual'); }
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
  openDashboard().catch(() => { authPane.hidden = false; dashboard.hidden = true; });
})();
