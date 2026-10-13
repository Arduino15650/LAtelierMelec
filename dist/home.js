(function(){
  'use strict';

  const homeItems=[
    {view:'activities',icon:'▦',title:'Activités',text:'Créer et évaluer les activités en atelier.'},
    {view:'activity-list',icon:'☷',title:'Liste des activités',text:'Retrouver les activités classées par niveau.'},
    {view:'students',icon:'♙',title:'Élèves',text:'Gérer les classes et le suivi des élèves.'},
    {view:'results',icon:'▥',title:'Résultats',text:'Consulter les notes et les moyennes par élève.'},
    {view:'referential',icon:'◎',title:'Référentiel',text:'Consulter les compétences, tâches et connaissances.'}
  ];

  function renderHome(){
    const target=document.querySelector('#homeView');
    if(!target)return;
    target.innerHTML=`<section class="home-screen"><div class="home-hero"><div class="home-intro"><span class="home-kicker">Espace pédagogique</span><h1>BAC PRO MELEC</h1><p>Créer, suivre et évaluer les activités en atelier.</p></div><div class="home-values" aria-hidden="true"><span>Savoir-faire</span><span>Sécurité</span><span>Autonomie</span><span>Réussite</span></div></div><nav class="home-access" aria-label="Accès principaux">${homeItems.map(item=>`<button class="home-access-card" type="button" onclick="show('${item.view}')"><span class="home-access-icon">${item.icon}</span><span class="home-access-copy"><strong>${item.title}</strong><small>${item.text}</small></span><span class="home-access-arrow" aria-hidden="true">›</span></button>`).join('')}</nav></section>`;
  }

  const applicationShow=window.show;
  window.show=show=function(name){
    const route=name==='home'?'':`#${name}`;
    if(location.hash!==route)history.replaceState(null,'',`${location.pathname}${location.search}${route}`);
    document.body.classList.toggle('home-active',name==='home');
    document.body.classList.toggle('subpage-active',name!=='home');
    const menu=document.querySelector('.menu-dropdown');
    if(menu)menu.open=false;
    if(name==='results'){
      document.querySelectorAll('.view').forEach(view=>view.classList.add('hidden'));
      document.querySelector('#resultsView')?.classList.remove('hidden');
      document.querySelectorAll('.header-nav .nav').forEach(button=>button.classList.toggle('active',button.dataset.view==='results'));
      window.renderResults?.();
      return;
    }
    if(name!=='home')return applicationShow(name);
    document.querySelectorAll('.view').forEach(view=>view.classList.add('hidden'));
    document.querySelector('#homeView')?.classList.remove('hidden');
    document.querySelectorAll('.header-nav .nav').forEach(button=>button.classList.remove('active'));
    document.querySelector('.header-nav .nav-home')?.classList.add('active');
    renderHome();
    window.scrollTo({top:0,behavior:'smooth'});
  };

  window.renderHome=renderHome;
  renderHome();
  const requestedView=location.hash.slice(1);
  show(homeItems.some(item=>item.view===requestedView)?requestedView:'home');
})();
