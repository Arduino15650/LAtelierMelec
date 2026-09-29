(function () {
  'use strict';
  const api = window.MelecPortal;
  const esc = api.escapeHtml;
  const kinds = [['course','Cours'],['td','Travaux dirigés'],['exercises','Exercices'],['corrections','Corrections']];
  const mimeByExtension = {
    pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',
    doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls:'application/vnd.ms-excel',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt:'application/vnd.ms-powerpoint',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  };
  let body, classId, notify, themes=[], chapters=[], lessons=[], sections=[], assets=[];
  let themeId='', chapterId='', lessonId='', request=0, busy=false, dirty=false;
  function label(kind) { return kinds.find(entry => entry[0] === kind)?.[1] || kind; }
  function safe(html) { return window.MelecContent.sanitize(html); }
  function selected() {
    return {theme:themes.find(row=>row.id===themeId), chapter:chapters.find(row=>row.id===chapterId), lesson:lessons.find(row=>row.id===lessonId)};
  }
  async function list(table, filter, columns='*') {
    return api.rest(table+'?'+filter+'&select='+columns+'&order=position.asc,created_at.asc');
  }
  async function load() {
    const ticket=++request;
    body.innerHTML='<div class="teach-card">Chargement du manuel numérique…</div>';
    try {
      themes=await list('manual_themes','class_id=eq.'+encodeURIComponent(classId));
      chapters=themes.length ? await list('manual_chapters','theme_id=in.('+themes.map(x=>x.id).join(',')+')') : [];
      lessons=chapters.length ? await list('manual_lessons','chapter_id=in.('+chapters.map(x=>x.id).join(',')+')') : [];
      sections=lessons.length ? await api.rest('manual_sections?lesson_id=in.('+lessons.map(x=>x.id).join(',')+')&select=*&order=kind.asc') : [];
      assets=sections.length ? await api.rest('manual_assets?section_id=in.('+sections.map(x=>x.id).join(',')+')&select=*&order=created_at.asc') : [];
      if(ticket!==request)return;
      if(!themes.some(x=>x.id===themeId)){themeId='';chapterId='';lessonId='';}
      if(!chapters.some(x=>x.id===chapterId&&x.theme_id===themeId)){chapterId='';lessonId='';}
      if(!lessons.some(x=>x.id===lessonId&&x.chapter_id===chapterId))lessonId='';
      draw();
    } catch(error) { if(ticket===request){body.innerHTML='<div class="teach-card manual-error">Le manuel est indisponible. Vérifiez que son script SQL est installé.</div>';notify(error.message,true);} }
  }
  function sectionCard(kind,lesson) {
    const section=sections.find(x=>x.lesson_id===lesson.id&&x.kind===kind);
    const files=section?assets.filter(x=>x.section_id===section.id):[];
    return `<section class="manual-section" data-kind="${kind}"><div class="manual-section-head"><h4>${label(kind)}</h4><span class="manual-state ${section?.published?'on':''}">${section?.published?'Publié':'Brouillon'}</span></div>
      <div class="manual-toolbar" role="toolbar" aria-label="Mise en forme ${label(kind)}"><button type="button" data-format="bold">Gras</button><button type="button" data-format="italic">Italique</button><button type="button" data-format="insertUnorderedList">Liste</button><button type="button" data-format="formatBlock" data-value="h3">Titre</button></div>
      <div class="manual-editor" data-editor contenteditable="true" role="textbox" aria-multiline="true" aria-label="Contenu ${label(kind)}">${safe(section?.content_html||'')}</div>
      <div class="manual-files">${files.map(file=>`<button type="button" data-download="${file.id}" class="subtle">📎 ${esc(file.file_name)}</button>`).join('')}</div>
      <label class="manual-upload">Ajouter des images, PDF ou documents bureautiques<input type="file" data-upload="${kind}" accept=".png,.jpg,.jpeg,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" multiple></label>
      ${section?`<button type="button" data-toggle-section="${section.id}" class="subtle">${section.published?'Masquer cette section':'Publier cette section'}</button>`:''}</section>`;
  }
  function draw() {
    dirty=false;
    const {theme,chapter,lesson}=selected();
    const chapterChoices=theme?chapters.filter(x=>x.theme_id===theme.id):[];
    const lessonChoices=chapter?lessons.filter(x=>x.chapter_id===chapter.id):[];
    body.innerHTML=`<div class="teach-card manual-manager"><h2>Constructeur de manuel numérique</h2><p class="teach-help">Structure indépendante des cours déjà publiés. Créez un thème, ses chapitres, puis plusieurs leçons. Les élèves ne voient que les éléments publiés.</p>
      <div class="manual-pickers"><label>Thème<select id="manualTheme"><option value="">Choisir un thème…</option>${themes.map(x=>`<option value="${x.id}" ${x.id===themeId?'selected':''}>${esc(x.title)}${x.published?' ✓':''}</option>`).join('')}</select></label><label>Nouveau thème<input id="manualNewTheme" maxlength="180" placeholder="Ex. Installations électriques"></label><button type="button" id="manualAddTheme">Créer le thème</button></div>
      ${theme?`<div class="manual-level-actions"><label>Nom du thème<input id="manualThemeTitle" maxlength="180" value="${esc(theme.title)}"></label><button type="button" id="manualRenameTheme" class="subtle">Renommer</button><button type="button" id="manualToggleTheme" class="subtle">${theme.published?'Masquer le thème':'Publier le thème'}</button></div>`:''}
      ${theme?`<div class="manual-pickers"><label>Chapitre<select id="manualChapter"><option value="">Choisir un chapitre…</option>${chapterChoices.map(x=>`<option value="${x.id}" ${x.id===chapterId?'selected':''}>${esc(x.title)}${x.published?' ✓':''}</option>`).join('')}</select></label><label>Nouveau chapitre<input id="manualNewChapter" maxlength="180" placeholder="Ex. Les protections"></label><button type="button" id="manualAddChapter">Créer le chapitre</button></div>`:''}
      ${chapter?`<div class="manual-level-actions"><label>Nom du chapitre<input id="manualChapterTitle" maxlength="180" value="${esc(chapter.title)}"></label><button type="button" id="manualRenameChapter" class="subtle">Renommer</button><button type="button" id="manualToggleChapter" class="subtle">${chapter.published?'Masquer le chapitre':'Publier le chapitre'}</button></div>`:''}
      ${chapter?`<div class="manual-pickers"><label>Leçon<select id="manualLesson"><option value="">Choisir une leçon…</option>${lessonChoices.map(x=>`<option value="${x.id}" ${x.id===lessonId?'selected':''}>${esc(x.title)}${x.published?' ✓':''}</option>`).join('')}</select></label><label>Nouvelle leçon<input id="manualNewLesson" maxlength="180" placeholder="Ex. Le disjoncteur différentiel"></label><button type="button" id="manualAddLesson">Créer la leçon</button></div>`:''}
      ${lesson?`<div class="manual-lesson"><label>Titre de la leçon<input id="manualLessonTitle" maxlength="180" value="${esc(lesson.title)}"></label><div class="manual-sections">${kinds.map(([kind])=>sectionCard(kind,lesson)).join('')}</div><div class="manual-actions"><button type="button" id="manualPreview" class="subtle">Prévisualiser la leçon</button><button type="button" id="manualSave">Enregistrer la leçon</button><button type="button" id="manualPublishLesson" class="subtle">Publier la leçon sans les sections privées</button><button type="button" id="manualPublish">Publier toute la leçon</button><button type="button" id="manualHide" class="warn" ${lesson.published?'':'hidden'}>Masquer la leçon</button></div></div>`:''}</div>`;
    body.querySelector('#manualTheme').onchange=e=>{if(dirty&&!confirm('Quitter cette leçon sans enregistrer vos modifications ?')){e.target.value=themeId;return;}themeId=e.target.value;chapterId='';lessonId='';draw();};
    body.querySelector('#manualAddTheme').onclick=()=>create('theme');
    body.querySelector('#manualRenameTheme')?.addEventListener('click',()=>rename('manual_themes',theme.id,body.querySelector('#manualThemeTitle').value));
    body.querySelector('#manualToggleTheme')?.addEventListener('click',()=>update('manual_themes',theme.id,{published:!theme.published},theme.published?'Thème masqué.':'Thème publié.'));
    body.querySelector('#manualChapter')?.addEventListener('change',e=>{if(dirty&&!confirm('Quitter cette leçon sans enregistrer vos modifications ?')){e.target.value=chapterId;return;}chapterId=e.target.value;lessonId='';draw();});
    body.querySelector('#manualAddChapter')?.addEventListener('click',()=>create('chapter'));
    body.querySelector('#manualRenameChapter')?.addEventListener('click',()=>rename('manual_chapters',chapter.id,body.querySelector('#manualChapterTitle').value));
    body.querySelector('#manualToggleChapter')?.addEventListener('click',()=>update('manual_chapters',chapter.id,{published:!chapter.published},chapter.published?'Chapitre masqué.':'Chapitre publié.'));
    body.querySelector('#manualLesson')?.addEventListener('change',e=>{if(dirty&&!confirm('Quitter cette leçon sans enregistrer vos modifications ?')){e.target.value=lessonId;return;}lessonId=e.target.value;draw();});
    body.querySelector('#manualAddLesson')?.addEventListener('click',()=>create('lesson'));
    if(!lesson)return;
    body.querySelectorAll('[data-editor],#manualLessonTitle').forEach(node=>node.addEventListener('input',()=>{dirty=true;}));
    body.querySelectorAll('[data-format]').forEach(button=>button.onclick=()=>{
      const editor=button.closest('.manual-section').querySelector('[data-editor]');editor.focus();
      document.execCommand(button.dataset.format,false,button.dataset.value||null);
      dirty=true;
    });
    body.querySelector('#manualPreview').onclick=preview;
    body.querySelector('#manualSave').onclick=saveAll;
    body.querySelector('#manualPublishLesson').onclick=publishLessonOnly;
    body.querySelector('#manualPublish').onclick=publishAll;
    body.querySelector('#manualHide').onclick=()=>update('manual_lessons',lesson.id,{published:false},'Leçon masquée.');
    body.querySelectorAll('[data-toggle-section]').forEach(button=>button.onclick=()=>{
      const section=sections.find(x=>x.id===button.dataset.toggleSection);
      run(async()=>{
        await persistEditor();
        await api.rest('manual_sections?id=eq.'+section.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({published:!section.published})});
      },section.published?'Section masquée.':'Section publiée.');
    });
    body.querySelectorAll('[data-upload]').forEach(input=>input.onchange=()=>upload(input));
    body.querySelectorAll('[data-download]').forEach(button=>button.onclick=()=>download(assets.find(x=>x.id===button.dataset.download)));
  }
  async function run(work,success) {
    if(busy)return false;busy=true;
    try {await work();await load();notify(success||'Enregistré.');return true;}
    catch(error){notify(error.message,true);return false;}
    finally {busy=false;}
  }
  async function create(type) {
    const input=body.querySelector('#manualNew'+type[0].toUpperCase()+type.slice(1));
    const title=input?.value.trim();if(!title)return notify('Saisissez un titre.',true);
    if(type==='chapter'&&!themeId||type==='lesson'&&!chapterId)return notify('Choisissez le niveau parent.',true);
    await run(async()=>{
      if(dirty&&lessonId)await persistEditor();
      const table='manual_'+({theme:'themes',chapter:'chapters',lesson:'lessons'}[type]);
      const parent=type==='theme'?{class_id:classId}:type==='chapter'?{theme_id:themeId}:{chapter_id:chapterId};
      const siblings=type==='theme'?themes:type==='chapter'?chapters.filter(x=>x.theme_id===themeId):lessons.filter(x=>x.chapter_id===chapterId);
      const created=await api.rest(table+'?select=id',{method:'POST',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({...parent,title,position:siblings.length})});
      if(type==='theme')themeId=created[0].id;
      if(type==='chapter')chapterId=created[0].id;
      if(type==='lesson'){
        lessonId=created[0].id;
        await api.rest('manual_sections',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(kinds.map(([kind])=>({lesson_id:lessonId,kind})))});
      }
    },type==='lesson'?'Leçon créée en brouillon.':'Élément créé en brouillon.');
  }
  async function update(table,id,values,success) {
    await run(async()=>{
      if(dirty&&lessonId)await persistEditor();
      await api.rest(table+'?id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(values)});
    },success);
  }
  async function rename(table,id,value){const title=value.trim();if(!title)return notify('Saisissez un titre.',true);await update(table,id,{title},'Titre modifié.');}
  function editorHtml(kind){return safe(body.querySelector(`.manual-section[data-kind="${kind}"] [data-editor]`)?.innerHTML||'');}
  async function persistEditor(){
    const title=body.querySelector('#manualLessonTitle').value.trim();if(!title)throw new Error('Donnez un titre à la leçon.');
    const current=selected().lesson;
    await api.rest('manual_lessons?id=eq.'+current.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({title,updated_at:new Date().toISOString()})});
    for(const [kind] of kinds){
      let section=sections.find(x=>x.lesson_id===current.id&&x.kind===kind);
      const payload={content_html:editorHtml(kind),updated_at:new Date().toISOString()};
      if(section)await api.rest('manual_sections?id=eq.'+section.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      else await api.rest('manual_sections',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,lesson_id:current.id,kind})});
    }
  }
  async function saveAll(){
    if(!body.querySelector('#manualLessonTitle').value.trim())return notify('Donnez un titre à la leçon.',true);
    return run(persistEditor,'Leçon enregistrée. Les élèves ne voient que les parties publiées.');
  }
  async function publishAll(){
    if(!confirm('Publier cette leçon, ses quatre sections (y compris les corrections), son chapitre et son thème ?'))return;
    const title=body.querySelector('#manualLessonTitle').value.trim();if(!title)return notify('Donnez un titre à la leçon.',true);
    // Sauver les modifications visibles avant l'opération de publication transactionnelle.
    if(!await saveAll())return;
    await run(()=>api.rest('rpc/manual_publish_lesson',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_lesson_id:lessonId})}),'Leçon et sections publiées pour la classe.');
  }
  async function publishLessonOnly(){
    if(!await saveAll())return;
    await run(()=>api.rest('manual_lessons?id=eq.'+lessonId,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({published:true})}),'Leçon publiée. Seules les sections publiées sont visibles ; vérifiez aussi le thème et le chapitre.');
  }
  async function upload(input){
    const kind=input.dataset.upload,section=sections.find(x=>x.lesson_id===lessonId&&x.kind===kind);
    if(!section)return notify('Enregistrez d’abord la leçon.',true);
    const files=[...input.files];if(!files.length)return;
    await run(async()=>{
      await persistEditor();
      for(const file of files){
        const ext=file.name.split('.').pop().toLowerCase(),mime=mimeByExtension[ext];
        if(!mime||file.size>20*1024*1024)throw new Error('Fichier non accepté ou supérieur à 20 Mo : '+file.name);
        const path='manual/'+lessonId+'/'+crypto.randomUUID()+'-'+file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
        await api.upload(path,new File([file],file.name,{type:mime}));
        try{await api.rest('manual_assets',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({section_id:section.id,object_path:path,file_name:file.name,mime_type:mime})});}
        catch(error){await api.removeFiles([path]).catch(()=>{});throw error;}
      }
    },files.length+' fichier(s) ajouté(s).');
  }
  async function download(asset){
    try{const blob=await api.download(asset.object_path),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=asset.file_name;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
    catch(error){notify(error.message,true);}
  }
  function preview(){
    const lesson=selected().lesson, title=body.querySelector('#manualLessonTitle').value.trim()||lesson.title;
    const dialog=document.createElement('dialog');dialog.className='manual-preview';
    dialog.innerHTML=`<div class="manual-preview-head"><h2>${esc(title)}</h2><button type="button" data-close>Fermer</button></div>${kinds.map(([kind,name])=>{const sec=sections.find(x=>x.lesson_id===lesson.id&&x.kind===kind);return `<section><h3>${name}</h3><div class="manual-preview-content">${editorHtml(kind)||'<p>Section vide.</p>'}</div>${assets.filter(x=>x.section_id===sec?.id).map(x=>`<button type="button" data-preview-file="${x.id}" class="subtle">📎 ${esc(x.file_name)}</button>`).join('')}</section>`}).join('')}`;
    document.body.append(dialog);dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();dialog.showModal();
    dialog.querySelectorAll('[data-preview-file]').forEach(button=>button.onclick=()=>download(assets.find(x=>x.id===button.dataset.previewFile)));
  }
  window.MelecManualTeacher={canLeave(){return !dirty||confirm('Quitter la leçon sans enregistrer vos modifications ?');},render(nextBody,nextClassId,nextNotify){
    body=nextBody;notify=nextNotify;
    if(classId!==nextClassId){classId=nextClassId;themeId='';chapterId='';lessonId='';}
    if(!classId){body.innerHTML='<div class="teach-card">Choisissez une classe pour créer son manuel.</div>';return;}
    load();
  }};
})();
