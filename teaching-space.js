(function () {
  'use strict';
  const api = MelecPortal, esc = api.escapeHtml, root = document.getElementById('teachingView');
  let classes = [], chapters = [], items = [], students = [], messages = [];
  let classId = '', tab = 'course', editing = null, blocks = [], draftAssets = [], activeItem = null, originalAssets = [];
  let selectedChapterId = '', selectedItemId = '';
  let tpAssignments = [], classStudents = [], selectedTpId = 'all', draftRoles = [];
  let previewCleanup = null;
  let loadedSession = '', lastLoaded = 0, loadInFlight = null;
  const kindNames = { course: 'Cours', td: 'Travaux dirigés', tp: 'Travaux pratiques' };
  const originalShow = window.show;
  function sessionKey() {
    try {
      const token = JSON.parse(sessionStorage.getItem('melec-cloud-session-v1') || 'null')?.access_token;
      if (!token) return '';
      // Utilisé seulement pour isoler le cache d'affichage, jamais pour autoriser l'accès.
      return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub || token;
    }
    catch { return ''; }
  }
  window.show = show = function (name) {
    if (name !== 'teaching') return originalShow(name);
    history.replaceState(null, '', location.pathname + location.search + '#teaching');
    document.body.classList.remove('home-active'); document.body.classList.add('subpage-active');
    document.querySelectorAll('.view').forEach(node => node.classList.add('hidden'));
    root.classList.remove('hidden');
    document.querySelectorAll('.nav').forEach(node => node.classList.toggle('active', node.dataset.view === name));
    window.scrollTo(0, 0);
    const key = sessionKey();
    if (key && loadedSession === key) {
      render();
      if (Date.now() - lastLoaded > 30000) load(true).catch(error => status(error.message, true));
    } else {
      classes = []; chapters = []; items = []; students = []; messages = [];
      loadedSession = '';
      load().catch(error => status(error.message, true));
    }
  };
  function status(text, error = false) {
    const node = root.querySelector('#teachStatus');
    if (node) { node.textContent = text; node.classList.toggle('error', error); }
  }
  function classNames() {
    const names = new Set();
    (state?.students || []).forEach(s => { if (s.className) names.add(s.className.trim()); });
    (state?.activities || []).forEach(a => { if (a.className) names.add(a.className.trim()); });
    return [...names].filter(Boolean).sort((a,b) => a.localeCompare(b, 'fr'));
  }
  async function load(background = false) {
    if (loadInFlight) return loadInFlight;
    if (!background) root.innerHTML = '<div class="teach-head"><div><h1>Cours · TD · TP</h1><p>Contenus de classe et accès élèves</p></div></div><div class="teach-card">Chargement… <span id="teachStatus"></span></div>';
    const key = sessionKey();
    loadInFlight = (async () => {
      // La base applique les règles d'accès : aucune donnée n'est affichée avant contrôle du compte.
      const [user, nextClasses] = await Promise.all([
        api.user(),
        api.rest('teaching_classes?select=id,name&order=name.asc')
      ]);
      const teachers = await api.rest('teacher_accounts?user_id=eq.' + encodeURIComponent(user.id) + '&select=user_id');
      if (!teachers.length) throw new Error('Accès réservé à l’enseignant.');
      if (sessionKey() !== key) return;
      classes = nextClasses;
      if (!classId || !classes.some(c => c.id === classId)) {
        classId = classes[0]?.id || '';
        selectedChapterId = ''; selectedItemId = '';
      }
      await loadClass();
      if (sessionKey() === key) { loadedSession = key; lastLoaded = Date.now(); }
    })();
    try { await loadInFlight; }
    finally { loadInFlight = null; }
  }
  async function loadClass() {
    const auxiliary = tab === 'students'
      ? api.rest('student_profiles?select=*&order=last_name.asc,first_name.asc')
      : tab === 'messages'
        ? api.rest('contact_messages?select=*&order=created_at.desc&limit=100')
        : null;
    if (classId) {
      [chapters, items] = await Promise.all([
        api.rest('learning_chapters?class_id=eq.' + classId + '&select=*&order=position.asc,title.asc'),
        api.rest('learning_items?select=*&order=position.asc,title.asc')
      ]);
      items = items.filter(i => chapters.some(c => c.id === i.chapter_id));
      if (tab === 'tp') {
        [classStudents,tpAssignments] = await Promise.all([
          api.rest('student_profiles?class_id=eq.' + encodeURIComponent(classId) + '&select=user_id,last_name,first_name&order=last_name.asc,first_name.asc'),
          api.rest('tp_assignments?select=*')
        ]);
      }
    } else { chapters = []; items = []; }
    if (auxiliary) {
      const result = await auxiliary;
      if (tab === 'students') students = result;
      if (tab === 'messages') messages = result;
    }
    render();
  }
  async function refreshAuxiliary(selectedTab) {
    const result = selectedTab === 'students'
      ? await api.rest('student_profiles?select=*&order=last_name.asc,first_name.asc')
      : await api.rest('contact_messages?select=*&order=created_at.desc&limit=100');
    if (tab !== selectedTab || !root.offsetParent) return;
    if (selectedTab === 'students') students = result;
    else messages = result;
    render();
  }
  function render() {
    root.innerHTML = `<div class="teach-head"><div><h1>Cours · TD · TP</h1><p>Créer et publier des ressources par classe.</p></div></div>
      <div class="teach-card"><div class="teach-row"><label for="teachClass">Classe</label><select id="teachClass"><option value="">Choisir une classe</option>${classes.map(c => `<option value="${c.id}" ${c.id === classId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select><button type="button" id="teachSyncClasses" class="subtle">Ajouter les classes de l’application</button></div><p class="teach-help">Les cours sont visibles par les élèves approuvés de la classe uniquement après publication et activation de leur code de 24 h.</p></div>
      <div class="teach-tabs" role="tablist">${[['course','Cours'],['td','Travaux dirigés'],['tp','Travaux pratiques'],['students','Accès élèves'],['messages','Messages']].map(([key,label]) => `<button type="button" data-teach-tab="${key}" class="${tab === key ? 'active' : ''}">${label}</button>`).join('')}</div>
      <div id="teachBody"></div><p id="teachStatus" class="teach-status" role="status"></p>`;
    root.querySelector('#teachClass').onchange = e => { classId = e.target.value; selectedChapterId = ''; selectedItemId = ''; editing = null; loadClass().catch(err => status(err.message, true)); };
    root.querySelector('#teachSyncClasses').onclick = syncClasses;
    root.querySelectorAll('[data-teach-tab]').forEach(button => button.onclick = () => {
      tab = button.dataset.teachTab; selectedItemId = ''; editing = null; render();
      if (tab === 'students' || tab === 'messages') refreshAuxiliary(tab).catch(err => status(err.message, true));
      if (tab === 'tp') loadClass().catch(err => status(err.message, true));
    });
    if (tab === 'students') renderStudents();
    else if (tab === 'messages') renderMessages();
    else if (tab === 'tp') renderTp();
    else renderContent();
  }
  async function syncClasses() {
    try {
      const existing = new Set(classes.map(c => c.name.toLocaleLowerCase('fr')));
      const names = classNames().filter(name => !existing.has(name.toLocaleLowerCase('fr')));
      if (!names.length) { status('Toutes les classes sont déjà présentes.'); return; }
      await api.rest('teaching_classes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(names.map(name => ({name}))) });
      await load(); status(names.length + ' classe(s) ajoutée(s).');
    } catch (error) { status(error.message, true); }
  }
  function tpIsActive(assignment) {
    const initialEnd = assignment.started_at ? Date.parse(assignment.started_at) + 210 * 60000 : 0;
    return Math.max(initialEnd, Date.parse(assignment.reactivated_until || '') || 0) > Date.now();
  }
  function renderTp() {
    const body = root.querySelector('#teachBody');
    if (!classId) { body.innerHTML = '<div class="teach-card">Choisissez une classe pour gérer ses TP.</div>'; return; }
    const tps = items.filter(item => item.kind === 'tp');
    if (selectedTpId !== 'all' && !tps.some(item => item.id === selectedTpId)) selectedTpId = 'all';
    const displayed = selectedTpId === 'all' ? tps : tps.filter(item => item.id === selectedTpId);
    body.innerHTML = `<div class="teach-card teach-content-manager"><h2>TP en atelier</h2><p class="teach-help">Ajoutez un TP PDF, puis choisissez les élèves autorisés. Chaque dossier technique reste lié à son TP.</p><div class="teach-row"><button type="button" id="createTp">＋ Ajouter un TP</button><label for="tpFilter">Afficher<select id="tpFilter"><option value="all">Tous les TP (${tps.length})</option>${tps.map(item => `<option value="${item.id}" ${item.id === selectedTpId ? 'selected' : ''}>${esc(item.title)}</option>`).join('')}</select></label></div></div>
      ${displayed.map(item => { const assignments = tpAssignments.filter(row => row.tp_id === item.id); return `<article class="teach-card teach-tp-card" data-tp="${item.id}"><div class="teach-section-heading"><div><h3>${esc(item.title)}</h3><span class="teach-meta">${assignments.length} élève(s) associé(s)</span></div><div class="teach-row"><button type="button" data-preview-tp="${item.id}" class="subtle">Voir</button><button type="button" data-edit-tp="${item.id}" class="subtle">Modifier</button><button type="button" data-publish-tp="${item.id}" class="subtle">${item.published ? 'Masquer' : 'Publier'}</button><button type="button" data-delete-tp="${item.id}" class="warn">Supprimer</button></div></div><details><summary>Associer des élèves et gérer le temps</summary><div class="teach-tp-students">${classStudents.map(student => { const assignment = assignments.find(row => row.student_id === student.user_id); const active = assignment && tpIsActive(assignment); const locked = assignment?.started_at && !active; return `<div class="teach-tp-student"><label><input type="checkbox" data-tp-student="${student.user_id}" ${assignment ? 'checked' : ''}><span>${esc(student.last_name)} ${esc(student.first_name)}</span></label><div class="teach-tp-time">${assignment ? active ? 'En cours' : locked ? 'Terminé / verrouillé' : 'Non commencé' : 'Non associé'}${locked ? `<select data-extend-time="${assignment.id}" aria-label="Prolongation"><option value="30">30 min</option><option value="60">1 h</option><option value="90">1 h 30</option><option value="120">2 h</option><option value="180">3 h</option></select><button type="button" data-extend="${assignment.id}">Réactiver</button>` : ''}</div></div>`; }).join('') || '<p>Aucun élève dans cette classe.</p>'}</div><button type="button" data-save-tp="${item.id}">Enregistrer les associations</button></details></article>`; }).join('') || '<div class="teach-card">Aucun TP pour cette classe. Cliquez sur « Ajouter un TP ».</div>'}<div id="teachEditor"></div>`;
    body.querySelector('#tpFilter').onchange = event => { selectedTpId = event.target.value; renderTp(); };
    body.querySelector('#createTp').onclick = async () => {
      try {
        let chapter = chapters.find(candidate => candidate.title === 'TP en atelier');
        if (!chapter) {
          const created = await api.rest('learning_chapters?select=*', {method:'POST',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({class_id:classId,title:'TP en atelier',published:true})});
          chapter = created[0]; chapters.push(chapter);
        } else if (!chapter.published) await api.rest('learning_chapters?id=eq.' + chapter.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({published:true})});
        editItem(null,chapter.id);
      } catch (error) { status(error.message,true); }
    };
    body.querySelectorAll('[data-preview-tp]').forEach(button => button.onclick = () => previewItem(items.find(item => item.id === button.dataset.previewTp)));
    body.querySelectorAll('[data-edit-tp]').forEach(button => button.onclick = () => editItem(button.dataset.editTp));
    body.querySelectorAll('[data-publish-tp]').forEach(button => button.onclick = async () => {
      const item = items.find(candidate => candidate.id === button.dataset.publishTp);
      if (!item) return;
      try {
        if (!item.published) {
          const chapter = chapters.find(candidate => candidate.id === item.chapter_id);
          if (chapter && !chapter.published) await api.rest('learning_chapters?id=eq.' + encodeURIComponent(chapter.id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({published:true})});
        }
        await api.rest('learning_items?id=eq.' + encodeURIComponent(item.id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({published:!item.published})});
        await loadClass(); status(item.published ? 'TP masqué.' : 'TP publié pour les élèves associés.');
      } catch (error) { status(error.message,true); }
    });
    body.querySelectorAll('[data-delete-tp]').forEach(button => button.onclick = () => deleteItem(button.dataset.deleteTp));
    body.querySelectorAll('[data-save-tp]').forEach(button => button.onclick = () => saveTpAssignments(button.dataset.saveTp));
    body.querySelectorAll('[data-extend]').forEach(button => button.onclick = () => extendTp(button.dataset.extend));
  }
  async function saveTpAssignments(tpId) {
    const card = root.querySelector(`[data-tp="${tpId}"]`);
    const selected = new Set([...card.querySelectorAll('[data-tp-student]:checked')].map(input => input.dataset.tpStudent));
    const existing = tpAssignments.filter(row => row.tp_id === tpId);
    const removed = existing.filter(row => !selected.has(row.student_id));
    if (removed.some(row => row.started_at) && !confirm('Retirer un élève qui a déjà ouvert ce TP supprimera son accès et son chronomètre. Continuer ?')) return;
    try {
      const newRows = [...selected].filter(id => !existing.some(row => row.student_id === id)).map(student_id => ({tp_id:tpId,student_id}));
      if (newRows.length) await api.rest('tp_assignments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(newRows)});
      for (const row of removed) await api.rest('tp_assignments?id=eq.' + encodeURIComponent(row.id),{method:'DELETE'});
      const item = items.find(candidate => candidate.id === tpId);
      if (selected.size && item && !item.published) {
        const chapter = chapters.find(candidate => candidate.id === item.chapter_id);
        if (chapter && !chapter.published) await api.rest('learning_chapters?id=eq.' + encodeURIComponent(chapter.id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({published:true})});
        await api.rest('learning_items?id=eq.' + encodeURIComponent(tpId),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({published:true})});
      }
      await loadClass(); status(selected.size ? 'Associations enregistrées. Le TP est accessible aux élèves sélectionnés.' : 'Associations du TP enregistrées.');
    } catch (error) { status(error.message,true); }
  }
  async function extendTp(id) {
    const assignment = tpAssignments.find(row => row.id === id);
    const select = root.querySelector(`[data-extend-time="${id}"]`);
    if (!assignment || !select || tpIsActive(assignment)) return status('Ce TP est encore actif.',true);
    const minutes = Number(select.value);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 180) return status('Durée invalide.',true);
    try {
      await api.rest('tp_assignments?id=eq.' + encodeURIComponent(id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({extension_minutes:minutes})});
      await loadClass(); status('TP réactivé pour cet élève pendant ' + minutes + ' minute(s).');
    } catch (error) { status(error.message,true); }
  }
  function renderContent() {
    const body = root.querySelector('#teachBody');
    if (!classId) { body.innerHTML = '<div class="teach-card">Ajoutez ou choisissez une classe pour commencer.</div>'; return; }
    const contentChapters = chapters.filter(candidate => candidate.title.trim().toLocaleLowerCase('fr') !== 'tp en atelier');
    if (!contentChapters.some(chapter => chapter.id === selectedChapterId)) { selectedChapterId = ''; selectedItemId = ''; }
    const chapter = contentChapters.find(candidate => candidate.id === selectedChapterId);
    const relatedItems = chapter ? items.filter(item => item.chapter_id === chapter.id && item.kind === tab) : [];
    if (!relatedItems.some(item => item.id === selectedItemId)) selectedItemId = '';
    const selectedItem = relatedItems.find(item => item.id === selectedItemId);
    body.innerHTML = `<div class="teach-card teach-content-manager"><h2>${esc(kindNames[tab])} de la classe</h2>
      <div class="teach-manager-fields"><label for="chapterSelect">Chapitre<select id="chapterSelect"><option value="">Choisir un chapitre…</option>${contentChapters.map(candidate => `<option value="${candidate.id}" ${candidate.id === selectedChapterId ? 'selected' : ''}>${esc(candidate.title)}</option>`).join('')}</select></label>
      <div class="teach-create-chapter"><label for="chapterTitle">Créer un chapitre<input id="chapterTitle" maxlength="180" placeholder="Ex. Symboles architecturaux"></label><button type="button" id="addChapter">Créer</button></div></div></div>
      ${chapter ? `<div class="teach-card teach-chapter-detail"><div class="teach-section-heading"><div><h3>${esc(chapter.title)}</h3></div><div class="teach-row"><button type="button" id="publishChapter" class="subtle">${chapter.published ? 'Masquer aux élèves' : 'Publier le chapitre'}</button><button type="button" id="deleteChapter" class="warn">Supprimer le chapitre</button></div></div>
      <details class="teach-rename"><summary>Modifier le nom du chapitre</summary><div class="teach-row"><label for="chapterRename">Nouveau nom</label><input id="chapterRename" maxlength="180" value="${esc(chapter.title)}"><button type="button" id="renameChapter">Enregistrer le nom</button></div></details>
      <div class="teach-manager-fields"><label for="lessonSelect">${tab === 'course' ? 'Leçons du chapitre' : tab === 'td' ? 'TD du chapitre' : 'TP du chapitre'}<select id="lessonSelect"><option value="">Choisir ${tab === 'course' ? 'une leçon' : tab === 'td' ? 'un TD' : 'un TP'}…</option>${relatedItems.map(item => `<option value="${item.id}" ${item.id === selectedItemId ? 'selected' : ''}>${esc(item.title)}</option>`).join('')}</select></label><button type="button" id="addItem">Ajouter ${tab === 'course' ? 'une leçon' : tab === 'td' ? 'un TD' : 'un TP'}</button></div>
      </div>` : ''}
      ${selectedItem ? `<div class="teach-card teach-item-detail"><div><h3>${esc(selectedItem.title)}</h3></div><div class="teach-row"><button type="button" id="previewSelectedItem" class="subtle">Voir le contenu</button><button type="button" id="editSelectedItem" class="subtle">Modifier</button><button type="button" id="publishSelectedItem" class="subtle">${selectedItem.published ? 'Masquer' : 'Publier et voir le PDF'}</button><button type="button" id="deleteSelectedItem" class="warn">Supprimer</button></div></div>` : ''}<div id="teachEditor"></div>`;
    body.querySelector('#addChapter').onclick = async () => {
      const title = body.querySelector('#chapterTitle').value.trim(); if (!title) return status('Saisissez le nom du chapitre.', true);
      if (title.toLocaleLowerCase('fr') === 'tp en atelier') return status('Ce nom est réservé à la rubrique Travaux pratiques.', true);
      const existing = contentChapters.find(candidate => candidate.title.trim().toLocaleLowerCase('fr') === title.toLocaleLowerCase('fr'));
      if (existing) { selectedChapterId = existing.id; selectedItemId = ''; renderContent(); return status('Ce chapitre existe déjà. Il est maintenant sélectionné.'); }
      try { const created = await api.rest('learning_chapters?select=id', {method:'POST', headers:{'Content-Type':'application/json',Prefer:'return=representation'}, body:JSON.stringify({class_id:classId,title,position:chapters.length})}); selectedChapterId = created[0].id; selectedItemId = ''; await loadClass(); status('Chapitre créé. Vous pouvez y ajouter plusieurs contenus.'); }
      catch (error) { status(error.message, true); }
    };
    body.querySelector('#chapterSelect').onchange = event => { selectedChapterId = event.target.value; selectedItemId = ''; renderContent(); };
    if (!chapter) return;
    body.querySelector('#publishChapter').onclick = () => update('learning_chapters', chapter.id, {published: !chapter.published});
    body.querySelector('#deleteChapter').onclick = () => deleteChapter(chapter.id);
    body.querySelector('#renameChapter').onclick = () => renameChapter(chapter.id);
    body.querySelector('#addItem').onclick = () => { selectedItemId = ''; editItem(null, chapter.id); };
    body.querySelector('#lessonSelect').onchange = event => { selectedItemId = event.target.value; renderContent(); };
    if (selectedItem) {
      body.querySelector('#previewSelectedItem').onclick = () => previewItem(selectedItem);
      body.querySelector('#editSelectedItem').onclick = () => editItem(selectedItem.id);
      body.querySelector('#publishSelectedItem').onclick = async () => {
        try {
          await api.rest('learning_items?id=eq.' + encodeURIComponent(selectedItem.id), {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({published: !selectedItem.published})});
          await loadClass();
          if (!selectedItem.published) {
            const preview = await previewItem({...selectedItem,published:true});
            if (preview?.hasPrintable) {
              status('Contenu publié. La fenêtre d’impression permet de choisir « Enregistrer au format PDF ».');
              document.querySelector('#printLesson')?.click();
            } else status('Contenu publié. Ouvrez chaque PDF joint depuis l’aperçu pour le consulter ou l’imprimer.');
          }
          else status('Contenu masqué aux élèves.');
        } catch (error) { status(error.message, true); }
      };
      body.querySelector('#deleteSelectedItem').onclick = () => deleteItem(selectedItem.id);
    }
  }
  async function renameChapter(id) {
    const chapter = chapters.find(candidate => candidate.id === id);
    const title = root.querySelector('#chapterRename')?.value.trim();
    if (!chapter || !title) return status('Saisissez un nom de chapitre.', true);
    if (chapters.some(candidate => candidate.id !== id && candidate.title.trim().toLocaleLowerCase('fr') === title.toLocaleLowerCase('fr'))) {
      return status('Un autre chapitre porte déjà ce nom.', true);
    }
    try {
      const changed = await api.rest('learning_chapters?id=eq.' + encodeURIComponent(id) + '&class_id=eq.' + encodeURIComponent(classId) + '&select=id', {
        method: 'PATCH', headers: {'Content-Type':'application/json', Prefer:'return=representation'}, body: JSON.stringify({title})
      });
      if (!Array.isArray(changed) || changed.length !== 1) throw new Error('La modification du chapitre n’a pas été confirmée.');
      await loadClass(); status('Nom du chapitre modifié.');
    } catch (error) { status(error.message, true); }
  }
  async function deleteChapter(id) {
    const chapter = chapters.find(candidate => candidate.id === id);
    if (!chapter || selectedChapterId !== id) return status('Chapitre introuvable. Actualisez la page.', true);
    const chapterItems = items.filter(item => item.chapter_id === id);
    let assets = [];
    try {
      for (let index = 0; index < chapterItems.length; index += 50) {
        const ids = chapterItems.slice(index, index + 50).map(item => item.id).join(',');
        const batch = await api.rest('learning_assets?item_id=in.(' + ids + ')&select=object_path');
        assets.push(...batch);
      }
    } catch (error) { return status('Impossible de vérifier les fichiers liés : ' + error.message, true); }
    const courseCount = chapterItems.filter(item => item.kind === 'course').length;
    const tdCount = chapterItems.filter(item => item.kind === 'td').length;
    const tpCount = chapterItems.filter(item => item.kind === 'tp').length;
    const message = `Supprimer définitivement le chapitre « ${chapter.title} » ?\n\nCela supprimera aussi ${courseCount} leçon(s), ${tdCount} TD, ${tpCount} TP et ${assets.length} fichier(s) joint(s). Cette opération est irréversible.`;
    if (!confirm(message)) return;
    try {
      const deleted = await api.rest('learning_chapters?id=eq.' + encodeURIComponent(id) + '&class_id=eq.' + encodeURIComponent(classId) + '&select=id', {
        method: 'DELETE', headers: {Prefer:'return=representation'}
      });
      if (!Array.isArray(deleted) || deleted.length !== 1) throw new Error('La suppression du chapitre n’a pas été confirmée par la base.');
      selectedChapterId = ''; selectedItemId = '';
      activeItem = null; editing = null; blocks = []; draftAssets = []; originalAssets = [];
      await loadClass();
      const paths = assets.map(asset => asset.object_path).filter(Boolean);
      if (paths.length) {
        try { await api.removeFiles(paths); }
        catch (error) { return status('Chapitre et contenus supprimés, mais le nettoyage des fichiers a échoué : ' + error.message, true); }
      }
      status('Chapitre et contenus associés supprimés.');
    } catch (error) { status(error.message, true); }
  }
  async function deleteItem(id) {
    const item = items.find(candidate => candidate.id === id && candidate.kind === tab);
    if (!item) return status('Contenu introuvable. Actualisez la page.', true);
    const linkedCount = item.kind === 'course' ? items.filter(candidate => candidate.kind === 'td' && candidate.linked_course_id === id).length : 0;
    const warning = linkedCount ? `\n${linkedCount} TD lié(s) seront conservés, mais leur liaison avec ce cours sera retirée.` : '';
    if (!confirm(`Supprimer définitivement « ${item.title} » et ses fichiers joints ?${warning}`)) return;
    try {
      const assets = await api.rest('learning_assets?item_id=eq.' + encodeURIComponent(id) + '&select=object_path');
      const deleted = await api.rest('learning_items?id=eq.' + encodeURIComponent(id) + '&kind=eq.' + encodeURIComponent(item.kind) + '&select=id', {
        method: 'DELETE', headers: { Prefer: 'return=representation' }
      });
      if (!Array.isArray(deleted) || deleted.length !== 1) throw new Error('La suppression n’a pas été confirmée par la base.');
      if (activeItem === id) { activeItem = null; editing = null; blocks = []; draftAssets = []; originalAssets = []; }
      if (selectedItemId === id) selectedItemId = '';
      await loadClass();
      const paths = assets.map(asset => asset.object_path).filter(Boolean);
      if (paths.length) {
        try { await api.removeFiles(paths); }
        catch (error) { return status('Contenu supprimé, mais le nettoyage des fichiers a échoué : ' + error.message, true); }
      }
      status('Contenu et fichiers joints supprimés.');
    } catch (error) { status(error.message, true); }
  }
  async function update(table, id, fields) {
    try { await api.rest(table + '?' + (table === 'student_profiles' ? 'user_id' : 'id') + '=eq.' + id, {method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify(fields)}); await loadClass(); status('Modification enregistrée.'); }
    catch (error) { status(error.message, true); }
  }
  async function editItem(id, chapterId) {
    editing = id ? items.find(i => i.id === id) : null;
    if (id && (!editing || editing.kind !== tab)) return status('Contenu introuvable. Actualisez la page.', true);
    activeItem = editing?.id || null;
    blocks = structuredClone(editing?.blocks || []); draftAssets = []; draftRoles = [];
    try {
      originalAssets = id ? await api.rest('learning_assets?item_id=eq.' + encodeURIComponent(id) + '&select=id,object_path,file_name,mime_type,asset_role') : [];
    } catch (error) { return status('Impossible de charger les fichiers joints : ' + error.message, true); }
    const host = root.querySelector('#teachEditor');
    const courseOptions = items.filter(i => i.kind === 'course' && i.chapter_id === (editing?.chapter_id || chapterId));
    host.innerHTML = `<div class="teach-card teach-editor"><h2>${editing ? 'Modifier' : 'Créer'} : ${esc(kindNames[tab])}</h2><label>Titre <input id="itemTitle" maxlength="180" value="${esc(editing?.title || '')}" required></label>${tab === 'td' ? `<label>Cours lié <select id="linkedCourse"><option value="">Aucun</option>${courseOptions.map(i => `<option value="${i.id}" ${editing?.linked_course_id === i.id ? 'selected' : ''}>${esc(i.title)}</option>`).join('')}</select></label>` : ''}<div id="blockList"></div><div class="teach-row">${tab !== 'tp' ? '<button type="button" id="addText" class="subtle">＋ Texte / tableau</button><button type="button" id="addVideo" class="subtle">＋ Vidéo</button>' : ''}<button type="button" id="addFile" class="subtle">＋ ${tab === 'tp' ? 'PDF du TP' : 'Image ou document'}</button><input id="itemFile" type="file" accept="${tab === 'tp' ? '.pdf' : 'image/*,.pdf,.doc,.docx'}" hidden>${tab === 'tp' ? '<button type="button" id="addTechnical" class="subtle">＋ Dossier technique PDF</button><input id="technicalFile" type="file" accept=".pdf" hidden>' : ''}</div><div class="teach-row"><button type="button" id="previewDraft" class="subtle">Aperçu</button><button type="button" id="saveItem">Enregistrer</button><button type="button" id="cancelItem" class="subtle">Annuler</button></div><p class="teach-help">${tab === 'tp' ? 'Chaque PDF ajouté reste lié uniquement à ce TP.' : 'Publiez ensuite le chapitre et le contenu pour les rendre accessibles aux élèves.'}</p></div>`;
    if (tab !== 'tp') {
      const tip = document.createElement('p'); tip.className='teach-help';
      tip.textContent='Sélectionnez d’abord le texte, puis cliquez sur une couleur, une taille ou un autre outil de la palette.';
      host.querySelector('#blockList').before(tip);
    }
    host.querySelector('#cancelItem').onclick = () => host.replaceChildren();
    host.querySelector('#saveItem').onclick = () => saveItem(editing?.chapter_id || chapterId);
    host.querySelector('#previewDraft').onclick = () => previewItem(null, true);
    host.querySelector('#addText')?.addEventListener('click', () => { captureBlocks(); blocks.push({type:'html',html:'<p>Votre texte…</p>'}); renderBlocks(); });
    host.querySelector('#addVideo')?.addEventListener('click', () => { captureBlocks(); blocks.push({type:'video',url:''}); renderBlocks(); });
    host.querySelector('#addFile').onclick = () => host.querySelector('#itemFile').click();
    host.querySelector('#itemFile').onchange = e => { const file = e.target.files[0]; if (file) { captureBlocks(); draftAssets.push(file); draftRoles.push('main'); blocks.push({type:'pending',index:draftAssets.length-1}); renderBlocks(); e.target.value=''; } };
    host.querySelector('#addTechnical')?.addEventListener('click', () => host.querySelector('#technicalFile').click());
    if (host.querySelector('#technicalFile')) host.querySelector('#technicalFile').onchange = e => { const file=e.target.files[0]; if (file) { captureBlocks(); draftAssets.push(file); draftRoles.push('technical'); blocks.push({type:'pending',index:draftAssets.length-1}); renderBlocks(); e.target.value=''; } };
    renderBlocks(); host.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function captureBlocks() {
    root.querySelectorAll('[data-block-index]').forEach(node => {
      const index = Number(node.dataset.blockIndex);
      if (blocks[index]?.type === 'html') blocks[index].html = MelecContent.sanitize(node.querySelector('.teach-editable')?.innerHTML || '');
      if (blocks[index]?.type === 'video') blocks[index].url = node.querySelector('input')?.value || '';
    });
  }
  let savedRange = null;
  document.addEventListener('selectionchange', () => {
    const selection = window.getSelection();
    const editable = selection?.anchorNode?.parentElement?.closest('.teach-editable');
    if (editable && selection.rangeCount) savedRange = selection.getRangeAt(0).cloneRange();
  });
  function formatSelection(command, value) {
    const editable = savedRange?.startContainer?.parentElement?.closest('.teach-editable') || root.querySelector('.teach-editable');
    if (!editable) return;
    editable.focus();
    if (savedRange && editable.contains(savedRange.commonAncestorContainer)) {
      const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(savedRange);
    }
    document.execCommand(command, false, value);
    captureBlocks();
  }
  function editorToolbar() {
    const commands = [['bold','Gras','G'],['italic','Italique','I'],['underline','Souligné','S'],['strikeThrough','Barré','S̶'],['subscript','Indice','x₂'],['superscript','Exposant','x²'],['insertUnorderedList','Puces','• Liste'],['insertOrderedList','Numérotation','1. Liste'],['outdent','Réduire le retrait','⇤'],['indent','Augmenter le retrait','⇥'],['justifyLeft','Aligner à gauche','☷'],['justifyCenter','Centrer','☰'],['justifyRight','Aligner à droite','☷'],['justifyFull','Justifier','▤']];
    const colors = ['#173450','#d12d32','#e47713','#147a45','#1669b3','#7b4bad'];
    const highlights = ['#fff08a','#ffb8bb','#c2f0ce','#bfe6ff','#e5d7ff'];
    return `<div class="teach-editor-toolbar" role="toolbar" aria-label="Mise en forme du texte"><label>Police<select data-format-select="fontName" aria-label="Police"><option value="">Police</option>${['Arial','Aptos','Calibri','Georgia','Times New Roman','Verdana','Tahoma','Trebuchet MS'].map(font => `<option value="${font}">${font}</option>`).join('')}</select></label><label>Taille<select data-format-select="fontSize" aria-label="Taille"><option value="">Taille</option>${[['1','10'],['2','12'],['3','14'],['4','16'],['5','18'],['6','24'],['7','32']].map(([value,label]) => `<option value="${value}">${label} pt</option>`).join('')}</select></label>${commands.map(([command,label,symbol]) => `<button type="button" data-format="${command}" title="${label}" aria-label="${label}">${symbol}</button>`).join('')}<div class="teach-color-group"><span>Texte</span>${colors.map(color => `<button type="button" class="teach-swatch" data-swatch="foreColor" data-value="${color}" style="--swatch:${color}" title="Texte ${color}" aria-label="Texte ${color}"></button>`).join('')}<input type="color" data-color="foreColor" value="#173450" aria-label="Autre couleur du texte"></div><div class="teach-color-group"><span>Surlignage</span>${highlights.map(color => `<button type="button" class="teach-swatch" data-swatch="hiliteColor" data-value="${color}" style="--swatch:${color}" title="Surlignage ${color}" aria-label="Surlignage ${color}"></button>`).join('')}<input type="color" data-color="hiliteColor" value="#fff08a" aria-label="Autre couleur de surlignage"></div><button type="button" data-table="1" title="Insérer un tableau">▦ Tableau</button></div>`;
  }
  function renderBlocks() {
    const list = root.querySelector('#blockList'); if (!list) return;
    list.innerHTML = blocks.map((block,index) => `<div class="teach-block" data-block-index="${index}"><div class="teach-block-actions"><button type="button" data-up="${index}" class="subtle" aria-label="Monter">↑</button><button type="button" data-down="${index}" class="subtle" aria-label="Descendre">↓</button><button type="button" data-remove="${index}" class="warn">Retirer</button></div>${block.type === 'html' ? `${editorToolbar()}<div class="teach-editable" contenteditable="true" role="textbox" aria-label="Contenu du cours">${MelecContent.sanitize(block.html)}</div>` : block.type === 'video' ? `<label>Adresse YouTube ou Vimeo <input type="url" value="${esc(block.url)}" placeholder="https://..."></label>` : `<span>${tab === 'tp' ? (block.type === 'pending' ? draftRoles[block.index] : originalAssets.find(asset => asset.id === block.assetId)?.asset_role) === 'technical' ? 'Dossier technique · ' : 'Document du TP · ' : ''}${block.type === 'pending' ? esc(draftAssets[block.index]?.name || 'Fichier') : esc(originalAssets.find(asset => asset.id === block.assetId)?.file_name || 'Document joint')}</span>`}</div>`).join('');
    list.querySelectorAll('[data-up],[data-down],[data-remove]').forEach(btn => btn.onclick = () => { captureBlocks(); const n = Number(btn.dataset.up ?? btn.dataset.down ?? btn.dataset.remove); if (btn.dataset.remove != null) blocks.splice(n,1); else { const m = btn.dataset.up != null ? n-1 : n+1; if (m >= 0 && m < blocks.length) [blocks[n],blocks[m]] = [blocks[m],blocks[n]]; } renderBlocks(); });
    list.querySelectorAll('[data-format]').forEach(btn => { btn.onmousedown = event => event.preventDefault(); btn.onclick = () => formatSelection(btn.dataset.format); });
    list.querySelectorAll('[data-format-select]').forEach(select => select.onchange = () => { if (select.value) formatSelection(select.dataset.formatSelect, select.value); select.value = ''; });
    list.querySelectorAll('[data-color]').forEach(input => input.oninput = () => formatSelection(input.dataset.color, input.value));
    list.querySelectorAll('[data-swatch]').forEach(button => { button.onmousedown = event => event.preventDefault(); button.onclick = () => formatSelection(button.dataset.swatch,button.dataset.value); });
    list.querySelectorAll('[data-table]').forEach(btn => { btn.onmousedown = event => event.preventDefault(); btn.onclick = () => formatSelection('insertHTML', '<table><tbody><tr><td>Cellule 1</td><td>Cellule 2</td></tr><tr><td>Cellule 3</td><td>Cellule 4</td></tr></tbody></table><p></p>'); });
  }
  async function previewItem(item, draft = false) {
    if (previewCleanup) { previewCleanup(); previewCleanup = null; }
    document.querySelector('#teachPreview')?.remove();
    const title = draft ? root.querySelector('#itemTitle')?.value.trim() || 'Sans titre' : item.title;
    let previewBlocks = draft ? (captureBlocks(), structuredClone(blocks)) : item.blocks || [];
    let assets = draft ? [...originalAssets] : await api.rest('learning_assets?item_id=eq.' + encodeURIComponent(item.id) + '&select=id,object_path,file_name,mime_type');
    if (draft) previewBlocks = previewBlocks.map(block => {
      if (block.type !== 'pending') return block;
      const file = draftAssets[block.index];
      if (!file) return null;
      const id = 'draft-' + block.index;
      assets.push({id,file_name:file.name,mime_type:file.type || 'application/octet-stream',local_blob:file});
      return {type:'asset',assetId:id};
    }).filter(Boolean);
    const assetMap = new Map(assets.map(asset => [asset.id,asset]));
    const isPdf = asset => asset && (asset.mime_type === 'application/pdf' || /\.pdf$/i.test(asset.file_name || ''));
    const pdfAssets = previewBlocks.filter(block => block.type === 'asset' && isPdf(assetMap.get(block.assetId))).map(block => assetMap.get(block.assetId));
    const otherBlocks = previewBlocks.filter(block => !(block.type === 'asset' && isPdf(assetMap.get(block.assetId))));
    const hasPrintable = otherBlocks.some(block => block.type === 'html' || block.type === 'table' ||
      (block.type === 'asset' && String(assetMap.get(block.assetId)?.mime_type || '').startsWith('image/')));
    const pane = document.createElement('section'); pane.id = 'teachPreview'; pane.className = 'teach-preview';
    pane.innerHTML = `<div class="teach-preview-actions"><strong>Aperçu · ${esc(kindNames[tab])}</strong>${hasPrintable ? '<button type="button" id="printLesson">Imprimer la page de cours</button>' : ''}<button type="button" id="closePreview">Fermer</button><small>${pdfAssets.length ? 'Les PDF joints se consultent et s’impriment séparément ci-dessous. ' : ''}Dans la fenêtre d’impression, désactivez « En-têtes et pieds de page » si nécessaire.</small></div><header><p>BAC PRO MELEC · ${esc(classes.find(entry => entry.id === classId)?.name || '')}</p><h1>${esc(title)}</h1></header><div class="teach-preview-content"></div>`;
    document.body.append(pane);
    const pdfUrls = [];
    const close = () => { if (previewCleanup) { previewCleanup(); previewCleanup = null; } pane.remove(); document.body.classList.remove('print-lesson'); };
    pane.querySelector('#closePreview').onclick = close;
    if (hasPrintable) pane.querySelector('#printLesson').onclick = async () => {
      await Promise.all([...pane.querySelectorAll('img')].map(image => image.decode?.().catch(() => {}) || Promise.resolve()));
      document.body.classList.add('print-lesson'); window.print();
    };
    try {
      const renderCleanup = await MelecContent.render(otherBlocks, pane.querySelector('.teach-preview-content'), assets);
      previewCleanup = () => { renderCleanup(); pdfUrls.forEach(url => URL.revokeObjectURL(url)); };
      if (pdfAssets.length) {
        const section = document.createElement('section'); section.className = 'teach-pdf-attachments';
        const heading = document.createElement('h2'); heading.textContent = 'Documents PDF joints'; section.append(heading);
        let firstOpen = null;
        for (const asset of pdfAssets) {
          const card = document.createElement('article'); card.className = 'teach-pdf-card';
          const name = document.createElement('strong'); name.textContent = asset.file_name; card.append(name);
          const actions = document.createElement('div'); actions.className = 'teach-row';
          const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Afficher le PDF'; actions.append(button);
          card.append(actions); section.append(card);
          const showPdf = async () => {
            button.disabled = true; button.textContent = 'Chargement…';
            try {
              const blob = asset.local_blob || await api.download(asset.object_path);
              const url = URL.createObjectURL(blob); pdfUrls.push(url);
              const frame = document.createElement('iframe'); frame.src = url + '#toolbar=1&navpanes=0';
              frame.title = asset.file_name; frame.className = 'teach-pdf-frame'; card.append(frame);
              const link = document.createElement('a'); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
              link.className = 'teach-pdf-open'; link.textContent = 'Ouvrir / imprimer ce PDF'; actions.append(link);
              button.remove();
            } catch (error) { button.disabled = false; button.textContent = 'Réessayer'; status('PDF inaccessible : ' + error.message,true); }
          };
          button.onclick = showPdf;
          if (!firstOpen) firstOpen = showPdf;
        }
        pane.querySelector('.teach-preview-content').append(section);
        if (!hasPrintable && firstOpen) await firstOpen();
      }
    }
    catch (error) { close(); status('Aperçu impossible : ' + error.message, true); return; }
    pane.scrollIntoView({behavior:'smooth',block:'start'});
    return {hasPrintable,pdfCount:pdfAssets.length};
  }
  window.addEventListener('afterprint', () => document.body.classList.remove('print-lesson'));
  async function saveItem(chapterId) {
    const host = root.querySelector('#teachEditor'), title = host.querySelector('#itemTitle').value.trim();
    if (!title) return status('Saisissez un titre.', true);
    captureBlocks();
    if (tab === 'tp' && !blocks.some(block => block.type === 'pending' ? draftRoles[block.index] === 'main' : originalAssets.some(asset => asset.id === block.assetId && asset.asset_role === 'main'))) return status('Ajoutez au moins un PDF du TP.',true);
    if (blocks.some(b => b.type === 'video' && b.url && !MelecContent.videoUrl(b.url))) return status('Lien vidéo accepté : YouTube ou Vimeo en HTTPS.', true);
    const button = host.querySelector('#saveItem'); button.disabled = true;
    try {
      const payload = {chapter_id:chapterId,kind:tab,title,linked_course_id:tab === 'td' ? host.querySelector('#linkedCourse').value || null : null,blocks:blocks.filter(b => b.type !== 'pending'),updated_at:new Date().toISOString()};
      const keptAssetIds = new Set(payload.blocks.filter(block => block.type === 'asset').map(block => block.assetId));
      const removedAssets = originalAssets.filter(asset => !keptAssetIds.has(asset.id));
      let id = activeItem;
      if (id) await api.rest('learning_items?id=eq.' + id, {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      else { const created = await api.rest('learning_items?select=id', {method:'POST',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(payload)}); id = created[0].id; }
      const pendingBlocks = blocks.filter(b => b.type === 'pending');
      for (const block of pendingBlocks) {
        const file = draftAssets[block.index]; if (!file) continue;
        if (file.size > 20 * 1024 * 1024) throw new Error('Fichier trop volumineux (20 Mo maximum).');
        const path = id + '/' + crypto.randomUUID() + '-' + file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
        await api.upload(path,file);
        const asset = await api.rest('learning_assets?select=id', {method:'POST',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({item_id:id,object_path:path,file_name:file.name,mime_type:file.type || 'application/octet-stream',asset_role:draftRoles[block.index] || 'main'})});
        payload.blocks.push({type:'asset',assetId:asset[0].id});
      }
      if (pendingBlocks.length) await api.rest('learning_items?id=eq.' + id, {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({blocks:payload.blocks})});
      for (const asset of removedAssets) {
        await api.rest('learning_assets?id=eq.' + encodeURIComponent(asset.id), {method:'DELETE'});
      }
      let cleanupError = null;
      if (removedAssets.length) {
        try { await api.removeFiles(removedAssets.map(asset => asset.object_path)); }
        catch (error) { cleanupError = error; }
      }
      const wasPublished = Boolean(editing?.published);
      selectedChapterId = chapterId;
      selectedItemId = id;
      activeItem = null; editing = null; originalAssets = [];
      await loadClass();
      status(cleanupError ? 'Contenu modifié, mais le nettoyage d’anciens fichiers a échoué : ' + cleanupError.message : wasPublished ? 'Contenu modifié.' : 'Contenu enregistré.', !!cleanupError);
    } catch (error) { status(error.message, true); button.disabled = false; }
  }
  function renderStudents() {
    const body = root.querySelector('#teachBody');
    body.innerHTML = `<div class="teach-card"><h2>Demandes d’accès élèves</h2><p class="teach-help">Vérifiez l’identité avant d’associer un compte à une classe. Le code généré est à transmettre personnellement ; il n’est visible qu’une fois.</p><div class="teach-students">${students.map(s => `<div class="teach-student"><div><strong>${esc(s.last_name)} ${esc(s.first_name)}</strong><small>${esc(s.email)} · classe demandée : ${esc(s.requested_class)}</small><small>${s.approved_at ? 'Approuvé' : 'En attente'}${s.access_until ? ' · accès jusqu’au ' + esc(new Date(s.access_until).toLocaleString('fr-FR')) : ''}</small></div><select data-class-student="${s.user_id}"><option value="">Choisir la classe</option>${classes.map(c => `<option value="${c.id}" ${s.class_id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select><div class="teach-row"><button type="button" data-approve="${s.user_id}">Valider</button>${s.approved_at ? `<button type="button" data-code="${s.user_id}" class="subtle">Nouveau code</button><button type="button" data-revoke="${s.user_id}" class="warn">Révoquer</button>` : ''}</div></div>`).join('') || '<p>Aucune demande pour le moment.</p>'}</div><div id="issuedCode"></div></div>`;
    body.querySelectorAll('[data-approve]').forEach(btn => btn.onclick = async () => { const classId = body.querySelector(`[data-class-student="${btn.dataset.approve}"]`).value; if (!classId) return status('Choisissez une classe.',true); await update('student_profiles',btn.dataset.approve,{class_id:classId,approved_at:new Date().toISOString()}); });
    body.querySelectorAll('[data-code]').forEach(btn => btn.onclick = async () => { try { const result = await api.invoke('melec-access',{action:'issue',studentId:btn.dataset.code}); body.querySelector('#issuedCode').innerHTML = `<div class="teach-code">Code à remettre à l’élève : ${esc(result.code)}<br><small>Valide jusqu’au ${esc(new Date(result.expiresAt).toLocaleString('fr-FR'))}. Cette valeur ne sera plus affichée.</small></div>`; } catch (err) { status(err.message,true); } });
    body.querySelectorAll('[data-revoke]').forEach(btn => btn.onclick = async () => { if (!confirm('Révoquer immédiatement l’accès de cet élève ?')) return; await update('student_profiles',btn.dataset.revoke,{access_until:null,approved_at:null}); });
  }
  function renderMessages() {
    root.querySelector('#teachBody').innerHTML = `<div class="teach-card"><h2>Messages du formulaire</h2>${messages.map(m => `<article class="teach-message"><strong>${esc(m.last_name)} ${esc(m.first_name)}</strong> · ${esc(m.class_name)}<small class="teach-meta">${esc(m.email)} · ${esc(new Date(m.created_at).toLocaleString('fr-FR'))}</small><p>${esc(m.comment)}</p></article>`).join('') || '<p>Aucun message.</p>'}</div>`;
  }
  if (location.hash === '#teaching') setTimeout(() => show('teaching'), 0);
})();
