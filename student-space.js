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
  let assignments = [], tpItems = [], activeTp = null, tpUrls = [], selectedContentTab = 'courses';
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p' && !dashboard.hidden) {
      event.preventDefault();
      alert('L’impression des documents de l’espace élève n’est pas autorisée.');
    }
  });
  function tpEnd(assignment) {
    return Math.max(assignment.started_at ? Date.parse(assignment.started_at) + 210 * 60000 : 0,
      Date.parse(assignment.reactivated_until || '') || 0);
  }
  function clearTpViewer() {
    tpUrls.forEach(url => URL.revokeObjectURL(url)); tpUrls = [];
    $('studentTpViewer')?.remove();
  }
  function switchContentTab(next) {
    if (activeTp && next === 'courses') return;
    selectedContentTab = next;
    $('studentCoursesTab').classList.toggle('active', next === 'courses');
    $('studentTpTab').classList.toggle('active', next === 'tp');
    $('studentLessonsPane').hidden = next !== 'courses';
    $('studentTpPane').hidden = next !== 'tp';
  }
  $('studentCoursesTab').onclick = () => switchContentTab('courses');
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
    const teacher = await api.rest('teacher_accounts?user_id=eq.' + encodeURIComponent(user.id) + '&select=user_id');
    if (teacher.length) { location.href = './enseignant.html'; return; }
    const profiles = await api.rest('student_profiles?user_id=eq.' + encodeURIComponent(user.id) + '&select=*');
    if (!profiles.length) throw new Error('Profil élève introuvable. Contactez votre enseignant.');
    profile = profiles[0];
    authPane.hidden = true; dashboard.hidden = false;
    showContact(false);
    const intro = $('studentProfileStatus');
    intro.textContent = `Bonjour ${profile.first_name} ${profile.last_name}.`;
    const approved = Boolean(profile.approved_at && profile.class_id && !profile.blocked_at);
    const classLabel = $('studentClassName');
    classLabel.hidden = !approved;
    if (approved) {
      classLabel.textContent = 'Classe attribuée : chargement…';
      try {
        const assigned = await api.rest('teaching_classes?id=eq.' + encodeURIComponent(profile.class_id) + '&select=name');
        classLabel.textContent = assigned.length ? 'Classe attribuée : ' + assigned[0].name : 'Classe attribuée : nom indisponible';
      } catch { classLabel.textContent = 'Classe attribuée : nom indisponible'; }
    }
    $('studentLessonsPane').hidden = !approved;
    $('studentTpPane').hidden = true;
    $('studentContentTabs').hidden = !approved;
    if (!approved) {
      intro.textContent += ' Votre inscription est en attente de validation par l’enseignant.';
      return;
    }
    await loadTpAssignments();
    if (activeTp) {
      if (cleanupViewer) { cleanupViewer(); cleanupViewer=null; }
      $('studentLessons').replaceChildren();
      switchContentTab('tp'); $('studentCoursesTab').disabled = true;
    }
    else { $('studentCoursesTab').disabled = false; switchContentTab(selectedContentTab); await loadLessons(); }
  }
  async function loadTpAssignments(preserveViewer = false) {
    const previousActiveId = activeTp?.id;
    [assignments,tpItems] = await Promise.all([
      api.rest('tp_assignments?student_id=eq.' + encodeURIComponent(profile.user_id) + '&select=*'),
      api.rest('learning_items?kind=eq.tp&published=is.true&select=id,title')
    ]);
    activeTp = assignments.find(row => tpEnd(row) > Date.now()) || null;
    if (preserveViewer && previousActiveId && activeTp?.id === previousActiveId) return;
    clearTpViewer();
    const list = $('studentTpList'); list.replaceChildren();
    $('studentTpNotice').textContent = activeTp ? 'Un TP est en cours. Les cours et TD restent verrouillés jusqu’à la fin du chronomètre.' : 'Ouvrir un TP démarre immédiatement un chronomètre de 3 h 30. Après son expiration, demandez une prolongation à l’enseignant.';
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
    const notice = document.createElement('p'); notice.className='portal-small'; notice.textContent='Consultation à l’écran uniquement · impression non autorisée.'; viewer.append(notice);
    for (const role of ['main','technical']) {
      const group = document.createElement('section');
      const heading = document.createElement('h4'); heading.textContent = role === 'main' ? 'Document du TP' : 'Dossier technique'; group.append(heading);
      const files = assets.filter(asset => (asset.asset_role || 'main') === role);
      for (const asset of files) {
        const button = document.createElement('button'); button.type='button'; button.textContent=asset.file_name;
        button.onclick = async () => {
          if (tpEnd(activeTp) <= Date.now()) { clearTpViewer(); await openDashboard(); return; }
          const opened = group.querySelector('iframe');
          if (opened?.dataset.assetId === asset.id) {
            opened.remove(); button.textContent = asset.file_name; button.setAttribute('aria-expanded','false'); return;
          }
          button.disabled=true;
          try {
            const blob = await api.download(asset.object_path); const url=URL.createObjectURL(blob); tpUrls.push(url);
            group.querySelector('iframe')?.remove();
            group.querySelectorAll('button[aria-expanded="true"]').forEach(other => { other.textContent = other.dataset.fileName; other.setAttribute('aria-expanded','false'); });
            const frame=document.createElement('iframe'); frame.src=url+'#toolbar=0&navpanes=0&scrollbar=1'; frame.title='Consultation du document ' + asset.file_name; frame.dataset.assetId=asset.id; group.append(frame);
            button.dataset.fileName=asset.file_name; button.textContent='Réduire · '+asset.file_name; button.setAttribute('aria-expanded','true');
          } catch(error) { alert(error.message); } finally { button.disabled=false; }
        };
        group.append(button);
      }
      if (files.length) viewer.append(group);
    }
    card.append(viewer);
  }
  async function loadLessons() {
    const target = $('studentLessons');
    target.textContent = 'Chargement des contenus…';
    if (cleanupViewer) { cleanupViewer(); cleanupViewer = null; }
    const chapters = await api.rest('learning_chapters?class_id=eq.' + encodeURIComponent(profile.class_id) + '&published=is.true&select=id,title,position&order=position.asc,title.asc');
    if (!chapters.length) { target.textContent = 'Aucun chapitre publié pour votre classe.'; return; }
    const ids = chapters.map(c => c.id);
    const items = await api.rest('learning_items?chapter_id=in.(' + ids.join(',') + ')&kind=in.(course,td)&published=is.true&select=id,chapter_id,kind,title,blocks,linked_course_id,position&order=position.asc,title.asc');
    target.replaceChildren();
    if (!items.length) { target.textContent = 'Aucun cours ou TD publié n’est visible pour cette classe. Demandez à l’enseignant de vérifier la publication de la leçon.'; return; }
    const labels = { course: 'Cours', td: 'Travaux dirigés', tp: 'Travaux pratiques' };
    for (const chapter of chapters) {
      const chapterNode = document.createElement('details');
      const title = document.createElement('summary'); title.textContent = chapter.title; chapterNode.append(title);
      const chapterItems = items.filter(item => item.chapter_id === chapter.id);
      if (!chapterItems.length) continue;
      for (const kind of ['course','td']) {
        const subset = chapterItems.filter(item => item.kind === kind);
        if (!subset.length) continue;
        const heading = document.createElement('h3'); heading.textContent = labels[kind]; chapterNode.append(heading);
        for (const item of subset) {
          const row = document.createElement('details');
          const summary = document.createElement('summary'); summary.textContent = item.title; row.append(summary);
          const content = document.createElement('div'); content.className = 'student-readonly'; row.append(content);
          row.addEventListener('toggle', async () => {
            if (!row.open) { if (cleanupViewer) cleanupViewer(); content.replaceChildren(); return; }
            if (activeTp) { row.open = false; await openDashboard(); return; }
            try {
              const assets = await api.rest('learning_assets?item_id=eq.' + encodeURIComponent(item.id) + '&select=id,object_path,file_name,mime_type');
              if (cleanupViewer) cleanupViewer();
              cleanupViewer = await MelecContent.render(item.blocks, content, assets);
            } catch (error) { content.textContent = error.message; }
          });
          chapterNode.append(row);
        }
      }
      target.append(chapterNode);
    }
  }
  $('studentRefresh').onclick = async () => {
    const button = $('studentRefresh');
    const status = $('studentRefreshStatus');
    button.disabled = true;
    button.textContent = 'Actualisation…';
    message(status, 'Mise à jour des cours, TD et TP en cours…');
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
    clearTpViewer(); activeTp=null; assignments=[]; tpItems=[];
    await api.signOut();
    dashboard.hidden = true; authPane.hidden = false; profile = null;
    switchTab('login');
  };
  setInterval(() => {
    if (!activeTp) return;
    const remaining = tpEnd(activeTp) - Date.now();
    const info = $('studentTpList').querySelector('.student-tp-card .portal-small');
    if (info) info.textContent = remaining > 0 ? 'Temps restant : ' + formatDuration(remaining) : 'Temps écoulé · TP verrouillé.';
    if (remaining <= 0) { clearTpViewer(); activeTp=null; selectedContentTab='courses'; openDashboard().catch(error => message($('studentTpNotice'),error.message,true)); }
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
      $('studentLessons').replaceChildren();
      $('studentLessonsPane').hidden = true;
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
          if (!wasActive) { if (cleanupViewer) { cleanupViewer(); cleanupViewer=null; } $('studentLessons').replaceChildren(); }
          $('studentCoursesTab').disabled=true; switchContentTab('tp');
        }
        else { $('studentCoursesTab').disabled=false; if (wasActive) { switchContentTab('courses'); await loadLessons(); } }
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
  document.addEventListener('copy', e => { if (e.target.closest('.student-readonly')) e.preventDefault(); });
  document.addEventListener('contextmenu', e => { if (e.target.closest('.student-readonly')) e.preventDefault(); });
  openDashboard().catch(() => { authPane.hidden = false; dashboard.hidden = true; });
})();
