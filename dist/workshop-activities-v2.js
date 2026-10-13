/* Version 2 : fichier renommé pour neutraliser les anciens caches mobiles. */
(function(){
  'use strict';

  const baseEditorBody=editorBody;
  const baseBindEditor=bindEditor;
  const baseNextStep=nextStep;
  const baseGrade=grade;
  const baseViewEvaluated=viewEvaluated;
  const baseExportGrades=exportGrades;
  const baseExportEvaluated=exportEvaluated;
  const baseShow=show;
  let activityListClass='';

  const isWorkplace=a=>a?.audience==='students';
  const studentsFor=a=>{
    const classStudents=state.students.filter(s=>s.className===a.className);
    if(!isWorkplace(a))return classStudents;
    const selected=new Set(a.studentIds||[]);
    return classStudents.filter(s=>selected.has(s.id));
  };

  /* Intégration automatique des anciennes activités de classe. */
  let migrated=false;
  state.activities.forEach(a=>{
    if(isWorkplace(a))return;
    a.audience='students';
    a.studentIds=state.students.filter(s=>s.className===a.className).map(s=>s.id);
    migrated=true;
  });
  if(migrated)save();

  function activityCard(a){
    const assigned=studentsFor(a);
    const evaluated=assigned.filter(s=>scoreResult(a,s).count>0).length;
    const audience=isWorkplace(a)
      ?`<span class="activity-audience">${assigned.length} élève(s) sélectionné(s)</span>`:'';
    return `<details class="activity-card activity-entry online-activity-card"><summary class="activity-entry-summary"><div><span class="activity-date">${esc(a.date||'Date non renseignée')}</span><h3>${esc(a.title)}</h3><span>${esc(a.className||'Classe non renseignée')} • ${assigned.length} élève(s) • ${(a.competencies||[]).length} compétence(s)</span>${audience}</div>${evaluated?`<span class="evaluated-count">${evaluated} évalué(s)</span>`:''}</summary><div class="activity-entry-body"><p class="activity-context">${esc(a.context||'Aucune description renseignée.')}</p><div class="chips">${(a.competencies||[]).map(c=>`<span class="chip">${c}</span>`).join('')}</div><div class="meta">${(a.tasks||[]).length} tâche(s) • ${(a.criteria||[]).length} critère(s)</div><footer class="online-activity-actions"><button class="button small" onclick="printActivity('${a.id}')">Exporter PDF / Imprimer</button><button class="button small results-button" onclick="viewEvaluated('${a.id}')">Résultats</button><button class="button small" onclick="editActivity('${a.id}')">Modifier</button><button class="button small danger" onclick="removeActivity('${a.id}')">Supprimer</button><button class="button small primary" onclick="grade('${a.id}')">Évaluer <span aria-hidden="true">›</span></button></footer></div></details>`;
  }

  function activityListCard(a){
    const pupils=studentsFor(a).sort((x,y)=>x.name.localeCompare(y.name,'fr'));
    const competencies=(a.competencies||[]).map(id=>MELEC.competencies.find(c=>c.id===id)).filter(Boolean);
    const tasks=(a.tasks||[]).map(id=>MELEC.tasks.find(t=>t.id===id)).filter(Boolean);
    const criteriaByCompetence=competencies.map(competence=>({
      competence,
      criteria:(a.criteria||[]).filter(key=>key.startsWith(competence.id+':')).map(key=>competence.criteria?.[Number(key.split(':')[1])]||'Critère non retrouvé')
    }));
    return `<details class="activity-card activity-entry activity-list-card"><summary class="activity-entry-summary"><div><h3>${esc(a.title)}</h3><span>${esc(a.date||'Sans date')}</span></div><span class="activity-list-student-count">${pupils.length} élève(s)</span></summary><div class="activity-list-body"><details class="activity-list-fold"><summary>Tâches <span>${tasks.length}</span></summary><div>${tasks.length?`<ul>${tasks.map(t=>`<li><strong>${esc(t.id)}</strong> — ${esc(t.label)}</li>`).join('')}</ul>`:'<p class="meta">Aucune tâche</p>'}</div></details><details class="activity-list-fold"><summary>Compétences et critères <span>${competencies.length} compétence(s)</span></summary><div class="activity-criteria-groups">${criteriaByCompetence.length?criteriaByCompetence.map(group=>`<section class="activity-criteria-group"><h4><span class="chip">${esc(group.competence.id)} · ${esc(group.competence.unit)}</span> ${esc(group.competence.label)}</h4>${group.criteria.length?`<ul>${group.criteria.map(label=>`<li>${esc(label)}</li>`).join('')}</ul>`:'<p class="meta">Aucun critère sélectionné</p>'}</section>`).join(''):'<p class="meta">Aucune compétence</p>'}</div></details><details class="activity-linked-students"><summary>${pupils.length} élève(s) en lien avec l’activité</summary><div>${pupils.length?`<ul>${pupils.map(s=>`<li>${esc(s.name)}</li>`).join('')}</ul>`:'<p>Aucun élève sélectionné.</p>'}</div></details></div></details>`;
  }

  function groupedActivitySections(items,className){
    const groups=(state.studentGroups||[]).filter(group=>group.className===className).sort((a,b)=>a.name.localeCompare(b.name,'fr',{sensitivity:'base'}));
    const sections=groups.map(group=>{
      const memberIds=new Set(group.studentIds||[]);
      const linked=items.filter(activity=>studentsFor(activity).some(student=>memberIds.has(student.id)));
      return {name:group.name,id:group.id,activities:linked};
    });
    const groupedIds=new Set(groups.flatMap(group=>group.studentIds||[]));
    const outside=items.filter(activity=>studentsFor(activity).some(student=>!groupedIds.has(student.id))||!studentsFor(activity).length);
    if(outside.length)sections.push({name:groups.length?'Élèves hors groupe':'Sans groupe',id:'',activities:outside});
    return sections.map(section=>`<details class="activity-group-fold" data-group-id="${esc(section.id)}"><summary><strong>${esc(section.name)}</strong><span>${section.activities.length} activité(s)</span></summary><div class="activity-group-content">${section.activities.length?section.activities.map(activity=>activityCard(activity).replace('<details class="activity-card',`<details data-activity-group-id="${esc(section.id)}" class="activity-card`)).join(''):'<p class="activity-group-empty">Aucune activité liée à ce groupe.</p>'}</div></details>`).join('');
  }

  renderActivities=function(){
    const activities=state.activities.filter(isWorkplace);
    const done=activities.filter(a=>studentsFor(a).some(s=>scoreResult(a,s).count>0)).length;
    const classes=[...new Set(activities.map(a=>a.className||'Classe non précisée'))].sort((a,b)=>a.localeCompare(b,'fr',{numeric:true}));
    const classHtml=classes.map(className=>{
      const items=activities.filter(a=>(a.className||'Classe non précisée')===className).sort((a,b)=>(b.date||'').localeCompare(a.date||'')||a.title.localeCompare(b.title,'fr'));
      return `<details class="activity-class-group"><summary><div><strong>${esc(className)}</strong><span>${items.length} activité(s)</span></div></summary><div class="activity-class-content">${groupedActivitySections(items,className)}</div></details>`;
    }).join('');
    $('#activitiesView').innerHTML=`<div class="page-head activities-page-head"><div><h1>Activités en atelier</h1><p class="activities-description">Activités classées par classe puis par groupe. Une activité peut apparaître dans plusieurs groupes sans être dupliquée.</p><p class="official-reference">Arrêté du 1er mars 2024 — Bac Pro MELEC • JORF n°57 du 8 mars 2024</p></div></div>${activities.length?`<div class="activity-class-list">${classHtml}</div>`:`<div class="panel empty"><div class="symbol">▦</div><h2>Aucune activité en atelier</h2><p>Créez une activité puis choisissez les élèves auxquels elle est destinée.</p></div>`}<div class="stats bottom-stats"><div class="stat"><strong>${activities.length}</strong><span>activité(s) enregistrée(s)</span></div><div class="stat"><strong>${done}</strong><span>activité(s) avec évaluation(s)</span></div><button class="stat new-activity-stat" onclick="newActivity()"><span class="plus">+</span><div><strong>Nouvelle activité</strong><span>Créer pour un ou plusieurs élèves</span></div></button></div>`;
  };

  function setActivityListClass(value){
    activityListClass=value;
    renderActivityList();
  }

  function renderActivityList(){
    const classes=[...new Set(state.activities.map(a=>a.className).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fr',{numeric:true}));
    if(activityListClass&&!classes.includes(activityListClass))activityListClass='';
    const activities=activityListClass?state.activities.filter(a=>a.className===activityListClass).sort((a,b)=>(b.date||'').localeCompare(a.date||'')||a.title.localeCompare(b.title,'fr')):[];
    const target=$('#activity-listView');
    if(!target)return;
    target.innerHTML=`<div class="page-head"><div><h1>Liste des activités</h1><p>Choisissez une classe pour retrouver toutes les activités.</p></div></div><section class="panel activity-list-filter"><div class="field"><label for="activityListClass">Classe</label><select id="activityListClass" onchange="setActivityListClass(this.value)"><option value="">Choisir une classe…</option>${classes.map(c=>`<option value="${esc(c)}" ${activityListClass===c?'selected':''}>${esc(c)}</option>`).join('')}</select></div></section>${activityListClass?(activities.length?`<section class="activity-list-results"><div class="activity-list-heading"><h2>${esc(activityListClass)}</h2><span>${activities.length} activité(s)</span></div>${activities.map(activityListCard).join('')}</section>`:`<div class="panel empty"><h2>Aucune activité pour ${esc(activityListClass)}</h2><p>Les nouvelles activités associées à cette classe apparaîtront ici.</p></div>`):''}`;
  }

  show=function(name){
    baseShow(name);
    if(name==='activity-list')renderActivityList();
  };

  newActivity=function(){
    draft={id:createId(),title:'',className:'',date:new Date().toISOString().slice(0,10),context:'',sector:[],situation:'Formative',resources:'',tasks:[],taskSelections:{},competencies:[],criteria:[],criterionSelections:{},weights:{},scores:{},audience:'students',studentIds:[]};
    currentId=null;step=1;renderEditor();
  };

  const baseEditActivity=editActivity;
  editActivity=function(id){
    const a=state.activities.find(x=>x.id===id);
    if(a){a.audience='students';a.studentIds=Array.isArray(a.studentIds)?a.studentIds:[];}
    baseEditActivity(id);
  };

  function studentSelector(){
    if(!isWorkplace(draft))return '';
    const pupils=state.students.filter(s=>s.className===draft.className).sort((a,b)=>a.name.localeCompare(b.name,'fr'));
    const selected=new Set(draft.studentIds||[]);
    return `<section class="workplace-students"><div class="workplace-students-head"><div><h3>Élèves concernés *</h3><p>Choisissez un ou plusieurs élèves pour cette activité en atelier.</p></div>${pupils.length?'<button type="button" class="button small" id="toggleWorkplaceStudents">Tout sélectionner</button>':''}</div>${draft.className?(pupils.length?`<details class="selection-dropdown workplace-student-dropdown"><summary><span>${pupils.filter(s=>selected.has(s.id)).length} élève(s) sélectionné(s)</span></summary><div class="select-list">${pupils.map(s=>`<label class="select-row"><input type="checkbox" name="workplaceStudent" value="${s.id}" ${selected.has(s.id)?'checked':''}><div><strong>${esc(s.name)}</strong><small>${esc(s.className)}</small></div></label>`).join('')}</div></details>`:'<p class="workplace-empty">Aucun élève n’est enregistré dans cette classe.</p>'):'<p class="workplace-empty">Choisissez d’abord une classe pour afficher ses élèves.</p>'}</section>`;
  }

  editorBody=function(){
    let html=baseEditorBody();
    if(step===1&&isWorkplace(draft)){
      html=html.replace('L’activité sera liée à la classe choisie. Seuls les élèves de cette classe pourront ensuite être évalués.','L’activité sera liée à la classe choisie, puis attribuée uniquement aux élèves que vous sélectionnerez.');
      html+=studentSelector();
    }
    if(step===5&&isWorkplace(draft)){
      const names=studentsFor(draft).map(s=>s.name);
      html+=`<section class="workplace-verification"><span class="meta">Élèves concernés</span><strong>${names.length} élève(s) sélectionné(s)</strong><p>${names.map(esc).join(' • ')||'Aucun élève sélectionné'}</p></section>`;
    }
    return html;
  };

  bindEditor=function(){
    baseBindEditor();
    if(step!==1||!isWorkplace(draft))return;
    const classSelect=$('#fClass');
    if(classSelect)classSelect.addEventListener('change',()=>{
      draft.className=classSelect.value;
      const valid=new Set(state.students.filter(s=>s.className===draft.className).map(s=>s.id));
      draft.studentIds=(draft.studentIds||[]).filter(id=>valid.has(id));
      renderEditor();
    });
    const refreshSummary=()=>{
      draft.studentIds=$$('[name=workplaceStudent]:checked').map(x=>x.value);
      const summary=$('.workplace-student-dropdown summary span');
      if(summary)summary.textContent=`${draft.studentIds.length} élève(s) sélectionné(s)`;
    };
    $$('[name=workplaceStudent]').forEach(x=>x.addEventListener('change',refreshSummary));
    const toggle=$('#toggleWorkplaceStudents');
    if(toggle)toggle.onclick=()=>{
      const boxes=$$('[name=workplaceStudent]'),allSelected=boxes.length&&boxes.every(x=>x.checked);
      boxes.forEach(x=>x.checked=!allSelected);refreshSummary();
      toggle.textContent=allSelected?'Tout sélectionner':'Tout désélectionner';
    };
  };

  nextStep=function(){
    if(step===1&&isWorkplace(draft)&&draft.title.trim()&&draft.className&&!(draft.studentIds||[]).length)return toast('Sélectionnez au moins un élève pour cette activité.');
    baseNextStep();
  };

  function withAssignedStudents(id,callback){
    const a=state.activities.find(x=>x.id===id);
    if(!isWorkplace(a))return callback();
    const original=state.students;
    state.students=studentsFor(a);
    try{return callback();}finally{state.students=original;}
  }

  grade=function(id){
    const result=withAssignedStudents(id,()=>baseGrade(id));
    const a=state.activities.find(x=>x.id===id);
    if(isWorkplace(a)){
      const subtitle=$('#editorView .page-head p');
      if(subtitle)subtitle.textContent=`Évaluation en atelier • ${studentsFor(a).length} élève(s) sélectionné(s) • Note pondérée sur 20`;
      const label=$('.grade-picker .field:last-child label');
      if(label)label.textContent='Choisir un élève concerné';
      const empty=$('#editorView .empty h2');
      if(empty)empty.textContent='Aucun élève sélectionné pour cette activité';
    }
    return result;
  };
  viewEvaluated=function(id){return withAssignedStudents(id,()=>baseViewEvaluated(id));};
  exportGrades=function(id){return withAssignedStudents(id,()=>baseExportGrades(id));};
  exportEvaluated=function(id){return withAssignedStudents(id,()=>baseExportEvaluated(id));};

  window.renderActivities=renderActivities;
  window.renderActivityList=renderActivityList;
  window.setActivityListClass=setActivityListClass;
  window.show=show;
  window.newActivity=newActivity;
  window.editActivity=editActivity;
  window.grade=grade;
  window.viewEvaluated=viewEvaluated;
  window.exportGrades=exportGrades;
  window.exportEvaluated=exportEvaluated;

  renderActivities();
})();
