(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const api = MelecPortal;
  let profile = null;
  let cleanupViewer = null;
  const authPane = $('studentAuth');
  const dashboard = $('studentDashboard');
  const authStatus = $('studentAuthStatus');
  function message(target, text, error = false) {
    target.textContent = text;
    target.classList.toggle('error', error);
  }
  function switchTab(signup) {
    $('studentLoginForm').hidden = signup;
    $('studentSignupForm').hidden = !signup;
    $('studentLoginTab').classList.toggle('active', !signup);
    $('studentSignupTab').classList.toggle('active', signup);
    $('studentAuthTitle').textContent = signup ? 'Créer un compte élève' : 'Connexion élève';
    message(authStatus, '');
  }
  $('studentLoginTab').onclick = () => switchTab(false);
  $('studentSignupTab').onclick = () => switchTab(true);
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
      form.elements.password.value = '';
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
    const form = $('contactForm');
    if (form) {
      form.elements.lastName.value = profile.last_name;
      form.elements.firstName.value = profile.first_name;
      form.elements.email.value = profile.email;
      form.elements.className.value = profile.requested_class;
    }
    const intro = $('studentProfileStatus');
    intro.textContent = `Bonjour ${profile.first_name} ${profile.last_name}.`;
    const approved = Boolean(profile.approved_at && profile.class_id);
    const active = approved && Date.parse(profile.access_until || '') > Date.now();
    $('studentCodePane').hidden = !approved || active;
    $('studentLessonsPane').hidden = !active;
    if (!approved) {
      intro.textContent += ' Votre inscription est en attente de validation par l’enseignant.';
      return;
    }
    if (!active) {
      intro.textContent += ' Votre accès aux contenus est expiré ou n’a pas encore été activé.';
      return;
    }
    $('studentAccessUntil').textContent = 'Accès autorisé jusqu’au ' + new Date(profile.access_until).toLocaleString('fr-FR');
    await loadLessons();
  }
  async function loadLessons() {
    const target = $('studentLessons');
    target.textContent = 'Chargement des contenus…';
    if (cleanupViewer) { cleanupViewer(); cleanupViewer = null; }
    const chapters = await api.rest('learning_chapters?class_id=eq.' + encodeURIComponent(profile.class_id) + '&published=is.true&select=id,title,position&order=position.asc,title.asc');
    if (!chapters.length) { target.textContent = 'Aucun chapitre publié pour votre classe.'; return; }
    const ids = chapters.map(c => c.id);
    const items = await api.rest('learning_items?chapter_id=in.(' + ids.join(',') + ')&published=is.true&select=id,chapter_id,kind,title,blocks,linked_course_id,position&order=position.asc,title.asc');
    target.replaceChildren();
    const labels = { course: 'Cours', td: 'Travaux dirigés', tp: 'Travaux pratiques' };
    for (const chapter of chapters) {
      const chapterNode = document.createElement('details');
      const title = document.createElement('summary'); title.textContent = chapter.title; chapterNode.append(title);
      const chapterItems = items.filter(item => item.chapter_id === chapter.id);
      for (const kind of ['course','td','tp']) {
        const subset = chapterItems.filter(item => item.kind === kind);
        if (!subset.length) continue;
        const heading = document.createElement('h3'); heading.textContent = labels[kind]; chapterNode.append(heading);
        for (const item of subset) {
          const row = document.createElement('details');
          const summary = document.createElement('summary'); summary.textContent = item.title; row.append(summary);
          const content = document.createElement('div'); content.className = 'student-readonly'; row.append(content);
          row.addEventListener('toggle', async () => {
            if (!row.open) { if (cleanupViewer) cleanupViewer(); content.replaceChildren(); return; }
            if (Date.parse(profile.access_until || '') <= Date.now()) { row.open = false; await openDashboard(); return; }
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
  $('studentCodeForm').onsubmit = async event => {
    event.preventDefault();
    const form = event.currentTarget, button = form.querySelector('button[type=submit]');
    button.disabled = true;
    message($('studentCodeStatus'), 'Vérification du code…');
    try {
      await api.invoke('melec-access', { action: 'redeem', code: form.elements.code.value.trim() });
      form.reset();
      await openDashboard();
      message($('studentCodeStatus'), 'Accès activé.');
    } catch (error) { message($('studentCodeStatus'), error.message, true); }
    finally { button.disabled = false; }
  };
  $('studentRefresh').onclick = () => openDashboard().catch(error => alert(error.message));
  $('studentLogout').onclick = async () => {
    if (cleanupViewer) cleanupViewer();
    await api.signOut();
    dashboard.hidden = true; authPane.hidden = false; profile = null;
  };
  setInterval(async () => {
    if (!profile || $('studentLessonsPane').hidden) return;
    try {
      const current = await api.rest('student_profiles?user_id=eq.' + encodeURIComponent(profile.user_id) + '&select=approved_at,class_id,access_until');
      if (current[0]) profile = { ...profile, ...current[0] };
    } catch { /* Les requêtes de contenu restent protégées par RLS même hors réseau. */ }
    if ((!profile.approved_at || !profile.class_id || Date.parse(profile.access_until || '') <= Date.now()) && !$('studentLessonsPane').hidden) {
      if (cleanupViewer) cleanupViewer();
      $('studentLessons').replaceChildren();
      $('studentLessonsPane').hidden = true;
      $('studentCodePane').hidden = !profile.approved_at;
      $('studentProfileStatus').textContent = profile.approved_at ? 'Votre accès de 24 h a expiré. Demandez un nouveau code à l’enseignant.' : 'Votre accès a été révoqué par l’enseignant.';
    }
  }, 30000);
  document.addEventListener('copy', e => { if (e.target.closest('.student-readonly')) e.preventDefault(); });
  document.addEventListener('contextmenu', e => { if (e.target.closest('.student-readonly')) e.preventDefault(); });
  openDashboard().catch(() => { authPane.hidden = false; dashboard.hidden = true; });
})();
