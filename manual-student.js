(function () {
  'use strict';
  const api=window.MelecPortal, esc=api.escapeHtml;
  const kinds=[['course','Cours'],['td','Travaux dirigés'],['corrections','Corrections des TD']];
  let themes=[],chapters=[],lessons=[],sections=[],assets=[],selectedId='',classId='',epoch=0,objectUrls=[];
  const target=()=>document.getElementById('studentManualContent');
  const readingPane=document.getElementById('studentManualPane');
  ['copy','cut','contextmenu','dragstart','selectstart'].forEach(name=>readingPane?.addEventListener(name,event=>{
    if(event.target.closest('.manual-lesson-page, .manual-toc'))event.preventDefault();
  }));
  function cleanup(){objectUrls.forEach(URL.revokeObjectURL);objectUrls=[];}
  async function load(nextClassId){
    if(!nextClassId)return;
    const ticket=++epoch;classId=nextClassId;cleanup();
    target().innerHTML='<p>Chargement du manuel…</p>';
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
      if(!lessons.some(x=>x.id===selectedId))selectedId=lessons[0]?.id||'';
      draw();
    }catch(error){if(ticket===epoch)target().textContent='Manuel indisponible : '+error.message;}
  }
  function draw(){
    cleanup();const host=target();
    if(!lessons.length){host.innerHTML='<p>Aucune leçon publiée pour votre classe pour le moment.</p>';return;}
    const index=lessons.findIndex(x=>x.id===selectedId),lesson=lessons[index];
    host.innerHTML=`<div class="manual-reader"><details class="manual-toc" ${matchMedia('(min-width: 801px)').matches?'open':''}><summary>Sommaire du manuel</summary><nav aria-label="Sommaire du manuel">${themes.map(theme=>`<div class="manual-toc-theme"><strong>${esc(theme.title)}</strong>${chapters.filter(c=>c.theme_id===theme.id).map(ch=>`<div class="manual-toc-chapter"><span>${esc(ch.title)}</span>${lessons.filter(l=>l.chapter_id===ch.id).map(l=>`<button type="button" data-lesson="${l.id}" ${l.id===selectedId?'aria-current="page"':''}>${esc(l.title)}</button>`).join('')}</div>`).join('')}</div>`).join('')}</nav></details>
      <article class="manual-lesson-page"><p class="manual-breadcrumb">${esc(themes.find(t=>t.id===chapters.find(c=>c.id===lesson.chapter_id)?.theme_id)?.title||'')} · ${esc(chapters.find(c=>c.id===lesson.chapter_id)?.title||'')}</p><h2>${esc(lesson.title)}</h2>
        ${kinds.map(([kind,name])=>{const sec=sections.find(s=>s.lesson_id===lesson.id&&s.kind===kind);if(!sec)return'';return `<section class="manual-reading-section" data-section="${sec.id}"><h3>${name}</h3><div class="manual-reading-html">${window.MelecContent.sanitize(sec.content_html||'')||'<p>Aucun texte pour cette section.</p>'}</div><div class="manual-reading-files">${assets.filter(a=>a.section_id===sec.id).map(a=>`<div class="manual-reading-file"><span>📎 ${esc(a.file_name)}</span><div><button type="button" data-open="${a.id}">Consulter</button><button type="button" data-download="${a.id}">Télécharger</button></div><div class="manual-file-preview" data-preview="${a.id}"></div></div>`).join('')}</div></section>`}).join('')||'<p>Cette leçon ne comporte pas encore de section publiée.</p>'}
        <nav class="manual-next-prev" aria-label="Navigation entre les leçons"><button type="button" data-adjacent="${index-1}" ${index===0?'disabled':''}>← Leçon précédente</button><span>${index+1} / ${lessons.length}</span><button type="button" data-adjacent="${index+1}" ${index===lessons.length-1?'disabled':''}>Leçon suivante →</button></nav></article></div>`;
    host.querySelectorAll('[data-lesson]').forEach(button=>button.onclick=()=>openLesson(button.dataset.lesson));
    host.querySelectorAll('[data-adjacent]').forEach(button=>button.onclick=()=>openLesson(lessons[Number(button.dataset.adjacent)]?.id));
    host.querySelectorAll('[data-download]').forEach(button=>button.onclick=()=>download(assets.find(x=>x.id===button.dataset.download)));
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
    section.querySelectorAll('.manual-reading-file').forEach(card=>{
      const imageAsset=assets.find(a=>a.id===card.querySelector('[data-open]')?.dataset.open&&a.mime_type.startsWith('image/'));
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
  async function download(asset){
    if(!asset)return;
    try{const blob=await api.download(asset.object_path),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=asset.file_name;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
    catch(error){alert(error.message);}
  }
  async function openFile(asset){
    if(!asset)return;const mount=target().querySelector(`[data-preview="${asset.id}"]`);if(!mount)return;
    if(mount.childElementCount){mount.replaceChildren();return;}
    mount.textContent='Chargement…';
    try{
      const blob=await api.download(asset.object_path);if(!mount.isConnected)return;
      const url=URL.createObjectURL(blob);objectUrls.push(url);mount.replaceChildren();
      if(asset.mime_type.startsWith('image/')){const image=document.createElement('img');image.src=url;image.alt=asset.file_name;mount.append(image);}
      else if(asset.mime_type==='application/pdf'){const frame=document.createElement('iframe');frame.src=url+'#toolbar=0';frame.title=asset.file_name;frame.loading='lazy';mount.append(frame);}
      else{mount.textContent='Ce document bureautique peut être téléchargé et ouvert sur votre appareil.';}
    }catch(error){mount.textContent=error.message;}
  }
  window.MelecManualStudent={load,clear(){epoch++;cleanup();if(target())target().replaceChildren();}};
})();
