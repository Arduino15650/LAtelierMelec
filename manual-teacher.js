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
  let body, classId, notify, themes=[], chapters=[], lessons=[], sections=[], assets=[], mode='manual',tdEditorView='td';
  let themeId='', chapterId='', lessonId='', request=0, busy=false, dirty=false;
  let loadedClassId='', loadedAt=0;
  const selections=new WeakMap();
  let teacherUrls=[];
  let inlineCaptureInFlight=null;
  const imagePattern=()=>/\[\[image:([0-9a-f-]{36})(?:\|(left|center|right)\|(\d{1,3}))?\]\]/gi;
  const imageWidth=value=>Math.max(20,Math.min(100,Number(value)||100));
  const imageAlign=value=>['left','center','right'].includes(value)?value:'center';
  function setImageLayout(node,align,width){
    node.dataset.imageAlign=imageAlign(align);node.dataset.imageWidth=String(imageWidth(width));
    node.classList.remove('manual-align-left','manual-align-center','manual-align-right');
    node.classList.add('manual-align-'+node.dataset.imageAlign);
    node.style.width=node.dataset.imageWidth+'%';node.style.setProperty('--image-width',node.dataset.imageWidth+'%');
  }
  function label(kind) { return kinds.find(entry => entry[0] === kind)?.[1] || kind; }
  function visibleKinds() { return kinds.filter(([kind])=>mode==='manual'?kind==='course':kind==='td'||kind==='corrections'); }
  function safe(html) { return window.MelecContent.sanitize(html); }
  function toolbar(kind) {
    const commands=[['bold','Gras','G'],['italic','Italique','I'],['underline','Souligné','S'],['strikeThrough','Barré','S̶'],['subscript','Indice','x₂'],['superscript','Exposant','x²'],['insertUnorderedList','Puces','• Liste'],['insertOrderedList','Numérotation','1. Liste'],['outdent','Réduire le retrait','⇤'],['indent','Augmenter le retrait','⇥'],['justifyLeft','Aligner à gauche','☷'],['justifyCenter','Centrer','☰'],['justifyRight','Aligner à droite','☷'],['justifyFull','Justifier','▤']];
    const colors=['#173450','#d12d32','#e47713','#147a45','#1669b3','#7b4bad'];
    const highlights=['#fff08a','#ffb8bb','#c2f0ce','#bfe6ff','#e5d7ff'];
    return `<div class="manual-toolbar" role="toolbar" aria-label="Mise en forme ${label(kind)}"><label>Police<select data-format-select="fontName" aria-label="Police"><option value="">Police</option>${['Arial','Aptos','Calibri','Georgia','Times New Roman','Verdana','Tahoma','Trebuchet MS'].map(font=>`<option value="${font}">${font}</option>`).join('')}</select></label><label>Taille<select data-format-select="fontSize" aria-label="Taille"><option value="">Taille</option>${[['1','10'],['2','12'],['3','14'],['4','16'],['5','18'],['6','24'],['7','32']].map(([value,size])=>`<option value="${value}">${size} pt</option>`).join('')}</select></label>${commands.map(([command,name,symbol])=>`<button type="button" data-format="${command}" title="${name}" aria-label="${name}">${symbol}</button>`).join('')}<label>Interligne<select data-spacing="lineHeight" aria-label="Interligne du paragraphe"><option value="">Interligne</option>${[['1','Serré 1'],['1.15','1,15'],['1.3','1,3'],['1.5','1,5'],['1.8','1,8'],['2','Double 2']].map(([value,text])=>`<option value="${value}">${text}</option>`).join('')}</select></label><label>Après paragraphe<select data-spacing="marginBottom" aria-label="Espace après le paragraphe"><option value="">Espacement</option>${[['0px','Aucun'],['4px','Petit'],['8px','Moyen'],['12px','Grand'],['18px','Très grand']].map(([value,text])=>`<option value="${value}">${text}</option>`).join('')}</select></label><div class="manual-color-group"><span>Texte</span>${colors.map(color=>`<button type="button" class="manual-swatch" data-swatch="foreColor" data-value="${color}" style="--swatch:${color}" aria-label="Texte ${color}"></button>`).join('')}<input type="color" data-color="foreColor" value="#173450" aria-label="Autre couleur du texte"></div><div class="manual-color-group"><span>Surlignage</span>${highlights.map(color=>`<button type="button" class="manual-swatch" data-swatch="hiliteColor" data-value="${color}" style="--swatch:${color}" aria-label="Surlignage ${color}"></button>`).join('')}<input type="color" data-color="hiliteColor" value="#fff08a" aria-label="Autre couleur de surlignage"></div><button type="button" data-table title="Insérer un tableau">▦ Tableau</button><button type="button" data-video title="Insérer une vidéo YouTube ou Vimeo">▶ Vidéo</button></div>`;
  }
  function selected() {
    return {theme:themes.find(row=>row.id===themeId), chapter:chapters.find(row=>row.id===chapterId), lesson:lessons.find(row=>row.id===lessonId)};
  }
  async function list(table, filter, columns='*') {
    return api.rest(table+'?'+filter+'&select='+columns+'&order=position.asc,created_at.asc');
  }
  async function load() {
    const ticket=++request;
    body.innerHTML='<div class="teach-card">Chargement du thème sélectionné…</div>';
    try {
      themes=await list('manual_themes','class_id=eq.'+encodeURIComponent(classId),'id,title,position,published,created_at');
      if(ticket!==request)return;
      if(!themes.some(x=>x.id===themeId)){themeId='';chapterId='';lessonId='';}
      chapters=themeId ? await list('manual_chapters','theme_id=eq.'+themeId,'id,theme_id,title,position,published,created_at') : [];
      if(ticket!==request)return;
      if(!chapters.some(x=>x.id===chapterId&&x.theme_id===themeId)){chapterId='';lessonId='';}
      lessons=chapterId ? await list('manual_lessons','chapter_id=eq.'+chapterId,'id,chapter_id,title,position,published,created_at') : [];
      if(ticket!==request)return;
      if(!lessons.some(x=>x.id===lessonId&&x.chapter_id===chapterId))lessonId='';
      sections=lessonId ? await api.rest('manual_sections?lesson_id=eq.'+lessonId+'&select=id,lesson_id,kind,content_html,published,updated_at') : [];
      if(ticket!==request)return;
      assets=sections.length ? await api.rest('manual_assets?section_id=in.('+sections.map(x=>x.id).join(',')+')&select=id,section_id,object_path,file_name,mime_type,created_at&order=created_at.asc') : [];
      if(ticket!==request)return;
      draw();
      loadedClassId=classId;
      loadedAt=Date.now();
    } catch(error) { if(ticket===request){body.innerHTML='<div class="teach-card manual-error">Le manuel est indisponible. Vérifiez que son script SQL est installé.</div>';notify(error.message,true);} }
  }
  function sectionCard(kind,lesson) {
    const section=sections.find(x=>x.lesson_id===lesson.id&&x.kind===kind);
    const files=section?assets.filter(x=>x.section_id===section.id):[];
    return `<section class="manual-section" data-kind="${kind}" ${mode==='manual-td'&&tdEditorView!==kind?'hidden':''}><div class="manual-section-head"><h4>${label(kind)}</h4><span class="manual-state ${section?.published?'on':''}">${section?.published?'Publié':'Brouillon'}</span></div>
      ${toolbar(kind)}
      <div class="manual-editor" data-editor contenteditable="true" role="textbox" aria-multiline="true" aria-label="Contenu ${label(kind)}">${safe(section?.content_html||'')}</div>
      <div class="manual-image-tools" data-image-tools hidden><strong>Image sélectionnée</strong><button type="button" data-image-align="left">À gauche</button><button type="button" data-image-align="center">Centrer</button><button type="button" data-image-align="right">À droite</button><label>Taille <input type="range" data-image-width min="20" max="100" step="5" value="100"><output data-image-size>100 %</output></label><button type="button" data-image-move="up">↑ Monter</button><button type="button" data-image-move="down">↓ Descendre</button><button type="button" data-image-remove>Retirer du texte</button></div>
      <div class="manual-files">${files.map(file=>`<span class="manual-file-chip">${file.mime_type.startsWith('image/')?`<img data-teacher-image="${file.id}" alt="${esc(file.file_name)}" class="manual-teacher-thumbnail"><button type="button" data-insert-image="${file.id}" class="subtle">Insérer l’image dans le texte</button>`:`<button type="button" data-download="${file.id}" class="subtle">📎 ${esc(file.file_name)}</button>`}</span>`).join('')}</div>
      <label class="manual-upload">Ajouter des images, PDF ou documents bureautiques<input type="file" data-upload="${kind}" accept=".png,.jpg,.jpeg,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" multiple></label>
      ${section?`<div class="manual-section-actions"><button type="button" data-toggle-section="${section.id}" class="subtle">${section.published?'Masquer cette section':'Publier cette section'}</button><button type="button" data-delete-section="${kind}" class="warn">Supprimer ${label(kind).toLowerCase()}</button></div>`:''}</section>`;
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
  function formatSpacing(control,property,value){
    if(!value)return;
    const editor=control.closest('.manual-section').querySelector('[data-editor]');
    const range=selections.get(editor);
    if(!range||!editor.contains(range.commonAncestorContainer)){
      notify('Placez le curseur dans un paragraphe ou sélectionnez plusieurs paragraphes.',true);
      control.value='';return;
    }
    const candidates=[...editor.querySelectorAll('p,div,li,h2,h3,h4,blockquote')].filter(node=>range.intersectsNode(node));
    const blocks=candidates.filter(node=>!candidates.some(other=>other!==node&&node.contains(other)));
    if(!blocks.length){notify('Sélectionnez un paragraphe pour régler son espacement.',true);control.value='';return;}
    blocks.forEach(node=>{node.style[property]=value;});
    dirty=true;control.value='';
  }
  async function prepareInlineImages(){
    if(inlineCaptureInFlight)return inlineCaptureInFlight;
    inlineCaptureInFlight=(async()=>{
      for(const [kind] of visibleKinds()){
        const editor=body.querySelector(`.manual-section[data-kind="${kind}"] [data-editor]`);
        if(!editor)continue;
        for(const image of [...editor.querySelectorAll('img')]){
          if(image.closest('[data-manual-image]'))continue;
          const section=sections.find(row=>row.lesson_id===lessonId&&row.kind===kind);
          if(!section)throw new Error('Enregistrez d’abord la leçon avant d’intégrer un pictogramme collé.');
          const src=image.getAttribute('src')||'';
          if(!/^(data:image\/(?:png|jpeg|webp|gif);base64,|blob:|https:\/\/)/i.test(src))
            throw new Error('Ce pictogramme externe ne peut pas être intégré automatiquement. Déposez son fichier PNG, JPG ou WebP dans la section, puis utilisez « Insérer l’image dans le texte ».');
          if(src.length>15_000_000)throw new Error('Pictogramme trop volumineux : utilisez un fichier de moins de 10 Mo.');
          const response=await fetch(src,{credentials:'omit'}).catch(()=>null);
          if(!response?.ok)throw new Error('Lecture du pictogramme impossible. Déposez son fichier dans la section, puis insérez-le dans le texte.');
          const blob=await response.blob();
          const mime=blob.type.toLowerCase();
          if(!['image/png','image/jpeg','image/webp','image/gif'].includes(mime)||blob.size>10*1024*1024)
            throw new Error('Pictogramme non accepté ou supérieur à 10 Mo.');
          const ext={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif'}[mime];
          const name='pictogramme-'+crypto.randomUUID()+'.'+ext;
          const path='manual/'+lessonId+'/'+name;
          await api.upload(path,new File([blob],name,{type:mime}));
          let asset;
          try{
            const rows=await api.rest('manual_assets?select=id,section_id,object_path,file_name,mime_type,created_at',{
              method:'POST',headers:{'Content-Type':'application/json',Prefer:'return=representation'},
              body:JSON.stringify({section_id:section.id,object_path:path,file_name:name,mime_type:mime})
            });
            asset=rows?.[0];
            if(!asset?.id)throw new Error('Pièce jointe non confirmée.');
          }catch(error){await api.removeFiles([path]).catch(()=>{});throw error;}
          assets.push(asset);
          const frame=document.createElement('span');
          frame.contentEditable='false';frame.dataset.manualImage=asset.id;frame.className='manual-editor-image';setImageLayout(frame,'center',100);
          image.alt=image.alt||name;image.replaceWith(frame);frame.append(image);
          dirty=true;
        }
      }
    })().finally(()=>{inlineCaptureInFlight=null;});
    return inlineCaptureInFlight;
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
  async function loadTeacherImage(asset,image){
    if(!asset)return;
    try{const blob=await api.download(asset.object_path);if(!image.isConnected)return;const url=URL.createObjectURL(blob);teacherUrls.push(url);image.src=url;}
    catch{if(image.isConnected)image.alt='Image indisponible';}
  }
  function hydrateTeacherImages(editor){
    const kind=editor.closest('.manual-section').dataset.kind;
    const section=sections.find(row=>row.lesson_id===lessonId&&row.kind===kind);
    if(!section)return;
    const walker=document.createTreeWalker(editor,NodeFilter.SHOW_TEXT),nodes=[];
    while(walker.nextNode())nodes.push(walker.currentNode);
    nodes.forEach(node=>{
      const text=node.textContent,pattern=imagePattern();
      if(!pattern.test(text))return;pattern.lastIndex=0;
      const fragment=document.createDocumentFragment();let start=0,match;
      while((match=pattern.exec(text))){
        fragment.append(document.createTextNode(text.slice(start,match.index)));
        const asset=assets.find(row=>row.id===match[1]&&row.section_id===section.id&&row.mime_type.startsWith('image/'));
        if(asset){const frame=document.createElement('span');frame.contentEditable='false';frame.dataset.manualImage=asset.id;frame.className='manual-editor-image';setImageLayout(frame,match[2],match[3]);const image=document.createElement('img');image.alt=asset.file_name;frame.append(image);fragment.append(frame);loadTeacherImage(asset,image);}
        else fragment.append(document.createTextNode(match[0]));
        start=pattern.lastIndex;
      }
      fragment.append(document.createTextNode(text.slice(start)));node.replaceWith(fragment);
    });
  }
  function selectedImage(section){return section.querySelector('[data-image-tools]')?.selectedFrame||null;}
  function selectImage(frame){
    const section=frame.closest('.manual-section'),tools=section.querySelector('[data-image-tools]');
    section.querySelectorAll('.manual-editor-image.is-selected').forEach(node=>node.classList.remove('is-selected'));
    frame.classList.add('is-selected');tools.selectedFrame=frame;tools.hidden=false;
    tools.querySelector('[data-image-width]').value=frame.dataset.imageWidth||'100';
    tools.querySelector('[data-image-size]').textContent=(frame.dataset.imageWidth||'100')+' %';
  }
  function insertClipboardImage(editor,file){
    const image=document.createElement('img');image.alt=file.name||'Image collée';image.src=URL.createObjectURL(file);teacherUrls.push(image.src);
    const selection=window.getSelection(),range=selections.get(editor)||selection?.rangeCount&&selection.getRangeAt(0);
    if(range&&editor.contains(range.commonAncestorContainer)){
      const at=range.cloneRange();at.deleteContents();at.insertNode(image);at.setStartAfter(image);at.collapse(true);
      selection.removeAllRanges();selection.addRange(at);selections.set(editor,at.cloneRange());
    }else editor.append(image);
    dirty=true;
  }
  function draw() {
    teacherUrls.forEach(URL.revokeObjectURL);teacherUrls=[];
    dirty=false;
    const {theme,chapter,lesson}=selected();
    const chapterChoices=theme?chapters.filter(x=>x.theme_id===theme.id):[];
    const lessonChoices=chapter?lessons.filter(x=>x.chapter_id===chapter.id):[];
    body.innerHTML=`<div class="teach-card manual-manager"><h2>${mode==='manual'?'Manuel numérique · Cours':'Travaux dirigés et corrections'}</h2><p class="teach-help">Créez un thème, ses chapitres, puis plusieurs leçons. Les élèves ne voient que les sections publiées.</p>
      <div class="manual-pickers"><label>Thème<select id="manualTheme"><option value="">Choisir un thème…</option>${themes.map(x=>`<option value="${x.id}" ${x.id===themeId?'selected':''}>${esc(x.title)}${x.published?' ✓':''}</option>`).join('')}</select></label><label>Nouveau thème<input id="manualNewTheme" maxlength="180" placeholder="Ex. Installations électriques"></label><button type="button" id="manualAddTheme">Créer le thème</button></div>
      ${theme?`<div class="manual-level-actions"><label>Nom du thème<input id="manualThemeTitle" maxlength="180" value="${esc(theme.title)}"></label><button type="button" id="manualRenameTheme" class="subtle">Renommer</button><button type="button" id="manualToggleTheme" class="subtle">${theme.published?'Masquer le thème':'Publier le thème'}</button><button type="button" id="manualDeleteTheme" class="warn">Supprimer le thème</button></div>`:''}
      ${theme?`<div class="manual-pickers"><label>Chapitre<select id="manualChapter"><option value="">Choisir un chapitre…</option>${chapterChoices.map(x=>`<option value="${x.id}" ${x.id===chapterId?'selected':''}>${esc(x.title)}${x.published?' ✓':''}</option>`).join('')}</select></label><label>Nouveau chapitre<input id="manualNewChapter" maxlength="180" placeholder="Ex. Les protections"></label><button type="button" id="manualAddChapter">Créer le chapitre</button></div>`:''}
      ${chapter?`<div class="manual-level-actions"><label>Nom du chapitre<input id="manualChapterTitle" maxlength="180" value="${esc(chapter.title)}"></label><button type="button" id="manualRenameChapter" class="subtle">Renommer</button><button type="button" id="manualToggleChapter" class="subtle">${chapter.published?'Masquer le chapitre':'Publier le chapitre'}</button><button type="button" id="manualDeleteChapter" class="warn">Supprimer le chapitre</button></div>`:''}
      ${chapter?`<div class="manual-pickers"><label>Leçon<select id="manualLesson"><option value="">Choisir une leçon…</option>${lessonChoices.map(x=>`<option value="${x.id}" ${x.id===lessonId?'selected':''}>${esc(x.title)}${x.published?' ✓':''}</option>`).join('')}</select></label><label>Nouvelle leçon<input id="manualNewLesson" maxlength="180" placeholder="Ex. Le disjoncteur différentiel"></label><button type="button" id="manualAddLesson">Créer la leçon</button></div>`:''}
      ${lesson?`<div class="manual-lesson"><label>Titre de la leçon<input id="manualLessonTitle" maxlength="180" value="${esc(lesson.title)}"></label>${mode==='manual-td'?`<nav class="manual-td-submenu" aria-label="Édition des travaux dirigés"><button type="button" data-teacher-part="td" class="${tdEditorView==='td'?'active':''}">Travaux dirigés</button><button type="button" data-teacher-part="corrections" class="${tdEditorView==='corrections'?'active':''}">Correction des TD</button></nav>`:''}<div class="manual-sections">${visibleKinds().map(([kind])=>sectionCard(kind,lesson)).join('')}</div><div class="manual-actions"><button type="button" id="manualPreview" class="subtle">Prévisualiser</button><button type="button" id="manualSave">Enregistrer</button><button type="button" id="manualPublishLesson">Publier le thème, chapitre et la leçon</button><button type="button" id="manualPublish" class="subtle">${mode==='manual'?'Publier le cours':'Publier les TD et leurs corrections'}</button><button type="button" id="manualHide" class="warn" ${lesson.published?'':'hidden'}>Masquer la leçon</button><button type="button" id="manualDeleteLesson" class="warn">Supprimer la leçon entière</button></div><p class="teach-help">La suppression d’une leçon entière efface aussi son cours, ses TD, ses corrections et leurs fichiers. Pour ne retirer qu’une partie, utilisez le bouton de suppression dans sa section.</p></div>`:''}</div>`;
    body.querySelector('#manualTheme').onchange=e=>{if(dirty&&!confirm('Quitter cette leçon sans enregistrer vos modifications ?')){e.target.value=themeId;return;}themeId=e.target.value;chapterId='';lessonId='';load();};
    body.querySelector('#manualAddTheme').onclick=()=>create('theme');
    body.querySelector('#manualRenameTheme')?.addEventListener('click',()=>rename('manual_themes',theme.id,body.querySelector('#manualThemeTitle').value));
    body.querySelector('#manualToggleTheme')?.addEventListener('click',()=>update('manual_themes',theme.id,{published:!theme.published},theme.published?'Thème masqué.':'Thème publié.'));
    body.querySelector('#manualDeleteTheme')?.addEventListener('click',()=>removeContent('theme'));
    body.querySelector('#manualChapter')?.addEventListener('change',e=>{if(dirty&&!confirm('Quitter cette leçon sans enregistrer vos modifications ?')){e.target.value=chapterId;return;}chapterId=e.target.value;lessonId='';load();});
    body.querySelector('#manualAddChapter')?.addEventListener('click',()=>create('chapter'));
    body.querySelector('#manualRenameChapter')?.addEventListener('click',()=>rename('manual_chapters',chapter.id,body.querySelector('#manualChapterTitle').value));
    body.querySelector('#manualToggleChapter')?.addEventListener('click',()=>update('manual_chapters',chapter.id,{published:!chapter.published},chapter.published?'Chapitre masqué.':'Chapitre publié.'));
    body.querySelector('#manualDeleteChapter')?.addEventListener('click',()=>removeContent('chapter'));
    body.querySelector('#manualLesson')?.addEventListener('change',e=>{if(dirty&&!confirm('Quitter cette leçon sans enregistrer vos modifications ?')){e.target.value=lessonId;return;}lessonId=e.target.value;load();});
    body.querySelector('#manualAddLesson')?.addEventListener('click',()=>create('lesson'));
    if(!lesson)return;
    body.querySelector('#manualDeleteLesson').onclick=()=>removeContent('lesson');
    body.querySelectorAll('[data-delete-section]').forEach(button=>button.onclick=()=>removeContent('section',button.dataset.deleteSection));
    body.querySelectorAll('[data-teacher-part]').forEach(button=>button.onclick=()=>{
      tdEditorView=button.dataset.teacherPart;
      body.querySelectorAll('[data-teacher-part]').forEach(item=>item.classList.toggle('active',item===button));
      body.querySelectorAll('.manual-section').forEach(section=>section.hidden=section.dataset.kind!==tdEditorView);
    });
    body.querySelectorAll('[data-editor],#manualLessonTitle').forEach(node=>node.addEventListener('input',()=>{dirty=true;}));
    body.querySelectorAll('[data-editor]').forEach(editor=>{
      ['keyup','pointerup','touchend','focusout'].forEach(name=>editor.addEventListener(name,()=>rememberSelection(editor)));
      hydrateTeacherImages(editor);
      editor.addEventListener('click',event=>{const frame=event.target.closest('[data-manual-image]');if(frame&&editor.contains(frame))selectImage(frame);});
      editor.addEventListener('paste',event=>{
        const item=[...(event.clipboardData?.items||[])].find(item=>item.type.startsWith('image/'));
        if(item&&!event.clipboardData.getData('text/html')){
          const file=item.getAsFile();if(file){event.preventDefault();insertClipboardImage(editor,file);}
        }
        setTimeout(()=>prepareInlineImages().catch(error=>notify(error.message,true)),0);
      });
    });
    body.querySelectorAll('[data-image-tools]').forEach(tools=>{
      tools.querySelectorAll('[data-image-align]').forEach(button=>button.onclick=()=>{const frame=selectedImage(tools.closest('.manual-section'));if(!frame?.isConnected)return;setImageLayout(frame,button.dataset.imageAlign,frame.dataset.imageWidth);dirty=true;});
      tools.querySelector('[data-image-width]').oninput=event=>{const frame=selectedImage(tools.closest('.manual-section'));if(!frame?.isConnected)return;setImageLayout(frame,frame.dataset.imageAlign,event.target.value);tools.querySelector('[data-image-size]').textContent=frame.dataset.imageWidth+' %';dirty=true;};
      tools.querySelectorAll('[data-image-move]').forEach(button=>button.onclick=()=>{
        const frame=selectedImage(tools.closest('.manual-section'));if(!frame?.isConnected)return;
        const editor=frame.closest('[data-editor]'),block=frame.parentElement===editor?frame:frame.closest('p,div,li,blockquote')||frame;
        const sibling=button.dataset.imageMove==='up'?block.previousElementSibling:block.nextElementSibling;
        if(sibling){button.dataset.imageMove==='up'?sibling.before(frame):sibling.after(frame);dirty=true;}
      });
      tools.querySelector('[data-image-remove]').onclick=()=>{const frame=selectedImage(tools.closest('.manual-section'));if(frame?.isConnected){frame.remove();dirty=true;}tools.selectedFrame=null;tools.hidden=true;};
    });
    body.querySelectorAll('[data-teacher-image]').forEach(image=>loadTeacherImage(assets.find(asset=>asset.id===image.dataset.teacherImage),image));
    body.querySelectorAll('[data-format],[data-swatch],[data-table],[data-video],[data-insert-image]').forEach(button=>button.onmousedown=event=>event.preventDefault());
    body.querySelectorAll('[data-format]').forEach(button=>button.onclick=()=>formatSelection(button,button.dataset.format));
    body.querySelectorAll('[data-format-select]').forEach(select=>select.onchange=()=>{if(select.value)formatSelection(select,select.dataset.formatSelect,select.value);select.value='';});
    body.querySelectorAll('[data-spacing]').forEach(select=>select.onchange=()=>formatSpacing(select,select.dataset.spacing,select.value));
    body.querySelectorAll('[data-color]').forEach(input=>input.oninput=()=>formatSelection(input,input.dataset.color,input.value));
    body.querySelectorAll('[data-swatch]').forEach(button=>button.onclick=()=>formatSelection(button,button.dataset.swatch,button.dataset.value));
    body.querySelectorAll('[data-table]').forEach(button=>button.onclick=()=>insertTable(button));
    body.querySelectorAll('[data-video]').forEach(button=>button.onclick=()=>insertVideo(button));
    body.querySelectorAll('[data-insert-image]').forEach(button=>button.onclick=()=>{formatSelection(button,'insertText','[[image:'+button.dataset.insertImage+']]');hydrateTeacherImages(button.closest('.manual-section').querySelector('[data-editor]'));});
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
  async function children(table,column,ids,fields='id') {
    const rows=[];
    for(let index=0;index<ids.length;index+=30){
      const batch=ids.slice(index,index+30);
      rows.push(...await api.rest(table+'?'+column+'=in.('+batch.map(encodeURIComponent).join(',')+')&select='+fields));
    }
    return rows;
  }
  async function removalScope(type,kind){
    const {theme,chapter,lesson}=selected();
    if(type==='theme'&&!theme||type==='chapter'&&!chapter||type==='lesson'&&!lesson||type==='section'&&(!lesson||!kinds.some(([key])=>key===kind)))
      throw new Error('La sélection à supprimer est introuvable. Actualisez la page.');
    let branchChapters=[],branchLessons=[],branchSections=[];
    if(type==='theme')branchChapters=await api.rest('manual_chapters?theme_id=eq.'+encodeURIComponent(theme.id)+'&select=id');
    if(type==='chapter')branchChapters=[chapter];
    if(type==='theme'||type==='chapter')branchLessons=await children('manual_lessons','chapter_id',branchChapters.map(row=>row.id));
    if(type==='lesson')branchLessons=[lesson];
    if(type==='section')branchSections=await api.rest('manual_sections?lesson_id=eq.'+encodeURIComponent(lesson.id)+'&kind=eq.'+encodeURIComponent(kind)+'&select=id');
    else branchSections=await children('manual_sections','lesson_id',branchLessons.map(row=>row.id));
    const branchAssets=await children('manual_assets','section_id',branchSections.map(row=>row.id),'id,object_path');
    const node=type==='theme'?theme:type==='chapter'?chapter:type==='lesson'?lesson:sections.find(row=>row.id===branchSections[0]?.id);
    if(!node)throw new Error('Le contenu a déjà été supprimé. Actualisez la page.');
    return {node,branchChapters,branchLessons,branchSections,branchAssets};
  }
  async function removeContent(type,kind=''){
    if(busy)return;
    busy=true;
    let deleted=false;
    try{
      const scope=await removalScope(type,kind);
      const {node,branchChapters,branchLessons,branchSections,branchAssets}=scope;
      const title=type==='section'?label(kind):node.title;
      const summary=type==='section'
        ? `Cette section et ses ${branchAssets.length} fichier(s) joint(s) seront supprimés. Les autres parties de la leçon seront conservées.`
        : `Cette suppression effacera ${branchChapters.length} chapitre(s), ${branchLessons.length} leçon(s), ${branchSections.length} section(s) et ${branchAssets.length} fichier(s) joint(s). Un cours, des TD ou une correction présents dans ces leçons seront également effacés.`;
      const warning=dirty?'\n\nVos modifications non enregistrées seront perdues.':'';
      if(prompt(`SUPPRESSION DÉFINITIVE : ${title}\n\n${summary}${warning}\n\nAucune restauration ne sera possible. Pour confirmer, saisissez SUPPRIMER :`,'')!=='SUPPRIMER')return;
      let table,filter;
      if(type==='theme'){table='manual_themes';filter='id=eq.'+node.id+'&class_id=eq.'+classId;}
      if(type==='chapter'){table='manual_chapters';filter='id=eq.'+node.id+'&theme_id=eq.'+themeId;}
      if(type==='lesson'){table='manual_lessons';filter='id=eq.'+node.id+'&chapter_id=eq.'+chapterId;}
      if(type==='section'){table='manual_sections';filter='id=eq.'+node.id+'&lesson_id=eq.'+lessonId+'&kind=eq.'+encodeURIComponent(kind);}
      const removed=await api.rest(table+'?'+filter+'&select=id',{method:'DELETE',headers:{Prefer:'return=representation'}});
      if(!Array.isArray(removed)||removed.length!==1)throw new Error('La suppression n’a pas été confirmée par la base. Aucun fichier joint n’a été effacé.');
      deleted=true;
      if(type==='theme'){themeId='';chapterId='';lessonId='';}
      else if(type==='chapter'){chapterId='';lessonId='';}
      else if(type==='lesson')lessonId='';
      const paths=[...new Set(branchAssets.map(asset=>asset.object_path).filter(path=>typeof path==='string'&&path.startsWith('manual/')))];
      if(paths.length){
        try{await api.removeFiles(paths);}
        catch(firstError){
          try{await api.removeFiles(paths);}
          catch(error){throw new Error(`Le contenu est supprimé de la base, mais ${paths.length} fichier(s) peuvent rester dans le stockage. Signalez cette erreur pour nettoyage : ${error.message}`);}
        }
      }
      notify(`${title} supprimé définitivement${paths.length?' avec ses fichiers':''}.`);
    }catch(error){notify(error.message,true);}
    finally{if(deleted){dirty=false;await load();}busy=false;}
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
  function editorHtml(kind){
    const editor=body.querySelector(`.manual-section[data-kind="${kind}"] [data-editor]`);
    if(!editor)return '';
    const copy=editor.cloneNode(true);
    copy.querySelectorAll('[data-manual-image]').forEach(node=>node.replaceWith(document.createTextNode(`[[image:${node.dataset.manualImage}|${imageAlign(node.dataset.imageAlign)}|${imageWidth(node.dataset.imageWidth)}]]`)));
    return safe(copy.innerHTML);
  }
  async function persistEditor(){
    const title=body.querySelector('#manualLessonTitle').value.trim();if(!title)throw new Error('Donnez un titre à la leçon.');
    await prepareInlineImages();
    const current=selected().lesson;
    await api.rest('manual_lessons?id=eq.'+current.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({title,updated_at:new Date().toISOString()})});
    for(const [kind] of visibleKinds()){
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
    if(!confirm(mode==='manual'?'Publier le cours de cette leçon pour les élèves ?':'Publier les TD et leurs corrections pour les élèves ?'))return;
    const title=body.querySelector('#manualLessonTitle').value.trim();if(!title)return notify('Donnez un titre à la leçon.',true);
    if(!await saveAll())return;
    await run(async()=>{
      await publishHierarchy(false);
      const ids=sections.filter(section=>section.lesson_id===lessonId&&visibleKinds().some(([kind])=>kind===section.kind)).map(section=>section.id);
      if(!ids.length)throw new Error('Enregistrez les sections avant de publier.');
      await api.rest('manual_sections?id=in.('+ids.join(',')+')',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({published:true})});
    },mode==='manual'?'Cours publié pour la classe.':'TD et corrections publiés pour la classe.');
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
  async function preview(){
    try{await prepareInlineImages();}
    catch(error){notify(error.message,true);return;}
    const lesson=selected().lesson, title=body.querySelector('#manualLessonTitle').value.trim()||lesson.title;
    const dialog=document.createElement('dialog');dialog.className='manual-preview';
    dialog.innerHTML=`<div class="manual-preview-head"><h2>${esc(title)}</h2><button type="button" data-close>Fermer</button></div>${visibleKinds().map(([kind,name])=>{const sec=sections.find(x=>x.lesson_id===lesson.id&&x.kind===kind),html=editorHtml(kind),attached=assets.filter(x=>x.section_id===sec?.id);return `<section data-preview-section="${sec?.id||''}"><h3>${name}</h3><div class="manual-preview-content">${html||'<p>Section vide.</p>'}</div>${attached.filter(x=>x.mime_type.startsWith('image/')&&!html.includes('[[image:'+x.id)).map(x=>`<img class="manual-inline-image" data-preview-image="${x.id}" alt="${esc(x.file_name)}">`).join('')}${attached.filter(x=>!x.mime_type.startsWith('image/')).map(x=>`<button type="button" data-preview-file="${x.id}" class="subtle">📎 ${esc(x.file_name)}</button>`).join('')}</section>`}).join('')}`;
    const urls=[];
    document.body.append(dialog);dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.onclose=()=>{urls.forEach(URL.revokeObjectURL);dialog.remove();};dialog.showModal();
    dialog.querySelectorAll('[data-preview-file]').forEach(button=>button.onclick=()=>download(assets.find(x=>x.id===button.dataset.previewFile)));
    dialog.querySelectorAll('[data-preview-image]').forEach(image=>{
      const asset=assets.find(x=>x.id===image.dataset.previewImage);
      if(!asset)return;
      api.download(asset.object_path).then(blob=>{if(!image.isConnected)return;const url=URL.createObjectURL(blob);urls.push(url);image.src=url;}).catch(()=>{if(image.isConnected)image.alt='Image indisponible';});
    });
    dialog.querySelectorAll('[data-preview-section]').forEach(section=>{
      const mount=section.querySelector('.manual-preview-content');
      mount.querySelectorAll('a[href]').forEach(link=>{
        const url=window.MelecContent.videoUrl(link.href);if(!url)return;
        const frame=document.createElement('iframe');frame.src=url;frame.title='Vidéo intégrée';frame.loading='lazy';frame.allow='fullscreen; picture-in-picture';frame.referrerPolicy='strict-origin-when-cross-origin';link.replaceWith(frame);
      });
      const walker=document.createTreeWalker(mount,NodeFilter.SHOW_TEXT),nodes=[];
      while(walker.nextNode())nodes.push(walker.currentNode);
      nodes.forEach(node=>{
        const pattern=imagePattern(),text=node.textContent;if(!pattern.test(text))return;pattern.lastIndex=0;
        const replacement=document.createDocumentFragment();let start=0,match;
        while((match=pattern.exec(text))){
          replacement.append(document.createTextNode(text.slice(start,match.index)));
          const asset=assets.find(a=>a.id===match[1]&&a.section_id===section.dataset.previewSection&&a.mime_type.startsWith('image/'));
          if(asset){const image=document.createElement('img');image.alt=asset.file_name;image.className='manual-inline-image';setImageLayout(image,match[2],match[3]);replacement.append(image);
            api.download(asset.object_path).then(blob=>{if(!image.isConnected)return;const url=URL.createObjectURL(blob);urls.push(url);image.src=url;}).catch(()=>{if(image.isConnected)image.alt='Image indisponible';});}
          else replacement.append(document.createTextNode(match[0]));start=pattern.lastIndex;
        }
        replacement.append(document.createTextNode(text.slice(start)));node.replaceWith(replacement);
      });
    });
  }
  window.MelecManualTeacher={canLeave(){return !dirty||confirm('Quitter la leçon sans enregistrer vos modifications ?');},resetSelection(){themeId='';chapterId='';lessonId='';dirty=false;},render(nextBody,nextClassId,nextNotify,nextMode='manual'){
    body=nextBody;notify=nextNotify;mode=nextMode;
    if(classId!==nextClassId){classId=nextClassId;themeId='';chapterId='';lessonId='';loadedAt=0;}
    if(!classId){body.innerHTML='<div class="teach-card">Choisissez une classe pour créer son manuel.</div>';return;}
    if(loadedClassId===classId&&Date.now()-loadedAt<15000&&!busy){draw();return;}
    load();
  }};
})();
