(function(){
  'use strict';
  state.trainingPeriods=Array.isArray(state.trainingPeriods)?state.trainingPeriods:[];
  state.ccfComments=state.ccfComments&&typeof state.ccfComments==='object'?state.ccfComments:{};
  const byName=(a,b)=>a.name.localeCompare(b.name,'fr',{sensitivity:'base'});
  const assigned=(a,s)=>a.className===s.className&&(Array.isArray(a.studentIds)&&a.studentIds.length?a.studentIds.includes(s.id):a.audience!=='students');
  const evaluated=(a,s)=>{const r=scoreResult(a,s);return Number.isFinite(r.note)?r:null};
  const note=n=>Number.isFinite(n)?n.toFixed(2):'—';
  const classOptions=()=>[...new Set(state.students.map(s=>s.className).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fr',{numeric:true}));
  function competencyScore(a,s,cid){const item=evaluated(a,s)?.competencies?.find(c=>c.id===cid);return item&&Number.isFinite(item.factor)?item.factor:null}
  function pill(cid,factor){const level=factor===null?'none':factor<.25?'red':factor<.5?'orange':factor<.75?'green':'darkgreen';return `<span class="ccf-pill ${level}" title="${esc(cid)} : ${factor===null?'non évaluée':(factor*20).toFixed(2)+' / 20'}">${esc(cid)}<small>${factor===null?'—':(factor*20).toFixed(1)}</small></span>`}
  let filters={results:{className:'',groupId:'',studentId:''},ccf:{className:'',groupId:'',studentId:''}};
  function scope(kind){const f=filters[kind],classes=classOptions();if(!classes.includes(f.className)){f.className='';f.groupId='';f.studentId=''}const groups=state.studentGroups.filter(g=>g.className===f.className),group=groups.find(g=>g.id===f.groupId);if(f.groupId&&f.groupId!=='__class__'&&!group){f.groupId='';f.studentId=''}const available=state.students.filter(s=>s.className===f.className&&(f.groupId==='__class__'||group?.studentIds.includes(s.id))).sort(byName);if(f.studentId&&f.studentId!=='__all__'&&!available.some(s=>s.id===f.studentId))f.studentId='';return{f,classes,groups,available,students:f.studentId==='__all__'?available:available.filter(s=>s.id===f.studentId)}}
  function filterHtml(kind,data){
    const {f,classes,groups,available}=data;
    const index=available.findIndex(student=>student.id===f.studentId);
    return `<section class="panel dashboard-filters"><div class="field"><label>Classe</label><select data-filter="className"><option value="">Choisir une classe…</option>${classes.map(c=>`<option value="${esc(c)}" ${f.className===c?'selected':''}>${esc(c)}</option>`).join('')}</select></div>${f.className?`<div class="field"><label>Groupe ou classe</label><select data-filter="groupId"><option value="">Choisir…</option><option value="__class__" ${f.groupId==='__class__'?'selected':''}>Toute la classe</option>${groups.map(g=>`<option value="${esc(g.id)}" ${f.groupId===g.id?'selected':''}>${esc(g.name)}</option>`).join('')}</select></div>`:''}${f.groupId?`<div class="field"><label>Élève ou sélection entière</label><select data-filter="studentId"><option value="">Choisir…</option><option value="__all__" ${f.studentId==='__all__'?'selected':''}>${f.groupId==='__class__'?'Toute la classe':'Tout le groupe'}</option>${available.map(s=>`<option value="${esc(s.id)}" ${f.studentId===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}</select></div><div class="student-navigation" aria-label="Parcourir les élèves"><button type="button" data-student-step="-1" ${!available.length||index===0?'disabled':''}>← Élève précédent</button><span aria-live="polite">${index<0?`${available.length} élève(s) disponibles`:`Élève ${index+1} sur ${available.length}`}</span><button type="button" data-student-step="1" ${!available.length||index===available.length-1?'disabled':''}>Élève suivant →</button></div>`:''}</section>`
  }
  function bindFilters(kind,target){
    target.querySelectorAll('[data-filter]').forEach(el=>el.onchange=()=>{filters[kind][el.dataset.filter]=el.value;if(el.dataset.filter==='className'){filters[kind].groupId='';filters[kind].studentId=''}if(el.dataset.filter==='groupId')filters[kind].studentId='';renderTable(kind)});
    target.querySelectorAll('[data-student-step]').forEach(button=>button.onclick=()=>{
      const {f,available}=scope(kind),index=available.findIndex(student=>student.id===f.studentId);
      const next=index<0?(Number(button.dataset.studentStep)>0?0:available.length-1):index+Number(button.dataset.studentStep);
      if(next<0||next>=available.length)return;
      f.studentId=available[next].id;
      renderTable(kind);
    });
  }
  function activitiesFor(className){return state.activities.filter(a=>a.className===className).sort((a,b)=>(a.date||'').localeCompare(b.date||'')||a.title.localeCompare(b.title,'fr'))}
  function table(kind){const data=scope(kind),{f,students}=data,target=document.querySelector(`#${kind}View`);if(!target)return;const activities=activitiesFor(f.className).filter(a=>students.some(s=>assigned(a,s)&&evaluated(a,s))),ccf=kind==='ccf';target.innerHTML=`<div class="page-head"><div><h1>${ccf?'Récap Des CCF':'Résultats des élèves'}</h1><p>${ccf?'Notes et compétences évaluées pour chaque activité.':'Notes par activité et moyenne par élève.'}</p></div></div>${filterHtml(kind,data)}${f.className?`<div class="panel dashboard-table-wrap"><table class="dashboard-table"><thead><tr><th>Élève</th>${activities.map(a=>`<th><span>${esc(a.title)}</span><small>${esc(a.date||'Sans date')}${state.trainingPeriods.find(p=>p.id===a.periodId)?' · '+esc(state.trainingPeriods.find(p=>p.id===a.periodId).name):''}</small></th>`).join('')}<th>${ccf?'Bilan':'Moyenne'}</th>${ccf?'<th>Commentaire (100 caractères)</th>':''}</tr></thead><tbody>${students.map(s=>{const grades=activities.filter(a=>assigned(a,s)).map(a=>evaluated(a,s)?.note).filter(Number.isFinite),average=grades.length?grades.reduce((sum,n)=>sum+n,0)/grades.length:null;const compIds=[...new Set(activities.filter(a=>assigned(a,s)&&evaluated(a,s)).flatMap(a=>a.competencies||[]))];return `<tr><th scope="row">${esc(s.name)}</th>${activities.map(a=>{const r=assigned(a,s)?evaluated(a,s):null;return `<td>${r?`<strong>${note(r.note)} / 20</strong>${ccf?`<div class="ccf-pills">${(a.competencies||[]).map(cid=>pill(cid,competencyScore(a,s,cid))).join('')}</div>`:''}`:'<span class="muted">—</span>'}</td>`}).join('')}<td class="dashboard-bilan"><strong>${note(average)}${average===null?'':' / 20'}</strong>${ccf?`<div class="ccf-pills">${compIds.map(cid=>{const values=activities.filter(a=>assigned(a,s)).map(a=>competencyScore(a,s,cid)).filter(Number.isFinite);return pill(cid,values.length?values.reduce((x,y)=>x+y,0)/values.length:null)}).join('')}</div>`:''}</td>${ccf?`<td><textarea data-ccf-comment="${esc(s.id)}" maxlength="100" rows="3" placeholder="Bilan de l’élève…">${esc(state.ccfComments[s.id]||'')}</textarea><small class="char-count">${(state.ccfComments[s.id]||'').length}/100</small></td>`:''}</tr>`}).join('')}</tbody></table>${!activities.length?'<p class="muted">Aucune activité évaluée dans cette sélection.</p>':''}${!students.length?'<p class="muted">Aucun élève dans cette sélection.</p>':''}</div>`:''}`;bindFilters(kind,target,()=>table(kind));if(ccf)target.querySelectorAll('[data-ccf-comment]').forEach(el=>el.oninput=()=>{state.ccfComments[el.dataset.ccfComment]=el.value.slice(0,100);el.nextElementSibling.textContent=`${el.value.length}/100`;save()})}
  function renderTable(kind){
    const data=scope(kind);
    if(data.f.className&&data.f.groupId&&data.f.studentId)return table(kind);
    const target=document.querySelector(`#${kind}View`);
    if(!target)return;
    target.innerHTML=`<div class="page-head"><div><h1>${kind==='ccf'?'Récap Des CCF':'Résultats des élèves'}</h1><p>Choisissez une classe, puis un groupe ou la classe entière, et enfin les élèves à afficher.</p></div></div>${filterHtml(kind,data)}`;
    bindFilters(kind,target,()=>renderTable(kind));
  }
  window.renderResults=()=>renderTable('results');window.renderCcf=()=>renderTable('ccf');
  const previousShow=show;show=function(name){previousShow(name);if(name==='results')renderResults();if(name==='ccf')renderCcf()};window.show=show;

  const baseEditorBody=editorBody,baseBindEditor=bindEditor,baseNextStep=nextStep;
  editorBody=function(){let html=baseEditorBody();if(step!==1)return html;const pending=draft.pendingPeriod||{};const periodHtml=`<section class="period-panel"><h3>Période de formation</h3><div class="field"><label for="periodChoice">Période</label><select id="periodChoice"><option value="">Sans période</option>${state.trainingPeriods.map(x=>`<option value="${esc(x.id)}" ${draft.periodId===x.id?'selected':''}>${esc(x.name)} · ${esc(x.startDate)} → ${esc(x.endDate)}</option>`).join('')}<option value="__new__" ${draft.pendingPeriod?'selected':''}>Créer une période…</option></select></div><div id="newPeriodFields" class="period-fields" ${draft.pendingPeriod?'':'hidden'}><div class="field"><label for="periodName">Nom</label><input id="periodName" maxlength="80" value="${esc(pending.name||'')}" placeholder="SEMESTRE 1"></div><div class="field"><label for="periodStart">Début</label><input id="periodStart" type="date" value="${esc(pending.startDate||'')}"></div><div class="field"><label for="periodEnd">Fin</label><input id="periodEnd" type="date" value="${esc(pending.endDate||'')}"></div></div></section>`;html+=periodHtml;const pupils=state.students.filter(s=>s.className===draft.className);const groups=state.studentGroups.filter(g=>g.className===draft.className);if(draft.groupId&&!groups.some(g=>g.id===draft.groupId))draft.groupId='';if(groups.length&&pupils.length){html=html.replace('<section class="workplace-students">',`<section class="workplace-students"><div class="field"><label for="activityGroup">Sélectionner un groupe</label><select id="activityGroup"><option value="">Choisir librement les élèves</option>${groups.map(g=>`<option value="${esc(g.id)}" ${draft.groupId===g.id?'selected':''}>${esc(g.name)}</option>`).join('')}</select></div>`)}return html};
  bindEditor=function(){
    baseBindEditor();
    if(step!==1)return;
    const choice=$('#periodChoice');
    if(choice)choice.onchange=()=>{draft.periodId=choice.value==='__new__'?'':choice.value;draft.pendingPeriod=choice.value==='__new__'?{name:'',startDate:'',endDate:''}:null;$('#newPeriodFields').hidden=!draft.pendingPeriod};
    ['Name','Start','End'].forEach(k=>{const el=$('#period'+k);if(el)el.oninput=()=>{draft.pendingPeriod??={};draft.pendingPeriod[{Name:'name',Start:'startDate',End:'endDate'}[k]]=el.value}});
    const group=$('#activityGroup');
    if(group){
      group.insertAdjacentHTML('afterend','<small class="activity-group-help">Le groupe repère ses membres ; cochez librement un ou plusieurs élèves de la classe, y compris hors du groupe.</small>');
      const highlightGroup=()=>{
        draft.groupId=group.value;
        const members=new Set(state.studentGroups.find(g=>g.id===group.value)?.studentIds||[]);
        $$('[name=workplaceStudent]').forEach(el=>{
          el.disabled=false;
          el.closest('label').hidden=false;
          el.closest('label').classList.toggle('activity-group-member',members.has(el.value));
        });
      };
      group.onchange=highlightGroup;
      highlightGroup();
    }
  };
  nextStep=function(){if(step===1&&draft.pendingPeriod){const p=draft.pendingPeriod;if(!p.name?.trim()||!p.startDate||!p.endDate||p.endDate<p.startDate)return toast('Renseignez une période et des dates valides.')}if(step===5&&draft.pendingPeriod){const p=draft.pendingPeriod;let existing=state.trainingPeriods.find(x=>x.name.toLocaleLowerCase('fr')===p.name.trim().toLocaleLowerCase('fr')&&x.startDate===p.startDate&&x.endDate===p.endDate);if(!existing){existing={id:createId(),name:p.name.trim(),startDate:p.startDate,endDate:p.endDate};state.trainingPeriods.push(existing)}draft.periodId=existing.id;delete draft.pendingPeriod;save()}baseNextStep()};
  window.editorBody=editorBody;window.bindEditor=bindEditor;window.nextStep=nextStep;
  const renderActivitiesWithAssignments=renderActivities;
  renderActivities=function(){
    renderActivitiesWithAssignments();
    document.querySelectorAll('#activitiesView .online-activity-card').forEach(card=>{
      const editButton=card.querySelector('button[onclick^="editActivity("]');
      if(!editButton)return;
      const match=editButton.getAttribute('onclick').match(/editActivity\('([^']+)'\)/);
      if(!match)return;
      const button=document.createElement('button');
      button.type='button';button.className='button small assign-students-button';
      button.textContent='Associer des élèves';
      button.onclick=()=>{editActivity(match[1]);document.querySelector('.workplace-student-dropdown')?.setAttribute('open','');document.querySelector('.workplace-students')?.scrollIntoView({block:'center'})};
      editButton.before(button);
    });
  };
  window.renderActivities=renderActivities;
  const baseReferential=renderReferential;
  renderReferential=function(){baseReferential();document.querySelectorAll('#referentialView details.competence>summary').forEach(summary=>{const node=[...summary.childNodes].find(n=>n.nodeType===Node.TEXT_NODE&&/^C\d+\s/.test(n.textContent.trim()));if(!node)return;const match=node.textContent.match(/^\s*(C\d+)\s*[—-]\s*/);if(!match)return;const badge=document.createElement('span');badge.className='ref-comp-badge';badge.textContent=match[1];node.textContent=node.textContent.slice(match[0].length);summary.insertBefore(badge,node)})};window.renderReferential=renderReferential;
})();
