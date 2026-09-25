(function () {
  'use strict';
  const api = MelecPortal, esc = api.escapeHtml, root = document.getElementById('teachingView');
  let classes = [], chapters = [], items = [], students = [], messages = [];
  let classId = '', tab = 'course', editing = null, blocks = [], draftAssets = [], activeItem = null, originalAssets = [];
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
      if (!classId || !classes.some(c => c.id === classId)) classId = classes[0]?.id || '';
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
    root.querySelector('#teachClass').onchange = e => { classId = e.target.value; editing = null; loadClass().catch(err => status(err.message, true)); };
    root.querySelector('#teachSyncClasses').onclick = syncClasses;
    root.querySelectorAll('[data-teach-tab]').forEach(button => button.onclick = () => {
      tab = button.dataset.teachTab; editing = null; render();
      if (tab === 'students' || tab === 'messages') refreshAuxiliary(tab).catch(err => status(err.message, true));
    });
    if (tab === 'students') renderStudents();
    else if (tab === 'messages') renderMessages();
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
  function renderContent() {
    const body = root.querySelector('#teachBody');
    if (!classId) { body.innerHTML = '<div class="teach-card">Ajoutez ou choisissez une classe pour commencer.</div>'; return; }
    const addLabel = tab === 'course' ? 'Ajouter un cours' : tab === 'td' ? 'Ajouter un TD' : 'Ajouter un TP';
    body.innerHTML = `<div class="teach-card"><h2>Gérer les ${esc(kindNames[tab]).toLowerCase()}</h2><p class="teach-help">${tab === 'tp' ? 'Les travaux pratiques sont indépendants des cours et des TD. Ils sont simplement classés dans un chapitre pour les retrouver.' : 'Choisissez un chapitre, puis ajoutez, modifiez ou supprimez son contenu.'}</p><div class="teach-row"><label for="chapterTitle">Nouveau chapitre</label><input id="chapterTitle" maxlength="180" placeholder="Ex. Installation électrique d’un logement"><button type="button" id="addChapter">Créer le chapitre</button></div></div>
      <div class="teach-list">${chapters.map(ch => `<details open><summary>${esc(ch.title)} <span class="teach-meta">${ch.published ? 'Publié' : 'Brouillon'}</span></summary><div class="teach-row"><button type="button" data-publish-chapter="${ch.id}" class="subtle">${ch.published ? 'Masquer aux élèves' : 'Publier le chapitre'}</button><button type="button" data-add-item="${ch.id}">${addLabel}</button></div>${items.filter(i => i.chapter_id === ch.id && i.kind === tab).map(i => `<div class="teach-item"><div><strong>${esc(i.title)}</strong><small class="teach-meta">${i.published ? 'Publié' : 'Brouillon'}${tab === 'td' && i.linked_course_id ? ' · lié à un cours' : ''}</small></div><div class="teach-row"><button type="button" data-edit-item="${i.id}" class="subtle" aria-label="Modifier ${esc(i.title)}">Modifier</button><button type="button" data-publish-item="${i.id}" class="subtle">${i.published ? 'Masquer' : 'Publier'}</button><button type="button" data-delete-item="${i.id}" class="warn" aria-label="Supprimer ${esc(i.title)}">Supprimer</button></div></div>`).join('') || '<p>Aucun contenu dans cette rubrique.</p>'}</details>`).join('') || '<div class="teach-card">Aucun chapitre pour cette classe. Créez-en un ci-dessus pour ajouter un contenu.</div>'}</div><div id="teachEditor"></div>`;
    body.querySelector('#addChapter').onclick = async () => {
      const title = body.querySelector('#chapterTitle').value.trim(); if (!title) return status('Saisissez le nom du chapitre.', true);
      try { await api.rest('learning_chapters', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({class_id:classId,title,position:chapters.length})}); await loadClass(); status('Chapitre créé.'); }
      catch (error) { status(error.message, true); }
    };
    body.querySelectorAll('[data-publish-chapter]').forEach(btn => btn.onclick = () => update('learning_chapters', btn.dataset.publishChapter, {published: !chapters.find(c => c.id === btn.dataset.publishChapter).published}));
    body.querySelectorAll('[data-add-item]').forEach(btn => btn.onclick = () => editItem(null, btn.dataset.addItem));
    body.querySelectorAll('[data-edit-item]').forEach(btn => btn.onclick = () => editItem(btn.dataset.editItem));
    body.querySelectorAll('[data-publish-item]').forEach(btn => btn.onclick = () => update('learning_items', btn.dataset.publishItem, {published: !items.find(i => i.id === btn.dataset.publishItem).published}));
    body.querySelectorAll('[data-delete-item]').forEach(btn => btn.onclick = () => deleteItem(btn.dataset.deleteItem));
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
    blocks = structuredClone(editing?.blocks || []); draftAssets = [];
    try {
      originalAssets = id ? await api.rest('learning_assets?item_id=eq.' + encodeURIComponent(id) + '&select=id,object_path,file_name') : [];
    } catch (error) { return status('Impossible de charger les fichiers joints : ' + error.message, true); }
    const host = root.querySelector('#teachEditor');
    const courseOptions = items.filter(i => i.kind === 'course' && i.chapter_id === (editing?.chapter_id || chapterId));
    host.innerHTML = `<div class="teach-card teach-editor"><h2>${editing ? 'Modifier' : 'Créer'} : ${esc(kindNames[tab])}</h2><label>Titre <input id="itemTitle" maxlength="180" value="${esc(editing?.title || '')}" required></label>${tab === 'td' ? `<label>Cours lié <select id="linkedCourse"><option value="">Aucun</option>${courseOptions.map(i => `<option value="${i.id}" ${editing?.linked_course_id === i.id ? 'selected' : ''}>${esc(i.title)}</option>`).join('')}</select></label>` : ''}<div id="blockList"></div><div class="teach-row">${tab !== 'tp' ? '<button type="button" id="addText" class="subtle">＋ Texte / tableau</button><button type="button" id="addVideo" class="subtle">＋ Vidéo</button>' : ''}<button type="button" id="addFile" class="subtle">＋ ${tab === 'tp' ? 'PDF ou Word' : 'Image ou document'}</button><input id="itemFile" type="file" accept="${tab === 'tp' ? '.pdf,.doc,.docx' : 'image/*,.pdf,.doc,.docx'}" hidden></div><div class="teach-row"><button type="button" id="saveItem">Enregistrer</button><button type="button" id="cancelItem" class="subtle">Annuler</button></div><p class="teach-help">${tab === 'tp' ? 'Ce TP n’est lié à aucun cours ni TD. ' : ''}Publiez ensuite le chapitre et le contenu pour les rendre accessibles aux élèves.</p></div>`;
    host.querySelector('#cancelItem').onclick = () => host.replaceChildren();
    host.querySelector('#saveItem').onclick = () => saveItem(editing?.chapter_id || chapterId);
    host.querySelector('#addText')?.addEventListener('click', () => { captureBlocks(); blocks.push({type:'html',html:'<p>Votre texte…</p>'}); renderBlocks(); });
    host.querySelector('#addVideo')?.addEventListener('click', () => { captureBlocks(); blocks.push({type:'video',url:''}); renderBlocks(); });
    host.querySelector('#addFile').onclick = () => host.querySelector('#itemFile').click();
    host.querySelector('#itemFile').onchange = e => { const file = e.target.files[0]; if (file) { captureBlocks(); draftAssets.push(file); blocks.push({type:'pending',index:draftAssets.length-1}); renderBlocks(); } };
    renderBlocks(); host.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function captureBlocks() {
    root.querySelectorAll('[data-block-index]').forEach(node => {
      const index = Number(node.dataset.blockIndex);
      if (blocks[index]?.type === 'html') blocks[index].html = MelecContent.sanitize(node.querySelector('.teach-editable')?.innerHTML || '');
      if (blocks[index]?.type === 'video') blocks[index].url = node.querySelector('input')?.value || '';
    });
  }
  function renderBlocks() {
    const list = root.querySelector('#blockList'); if (!list) return;
    list.innerHTML = blocks.map((block,index) => `<div class="teach-block" data-block-index="${index}"><div class="teach-block-actions"><button type="button" data-up="${index}" class="subtle" aria-label="Monter">↑</button><button type="button" data-down="${index}" class="subtle" aria-label="Descendre">↓</button><button type="button" data-remove="${index}" class="warn">Retirer</button></div>${block.type === 'html' ? `<div class="teach-editor-toolbar"><button type="button" data-format="bold" title="Gras">G</button><button type="button" data-format="italic" title="Italique"><i>I</i></button><button type="button" data-format="underline" title="Souligner"><u>S</u></button><button type="button" data-format="insertUnorderedList">Liste</button><button type="button" data-table="1">Tableau</button></div><div class="teach-editable" contenteditable="true" role="textbox" aria-label="Contenu du cours">${MelecContent.sanitize(block.html)}</div>` : block.type === 'video' ? `<label>Adresse YouTube ou Vimeo <input type="url" value="${esc(block.url)}" placeholder="https://..."></label>` : `<span>${block.type === 'pending' ? esc(draftAssets[block.index]?.name || 'Fichier') : esc(originalAssets.find(asset => asset.id === block.assetId)?.file_name || 'Document joint')}</span>`}</div>`).join('');
    list.querySelectorAll('[data-up],[data-down],[data-remove]').forEach(btn => btn.onclick = () => { captureBlocks(); const n = Number(btn.dataset.up ?? btn.dataset.down ?? btn.dataset.remove); if (btn.dataset.remove != null) blocks.splice(n,1); else { const m = btn.dataset.up != null ? n-1 : n+1; if (m >= 0 && m < blocks.length) [blocks[n],blocks[m]] = [blocks[m],blocks[n]]; } renderBlocks(); });
    list.querySelectorAll('[data-format]').forEach(btn => btn.onclick = () => { const editable = btn.closest('.teach-block').querySelector('.teach-editable'); editable.focus(); document.execCommand(btn.dataset.format); });
    list.querySelectorAll('[data-table]').forEach(btn => btn.onclick = () => { const editable = btn.closest('.teach-block').querySelector('.teach-editable'); editable.focus(); document.execCommand('insertHTML', false, '<table><tbody><tr><td>Cellule 1</td><td>Cellule 2</td></tr><tr><td>Cellule 3</td><td>Cellule 4</td></tr></tbody></table><p></p>'); });
  }
  async function saveItem(chapterId) {
    const host = root.querySelector('#teachEditor'), title = host.querySelector('#itemTitle').value.trim();
    if (!title) return status('Saisissez un titre.', true);
    captureBlocks();
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
        const asset = await api.rest('learning_assets?select=id', {method:'POST',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({item_id:id,object_path:path,file_name:file.name,mime_type:file.type || 'application/octet-stream'})});
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
      activeItem = null; editing = null; originalAssets = [];
      await loadClass();
      status(cleanupError ? 'Contenu modifié, mais le nettoyage d’anciens fichiers a échoué : ' + cleanupError.message : wasPublished ? 'Contenu modifié.' : 'Contenu enregistré en brouillon.', !!cleanupError);
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
