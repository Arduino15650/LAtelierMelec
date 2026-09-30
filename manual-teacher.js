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
  const blockUploads=new Set(),removedBlockAssets=new Set();
  let blockUploadError='';
  const selections=new WeakMap();
  let activeBlockText=null;
  const editorHistories=new WeakMap();
  function history(editor){return editorHistories.get(editor);}
  function recordEdit(editor,typing=false){
    const state=history(editor);if(!state)return;
    const html=editor.innerHTML,now=Date.now();
    if(state.items[state.index]===html){if(!typing)state.typing=false;return;}
    state.items.splice(state.index+1);
    if(typing&&state.typing&&now-state.lastTyped<600&&state.index>0)state.items[state.index]=html;
    else{state.items.push(html);state.index++;}
    if(state.items.length>80){state.items.shift();state.index--;}
    state.typing=typing;state.lastTyped=now;
    updateHistoryButtons(editor);
  }
  function updateHistoryButtons(editor){
    const state=history(editor),section=editor.closest('.manual-section');if(!state||!section)return;
    const undo=section.querySelector('[data-history="undo"]'),redo=section.querySelector('[data-history="redo"]');
    if(undo)undo.disabled=state.index<1;if(redo)redo.disabled=state.index>=state.items.length-1;
  }
  function travelHistory(editor,direction){
    const state=history(editor);if(!state)return;
    const next=state.index+direction;if(next<0||next>=state.items.length)return;
    state.index=next;state.typing=false;editor.innerHTML=state.items[next];
    editor.querySelectorAll('[data-manual-image]').forEach(frame=>{
      const image=frame.querySelector('img'),asset=assets.find(row=>row.id===frame.dataset.manualImage);
      if(image&&asset&&(!image.getAttribute('src')||!image.complete))loadTeacherImage(asset,image);
    });
    anchorFreeImages(editor);ensureTrailingTextBlock(editor);reserveEditorImageSpace(editor);
    const section=editor.closest('.manual-section');section.querySelectorAll('.is-selected').forEach(node=>node.classList.remove('is-selected'));
    section.querySelectorAll('[data-image-tools],[data-table-tools]').forEach(tools=>{tools.hidden=true;tools.selectedFrame=null;tools.selectedTable=null;});
    editor.focus();const range=document.createRange();range.selectNodeContents(editor);range.collapse(false);
    const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);selections.set(editor,range.cloneRange());
    dirty=true;updateHistoryButtons(editor);
  }
  let teacherUrls=[];
  const uploadedImageSources=new Map();
  const imageBlobs=new Map(),imageRequests=new Map();
  let imageCacheBytes=0;
  async function teacherImageBlob(path){
    const hit=imageBlobs.get(path);
    if(hit){imageBlobs.delete(path);imageBlobs.set(path,hit);return hit;}
    if(imageRequests.has(path))return imageRequests.get(path);
    const pending=api.download(path,{retryTransient:true}).then(blob=>{
      if(blob.size&&blob.size<=10*1024*1024){
        while(imageCacheBytes+blob.size>40*1024*1024&&imageBlobs.size){const oldest=imageBlobs.keys().next().value;imageCacheBytes-=imageBlobs.get(oldest).size;imageBlobs.delete(oldest);}
        imageBlobs.set(path,blob);imageCacheBytes+=blob.size;
      }
      return blob;
    }).finally(()=>imageRequests.delete(path));
    imageRequests.set(path,pending);return pending;
  }
  let inlineCaptureInFlight=null;
  const imagePattern=()=>/\[\[image:([0-9a-f-]{36})(?:\|(left|center|right|free)\|(\d{1,3})(?:\|(\d{1,3})\|(\d{1,5}))?)?\]\]/gi;
  const imageWidth=value=>Math.max(1,Math.min(100,Number(value)||100));
  const imageAlign=value=>['left','center','right','free'].includes(value)?value:'center';
  function setImageLayout(node,align,width,x,y){
    const previous=imageAlign(align),size=imageWidth(width);
    node.dataset.imageAlign='free';node.dataset.imageWidth=String(size);
    node.classList.remove('manual-align-left','manual-align-center','manual-align-right','manual-align-free');
    node.classList.add('manual-align-free');
    node.style.width=node.dataset.imageWidth+'%';node.style.setProperty('--image-width',node.dataset.imageWidth+'%');
    const maxX=100-size,legacyX=previous==='right'?maxX:previous==='center'?maxX/2:0;
    node.dataset.imageX=String(Math.max(0,Math.min(maxX,previous==='free'?(Number(x)||0):legacyX)));
    node.dataset.imageY=String(Math.max(0,Math.min(10000,Number(y)||0)));
    node.style.left=node.dataset.imageX+'%';node.style.top=node.dataset.imageY+'px';
  }
  function anchorFreeImages(root){
    root.querySelectorAll('.manual-align-free').forEach(image=>{
      let anchor=image.parentElement?.closest('p,div,li,h2,h3,h4,blockquote');
      if(!anchor||anchor===root||!root.contains(anchor)){
        anchor=document.createElement('p');image.before(anchor);anchor.append(image);
      }
      anchor.classList.add('manual-image-anchor');
    });
  }
  function reserveEditorImageSpace(editor){
    requestAnimationFrame(()=>{
      if(!editor.isConnected)return;
      // L'image flotte sans modifier la hauteur du paragraphe ni déplacer les lignes.
      editor.querySelectorAll('.manual-image-anchor').forEach(anchor=>anchor.style.minHeight='');
      editor.style.minHeight='';
      positionContinuations(editor,'.manual-editor-image.manual-align-free');
      const images=[...editor.querySelectorAll('.manual-editor-image.manual-align-free')];
      if(images.length){
        const top=editor.getBoundingClientRect().top;
        const bottom=Math.max(...images.map(image=>image.getBoundingClientRect().bottom-top+16));
        editor.style.minHeight=Math.max(260,Math.ceil(bottom))+'px';
      }
    });
  }
  function writeBelowImage(frame){
    const editor=frame.closest('[data-editor]');if(!editor)return;
    let next=editor.lastElementChild;
    if(!next?.matches('p[data-manual-continuation]')||next.textContent.trim()||next.querySelector('img,[data-manual-image]')){
      next=document.createElement('p');next.dataset.manualContinuation='true';next.append(document.createElement('br'));editor.append(next);
    }
    reserveEditorImageSpace(editor);
    requestAnimationFrame(()=>{
      if(!next.isConnected)return;
      editor.focus();const range=document.createRange();range.selectNodeContents(next);range.collapse(true);
      const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
      selections.set(editor,range.cloneRange());next.scrollIntoView({block:'center'});
    });
    dirty=true;
  }
  function ensureTrailingTextBlock(editor){
    if(!editor.querySelector('.manual-editor-image'))return;
    const last=editor.lastElementChild;
    if(last?.matches('p[data-manual-continuation]')&&!last.textContent.trim()&&!last.querySelector('img,[data-manual-image]'))return;
    const paragraph=document.createElement('p');paragraph.dataset.manualContinuation='true';paragraph.append(document.createElement('br'));editor.append(paragraph);
  }
  function positionContinuations(root,imageSelector){
    const images=[...root.querySelectorAll(imageSelector)];
    root.querySelectorAll('p[data-manual-continuation]').forEach(paragraph=>{
      paragraph.style.marginTop='0px';
      const before=images.filter(image=>Boolean(image.compareDocumentPosition(paragraph)&Node.DOCUMENT_POSITION_FOLLOWING));
      if(!before.length)return;
      const bottom=Math.max(...before.map(image=>image.getBoundingClientRect().bottom));
      paragraph.style.marginTop=Math.max(0,Math.ceil(bottom-paragraph.getBoundingClientRect().top+16))+'px';
    });
  }
  function reserveImageSpace(root){
    requestAnimationFrame(()=>{
      if(!root.isConnected)return;
      root.querySelectorAll('.manual-image-anchor').forEach(anchor=>anchor.style.minHeight='');
      root.style.minHeight='';
      positionContinuations(root,'.manual-inline-image.manual-align-free');
      const images=[...root.querySelectorAll('.manual-align-free')].filter(image=>image.complete&&image.naturalWidth);
      if(images.length){
        const top=root.getBoundingClientRect().top;
        root.style.minHeight=Math.max(0,Math.ceil(Math.max(...images.map(image=>image.getBoundingClientRect().bottom-top+16))))+'px';
      }
    });
  }
  function label(kind) { return kinds.find(entry => entry[0] === kind)?.[1] || kind; }
  function visibleKinds() { return kinds.filter(([kind])=>mode==='manual'?kind==='course':kind==='td'||kind==='corrections'); }
  function safe(html) { return window.MelecContent.sanitize(html); }
  function toolbar(kind) {
    const commands=[['bold','Gras','G'],['italic','Italique','I'],['underline','Souligné','S'],['strikeThrough','Barré','S̶'],['subscript','Indice','x₂'],['superscript','Exposant','x²'],['insertUnorderedList','Puces','• Liste'],['insertOrderedList','Numérotation','1. Liste'],['outdent','Réduire le retrait','⇤'],['indent','Augmenter le retrait','⇥'],['justifyLeft','Aligner à gauche','☷'],['justifyCenter','Centrer','☰'],['justifyRight','Aligner à droite','☷'],['justifyFull','Justifier','▤']];
    const colors=['#173450','#d12d32','#e47713','#147a45','#1669b3','#7b4bad'];
    const highlights=['#fff08a','#ffb8bb','#c2f0ce','#bfe6ff','#e5d7ff'];
    return `<div class="manual-toolbar" role="toolbar" aria-label="Mise en forme ${label(kind)}"><button type="button" data-history="undo" title="Annuler (Ctrl+Z)" disabled>↶ Annuler</button><button type="button" data-history="redo" title="Rétablir (Ctrl+Y)" disabled>↷ Rétablir</button><label>Police<select data-format-select="fontName" aria-label="Police"><option value="">Police</option>${['Arial','Aptos','Calibri','Georgia','Times New Roman','Verdana','Tahoma','Trebuchet MS'].map(font=>`<option value="${font}">${font}</option>`).join('')}</select></label><label>Taille<select data-format-select="fontSize" aria-label="Taille"><option value="">Taille</option>${[['1','10'],['2','12'],['3','14'],['4','16'],['5','18'],['6','24'],['7','32']].map(([value,size])=>`<option value="${value}">${size} pt</option>`).join('')}</select></label>${commands.map(([command,name,symbol])=>`<button type="button" data-format="${command}" title="${name}" aria-label="${name}">${symbol}</button>`).join('')}<label>Interligne<select data-spacing="lineHeight" aria-label="Interligne du paragraphe"><option value="">Interligne</option>${[['1','Serré 1'],['1.15','1,15'],['1.3','1,3'],['1.5','1,5'],['1.8','1,8'],['2','Double 2']].map(([value,text])=>`<option value="${value}">${text}</option>`).join('')}</select></label><label>Après paragraphe<select data-spacing="marginBottom" aria-label="Espace après le paragraphe"><option value="">Espacement</option>${[['0px','Aucun'],['4px','Petit'],['8px','Moyen'],['12px','Grand'],['18px','Très grand']].map(([value,text])=>`<option value="${value}">${text}</option>`).join('')}</select></label><div class="manual-color-group"><span>Texte</span>${colors.map(color=>`<button type="button" class="manual-swatch" data-swatch="foreColor" data-value="${color}" style="--swatch:${color}" aria-label="Texte ${color}"></button>`).join('')}<input type="color" data-color="foreColor" value="#173450" aria-label="Autre couleur du texte"></div><div class="manual-color-group"><span>Surlignage</span>${highlights.map(color=>`<button type="button" class="manual-swatch" data-swatch="hiliteColor" data-value="${color}" style="--swatch:${color}" aria-label="Surlignage ${color}"></button>`).join('')}<input type="color" data-color="hiliteColor" value="#fff08a" aria-label="Autre couleur de surlignage"></div><button type="button" data-table title="Insérer un tableau">▦ Tableau</button><button type="button" data-video title="Insérer une vidéo YouTube ou Vimeo">▶ Vidéo</button></div>`;
  }
  function floatingToolbar(){
    return toolbar(mode==='manual'?'course':'td')
      .replace('class="manual-toolbar"','class="manual-toolbar manual-floating-toolbar"')
      .replace(' disabled>','>').replace(' disabled>','>')
      .replace(/<\/div>$/,'<span class="manual-floating-hint" data-block-hint>Choisissez un bloc de texte</span></div>');
  }
  function selected() {
    return {theme:themes.find(row=>row.id===themeId), chapter:chapters.find(row=>row.id===chapterId), lesson:lessons.find(row=>row.id===lessonId)};
  }
  async function list(table, filter, columns='*') {
    return api.rest(table+'?'+filter+'&select='+columns+'&order=position.asc,created_at.asc');
  }
  async function load(level='all') {
    const ticket=++request;
    const keepView=Boolean(body.querySelector('.manual-manager'));
    if(keepView){body.classList.add('manual-loading');body.setAttribute('aria-busy','true');}
    else body.innerHTML='<div class="teach-card">Chargement du thème sélectionné…</div>';
    try {
      if(level==='all')themes=await list('manual_themes','class_id=eq.'+encodeURIComponent(classId),'id,title,position,published,created_at');
      if(ticket!==request)return;
      if(!themes.some(x=>x.id===themeId)){themeId='';chapterId='';lessonId='';}
      if(level==='all'||level==='theme')chapters=themeId ? await list('manual_chapters','theme_id=eq.'+themeId,'id,theme_id,title,position,published,created_at') : [];
      if(ticket!==request)return;
      if(!chapters.some(x=>x.id===chapterId&&x.theme_id===themeId)){chapterId='';lessonId='';}
      if(level==='all'||level==='theme'||level==='chapter')lessons=chapterId ? await list('manual_lessons','chapter_id=eq.'+chapterId,'id,chapter_id,title,position,published,created_at') : [];
      if(ticket!==request)return;
      if(!lessons.some(x=>x.id===lessonId&&x.chapter_id===chapterId))lessonId='';
      sections=lessonId ? await api.rest('manual_sections?lesson_id=eq.'+lessonId+'&select=id,lesson_id,kind,content_html,published,updated_at') : [];
      if(ticket!==request)return;
      assets=sections.length ? await api.rest('manual_assets?section_id=in.('+sections.map(x=>x.id).join(',')+')&select=id,section_id,object_path,file_name,mime_type,created_at&order=created_at.asc') : [];
      if(ticket!==request)return;
      draw();
      loadedClassId=classId;
      loadedAt=Date.now();
    } catch(error) { if(ticket===request){if(!keepView)body.innerHTML='<div class="teach-card manual-error">Le manuel est indisponible. Vérifiez que son script SQL est installé.</div>';notify(error.message,true);} }
    finally {if(ticket===request){body.classList.remove('manual-loading');body.removeAttribute('aria-busy');}}
  }
  function sectionCard(kind,lesson) {
    const section=sections.find(x=>x.lesson_id===lesson.id&&x.kind===kind);
    const files=section?assets.filter(x=>x.section_id===section.id):[];
    return `<section class="manual-section" data-kind="${kind}" ${mode==='manual-td'&&tdEditorView!==kind?'hidden':''}><div class="manual-section-head"><h4>${label(kind)}</h4><span class="manual-state ${section?.published?'on':''}">${section?.published?'Publié':'Brouillon'}</span></div>
      <p class="teach-help">Ajoutez des blocs dans l’ordre. Après une image ou un PDF, cliquez sur « Ajouter du texte » pour continuer.</p>
      <div class="manual-block-editor" data-block-editor>${window.MelecManualBlocks.parse(section?.content_html||'',files).map(block=>blockCard(block,files)).join('')}</div>
      <div class="manual-block-add"><button type="button" data-add-block="text">＋ Ajouter du texte</button><button type="button" data-add-block="image">＋ Ajouter une image</button><button type="button" data-add-block="pdf">＋ Ajouter un PDF</button><input type="file" data-block-file="image" accept="image/png,image/jpeg,image/webp,image/gif" hidden><input type="file" data-block-file="pdf" accept="application/pdf,.pdf" hidden></div>
      <div class="manual-files">${files.filter(file=>!file.mime_type.startsWith('image/')&&file.mime_type!=='application/pdf').map(file=>`<span class="manual-file-chip"><button type="button" data-download="${file.id}" class="subtle">📎 ${esc(file.file_name)}</button></span>`).join('')}</div>
      ${section?`<div class="manual-section-actions"><button type="button" data-toggle-section="${section.id}" class="subtle">${section.published?'Masquer cette section':'Publier cette section'}</button><button type="button" data-delete-section="${kind}" class="warn">Supprimer ${label(kind).toLowerCase()}</button></div>`:''}</section>`;
  }
  function blockCard(block,files=[]){
    const asset=files.find(file=>file.id===block.id),title=asset?.file_name||'Fichier introuvable';
    const actions=`<div class="manual-block-actions"><button type="button" data-move-block="up" title="Monter ce bloc">↑ Monter</button><button type="button" data-move-block="down" title="Descendre ce bloc">↓ Descendre</button><button type="button" data-remove-block class="warn" title="Supprimer ce bloc">Supprimer</button></div>`;
    if(block.type==='image')return `<div class="manual-content-block" data-block-type="image" data-asset-id="${esc(block.id)}" data-align="${esc(block.align)}" data-width="${window.MelecManualBlocks.clamp(block.width)}"><div class="manual-block-head"><strong>Image · ${esc(title)}</strong>${actions}</div><div class="manual-block-image manual-block-align-${esc(block.align)}"><img data-block-image alt="${esc(title)}"></div><div class="manual-block-options"><label>Alignement <select data-block-align><option value="left" ${block.align==='left'?'selected':''}>Gauche</option><option value="center" ${block.align==='center'?'selected':''}>Centre</option><option value="right" ${block.align==='right'?'selected':''}>Droite</option></select></label><label>Largeur <input type="range" data-block-width min="1" max="100" value="${window.MelecManualBlocks.clamp(block.width)}"><output>${window.MelecManualBlocks.clamp(block.width)} %</output></label></div></div>`;
    if(block.type==='pdf')return `<div class="manual-content-block" data-block-type="pdf" data-asset-id="${esc(block.id)}"><div class="manual-block-head"><strong>PDF · ${esc(title)}</strong>${actions}</div><p>Le document sera consultable dans la leçon, sans bouton de téléchargement.</p><button type="button" data-preview-pdf>Voir le PDF</button><div class="manual-block-pdf-preview" hidden></div></div>`;
    return `<div class="manual-content-block" data-block-type="text"><div class="manual-block-head"><strong>Texte</strong>${actions}</div><div class="manual-block-text" data-block-text contenteditable="true" role="textbox" aria-multiline="true" aria-label="Texte du cours">${safe(block.html||'<p><br></p>')}</div></div>`;
  }
  function blockData(editor){
    return [...editor.querySelectorAll(':scope > [data-block-type]')].map(node=>{
      const type=node.dataset.blockType;
      if(type==='text')return{type,html:node.querySelector('[data-block-text]')?.innerHTML||''};
      if(type==='image')return{type,id:node.dataset.assetId,align:node.dataset.align,width:Number(node.dataset.width)};
      return{type:'pdf',id:node.dataset.assetId};
    });
  }
  async function loadBlockImage(block){
    const asset=assets.find(row=>row.id===block.dataset.assetId),image=block.querySelector('[data-block-image]');
    if(!asset||!image)return;
    image.alt='Chargement de l’image…';
    try{const blob=await teacherImageBlob(asset.object_path);if(!image.isConnected)return;const url=URL.createObjectURL(blob);teacherUrls.push(url);image.src=url;await image.decode();image.alt=asset.file_name;}
    catch{if(image.isConnected)image.alt='Image momentanément indisponible';}
  }
  function styleBlockImage(block){
    const image=block.querySelector('.manual-block-image');if(!image)return;
    image.className='manual-block-image manual-block-align-'+window.MelecManualBlocks.align(block.dataset.align);
    image.style.width=window.MelecManualBlocks.clamp(block.dataset.width)+'%';
  }
  function addTextBlock(editor,after=null){
    const holder=document.createElement('div');holder.innerHTML=blockCard({type:'text',html:'<p><br></p>'});
    const block=holder.firstElementChild;
    if(after?.parentElement===editor)after.after(block);else editor.append(block);
    dirty=true;block.querySelector('[data-block-text]').focus();return block;
  }
  async function addFileBlock(section,kind,file,after=null){
    const record=sections.find(row=>row.lesson_id===lessonId&&row.kind===section.dataset.kind);
    if(!record)throw new Error('Enregistrez d’abord la leçon.');
    const allowed=kind==='image'?['image/png','image/jpeg','image/webp','image/gif']:['application/pdf'];
    const limit=kind==='image'?10:20;
    if(!allowed.includes(file.type)||file.size>limit*1024*1024)throw new Error(`Fichier refusé : ${kind==='image'?'PNG, JPG, WebP ou GIF':'PDF'} de moins de ${limit} Mo requis.`);
    const name=(file.name||`${kind}.${kind==='pdf'?'pdf':'png'}`).replace(/[^a-zA-Z0-9._-]/g,'_');
    const path='manual/'+lessonId+'/'+crypto.randomUUID()+'-'+name;
    await api.upload(path,new File([file],name,{type:file.type}));
    let asset;
    try{
      const created=await api.rest('manual_assets?select=id,section_id,object_path,file_name,mime_type,created_at',{method:'POST',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({section_id:record.id,object_path:path,file_name:file.name||name,mime_type:file.type})});
      asset=created?.[0];if(!asset?.id)throw new Error('Le fichier n’a pas été confirmé.');
    }catch(error){await api.removeFiles([path]).catch(()=>{});throw error;}
    assets.push(asset);
    const editor=section.querySelector('[data-block-editor]'),holder=document.createElement('div');
    holder.innerHTML=blockCard({type:kind,id:asset.id,align:'center',width:60},[asset]);
    const block=holder.firstElementChild;
    if(after?.parentElement===editor)after.after(block);else editor.append(block);
    styleBlockImage(block);if(kind==='image')loadBlockImage(block);
    addTextBlock(editor,block);dirty=true;
  }
  function startBlockUpload(section,kind,file,after=null){
    blockUploadError='';
    const task=addFileBlock(section,kind,file,after).catch(error=>{blockUploadError=error.message;notify(error.message,true);throw error;});
    blockUploads.add(task);task.finally(()=>blockUploads.delete(task)).catch(()=>{});
    task.catch(()=>{});
  }
  function setupBlockEditors(){
    body.querySelectorAll('.manual-section').forEach(section=>{
      const editor=section.querySelector('[data-block-editor]');
      editor.addEventListener('focusin',event=>{const text=event.target.closest('[data-block-text]');if(text){activeBlockText=text;body.querySelector('[data-block-hint]').textContent='Texte sélectionné : '+label(section.dataset.kind);}});
      editor.querySelectorAll('[data-block-type="image"]').forEach(block=>{styleBlockImage(block);loadBlockImage(block);});
      editor.addEventListener('input',event=>{if(event.target.closest('[data-block-text]'))dirty=true;});
      editor.addEventListener('keyup',event=>{const text=event.target.closest('[data-block-text]');if(text)rememberSelection(text);});
      editor.addEventListener('mouseup',event=>{const text=event.target.closest('[data-block-text]');if(text)rememberSelection(text);});
      editor.addEventListener('paste',event=>{
        const text=event.target.closest('[data-block-text]');if(!text)return;
        const file=[...(event.clipboardData?.items||[])].find(item=>item.type.startsWith('image/'))?.getAsFile();
        if(file){event.preventDefault();startBlockUpload(section,'image',file,text.closest('[data-block-type]'));return;}
        if(/<img\b/i.test(event.clipboardData?.getData('text/html')||'')){
          event.preventDefault();notify('L’image copiée ne contient pas de fichier. Enregistrez-la, puis utilisez « Ajouter une image ».',true);
        }
      });
      editor.addEventListener('dragover',event=>{if([...event.dataTransfer?.items||[]].some(item=>item.kind==='file'))event.preventDefault();});
      editor.addEventListener('drop',event=>{
        const file=[...(event.dataTransfer?.files||[])][0];if(!file)return;
        event.preventDefault();const kind=file.type==='application/pdf'?'pdf':'image';
        startBlockUpload(section,kind,file,event.target.closest('[data-block-type]'));
      });
      editor.addEventListener('mousedown',event=>{if(event.target.closest('[data-block-format]'))event.preventDefault();});
      editor.addEventListener('click',event=>{
        const block=event.target.closest('[data-block-type]');if(!block)return;
        const move=event.target.closest('[data-move-block]');
        if(move){const peer=move.dataset.moveBlock==='up'?block.previousElementSibling:block.nextElementSibling;if(peer){if(move.dataset.moveBlock==='up')peer.before(block);else peer.after(block);dirty=true;}return;}
        if(event.target.closest('[data-remove-block]')){if(block.dataset.assetId)removedBlockAssets.add(block.dataset.assetId);block.remove();dirty=true;return;}
        const format=event.target.closest('[data-block-format]');
        if(format){const text=block.querySelector('[data-block-text]'),range=selections.get(text);if(!range)return notify('Sélectionnez d’abord du texte.',true);text.focus();const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);document.execCommand(format.dataset.blockFormat,false,format.dataset.value||null);rememberSelection(text);dirty=true;return;}
        if(event.target.closest('[data-preview-pdf]')){const mount=block.querySelector('.manual-block-pdf-preview');if(!mount.hidden){mount.hidden=true;mount.replaceChildren();return;}const asset=assets.find(row=>row.id===block.dataset.assetId);if(!asset)return;mount.hidden=false;mount.textContent='Chargement du PDF…';api.download(asset.object_path).then(blob=>{if(!mount.isConnected)return;const url=URL.createObjectURL(blob);teacherUrls.push(url);mount.innerHTML=`<iframe title="${esc(asset.file_name)}" src="${url}"></iframe>`;}).catch(error=>{mount.textContent=error.message;});}
      });
      editor.addEventListener('change',event=>{const block=event.target.closest('[data-block-type="image"]');if(!block)return;if(event.target.matches('[data-block-align]'))block.dataset.align=event.target.value;styleBlockImage(block);dirty=true;});
      editor.addEventListener('input',event=>{const block=event.target.closest('[data-block-type="image"]');if(!block||!event.target.matches('[data-block-width]'))return;block.dataset.width=event.target.value;block.querySelector('output').textContent=event.target.value+' %';styleBlockImage(block);dirty=true;});
      section.querySelectorAll('[data-add-block]').forEach(button=>button.onclick=()=>{if(button.dataset.addBlock==='text')addTextBlock(editor);else section.querySelector(`[data-block-file="${button.dataset.addBlock}"]`).click();});
      section.querySelectorAll('[data-block-file]').forEach(input=>input.onchange=()=>{const file=input.files?.[0];if(file)startBlockUpload(section,input.dataset.blockFile,file);input.value='';});
    });
  }
  function rememberSelection(editor) {
    const selection=window.getSelection();
    if(selection?.rangeCount&&editor.contains(selection.getRangeAt(0).commonAncestorContainer))
      selections.set(editor,selection.getRangeAt(0).cloneRange());
  }
  function blockRange(){
    const editor=activeBlockText;
    if(!editor?.isConnected||editor.closest('.manual-section')?.hidden){notify('Cliquez d’abord dans un bloc de texte.',true);return null;}
    let range=selections.get(editor);
    if(!range||!editor.contains(range.commonAncestorContainer)){
      range=document.createRange();range.selectNodeContents(editor);range.collapse(false);
    }
    editor.focus();const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
    return{editor,range};
  }
  function blockCommand(command,value){
    const target=blockRange();if(!target)return;
    document.execCommand(command,false,value??null);
    rememberSelection(target.editor);dirty=true;
  }
  function blockSpacing(property,value){
    if(!value)return;
    const target=blockRange();if(!target)return;
    const nodes=[...target.editor.querySelectorAll('p,div,li,h2,h3,h4,blockquote')].filter(node=>target.range.intersectsNode(node));
    const paragraphs=nodes.filter(node=>!nodes.some(other=>other!==node&&node.contains(other)));
    if(!paragraphs.length){notify('Sélectionnez un paragraphe.',true);return;}
    paragraphs.forEach(node=>node.style[property]=value);dirty=true;
  }
  function setupFloatingToolbar(){
    const tools=body.querySelector('.manual-floating-toolbar');if(!tools)return;
    // Mémoriser la sélection avant que la palette ne prenne le focus.
    tools.addEventListener('pointerdown',()=>{if(activeBlockText?.isConnected)rememberSelection(activeBlockText);},true);
    tools.addEventListener('mousedown',event=>{if(event.target.closest('button'))event.preventDefault();});
    tools.querySelectorAll('[data-format]').forEach(button=>button.onclick=()=>blockCommand(button.dataset.format));
    tools.querySelectorAll('[data-format-select]').forEach(select=>select.onchange=()=>{if(select.value)blockCommand(select.dataset.formatSelect,select.value);select.value='';});
    tools.querySelectorAll('[data-spacing]').forEach(select=>select.onchange=()=>{blockSpacing(select.dataset.spacing,select.value);select.value='';});
    tools.querySelectorAll('[data-swatch]').forEach(button=>button.onclick=()=>blockCommand(button.dataset.swatch,button.dataset.value));
    // "input" est émis pendant l'ouverture du sélecteur de couleurs : cela
    // redonnait immédiatement le focus au texte et interrompait le choix.
    tools.querySelectorAll('[data-color]').forEach(input=>input.onchange=()=>blockCommand(input.dataset.color,input.value));
    tools.querySelectorAll('[data-history]').forEach(button=>button.onclick=()=>blockCommand(button.dataset.history));
    tools.querySelector('[data-table]').onclick=()=>{
      const rows=Number(prompt('Nombre de lignes (1 à 30) :','3'));if(!Number.isInteger(rows)||rows<1||rows>30)return;
      const columns=Number(prompt('Nombre de colonnes (1 à 12) :','3'));if(!Number.isInteger(columns)||columns<1||columns>12)return;
      const cells='<td>Cellule</td>'.repeat(columns);
      blockCommand('insertHTML',`<table><tbody>${`<tr>${cells}</tr>`.repeat(rows)}</tbody></table><p><br></p>`);
    };
    tools.querySelector('[data-video]').onclick=()=>{
      const url=prompt('Adresse HTTPS de la vidéo YouTube ou Vimeo :','');if(!url)return;
      if(!window.MelecContent.videoUrl(url))return notify('Utilisez une adresse HTTPS YouTube ou Vimeo valide.',true);
      const safeUrl=esc(url.trim());blockCommand('insertHTML',`<p><a href="${safeUrl}">▶ Vidéo : ${safeUrl}</a></p><p><br></p>`);
    };
  }
  function formatSelection(control,command,value) {
    const editor=control.closest('.manual-section').querySelector('[data-editor]');
    const range=selections.get(editor);
    if(!range||!editor.contains(range.commonAncestorContainer))return notify('Placez le curseur dans le texte ou sélectionnez du texte.',true);
    editor.focus();
    const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
    document.execCommand(command,false,value??null);
    rememberSelection(editor);dirty=true;recordEdit(editor);
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
    dirty=true;control.value='';recordEdit(editor);
  }
  async function prepareInlineImages(){
    if(inlineCaptureInFlight){
      await inlineCaptureInFlight;
      if([...body.querySelectorAll('[data-editor] img')].some(image=>!image.closest('[data-manual-image]')))
        return prepareInlineImages();
      return;
    }
    inlineCaptureInFlight=(async()=>{
      for(const [kind] of visibleKinds()){
        const editor=body.querySelector(`.manual-section[data-kind="${kind}"] [data-editor]`);
        if(!editor)continue;
        // Une nouvelle image peut être collée pendant l'envoi de la précédente.
        // Rebalayer jusqu'à épuisement évite de perdre la troisième image (ou les suivantes).
        while(true){
          const image=[...editor.querySelectorAll('img')].find(node=>!node.closest('[data-manual-image]'));
          if(!image)break;
          let frame=image.closest('.manual-editor-image');
          if(!frame){frame=document.createElement('span');frame.contentEditable='false';frame.className='manual-editor-image';setImageLayout(frame,'free',25,0,0);image.replaceWith(frame);frame.append(image);anchorFreeImages(editor);ensureTrailingTextBlock(editor);image.addEventListener('load',()=>reserveEditorImageSpace(editor),{once:true});reserveEditorImageSpace(editor);}
          const known=uploadedImageSources.get(image.getAttribute('src'));
          if(known){frame.dataset.manualImage=known;continue;}
          const section=sections.find(row=>row.lesson_id===lessonId&&row.kind===kind);
          if(!section)throw new Error('Enregistrez d’abord la leçon avant de coller une image.');
          const src=image.getAttribute('src')||'';
          if(!/^(data:image\/(?:png|jpeg|webp|gif);base64,|blob:|https:\/\/)/i.test(src))
            throw new Error('Cette image ne peut pas être lue. Collez ou déposez un fichier PNG, JPG, WebP ou GIF directement dans le texte.');
          if(src.length>15_000_000)throw new Error('Image trop volumineuse : utilisez un fichier de moins de 10 Mo.');
          const response=await fetch(src,{credentials:'omit'}).catch(()=>null);
          if(!response?.ok)throw new Error('Lecture de l’image impossible. Essayez de déposer son fichier directement dans le texte.');
          const blob=await response.blob();
          const mime=blob.type.toLowerCase();
          if(!['image/png','image/jpeg','image/webp','image/gif'].includes(mime)||blob.size>10*1024*1024)
            throw new Error('Image non acceptée ou supérieure à 10 Mo.');
          const ext={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif'}[mime];
          const name='image-'+crypto.randomUUID()+'.'+ext;
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
          frame.dataset.manualImage=asset.id;image.alt=image.alt||name;
          uploadedImageSources.set(src,asset.id);
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
    image.classList.add('manual-image-loading');image.alt='';
    try{
      const blob=await teacherImageBlob(asset.object_path);if(!image.isConnected)return;
      if(!blob.size||blob.type&&!blob.type.startsWith('image/'))throw new Error('Fichier image invalide');
      const url=URL.createObjectURL(blob);teacherUrls.push(url);image.src=url;
      await image.decode();if(!image.isConnected)return;
      image.alt=asset.file_name;image.classList.remove('manual-image-loading');
      reserveEditorImageSpace(image.closest('[data-editor]'));
    }
    catch{if(image.isConnected){image.classList.remove('manual-image-loading');image.alt='Image indisponible';}}
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
        if(asset){const frame=document.createElement('span');frame.contentEditable='false';frame.dataset.manualImage=asset.id;frame.className='manual-editor-image';setImageLayout(frame,match[2],match[3],match[4],match[5]);const image=document.createElement('img');image.alt=asset.file_name;frame.append(image);fragment.append(frame);loadTeacherImage(asset,image);}
        else fragment.append(document.createTextNode(match[0]));
        start=pattern.lastIndex;
      }
      fragment.append(document.createTextNode(text.slice(start)));node.replaceWith(fragment);
    });
    anchorFreeImages(editor);ensureTrailingTextBlock(editor);reserveEditorImageSpace(editor);
  }
  function selectedImage(section){return section.querySelector('[data-image-tools]')?.selectedFrame||null;}
  function selectImage(frame){
    const section=frame.closest('.manual-section'),tools=section.querySelector('[data-image-tools]');
    section.querySelectorAll('.manual-editor-image.is-selected').forEach(node=>node.classList.remove('is-selected'));
    frame.classList.add('is-selected');frame.tabIndex=0;frame.focus({preventScroll:true});tools.selectedFrame=frame;tools.hidden=false;
    tools.querySelector('[data-image-width]').value=frame.dataset.imageWidth||'100';
    tools.querySelector('[data-image-size]').textContent=(frame.dataset.imageWidth||'100')+' %';
  }
  function insertClipboardImage(editor,file,dropRange){
    const image=document.createElement('img');image.alt=file.name||'Image collée';image.src=URL.createObjectURL(file);teacherUrls.push(image.src);
    const frame=document.createElement('span');frame.contentEditable='false';frame.className='manual-editor-image';setImageLayout(frame,'free',25,0,0);frame.append(image);
    const selection=window.getSelection(),range=dropRange||selections.get(editor)||selection?.rangeCount&&selection.getRangeAt(0);
    const caretRect=range?.getBoundingClientRect?.();
    if(range&&editor.contains(range.commonAncestorContainer)){
      const at=range.cloneRange();at.deleteContents();at.insertNode(frame);at.setStartAfter(frame);at.collapse(true);
      selection.removeAllRanges();selection.addRange(at);selections.set(editor,at.cloneRange());
    }else{const paragraph=document.createElement('p');paragraph.append(frame);editor.append(paragraph);}
    anchorFreeImages(editor);image.onload=()=>reserveEditorImageSpace(editor);reserveEditorImageSpace(editor);
    if(caretRect){
      const anchor=frame.offsetParent,rect=anchor?.getBoundingClientRect();
      if(rect?.width)setImageLayout(frame,'free',25,(caretRect.left-rect.left)*100/rect.width,(caretRect.top-rect.top)+anchor.scrollTop);
    }
    ensureTrailingTextBlock(editor);
    reserveEditorImageSpace(editor);
    writeBelowImage(frame);
    dirty=true;recordEdit(editor);
  }
  function draw() {
    teacherUrls.forEach(URL.revokeObjectURL);teacherUrls=[];
    dirty=false;removedBlockAssets.clear();blockUploadError='';activeBlockText=null;
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
    body.querySelector('.manual-lesson')?.insertAdjacentHTML('beforeend',floatingToolbar());
    body.querySelector('#manualTheme').onchange=e=>{if(dirty&&!confirm('Quitter cette leçon sans enregistrer vos modifications ?')){e.target.value=themeId;return;}themeId=e.target.value;chapterId='';lessonId='';load('theme');};
    body.querySelector('#manualAddTheme').onclick=()=>create('theme');
    body.querySelector('#manualRenameTheme')?.addEventListener('click',()=>rename('manual_themes',theme.id,body.querySelector('#manualThemeTitle').value));
    body.querySelector('#manualToggleTheme')?.addEventListener('click',()=>update('manual_themes',theme.id,{published:!theme.published},theme.published?'Thème masqué.':'Thème publié.'));
    body.querySelector('#manualDeleteTheme')?.addEventListener('click',()=>removeContent('theme'));
    body.querySelector('#manualChapter')?.addEventListener('change',e=>{if(dirty&&!confirm('Quitter cette leçon sans enregistrer vos modifications ?')){e.target.value=chapterId;return;}chapterId=e.target.value;lessonId='';load('chapter');});
    body.querySelector('#manualAddChapter')?.addEventListener('click',()=>create('chapter'));
    body.querySelector('#manualRenameChapter')?.addEventListener('click',()=>rename('manual_chapters',chapter.id,body.querySelector('#manualChapterTitle').value));
    body.querySelector('#manualToggleChapter')?.addEventListener('click',()=>update('manual_chapters',chapter.id,{published:!chapter.published},chapter.published?'Chapitre masqué.':'Chapitre publié.'));
    body.querySelector('#manualDeleteChapter')?.addEventListener('click',()=>removeContent('chapter'));
    body.querySelector('#manualLesson')?.addEventListener('change',e=>{if(dirty&&!confirm('Quitter cette leçon sans enregistrer vos modifications ?')){e.target.value=lessonId;return;}lessonId=e.target.value;load('lesson');});
    body.querySelector('#manualAddLesson')?.addEventListener('click',()=>create('lesson'));
    if(!lesson)return;
    body.querySelector('#manualDeleteLesson').onclick=()=>removeContent('lesson');
    body.querySelectorAll('[data-delete-section]').forEach(button=>button.onclick=()=>removeContent('section',button.dataset.deleteSection));
    body.querySelectorAll('[data-teacher-part]').forEach(button=>button.onclick=()=>{
      tdEditorView=button.dataset.teacherPart;
      body.querySelectorAll('[data-teacher-part]').forEach(item=>item.classList.toggle('active',item===button));
      body.querySelectorAll('.manual-section').forEach(section=>section.hidden=section.dataset.kind!==tdEditorView);
    });
    body.querySelector('#manualLessonTitle').addEventListener('input',()=>{dirty=true;});
    setupBlockEditors();
    setupFloatingToolbar();
    body.querySelectorAll('[data-editor],#manualLessonTitle').forEach(node=>node.addEventListener('input',()=>{dirty=true;node.querySelectorAll?.('.manual-write-below').forEach(p=>{if(p.textContent.trim())p.classList.remove('manual-write-below');});if(node.matches('[data-editor]')){reserveEditorImageSpace(node);recordEdit(node,true);}}));
    body.querySelectorAll('[data-editor]').forEach(editor=>{
      ['keyup','pointerup','touchend','focusout'].forEach(name=>editor.addEventListener(name,()=>rememberSelection(editor)));
      hydrateTeacherImages(editor);
      editorHistories.set(editor,{items:[editor.innerHTML],index:0,typing:false,lastTyped:0});
      editor.addEventListener('keydown',event=>{
        if(event.key==='Escape'){
          const section=editor.closest('.manual-section');
          section.querySelectorAll('[data-image-tools],[data-table-tools]').forEach(tools=>tools.hidden=true);
          section.querySelectorAll('.is-selected').forEach(node=>node.classList.remove('is-selected'));
          return;
        }
        if(['Delete','Backspace'].includes(event.key)&&event.target.matches('.manual-editor-image.is-selected')){
          event.preventDefault();editor.closest('.manual-section').querySelector('[data-image-remove]').click();return;
        }
        if((event.ctrlKey||event.metaKey)&&!event.altKey&&['z','y'].includes(event.key.toLowerCase())){
          event.preventDefault();travelHistory(editor,event.key.toLowerCase()==='y'||event.shiftKey?1:-1);
        }
      });
      editor.addEventListener('click',event=>{
        const frame=event.target.closest('.manual-editor-image');if(frame&&editor.contains(frame)){selectImage(frame);return;}
        const table=event.target.closest('table');if(table&&editor.contains(table)){
          const tools=editor.closest('.manual-section').querySelector('[data-table-tools]');
          editor.querySelectorAll('table.is-selected').forEach(node=>node.classList.remove('is-selected'));
          table.classList.add('is-selected');tools.selectedTable=table;tools.hidden=false;
        }
      });
      editor.addEventListener('pointerdown',event=>{
        const writing=event.target.closest('.manual-write-below');
        if(writing&&editor.contains(writing)){
          event.preventDefault();editor.focus();const range=document.createRange();range.selectNodeContents(writing);range.collapse(true);
          const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);selections.set(editor,range.cloneRange());return;
        }
        const frame=event.target.closest('.manual-editor-image');if(!frame||!editor.contains(frame))return;
        event.preventDefault();selectImage(frame);
        const anchor=frame.offsetParent,baseX=Number(frame.dataset.imageX)||0,baseY=Number(frame.dataset.imageY)||0,startX=event.clientX,startY=event.clientY;
        frame.setPointerCapture(event.pointerId);
        const move=next=>{
          const width=anchor?.getBoundingClientRect().width||editor.clientWidth;
          setImageLayout(frame,'free',frame.dataset.imageWidth,baseX+(next.clientX-startX)*100/width,baseY+next.clientY-startY);
          reserveEditorImageSpace(editor);
          dirty=true;
        };
        const stop=()=>{frame.removeEventListener('pointermove',move);frame.removeEventListener('pointerup',stop);frame.removeEventListener('pointercancel',stop);recordEdit(editor);};
        frame.addEventListener('pointermove',move);frame.addEventListener('pointerup',stop);frame.addEventListener('pointercancel',stop);
      });
      editor.addEventListener('paste',event=>{
        const item=[...(event.clipboardData?.items||[])].find(item=>item.type.startsWith('image/'));
        if(item){
          const file=item.getAsFile();if(file){event.preventDefault();insertClipboardImage(editor,file);}
        }
        setTimeout(()=>prepareInlineImages().catch(error=>notify(error.message,true)),0);
      });
      editor.addEventListener('dragover',event=>{if([...event.dataTransfer?.items||[]].some(item=>item.kind==='file'&&item.type.startsWith('image/')))event.preventDefault();});
      editor.addEventListener('drop',event=>{
        const file=[...event.dataTransfer?.files||[]].find(file=>file.type.startsWith('image/'));if(!file)return;
        event.preventDefault();
        const range=document.caretRangeFromPoint?.(event.clientX,event.clientY)||null;
        insertClipboardImage(editor,file,range&&editor.contains(range.commonAncestorContainer)?range:null);
        prepareInlineImages().catch(error=>notify(error.message,true));
      });
    });
    body.querySelectorAll('[data-image-tools]').forEach(tools=>{
      tools.querySelector('[data-image-close]').onclick=()=>{tools.selectedFrame?.classList.remove('is-selected');tools.selectedFrame=null;tools.hidden=true;};
      tools.querySelectorAll('[data-image-align]').forEach(button=>button.onclick=()=>{const frame=selectedImage(tools.closest('.manual-section'));if(!frame?.isConnected)return;const width=Number(frame.dataset.imageWidth)||25;const x=button.dataset.imageAlign==='left'?0:button.dataset.imageAlign==='right'?100-width:(100-width)/2;setImageLayout(frame,'free',width,x,frame.dataset.imageY);anchorFreeImages(frame.closest('[data-editor]'));reserveEditorImageSpace(frame.closest('[data-editor]'));dirty=true;recordEdit(frame.closest('[data-editor]'));});
      tools.querySelector('[data-image-width]').oninput=event=>{const frame=selectedImage(tools.closest('.manual-section'));if(!frame?.isConnected)return;setImageLayout(frame,'free',event.target.value,frame.dataset.imageX,frame.dataset.imageY);anchorFreeImages(frame.closest('[data-editor]'));reserveEditorImageSpace(frame.closest('[data-editor]'));tools.querySelector('[data-image-size]').textContent=frame.dataset.imageWidth+' %';dirty=true;};
      tools.querySelector('[data-image-width]').onchange=()=>{const frame=selectedImage(tools.closest('.manual-section'));if(frame?.isConnected)recordEdit(frame.closest('[data-editor]'));};
      tools.querySelector('[data-write-below]').onclick=()=>{const frame=selectedImage(tools.closest('.manual-section'));if(frame?.isConnected)writeBelowImage(frame);};
      tools.querySelector('[data-image-remove]').onclick=()=>{const frame=selectedImage(tools.closest('.manual-section'));if(frame?.isConnected){const editor=frame.closest('[data-editor]'),anchor=frame.parentElement;frame.remove();if(anchor?.classList.contains('manual-image-anchor')&&!anchor.textContent.trim()&&!anchor.querySelector('img'))anchor.remove();reserveEditorImageSpace(editor);dirty=true;recordEdit(editor);}tools.selectedFrame=null;tools.hidden=true;};
    });
    body.querySelectorAll('[data-table-tools]').forEach(tools=>{
      tools.querySelector('[data-table-close]').onclick=()=>{tools.selectedTable?.classList.remove('is-selected');tools.selectedTable=null;tools.hidden=true;};
      tools.querySelector('[data-table-remove]').onclick=()=>{
        const table=tools.selectedTable;if(!table?.isConnected)return;
        const editor=table.closest('[data-editor]');table.remove();tools.selectedTable=null;tools.hidden=true;
        dirty=true;recordEdit(editor);editor.focus();
      };
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
    const editor=body.querySelector(`.manual-section[data-kind="${kind}"] [data-block-editor]`);
    return editor?window.MelecManualBlocks.serialize(blockData(editor)):'';
  }
  async function persistEditor(){
    const title=body.querySelector('#manualLessonTitle').value.trim();if(!title)throw new Error('Donnez un titre à la leçon.');
    const uploaded=await Promise.allSettled([...blockUploads]);
    if(uploaded.some(result=>result.status==='rejected')||blockUploadError)throw new Error(blockUploadError||'Un fichier n’a pas été ajouté. Corrigez l’erreur avant d’enregistrer.');
    const current=selected().lesson;
    await api.rest('manual_lessons?id=eq.'+current.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({title,updated_at:new Date().toISOString()})});
    for(const [kind] of visibleKinds()){
      let section=sections.find(x=>x.lesson_id===current.id&&x.kind===kind);
      const payload={content_html:editorHtml(kind),updated_at:new Date().toISOString()};
      if(section)await api.rest('manual_sections?id=eq.'+section.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      else await api.rest('manual_sections',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,lesson_id:current.id,kind})});
    }
    for(const id of removedBlockAssets){
      if(body.querySelector(`[data-asset-id="${id}"]`))continue;
      const asset=assets.find(row=>row.id===id);if(!asset)continue;
      await api.rest('manual_assets?id=eq.'+encodeURIComponent(id)+'&section_id=eq.'+encodeURIComponent(asset.section_id),{method:'DELETE'});
      await api.removeFiles([asset.object_path]);
      assets=assets.filter(row=>row.id!==id);
    }
    removedBlockAssets.clear();
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
  async function previewBlockLesson(){
    const title=body.querySelector('#manualLessonTitle').value.trim()||selected().lesson.title;
    const dialog=document.createElement('dialog');dialog.className='manual-preview';
    const markup=visibleKinds().map(([kind,name])=>{
      const editor=body.querySelector(`.manual-section[data-kind="${kind}"] [data-block-editor]`);
      const blocks=editor?blockData(editor):[];
      return `<section><h3>${name}</h3><div class="manual-preview-blocks">${blocks.map(block=>{
        if(block.type==='text')return `<div class="manual-preview-text">${safe(block.html)}</div>`;
        const asset=assets.find(row=>row.id===block.id);
        if(block.type==='image')return `<figure class="manual-view-image manual-view-align-${window.MelecManualBlocks.align(block.align)}" style="width:${window.MelecManualBlocks.clamp(block.width)}%"><img data-preview-image="${esc(block.id)}" alt="${esc(asset?.file_name||'Image')}"></figure>`;
        return `<div class="manual-view-pdf"><strong>📄 ${esc(asset?.file_name||'PDF')}</strong><button type="button" data-preview-pdf="${esc(block.id)}">Lire le PDF</button><div data-preview-pdf-mount></div></div>`;
      }).join('')}</div></section>`;
    }).join('');
    dialog.innerHTML=`<div class="manual-preview-head"><h2>${esc(title)}</h2><button type="button" data-close>Fermer</button></div>${markup}`;
    const urls=[];document.body.append(dialog);dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.onclose=()=>{urls.forEach(URL.revokeObjectURL);dialog.remove();};dialog.showModal();
    dialog.querySelectorAll('[data-preview-image]').forEach(async image=>{
      const asset=assets.find(row=>row.id===image.dataset.previewImage);if(!asset)return;
      const existing=body.querySelector(`[data-asset-id="${asset.id}"] [data-block-image]`);
      if(existing?.complete&&existing.naturalWidth){image.src=existing.src;return;}
      try{const blob=await teacherImageBlob(asset.object_path);if(!image.isConnected)return;const url=URL.createObjectURL(blob);urls.push(url);image.src=url;}catch{image.alt='Image indisponible';}
    });
    dialog.querySelectorAll('[data-preview-pdf]').forEach(button=>button.onclick=async()=>{
      const mount=button.closest('.manual-view-pdf').querySelector('[data-preview-pdf-mount]');
      if(mount.childElementCount){mount.replaceChildren();return;}
      const asset=assets.find(row=>row.id===button.dataset.previewPdf);if(!asset)return;
      mount.textContent='Chargement du PDF…';
      try{const blob=await api.download(asset.object_path);if(!mount.isConnected)return;const url=URL.createObjectURL(blob);urls.push(url);mount.innerHTML=`<iframe title="${esc(asset.file_name)}" src="${url}"></iframe>`;}
      catch(error){mount.textContent=error.message;}
    });
  }
  async function preview(){
    return previewBlockLesson();
    try{await prepareInlineImages();}
    catch(error){notify(error.message,true);return;}
    const lesson=selected().lesson, title=body.querySelector('#manualLessonTitle').value.trim()||lesson.title;
    const dialog=document.createElement('dialog');dialog.className='manual-preview';
    dialog.innerHTML=`<div class="manual-preview-head"><h2>${esc(title)}</h2><button type="button" data-close>Fermer</button></div>${visibleKinds().map(([kind,name])=>{const sec=sections.find(x=>x.lesson_id===lesson.id&&x.kind===kind),html=editorHtml(kind),attached=assets.filter(x=>x.section_id===sec?.id);return `<section data-preview-section="${sec?.id||''}"><h3>${name}</h3><div class="manual-preview-content">${html||'<p>Section vide.</p>'}</div>${attached.filter(x=>!x.mime_type.startsWith('image/')).map(x=>`<button type="button" data-preview-file="${x.id}" class="subtle">📎 ${esc(x.file_name)}</button>`).join('')}</section>`}).join('')}`;
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
        const pattern=imagePattern(),text=node.textContent;if(!pattern.test(text))return;pattern.lastIndex=0;
        const replacement=document.createDocumentFragment();let start=0,match;
        while((match=pattern.exec(text))){
          replacement.append(document.createTextNode(text.slice(start,match.index)));
          const asset=assets.find(a=>a.id===match[1]&&a.section_id===section.dataset.previewSection&&a.mime_type.startsWith('image/'));
          if(asset){const image=document.createElement('img');image.alt=asset.file_name;image.className='manual-inline-image';setImageLayout(image,match[2],match[3],match[4],match[5]);replacement.append(image);
            teacherImageBlob(asset.object_path).then(blob=>{if(!image.isConnected)return;const url=URL.createObjectURL(blob);urls.push(url);image.onload=()=>reserveImageSpace(mount);image.src=url;}).catch(()=>{if(image.isConnected)image.alt='Image indisponible';});}
          else replacement.append(document.createTextNode(match[0]));start=pattern.lastIndex;
        }
        replacement.append(document.createTextNode(text.slice(start)));node.replaceWith(replacement);
      });
      anchorFreeImages(mount);
    });
  }
  window.MelecManualTeacher={canLeave(){return !dirty||confirm('Quitter la leçon sans enregistrer vos modifications ?');},resetSelection(){themeId='';chapterId='';lessonId='';dirty=false;},render(nextBody,nextClassId,nextNotify,nextMode='manual'){
    body=nextBody;notify=nextNotify;mode=nextMode;
    if(classId!==nextClassId){classId=nextClassId;themeId='';chapterId='';lessonId='';loadedAt=0;imageBlobs.clear();imageCacheBytes=0;}
    if(!classId){body.innerHTML='<div class="teach-card">Choisissez une classe pour créer son manuel.</div>';return;}
    if(loadedClassId===classId&&Date.now()-loadedAt<15000&&!busy){draw();return;}
    load();
  }};
})();
