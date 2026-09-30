/* Réutilisation d'une activité : une déclinaison par classe protège les notes existantes. */
(function(){
  'use strict';
  const view=document.getElementById('activity-listView');
  if(!view)return;
  const choice={familyId:'',className:'',groupId:'',studentIds:new Set()};
  const familyId=activity=>activity.sourceActivityId||activity.id;
  const sorted=(a,b)=>a.name.localeCompare(b.name,'fr',{sensitivity:'base'});
  const templates=()=>{
    const map=new Map();
    state.activities.forEach(activity=>{
      const id=familyId(activity),current=map.get(id);
      if(!current||activity.id===id)map.set(id,activity);
    });
    return [...map].map(([id,activity])=>({id,activity})).sort((a,b)=>a.activity.title.localeCompare(b.activity.title,'fr',{sensitivity:'base'}));
  };
  const groups=()=>Array.isArray(state.studentGroups)?state.studentGroups.filter(group=>group.className===choice.className):[];
  const pupils=()=>{
    const all=state.students.filter(student=>student.className===choice.className).sort(sorted);
    if(choice.groupId==='__all__')return all;
    const group=groups().find(item=>item.id===choice.groupId);
    return group?all.filter(student=>(group.studentIds||[]).includes(student.id)):[];
  };
  const instance=()=>state.activities.find(activity=>familyId(activity)===choice.familyId&&activity.className===choice.className);
  function tone(id){
    let hash=2166136261;
    for(const char of String(id)){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619)}
    return (hash>>>0)%8;
  }
  function applyTones(){
    document.querySelectorAll('#activitiesView .activity-card').forEach(card=>{
      const action=card.querySelector('button[onclick^="grade("]')?.getAttribute('onclick')||'';
      const id=action.match(/grade\('([^']+)'\)/)?.[1];
      const activity=state.activities.find(item=>item.id===id);
      if(activity)card.dataset.tone=String(tone(familyId(activity)));
    });
  }
  function render(){
    const available=templates(),template=available.find(item=>item.id===choice.familyId)?.activity;
    const classes=[...new Set(state.students.map(student=>student.className).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fr',{numeric:true}));
    if(choice.className&&!classes.includes(choice.className)){choice.className='';choice.groupId='';choice.studentIds.clear()}
    if(choice.familyId&&!template){choice.familyId='';choice.studentIds.clear()}
    if(choice.groupId&&choice.groupId!=='__all__'&&!groups().some(group=>group.id===choice.groupId)){choice.groupId='';choice.studentIds.clear()}
    const students=choice.familyId&&choice.className&&choice.groupId?pupils():[];
    const current=instance();
    const valid=new Set(students.filter(student=>!current?.evaluationLocks?.[student.id]).map(student=>student.id));
    choice.studentIds=new Set([...choice.studentIds].filter(id=>valid.has(id)));
    view.innerHTML='<div class="page-head"><div><h1>Liste des activités</h1><p>Réutilisez une activité existante pour une classe, un groupe et les élèves de votre choix.</p></div></div>'+
      '<section class="panel activity-reuse-panel"><div class="activity-reuse-fields">'+
      '<div class="field"><label for="reuseActivity">1. Activité créée</label><select id="reuseActivity"><option value="">Choisir une activité…</option>'+
      available.map(item=>'<option value="'+esc(item.id)+'"'+(choice.familyId===item.id?' selected':'')+'>'+esc(item.activity.title)+' · '+esc((item.activity.competencies||[]).join(', ')||'compétences non précisées')+'</option>').join('')+'</select></div>'+
      '<div class="field"><label for="reuseClass">2. Classe</label><select id="reuseClass"'+(!choice.familyId?' disabled':'')+'><option value="">Choisir une classe…</option>'+
      classes.map(name=>'<option value="'+esc(name)+'"'+(choice.className===name?' selected':'')+'>'+esc(name)+'</option>').join('')+'</select></div>'+
      '<div class="field"><label for="reuseGroup">3. Groupe</label><select id="reuseGroup"'+(!choice.className?' disabled':'')+'><option value="">Choisir un groupe…</option><option value="__all__"'+(choice.groupId==='__all__'?' selected':'')+'>Toute la classe</option>'+
      groups().map(group=>'<option value="'+esc(group.id)+'"'+(choice.groupId===group.id?' selected':'')+'>'+esc(group.name)+'</option>').join('')+'</select></div></div>'+
      (template?'<p class="activity-reuse-template"><strong>Modèle :</strong> '+esc(template.title)+' · '+esc(template.situation||'Formative')+' · '+(template.competencies||[]).length+' compétence(s) · '+(template.criteria||[]).length+' critère(s). Les évaluations des autres classes restent séparées.</p>':'')+
      (choice.groupId?'<div class="activity-reuse-students"><div class="activity-reuse-students-head"><h2>4. Élèves à évaluer</h2><button type="button" class="button small" id="reuseSelectAll">Sélectionner les élèves disponibles</button></div>'+
      (students.length?'<div class="activity-reuse-student-list">'+students.map(student=>{
        const locked=Boolean(current?.evaluationLocks?.[student.id]);
        return '<label class="activity-reuse-student'+(locked?' is-locked':'')+'"><input type="checkbox" value="'+esc(student.id)+'"'+(choice.studentIds.has(student.id)?' checked':'')+(locked?' disabled':'')+'><span>'+esc(student.name)+(locked?' · évaluation verrouillée':'')+'</span></label>';
      }).join('')+'</div>':'<p>Aucun élève dans ce groupe.</p>')+'</div>':'<p class="activity-reuse-hint">Choisissez explicitement un groupe ou « Toute la classe » pour afficher les élèves.</p>')+
      '<div class="activity-reuse-actions"><span id="reuseCount">'+choice.studentIds.size+' élève(s) sélectionné(s)</span><button type="button" class="button primary" id="reuseLaunch"'+(!choice.studentIds.size?' disabled':'')+'>Ouvrir l’évaluation</button></div></section>';
    view.querySelector('#reuseActivity').onchange=event=>{choice.familyId=event.target.value;choice.studentIds.clear();render()};
    view.querySelector('#reuseClass').onchange=event=>{choice.className=event.target.value;choice.groupId='';choice.studentIds.clear();render()};
    view.querySelector('#reuseGroup').onchange=event=>{choice.groupId=event.target.value;choice.studentIds.clear();render()};
    view.querySelectorAll('.activity-reuse-student input').forEach(input=>input.onchange=()=>{
      if(input.checked)choice.studentIds.add(input.value);else choice.studentIds.delete(input.value);
      view.querySelector('#reuseCount').textContent=choice.studentIds.size+' élève(s) sélectionné(s)';
      view.querySelector('#reuseLaunch').disabled=!choice.studentIds.size;
    });
    const selectAll=view.querySelector('#reuseSelectAll');
    if(selectAll)selectAll.onclick=()=>{
      view.querySelectorAll('.activity-reuse-student input:not(:disabled)').forEach(input=>{input.checked=true;choice.studentIds.add(input.value)});
      view.querySelector('#reuseCount').textContent=choice.studentIds.size+' élève(s) sélectionné(s)';
      view.querySelector('#reuseLaunch').disabled=!choice.studentIds.size;
    };
    view.querySelector('#reuseLaunch').onclick=launch;
  }
  function launch(){
    const source=templates().find(item=>item.id===choice.familyId)?.activity;
    const allowed=new Set(pupils().filter(student=>!instance()?.evaluationLocks?.[student.id]).map(student=>student.id));
    const ids=pupils().filter(student=>choice.studentIds.has(student.id)&&allowed.has(student.id)).map(student=>student.id);
    if(!source||!choice.className||!choice.groupId||!ids.length)return toast('Choisissez une activité, une classe, un groupe et au moins un élève disponible.');
    let target=instance();
    if(!target){
      target=cloneData(source);
      target.id=createId();
      target.sourceActivityId=choice.familyId;
      target.className=choice.className;
      target.groupId=choice.groupId==='__all__'?'':choice.groupId;
      target.studentIds=[];
      target.scores={};target.feedback={};target.evaluationLocks={};
      target.audience='students';
      state.activities.unshift(target);
    }
    target.studentIds=[...new Set([...(target.studentIds||[]),...ids])];
    save();
    window.melecEvaluationQueue={activityId:target.id,studentIds:ids};
    gradeActivityId=target.id;gradeStudent=ids[0];
    grade(target.id);
  }
  const previousShow=show;
  show=function(name){
    previousShow(name);
    if(name==='activity-list')render();
    else if(name!=='editor')window.melecEvaluationQueue=null;
  };
  window.show=show;
  const previousRender=renderActivities;
  renderActivities=function(){previousRender();applyTones()};
  window.renderActivities=renderActivities;
  applyTones();
})();
