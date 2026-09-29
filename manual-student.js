(function () {
  'use strict';
  const api=window.MelecPortal, esc=api.escapeHtml;
  const kinds=[['course','Cours'],['td','Travaux dirigés'],['exercises','Exercices'],['corrections','Corrections']];
  let themes=[],chapters=[],lessons=[],sections=[],assets=[],selectedId='',classId='',epoch=0,objectUrls=[];
  const target=()=>document.getElementById('studentManualContent');
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
      if(!lessons.some(x=>x.id===selectedId))selectedId=lessons[0]?.id||'';
      draw();
    }catch(error){if(ticket===epoch)target().textContent='Manuel indisponible : '+error.message;}
  }
  function draw(){
    cleanup();const host=target();
    if(!lessons.length){host.innerHTML='<p>Aucune leçon publiée pour votre classe pour le moment. Les anciens cours et TD restent accessibles dans leur menu.</p>';return;}
    const index=lessons.findIndex(x=>x.id===selectedId),lesson=lessons[index];
    host.innerHTML=`<div class="manual-reader"><details class="manual-toc" ${matchMedia('(min-width: 801px)').matches?'open':''}><summary>Sommaire du manuel</summary><nav aria-label="Sommaire du manuel">${themes.map(theme=>`<div class="manual-toc-theme"><strong>${esc(theme.title)}</strong>${chapters.filter(c=>c.theme_id===theme.id).map(ch=>`<div class="manual-toc-chapter"><span>${esc(ch.title)}</span>${lessons.filter(l=>l.chapter_id===ch.id).map(l=>`<button type="button" data-lesson="${l.id}" ${l.id===selectedId?'aria-current="page"':''}>${esc(l.title)}</button>`).join('')}</div>`).join('')}</div>`).join('')}</nav></details>
      <article class="manual-lesson-page"><p class="manual-breadcrumb">${esc(themes.find(t=>t.id===chapters.find(c=>c.id===lesson.chapter_id)?.theme_id)?.title||'')} · ${esc(chapters.find(c=>c.id===lesson.chapter_id)?.title||'')}</p><h2>${esc(lesson.title)}</h2>
        ${kinds.map(([kind,name])=>{const sec=sections.find(s=>s.lesson_id===lesson.id&&s.kind===kind);if(!sec)return'';return `<section class="manual-reading-section"><h3>${name}</h3><div class="manual-reading-html">${window.MelecContent.sanitize(sec.content_html||'')||'<p>Aucun texte pour cette section.</p>'}</div><div class="manual-reading-files">${assets.filter(a=>a.section_id===sec.id).map(a=>`<div class="manual-reading-file"><span>📎 ${esc(a.file_name)}</span><div><button type="button" data-open="${a.id}">Consulter</button><button type="button" data-download="${a.id}">Télécharger</button></div><div class="manual-file-preview" data-preview="${a.id}"></div></div>`).join('')}</div></section>`}).join('')||'<p>Cette leçon ne comporte pas encore de section publiée.</p>'}
        <nav class="manual-next-prev" aria-label="Navigation entre les leçons"><button type="button" data-adjacent="${index-1}" ${index===0?'disabled':''}>← Leçon précédente</button><span>${index+1} / ${lessons.length}</span><button type="button" data-adjacent="${index+1}" ${index===lessons.length-1?'disabled':''}>Leçon suivante →</button></nav></article></div>`;
    host.querySelectorAll('[data-lesson]').forEach(button=>button.onclick=()=>openLesson(button.dataset.lesson));
    host.querySelectorAll('[data-adjacent]').forEach(button=>button.onclick=()=>openLesson(lessons[Number(button.dataset.adjacent)]?.id));
    host.querySelectorAll('[data-download]').forEach(button=>button.onclick=()=>download(assets.find(x=>x.id===button.dataset.download)));
    host.querySelectorAll('[data-open]').forEach(button=>button.onclick=()=>openFile(assets.find(x=>x.id===button.dataset.open)));
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
