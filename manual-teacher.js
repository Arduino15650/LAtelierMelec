(function () {
  'use strict';
  const api = window.MelecPortal;
  const esc = api.escapeHtml;
  const kinds = [['course','Cours'],['td','Travaux dirigés'],['corrections','Corrections des TD']];
  const mimeByExtension = {
    pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',
    doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls:'application/vnd.ms-excel',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt:'application/vnd.ms-powerpoint',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  };
  let body, classId, notify, themes=[], chapters=[], lessons=[], sections=[], assets=[];
  let themeId='', chapterId='', lessonId='', request=0, busy=false, dirty=false;
  const selections=new WeakMap();
  function label(kind) { return kinds.find(entry => entry[0] === kind)?.[1] || kind; }
  function safe(html) { return window.MelecContent.sanitize(html); }
  function toolbar(kind) {
    const commands=[['bold','Gras','G'],['italic','Italique','I'],['underline','Souligné','S'],['strikeThrough','Barré','S̶'],['subscript','Indice','x₂'],['superscript','Exposant','x²'],['insertUnorderedList','Puces','• Liste'],['insertOrderedList','Numérotation','1. Liste'],['outdent','Réduire le retrait','⇤'],['indent','Augmenter le retrait','⇥'],['justifyLeft','Aligner à gauche','☷'],['justifyCenter','Centrer','☰'],['justifyRight','Aligner à droite','☷'],['justifyFull','Justifier','▤']];
    const colors=['#173450','#d12d32','#e47713','#147a45','#1669b3','#7b4bad'];
    const highlights=['#fff08a','#ffb8bb','#c2f0ce','#bfe6ff','#e5d7ff'];
    return `<div class="manual-toolbar" role="toolbar" aria-label="Mise en forme ${label(kind)}"><label>Police<select data-format-select="fontName" aria-label="Police"><option value="">Police</option>${['Arial','Aptos','Calibri','Georgia','Times New Roman','Verdana','Tahoma','Trebuchet MS'].map(font=>`<option value="${font}">${font}</option>`).join('')}</select></label><label>Taille<select data-format-select="fontSize" aria-label="Taille"><option value="">Taille</option>${[['1','10'],['2','12'],['3','14'],['4','16'],['5','18'],['6','24'],['7','32']].map(([value,size])=>`<option value="${value}">${size} pt</option>`).join('')}</select></label>${commands.map(([command,name,symbol])=>`<button type="button" data-format="${command}" title="${name}" aria-label="${name}">${symbol}</button>`).join('')}<div class="manual-color-group"><span>Texte</span>${colors.map(color=>`<button type="button" class="manual-swatch" data-swatch="foreColor" data-value="${color}" style="--swatch:${color}" aria-label="Texte ${color}"></button>`).join('')}<input type="color" data-color="foreColor" value="#173450" aria-label="Autre couleur du texte"></div><div class="manual-color-group"><span>Surlignage</span>${highlights.map(color=>`<button type="button" class="manual-swatch" data-swatch="hiliteColor" data-value="${color}" style="--swatch:${color}" aria-label="Surlignage ${color}"></button>`).join('')}<input type="color" data-color="hiliteColor" value="#fff08a" aria-label="Autre couleur de surlignage"></div><button type="button" data-table title="Insérer un tableau">▦ Tableau</button><button type="button" data-video title="Insérer une vidéo YouTube ou Vimeo">▶ Vidéo</button></div>`;
  }
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
      ${toolbar(kind)}
      <div class="manual-editor" data-editor contenteditable="true" role="textbox" aria-multiline="true" aria-label="Contenu ${label(kind)}">${safe(section?.content_html||'')}</div>
      <div class="manual-files">${files.map(file=>`<span class="manual-file-chip"><button type="button" data-download="${file.id}" class="subtle">📎 ${esc(file.file_name)}</button>${file.mime_type.startsWith('image/')?`<button type="button" data-insert-image="${file.id}" class="subtle">Insérer l’image</button>`:''}</span>`).join('')}</div>
      <label class="manual-upload">Ajouter des images, PDF ou documents bureautiques<input type="file" data-upload="${kind}" accept=".png,.jpg,.jpeg,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" multiple></label>
      ${section?`<button type="button" data-toggle-section="${section.id}" class="subtle">${section.published?'Masquer cette section':'Publier cette section'}</button>`:''}</section>`;
  }
  function rememberSelection(editor) {
    const selection=window.getSelection();
    if(selection?.rangeCount&&editor.contains(selection.getRangeAt(0).commonAncestorContainer))
      selections.set(editor,selection.getRangeAt(0).cloneRange());
  }
  function formatSelection(control,command,value) {
    const editor=control.closest('.manual-section').querySelector('[data-editor]');
    const range=selections.get(editor);
    if(!range||!editor.contains(range.commonAncestorContainer))return notify('Placez le curseur dans le texte ou sélectionnez du texte.',true);
    editor.focus();
    const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
    document.execCommand(command,false,value??null);
    rememberSelection(editor);dirty=true;
  }
  function insertTable(control) {
    const rows=Number(prompt('Nombre de lignes (1 à 30) :','3'));
    if(!Number.isInteger(rows)||rows<1||rows>30)return;
    const columns=Number(prompt('Nombre de colonnes (1 à 12) :','3'));
    if(!Number.isInteger(columns)||columns<1||columns>12)return;
    const cells='<td>Cellule</td>'.repeat(columns);
    formatSelection(control,'insertHTML',`<table><tbody>${`<tr>${cells}</tr>`.repeat(rows)}</tbody></table><p></p>`);
  }
  function insertVideo(control) {
    const url=prompt('Adresse HTTPS de la vidéo YouTube ou Vimeo :','');
    if(!url)return;
    if(!window.MelecContent.videoUrl(url))return notify('Utilisez une adresse HTTPS YouTube ou Vimeo valide.',true);
    const safeUrl=esc(url.trim());
    formatSelection(control,'insertHTML',`<p><a href="${safeUrl}">▶ Vidéo : ${safeUrl}</a></p><p></p>`);
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
      ${lesson?`<div class="manual-lesson"><label>Titre de la leçon<input id="manualLessonTitle" maxlength="180" value="${esc(lesson.title)}"></label><div class="manual-sections">${kinds.map(([kind])=>sectionCard(kind,lesson)).join('')}</div><div class="manual-actions"><button type="button" id="manualPreview" class="subtle">Prévisualiser la leçon</button><button type="button" id="manualSave">Enregistrer la leçon</button><button type="button" id="manualPublishLesson">Publier la leçon et les sections déjà choisies</button><button type="button" id="manualPublish" class="subtle">Publier aussi les corrections</button><button type="button" id="manualHide" class="warn" ${lesson.published?'':'hidden'}>Masquer la leçon</button></div><p class="teach-help">Le thème et le chapitre seront publiés automatiquement. Les corrections restent privées tant que vous ne les publiez pas explicitement.</p></div>`:''}</div>`;
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
    body.querySelectorAll('[data-editor]').forEach(editor=>{
      ['keyup','pointerup','touchend','focusout'].forEach(name=>editor.addEventListener(name,()=>rememberSelection(editor)));
    });
    body.querySelectorAll('[data-format],[data-swatch],[data-table],[data-video],[data-insert-image]').forEach(button=>button.onmousedown=event=>event.preventDefault());
    body.querySelectorAll('[data-format]').forEach(button=>button.onclick=()=>formatSelection(button,button.dataset.format));
    body.querySelectorAll('[data-format-select]').forEach(select=>select.onchange=()=>{if(select.value)formatSelection(select,select.dataset.formatSelect,select.value);select.value='';});
    body.querySelectorAll('[data-color]').forEach(input=>input.oninput=()=>formatSelection(input,input.dataset.color,input.value));
    body.querySelectorAll('[data-swatch]').forEach(button=>button.onclick=()=>formatSelection(button,button.dataset.swatch,button.dataset.value));
    body.querySelectorAll('[data-table]').forEach(button=>button.onclick=()=>insertTable(button));
    body.querySelectorAll('[data-video]').forEach(button=>button.onclick=()=>insertVideo(button));
    body.querySelectorAll('[data-insert-image]').forEach(button=>button.onclick=()=>formatSelection(button,'insertText','[[image:'+button.dataset.insertImage+']]'));
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
    if(!confirm('Publier cette leçon, ses cours, TD et corrections, ainsi que son chapitre et son thème ?'))return;
    const title=body.querySelector('#manualLessonTitle').value.trim();if(!title)return notify('Donnez un titre à la leçon.',true);
    if(!await saveAll())return;
    await run(()=>publishHierarchy(true),'Cours, TD et corrections publiés pour la classe.');
  }
  async function publishHierarchy(includeCorrections=false){
    await api.rest('rpc/manual_publish_lesson_parts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_lesson_id:lessonId,p_include_corrections:includeCorrections})});
  }
  async function publishLessonOnly(){
    if(!await saveAll())return;
    await run(publishHierarchy,'Leçon, chapitre et thème publiés. Seules les sections déjà publiées sont visibles.');
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
    dialog.innerHTML=`<div class="manual-preview-head"><h2>${esc(title)}</h2><button type="button" data-close>Fermer</button></div>${kinds.map(([kind,name])=>{const sec=sections.find(x=>x.lesson_id===lesson.id&&x.kind===kind);return `<section data-preview-section="${sec?.id||''}"><h3>${name}</h3><div class="manual-preview-content">${editorHtml(kind)||'<p>Section vide.</p>'}</div>${assets.filter(x=>x.section_id===sec?.id).map(x=>`<button type="button" data-preview-file="${x.id}" class="subtle">📎 ${esc(x.file_name)}</button>`).join('')}</section>`}).join('')}`;
    const urls=[];
    document.body.append(dialog);dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.onclose=()=>{urls.forEach(URL.revokeObjectURL);dialog.remove();};dialog.showModal();
    dialog.querySelectorAll('[data-preview-file]').forEach(button=>button.onclick=()=>download(assets.find(x=>x.id===button.dataset.previewFile)));
    dialog.querySelectorAll('[data-preview-section]').forEach(section=>{
      const mount=section.querySelector('.manual-preview-content');
      mount.querySelectorAll('a[href]').forEach(link=>{
        const url=window.MelecContent.videoUrl(link.href);if(!url)return;
        const frame=document.createElement('iframe');frame.src=url;frame.title='Vidéo intégrée';frame.loading='lazy';frame.allow='fullscreen; picture-in-picture';frame.referrerPolicy='strict-origin-when-cross-origin';link.replaceWith(frame);
      });
      const walker=document.createTreeWalker(mount,NodeFilter.SHOW_TEXT),nodes=[];
      while(walker.nextNode())nodes.push(walker.currentNode);
      nodes.forEach(node=>{
        const pattern=/\[\[image:([0-9a-f-]{36})\]\]/gi,text=node.textContent;if(!pattern.test(text))return;pattern.lastIndex=0;
        const replacement=document.createDocumentFragment();let start=0,match;
        while((match=pattern.exec(text))){
          replacement.append(document.createTextNode(text.slice(start,match.index)));
          const asset=assets.find(a=>a.id===match[1]&&a.section_id===section.dataset.previewSection&&a.mime_type.startsWith('image/'));
          if(asset){const image=document.createElement('img');image.alt=asset.file_name;image.className='manual-inline-image';replacement.append(image);
            api.download(asset.object_path).then(blob=>{if(!image.isConnected)return;const url=URL.createObjectURL(blob);urls.push(url);image.src=url;}).catch(()=>{if(image.isConnected)image.alt='Image indisponible';});}
          else replacement.append(document.createTextNode(match[0]));start=pattern.lastIndex;
        }
        replacement.append(document.createTextNode(text.slice(start)));node.replaceWith(replacement);
      });
    });
  }
  window.MelecManualTeacher={canLeave(){return !dirty||confirm('Quitter la leçon sans enregistrer vos modifications ?');},render(nextBody,nextClassId,nextNotify){
    body=nextBody;notify=nextNotify;
    if(classId!==nextClassId){classId=nextClassId;themeId='';chapterId='';lessonId='';}
    if(!classId){body.innerHTML='<div class="teach-card">Choisissez une classe pour créer son manuel.</div>';return;}
    load();
  }};
})();
