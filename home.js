(function(){
  'use strict';

  const homeItems=[
    {view:'activities',icon:'▦',title:'Activités',text:'Créer et évaluer les activités en atelier.'},
    {view:'activity-list',icon:'☷',title:'Liste des activités',text:'Retrouver les activités classées par niveau.'},
    {view:'students',icon:'♙',title:'Élèves',text:'Gérer les classes et le suivi des élèves.'},
    {view:'results',icon:'▤',title:'Résultats',text:'Voir les notes et moyennes par groupe ou classe.'},
    {view:'ccf',icon:'◉',title:'Récap Des CCF',text:'Suivre les compétences et rédiger le bilan.'},
    {view:'referential',icon:'◎',title:'Référentiel',text:'Consulter les compétences, tâches et connaissances.'}
  ];

  function renderHome(){
    const target=document.querySelector('#homeView');
    if(!target)return;
    const activities=Array.isArray(state?.activities)?state.activities:[];
    const classes=[...new Set([...activities.map(activity=>activity.className),...state.students.map(student=>student.className)].filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fr',{numeric:true}));
    const evaluated=activities.filter(activity=>Object.values(activity.scores||{}).some(scores=>scores&&Object.keys(scores).length)).length;
    target.innerHTML=`<section class="home-screen"><div class="home-hero"><div class="home-intro"><span class="home-kicker">Espace pédagogique</span><h1>BAC PRO MELEC</h1><p>Créer, suivre et évaluer les activités en atelier.</p></div><div class="home-values" aria-hidden="true"><span>Savoir-faire</span><span>Sécurité</span><span>Autonomie</span><span>Réussite</span></div></div><nav class="home-access" aria-label="Accès principaux">${homeItems.map(item=>`<button class="home-access-card" type="button" onclick="show('${item.view}')"><span class="home-access-icon">${item.icon}</span><span class="home-access-copy"><strong>${item.title}</strong><small>${item.text}</small></span><span class="home-access-arrow" aria-hidden="true">›</span></button>`).join('')}</nav><div class="home-workspace"><section class="home-activity-overview"><div class="home-section-title"><div><span class="home-section-kicker">Suivi pédagogique</span><h2>Activités en atelier</h2></div><button type="button" onclick="show('activities')">Tout afficher <span>›</span></button></div><div class="home-class-list">${classes.length?classes.map(className=>{const count=activities.filter(activity=>activity.className===className).length;return `<button type="button" class="home-class-row" onclick="show('activities')"><span><strong>${esc(className)}</strong><small>${count} activité(s)</small></span><b>⌄</b></button>`}).join(''):'<div class="home-empty-state"><strong>Aucune activité enregistrée</strong><span>Créez votre première activité pour commencer.</span></div>'}</div></section><aside class="home-summary"><div class="home-metric"><span class="home-metric-icon">▤</span><strong>${activities.length}</strong><small>activité(s) enregistrée(s)</small></div><div class="home-metric"><span class="home-metric-icon">▥</span><strong>${evaluated}</strong><small>activité(s) avec évaluation(s)</small></div><button class="home-new-activity" type="button" onclick="newActivity()"><span>＋</span><strong>Nouvelle activité</strong><small>Créer pour un ou plusieurs élèves</small><b>›</b></button></aside></div></section>`;
    const list=target.querySelector('.home-class-list');
    target.querySelector('.home-summary')?.remove();
    list.innerHTML=classes.length?classes.map(className=>{
      const current=activities.filter(activity=>activity.className===className);
      const evaluatedCount=current.filter(activity=>Object.values(activity.scores||{}).some(scores=>scores&&Object.keys(scores).length)).length;
      return `<section class="home-class-block"><button type="button" class="home-class-row" data-open-class="${esc(className)}"><span><strong>${esc(className)}</strong><small>${current.length} activité(s)</small></span><b aria-hidden="true">›</b></button><div class="home-class-actions"><div class="home-metric"><span class="home-metric-icon">▤</span><strong>${current.length}</strong><small>activité(s) enregistrée(s)</small></div><div class="home-metric"><span class="home-metric-icon">▥</span><strong>${evaluatedCount}</strong><small>activité(s) avec évaluation(s)</small></div><button class="home-new-activity" type="button" data-new-class="${esc(className)}"><span>＋</span><strong>Nouvelle activité</strong><small>Créer pour un ou plusieurs élèves</small><b aria-hidden="true">›</b></button></div></section>`;
    }).join(''):'<div class="home-empty-state"><strong>Aucune classe enregistrée</strong><span>Ajoutez des élèves pour créer une classe, puis une activité.</span></div>';
    list.querySelectorAll('[data-open-class]').forEach(button=>button.addEventListener('click',()=>{
      show('activities');
      const group=[...document.querySelectorAll('#activitiesView .activity-class-group')].find(item=>item.querySelector('summary strong')?.textContent===button.dataset.openClass);
      if(group){group.open=true;group.scrollIntoView({block:'start',behavior:'smooth'})}
    }));
    list.querySelectorAll('[data-new-class]').forEach(button=>button.addEventListener('click',()=>{
      newActivity();draft.className=button.dataset.newClass;renderEditor();
    }));
  }

  const applicationShow=window.show;
  const applicationShowRaw=window.showRaw;
  const validRoutes=new Set(['home','editor',...homeItems.map(item=>item.view)]);
  let restoring=false;
  let resettingHome=false;
  let historyEpoch=Date.now();
  let historyDepth=0;
  const routeUrl=name=>`${location.pathname}${location.search}${name==='home'?'':`#${name}`}`;
  const currentRoute=()=>location.hash.slice(1)||'home';
  function updateBackButton(name){
    const button=document.querySelector('#appBackButton');
    if(button)button.hidden=name==='home';
  }
  function recordRoute(name){
    if(restoring||currentRoute()===name)return;
    historyDepth++;
    history.pushState({melecRoute:name,melecDepth:historyDepth,melecEpoch:historyEpoch},'',routeUrl(name));
  }
  window.show=show=function(name){
    if(!validRoutes.has(name)||name==='editor')return;
    recordRoute(name);
    document.body.classList.toggle('home-active',name==='home');
    document.body.classList.toggle('subpage-active',name!=='home');
    updateBackButton(name);
    if(name!=='home')return applicationShow(name);
    document.querySelectorAll('.view').forEach(view=>view.classList.add('hidden'));
    document.querySelector('#homeView')?.classList.remove('hidden');
    document.querySelectorAll('.header-nav .nav').forEach(button=>button.classList.remove('active'));
    document.querySelector('.header-nav .nav-home')?.classList.add('active');
    renderHome();
    window.scrollTo({top:0,behavior:'smooth'});
  };

  window.showRaw=showRaw=function(name){
    if(name==='editor'){
      recordRoute(name);
      document.body.classList.remove('home-active');
      document.body.classList.add('subpage-active');
      updateBackButton(name);
    }
    applicationShowRaw(name);
  };

  function restoreRoute(name){
    restoring=true;
    try{
      if(name==='editor'&&draft)renderEditor();
      else show(name==='editor'?'activities':name);
    }finally{restoring=false}
  }
  window.appBack=function(){
    if(historyDepth>0)history.back();
    else if(currentRoute()!=='home'){
      history.replaceState({melecRoute:'home',melecDepth:0,melecEpoch:historyEpoch},'',routeUrl('home'));
      restoreRoute('home');
    }
  };
  window.resetToHome=function(){
    if(historyDepth>0){resettingHome=true;history.go(-historyDepth)}
    else{
      history.replaceState({melecRoute:'home',melecDepth:0,melecEpoch:++historyEpoch},'',routeUrl('home'));
      restoreRoute('home');
    }
  };
  window.addEventListener('popstate',event=>{
    if(resettingHome||event.state?.melecEpoch!==historyEpoch){
      resettingHome=false;
      historyDepth=0;
      history.replaceState({melecRoute:'home',melecDepth:0,melecEpoch:++historyEpoch},'',routeUrl('home'));
      restoreRoute('home');
      return;
    }
    historyDepth=Number(event.state.melecDepth)||0;
    const route=event.state.melecRoute;
    restoreRoute(validRoutes.has(route)?route:'home');
  });

  window.renderHome=renderHome;
  renderHome();
  const requestedView=location.hash.slice(1);
  const initialRoute=homeItems.some(item=>item.view===requestedView)?requestedView:'home';
  history.replaceState({melecRoute:initialRoute,melecDepth:0,melecEpoch:historyEpoch},'',routeUrl(initialRoute));
  restoreRoute(initialRoute);
})();
