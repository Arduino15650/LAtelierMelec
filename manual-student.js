(function () {
  'use strict';
  const api=window.MelecPortal, esc=api.escapeHtml;
  let themes=[],chapters=[],lessons=[],sections=[],assets=[],selectedId='',classId='',epoch=0,objectUrls=[],pdfCleanups=[],mode='manual',tdView='td';
  const target=()=>document.getElementById(mode==='manual'?'studentManualContent':'studentTdContent');
  ['studentManualPane','studentTdPane'].forEach(id=>{
    const pane=document.getElementById(id);
    ['copy','cut','contextmenu','dragstart','selectstart'].forEach(name=>pane?.addEventListener(name,event=>{
      if(event.target.closest('.manual-lesson-page, .manual-toc'))event.preventDefault();
    }));
  });
  function cleanup(){pdfCleanups.forEach(close=>close());pdfCleanups=[];objectUrls.forEach(URL.revokeObjectURL);objectUrls=[];}
  async function load(nextClassId,nextMode='manual'){
    if(!nextClassId)return;
    const ticket=++epoch;classId=nextClassId;mode=nextMode;tdView='td';selectedId='';cleanup();
    target().innerHTML='<p>Chargement des contenus…</p>';
    try{
      [themes,chapters,lessons,sections,assets]=await Promise.all([
        api.rest('manual_themes?class_id=eq.'+encodeURIComponent(classId)+'&published=is.true&select=id,title,position&order=position.asc,created_at.asc'),
        api.rest('manual_chapters?published=is.true&select=id,theme_id,title,position&order=position.asc,created_at.asc'),
        api.rest('manual_lessons?published=is.true&select=id,chapter_id,title,position&order=position.asc,created_at.asc'),
        api.rest('manual_sections?published=is.true&select=id,lesson_id,kind,content_html'),
        api.rest('manual_assets?select=id,section_id,object_path,file_name,mime_type')
      ]);
      if(ticket!==epoch)return;
      // L'ordre précédent/suivant suit le sommaire (thème > chapitre > leçon),
      // et non la seule position de la leçon dans toute la base.
      const themeOrder=new Map(themes.map((theme,index)=>[theme.id,index]));
      chapters.sort((a,b)=>(themeOrder.get(a.theme_id)??Infinity)-(themeOrder.get(b.theme_id)??Infinity)||a.position-b.position);
      const chapterOrder=new Map(chapters.map((chapter,index)=>[chapter.id,index]));
      lessons.sort((a,b)=>(chapterOrder.get(a.chapter_id)??Infinity)-(chapterOrder.get(b.chapter_id)??Infinity)||a.position-b.position);
      const available=availableLessons();
      if(!available.some(x=>x.id===selectedId))selectedId=available[0]?.id||'';
      draw();
    }catch(error){if(ticket===epoch)target().textContent='Contenu indisponible : '+error.message;}
  }
  function availableLessons(){return lessons.filter(lesson=>sections.some(section=>section.lesson_id===lesson.id&&(mode==='manual'?section.kind==='course':['td','corrections'].includes(section.kind))));}
  function draw(){
    cleanup();const host=target();
    const available=availableLessons();
    if(!available.length){host.innerHTML='<p>Aucun contenu publié pour votre classe dans cette rubrique.</p>';return;}
    if(!available.some(lesson=>lesson.id===selectedId))selectedId=available[0].id;
    const index=available.findIndex(x=>x.id===selectedId),lesson=available[index];
    host.innerHTML=`<div class="manual-reader"><details class="manual-toc" ${matchMedia('(min-width: 801px)').matches?'open':''}><summary>${mode==='manual'?'Sommaire du manuel':'Sommaire des TD'}</summary><nav aria-label="Sommaire des leçons">${themes.map(theme=>`<div class="manual-toc-theme"><strong>${esc(theme.title)}</strong>${chapters.filter(c=>c.theme_id===theme.id).map(ch=>`<div class="manual-toc-chapter"><span>${esc(ch.title)}</span>${available.filter(l=>l.chapter_id===ch.id).map(l=>`<button type="button" data-lesson="${l.id}" ${l.id===selectedId?'aria-current="page"':''}>${esc(l.title)}</button>`).join('')}</div>`).join('')}</div>`).join('')}</nav></details>
      <article class="manual-lesson-page"><p class="manual-breadcrumb">${esc(themes.find(t=>t.id===chapters.find(c=>c.id===lesson.chapter_id)?.theme_id)?.title||'')} · ${esc(chapters.find(c=>c.id===lesson.chapter_id)?.title||'')}</p><h2>${esc(lesson.title)}</h2>
        ${mode==='td'?`<nav class="manual-td-submenu" aria-label="Travaux dirigés"><button type="button" data-td-view="td" class="${tdView==='td'?'active':''}">Travaux dirigés</button><button type="button" data-td-view="corrections" class="${tdView==='corrections'?'active':''}">Correction des TD</button></nav>`:''}
        ${[[mode==='manual'?'course':tdView,mode==='manual'?'Cours':tdView==='td'?'Travaux dirigés':'Correction des TD']].map(([kind,name])=>{const sec=sections.find(s=>s.lesson_id===lesson.id&&s.kind===kind);if(!sec)return'<p>Cette partie n’est pas encore publiée.</p>';return `<section class="manual-reading-section" data-section="${sec.id}"><h3>${name}</h3><div class="manual-reading-html">${window.MelecContent.sanitize(sec.content_html||'')||'<p>Aucun texte pour cette section.</p>'}</div><div class="manual-reading-files">${assets.filter(a=>a.section_id===sec.id).map(a=>a.mime_type.startsWith('image/')?`<div class="manual-reading-file manual-image-file" data-image-file="${a.id}"><div class="manual-file-preview"></div></div>`:a.mime_type==='application/pdf'?`<div class="manual-reading-file"><span>📄 ${esc(a.file_name)}</span><button type="button" data-open="${a.id}">Lire le PDF</button><div class="manual-file-preview" data-preview="${a.id}"></div></div>`:`<p class="manual-file-unavailable">${esc(a.file_name)} : consultez l’enseignant pour une version lisible en ligne.</p>`).join('')}</div></section>`}).join('')}
        <nav class="manual-next-prev" aria-label="Navigation entre les leçons"><button type="button" data-adjacent="${index-1}" ${index===0?'disabled':''}>← Leçon précédente</button><span>${index+1} / ${available.length}</span><button type="button" data-adjacent="${index+1}" ${index===available.length-1?'disabled':''}>Leçon suivante →</button></nav></article></div>`;
    host.querySelectorAll('[data-lesson]').forEach(button=>button.onclick=()=>openLesson(button.dataset.lesson));
    host.querySelectorAll('[data-adjacent]').forEach(button=>button.onclick=()=>openLesson(available[Number(button.dataset.adjacent)]?.id));
    host.querySelectorAll('[data-td-view]').forEach(button=>button.onclick=()=>{tdView=button.dataset.tdView;draw();});
    host.querySelectorAll('[data-open]').forEach(button=>button.onclick=()=>openFile(assets.find(x=>x.id===button.dataset.open)));
    host.querySelectorAll('[data-section]').forEach(section=>hydrateSection(section));
  }
  function hydrateSection(section){
    const html=section.querySelector('.manual-reading-html');
    html.querySelectorAll('a[href]').forEach(link=>{
      const url=window.MelecContent.videoUrl(link.href);
      if(!url)return;
      const frame=document.createElement('iframe');frame.src=url;frame.loading='lazy';
      frame.title='Vidéo intégrée';frame.allow='fullscreen; picture-in-picture';frame.referrerPolicy='strict-origin-when-cross-origin';
      link.replaceWith(frame);
    });
    const walker=document.createTreeWalker(html,NodeFilter.SHOW_TEXT);
    const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
    nodes.forEach(node=>{
      const text=node.textContent,pattern=/\[\[image:([0-9a-f-]{36})\]\]/gi;
      if(!pattern.test(text))return;pattern.lastIndex=0;
      const replacement=document.createDocumentFragment();let start=0,match;
      while((match=pattern.exec(text))){
        replacement.append(document.createTextNode(text.slice(start,match.index)));
        const asset=assets.find(a=>a.id===match[1]&&a.section_id===section.dataset.section&&a.mime_type.startsWith('image/'));
        if(asset){const image=document.createElement('img');image.alt=asset.file_name;image.className='manual-inline-image';replacement.append(image);loadImage(asset,image);}
        else replacement.append(document.createTextNode(match[0]));
        start=pattern.lastIndex;
      }
      replacement.append(document.createTextNode(text.slice(start)));node.replaceWith(replacement);
    });
    section.querySelectorAll('[data-image-file]').forEach(card=>{
      const imageAsset=assets.find(a=>a.id===card.dataset.imageFile&&a.mime_type.startsWith('image/'));
      if(imageAsset&&!html.querySelector(`img[data-asset="${imageAsset.id}"]`)){
        const image=document.createElement('img');image.alt=imageAsset.file_name;image.className='manual-inline-image';
        card.querySelector('.manual-file-preview').append(image);loadImage(imageAsset,image);
      }
    });
  }
  async function loadImage(asset,image){
    image.dataset.asset=asset.id;
    try{const blob=await api.download(asset.object_path);if(!image.isConnected)return;const url=URL.createObjectURL(blob);objectUrls.push(url);image.src=url;}
    catch{if(image.isConnected)image.replaceWith(document.createTextNode('Image indisponible.'));}
  }
  function openLesson(id){if(!id||id===selectedId)return;selectedId=id;draw();target().scrollIntoView({block:'start',behavior:'smooth'});}
  async function openFile(asset){
    if(!asset||asset.mime_type!=='application/pdf')return;const mount=target().querySelector(`[data-preview="${asset.id}"]`);if(!mount)return;
    if(mount.childElementCount){mount.replaceChildren();return;}
    mount.textContent='Chargement…';
    try{
      const blob=await api.download(asset.object_path);if(!mount.isConnected)return;
      const close=await window.MelecStudentPdf.render(blob,mount,()=>mount.isConnected&&document.getElementById('studentTpPane').hidden);
      pdfCleanups.push(close);
    }catch(error){mount.textContent=error.message;}
  }
  window.MelecManualStudent={load,clear(){epoch++;cleanup();['studentManualContent','studentTdContent'].forEach(id=>document.getElementById(id)?.replaceChildren());}};
})();
