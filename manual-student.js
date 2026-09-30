(function () {
  'use strict';
  const api=window.MelecPortal, esc=api.escapeHtml;
  let themes=[],chapters=[],lessons=[],sections=[],assets=[],selectedId='',selectedThemeId='',classId='',epoch=0,objectUrls=[],pdfCleanups=[],mode='manual',tdView='td';
  const lessonData=new Map();
  const imageBlobs=new Map(),imageRequests=new Map();
  let imageCacheBytes=0,imageCacheEpoch=0;
  const queuedImages=new WeakMap();
  const imageObserver=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{
    entries.forEach(entry=>{if(!entry.isIntersecting)return;imageObserver.unobserve(entry.target);const asset=queuedImages.get(entry.target);if(asset)loadImage(asset,entry.target);});
  },{rootMargin:'400px'}):null;
  const target=()=>document.getElementById(mode==='manual'?'studentManualContent':'studentTdContent');
  ['studentManualPane','studentTdPane'].forEach(id=>{
    const pane=document.getElementById(id);
    ['copy','cut','contextmenu','dragstart','selectstart'].forEach(name=>pane?.addEventListener(name,event=>{
      if(event.target.closest('.manual-lesson-page, .manual-toc'))event.preventDefault();
    }));
  });
  function cleanup(){imageObserver?.disconnect();pdfCleanups.forEach(close=>close());pdfCleanups=[];objectUrls.forEach(URL.revokeObjectURL);objectUrls=[];}
  function queueImage(asset,image,eager=false){if(imageObserver&&!eager){queuedImages.set(image,asset);imageObserver.observe(image);}else loadImage(asset,image);}
  function clearImageCache(){imageCacheEpoch++;imageBlobs.clear();imageRequests.clear();imageCacheBytes=0;}
  async function imageBlob(path){
    const cached=imageBlobs.get(path);
    if(cached){imageBlobs.delete(path);imageBlobs.set(path,cached);return cached;}
    if(!imageRequests.has(path)){
      const cacheEpoch=imageCacheEpoch;
      const request=api.download(path,{retryTransient:true}).then(blob=>{
        if(cacheEpoch===imageCacheEpoch&&blob.size<=20*1024*1024){
          while(imageCacheBytes+blob.size>20*1024*1024&&imageBlobs.size){
            const oldest=imageBlobs.keys().next().value;
            imageCacheBytes-=imageBlobs.get(oldest).size;imageBlobs.delete(oldest);
          }
          imageBlobs.set(path,blob);imageCacheBytes+=blob.size;
        }
        return blob;
      }).finally(()=>{if(imageRequests.get(path)===request)imageRequests.delete(path);});
      imageRequests.set(path,request);
    }
    return imageRequests.get(path);
  }
  async function load(nextClassId,nextMode='manual'){
    if(!nextClassId)return;
    const classChanged=classId&&classId!==nextClassId;
    const ticket=++epoch;classId=nextClassId;mode=nextMode;tdView='td';selectedId='';selectedThemeId='';themes=[];chapters=[];lessons=[];sections=[];assets=[];lessonData.clear();cleanup();if(classChanged)clearImageCache();
    target().innerHTML='<p>Chargement des contenus…</p>';
    try{
      const result=await api.rest('manual_themes?class_id=eq.'+encodeURIComponent(classId)+'&published=is.true&select=id,title,position&order=position.asc,created_at.asc');
      if(ticket!==epoch)return;
      themes=result;draw();
    }catch(error){if(ticket===epoch)target().textContent='Contenu indisponible : '+error.message;}
  }
  async function selectTheme(id){
    if(!themes.some(theme=>theme.id===id))return;
    const ticket=++epoch;selectedThemeId=id;selectedId='';chapters=[];lessons=[];sections=[];assets=[];lessonData.clear();cleanup();
    target().innerHTML='<p>Chargement du thème…</p>';
    try{
      const nextChapters=await api.rest('manual_chapters?theme_id=eq.'+encodeURIComponent(id)+'&published=is.true&select=id,theme_id,title,position&order=position.asc,created_at.asc');
      if(ticket!==epoch)return;
      chapters=nextChapters;
      if(!chapters.length){draw();return;}
      const nextLessons=await api.rest('manual_lessons?chapter_id=in.('+chapters.map(x=>x.id).join(',')+')&published=is.true&select=id,chapter_id,title,position&order=position.asc,created_at.asc');
      if(ticket!==epoch)return;
      lessons=nextLessons;
      if(!lessons.length){draw();return;}
      const chapterOrder=new Map(chapters.map((chapter,index)=>[chapter.id,index]));
      lessons.sort((a,b)=>(chapterOrder.get(a.chapter_id)??Infinity)-(chapterOrder.get(b.chapter_id)??Infinity)||a.position-b.position);
      const kind=mode==='manual'?'kind=eq.course':'kind=in.(td,corrections)';
      const nextSections=await api.rest('manual_sections?lesson_id=in.('+lessons.map(x=>x.id).join(',')+')&'+kind+'&published=is.true&select=id,lesson_id,kind');
      if(ticket!==epoch)return;
      sections=nextSections;
      const first=availableLessons()[0];
      if(first){selectedId=first.id;await fetchLesson(first.id);if(ticket!==epoch)return;}
      draw();
    }catch(error){if(ticket===epoch)target().textContent='Contenu indisponible : '+error.message;}
  }
  function availableLessons(){return lessons.filter(lesson=>sections.some(section=>section.lesson_id===lesson.id&&(mode==='manual'?section.kind==='course':['td','corrections'].includes(section.kind))));}
  function draw(){
    cleanup();const host=target();
    if(!selectedThemeId){
      host.innerHTML=themes.length?`<div class="manual-theme-choice"><label for="studentThemeChoice">Choisir un thème</label><select id="studentThemeChoice"><option value="">Choisir un thème…</option>${themes.map(theme=>`<option value="${theme.id}">${esc(theme.title)}</option>`).join('')}</select></div>`:'<p>Aucun thème publié pour votre classe dans cette rubrique.</p>';
      host.querySelector('#studentThemeChoice')?.addEventListener('change',event=>selectTheme(event.target.value));return;
    }
    const available=availableLessons();
    if(!available.length){host.innerHTML=`<div class="manual-theme-choice"><button type="button" id="changeTheme">← Choisir un autre thème</button><p>Aucun contenu publié dans ce thème pour cette rubrique.</p></div>`;host.querySelector('#changeTheme').onclick=()=>{selectedThemeId='';draw();};return;}
    if(!available.some(lesson=>lesson.id===selectedId))selectedId=available[0].id;
    const index=available.findIndex(x=>x.id===selectedId),lesson=available[index];
    const data=lessonData.get(mode+':'+lesson.id);if(!data)return;
    const currentSections=data.sections;assets=data.assets;
    host.innerHTML=`<div class="manual-reader"><details class="manual-toc" ${matchMedia('(min-width: 801px)').matches?'open':''}><summary>${mode==='manual'?'Sommaire du manuel':'Sommaire des TD'}</summary><button type="button" id="changeTheme">← Changer de thème</button><nav aria-label="Sommaire des leçons">${themes.filter(theme=>theme.id===selectedThemeId).map(theme=>`<div class="manual-toc-theme"><strong>${esc(theme.title)}</strong>${chapters.filter(c=>c.theme_id===theme.id).map(ch=>`<div class="manual-toc-chapter"><span>${esc(ch.title)}</span>${available.filter(l=>l.chapter_id===ch.id).map(l=>`<button type="button" data-lesson="${l.id}" ${l.id===selectedId?'aria-current="page"':''}>${esc(l.title)}</button>`).join('')}</div>`).join('')}</div>`).join('')}</nav></details>
      <article class="manual-lesson-page"><p class="manual-breadcrumb">${esc(themes.find(t=>t.id===chapters.find(c=>c.id===lesson.chapter_id)?.theme_id)?.title||'')} · ${esc(chapters.find(c=>c.id===lesson.chapter_id)?.title||'')}</p><h2>${esc(lesson.title)}</h2>
        ${mode==='td'?`<nav class="manual-td-submenu" aria-label="Travaux dirigés"><button type="button" data-td-view="td" class="${tdView==='td'?'active':''}">Travaux dirigés</button><button type="button" data-td-view="corrections" class="${tdView==='corrections'?'active':''}">Correction des TD</button></nav>`:''}
        ${[[mode==='manual'?'course':tdView,mode==='manual'?'Cours':tdView==='td'?'Travaux dirigés':'Correction des TD']].map(([kind,name])=>{const sec=currentSections.find(s=>s.lesson_id===lesson.id&&s.kind===kind);if(!sec)return'<p>Cette partie n’est pas encore publiée.</p>';return `<section class="manual-reading-section" data-section="${sec.id}"><h3>${name}</h3><div class="manual-reading-html">${window.MelecContent.sanitize(sec.content_html||'')||'<p>Aucun texte pour cette section.</p>'}</div><div class="manual-reading-files">${assets.filter(a=>a.section_id===sec.id&&!a.mime_type.startsWith('image/')).map(a=>a.mime_type==='application/pdf'?`<div class="manual-reading-file"><span>📄 ${esc(a.file_name)}</span><button type="button" data-open="${a.id}">Lire le PDF</button><div class="manual-file-preview" data-preview="${a.id}"></div></div>`:`<p class="manual-file-unavailable">${esc(a.file_name)} : consultez l’enseignant pour une version lisible en ligne.</p>`).join('')}</div></section>`}).join('')}
        <nav class="manual-next-prev" aria-label="Navigation entre les leçons"><button type="button" data-adjacent="${index-1}" ${index===0?'disabled':''}>← Leçon précédente</button><span>${index+1} / ${available.length}</span><button type="button" data-adjacent="${index+1}" ${index===available.length-1?'disabled':''}>Leçon suivante →</button></nav></article></div>`;
    host.querySelectorAll('[data-lesson]').forEach(button=>button.onclick=()=>openLesson(button.dataset.lesson));
    host.querySelector('#changeTheme').onclick=()=>{selectedThemeId='';selectedId='';draw();};
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
    let imagesQueued=0;
    nodes.forEach(node=>{
      const text=node.textContent,pattern=/\[\[image:([0-9a-f-]{36})(?:\|(left|center|right|free)\|(\d{1,3})(?:\|(\d{1,3})\|(\d{1,5}))?)?\]\]/gi;
      if(!pattern.test(text))return;pattern.lastIndex=0;
      const replacement=document.createDocumentFragment();let start=0,match;
      while((match=pattern.exec(text))){
        replacement.append(document.createTextNode(text.slice(start,match.index)));
        const asset=assets.find(a=>a.id===match[1]&&a.section_id===section.dataset.section&&a.mime_type.startsWith('image/'));
        if(asset){const image=document.createElement('img');image.alt='';image.className='manual-inline-image manual-align-free manual-image-loading';const width=Math.max(1,Math.min(100,Number(match[3])||100));const maxX=100-width,oldX=match[2]==='right'?maxX:match[2]==='left'?0:maxX/2;image.style.width=width+'%';image.style.setProperty('--image-width',image.style.width);image.style.left=Math.max(0,Math.min(maxX,match[2]==='free'?(Number(match[4])||0):oldX))+'%';image.style.top=Math.max(0,Math.min(10000,Number(match[5])||0))+'px';replacement.append(image);queueImage(asset,image,imagesQueued++<2);}
        else replacement.append(document.createTextNode(match[0]));
        start=pattern.lastIndex;
      }
      replacement.append(document.createTextNode(text.slice(start)));node.replaceWith(replacement);
    });
    html.querySelectorAll('.manual-align-free').forEach(image=>{
      let anchor=image.parentElement?.closest('p,div,li,h2,h3,h4,blockquote');
      if(!anchor||anchor===html||!html.contains(anchor)){anchor=document.createElement('p');image.before(anchor);anchor.append(image);}
      anchor.classList.add('manual-image-anchor');
    });
    reserveReadingImages(html);
  }
  function reserveReadingImages(root){
    requestAnimationFrame(()=>{if(!root?.isConnected)return;root.querySelectorAll('.manual-image-anchor').forEach(anchor=>{anchor.style.minHeight='';const images=[...anchor.querySelectorAll('.manual-align-free')].filter(node=>node.classList.contains('manual-image-loading')||node.complete&&node.naturalWidth);if(images.length){const top=anchor.getBoundingClientRect().top;anchor.style.minHeight=Math.ceil(Math.max(...images.map(node=>node.getBoundingClientRect().bottom-top+16)))+'px';}});});
  }
  async function fetchLesson(id){
    const cacheKey=mode+':'+id;
    if(lessonData.has(cacheKey))return lessonData.get(cacheKey);
    const kind=mode==='manual'?'kind=eq.course':'kind=in.(td,corrections)';
    const ids=sections.filter(row=>row.lesson_id===id).map(row=>row.id);
    const [detail,files]=await Promise.all([
      api.rest('manual_sections?lesson_id=eq.'+encodeURIComponent(id)+'&'+kind+'&published=is.true&select=id,lesson_id,kind,content_html'),
      ids.length?api.rest('manual_assets?section_id=in.('+ids.join(',')+')&select=id,section_id,object_path,file_name,mime_type'):Promise.resolve([])
    ]);
    const result={sections:detail,assets:files};lessonData.set(cacheKey,result);return result;
  }
  async function loadImage(asset,image){
    image.dataset.asset=asset.id;
    let url;
    try{
      const blob=await imageBlob(asset.object_path);if(!image.isConnected)return;
      if(!blob.size||blob.type&&!blob.type.startsWith('image/'))throw new Error('Fichier image invalide');
      url=URL.createObjectURL(blob);objectUrls.push(url);image.src=url;
      await image.decode();if(!image.isConnected)return;
      image.alt=asset.file_name;image.classList.remove('manual-image-loading');
      reserveReadingImages(image.closest('.manual-reading-html'));
    }
    catch(error){
      if(url)URL.revokeObjectURL(url);
      const cached=imageBlobs.get(asset.object_path);
      if(cached){imageCacheBytes-=cached.size;imageBlobs.delete(asset.object_path);}
      if(image.isConnected){
        const root=image.closest('.manual-reading-html');
        const retry=document.createElement('button');retry.type='button';retry.className='manual-image-retry';
        retry.textContent='Image momentanément indisponible · Réessayer';
        retry.onclick=()=>{image.removeAttribute('src');image.alt='';image.classList.add('manual-image-loading');retry.replaceWith(image);queueImage(asset,image);};
        image.replaceWith(retry);reserveReadingImages(root);
      }
      console.warn('Image du manuel indisponible :',error?.message||error);
    }
  }
  async function openLesson(id){
    if(!id||id===selectedId)return;
    const ticket=++epoch,host=target();host.setAttribute('aria-busy','true');
    try{await fetchLesson(id);if(ticket!==epoch)return;selectedId=id;draw();host.scrollIntoView({block:'start',behavior:'smooth'});}
    catch(error){if(ticket===epoch){const notice=document.createElement('p');notice.className='manual-load-error';notice.textContent='Leçon indisponible : '+error.message;host.querySelector('.manual-lesson-page')?.append(notice);}}
    finally{if(ticket===epoch)host.removeAttribute('aria-busy');}
  }
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
  window.MelecManualStudent={load,clear(options={}){epoch++;cleanup();if(!options.preserveImages)clearImageCache();lessonData.clear();themes=[];chapters=[];lessons=[];assets=[];selectedId='';selectedThemeId='';['studentManualContent','studentTdContent'].forEach(id=>document.getElementById(id)?.replaceChildren());}};
})();
