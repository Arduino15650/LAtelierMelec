(function(){
  'use strict';

  const modes={all:'Récap CCF',formative:'CCF formatif',certificative:'CCF certificatif'};
  const choice={mode:'all',className:'',groupId:'',studentIds:new Set()};
  const safe=value=>esc(String(value??''));
  const byName=(a,b)=>a.name.localeCompare(b.name,'fr',{sensitivity:'base'});
  const note=value=>Number.isFinite(value)?value.toFixed(2):'—';
  const assigned=(activity,student)=>activity.className===student.className&&(
    Array.isArray(activity.studentIds)&&activity.studentIds.length
      ? activity.studentIds.includes(student.id)
      : activity.audience!=='students'
  );

  function pill(id,factor){
    const level=factor===null?'none':factor<.25?'red':factor<.5?'orange':factor<.75?'green':'darkgreen';
    const label=factor===null?'—':(factor*20).toFixed(1);
    return `<span class="ccf-pill ${level}" title="${safe(id)} : ${factor===null?'non évaluée':(factor*20).toFixed(2)+' / 20'}">${safe(id)}<small>${label}</small></span>`;
  }

  function renderCcfCompact(){
    const target=document.querySelector('#ccfView');
    if(!target)return;
    state.ccfComments=state.ccfComments&&typeof state.ccfComments==='object'?state.ccfComments:{};
    const allStudents=Array.isArray(state.students)?state.students:[];
    const groups=Array.isArray(state.studentGroups)?state.studentGroups:[];
    const allActivities=Array.isArray(state.activities)?state.activities:[];
    const classes=[...new Set(allStudents.map(student=>student.className).filter(Boolean))]
      .sort((a,b)=>a.localeCompare(b,'fr',{numeric:true}));
    if(choice.className&&!classes.includes(choice.className)){
      choice.className='';choice.groupId='';choice.studentIds.clear();
    }
    const classGroups=groups.filter(group=>group.className===choice.className);
    const group=classGroups.find(item=>item.id===choice.groupId);
    if(choice.groupId&&!group){choice.groupId='';choice.studentIds.clear()}
    const eligible=allStudents.filter(student=>student.className===choice.className&&
      (!group||group.studentIds.includes(student.id))).sort(byName);
    const eligibleIds=new Set(eligible.map(student=>student.id));
    for(const id of choice.studentIds)if(!eligibleIds.has(id))choice.studentIds.delete(id);
    const students=choice.studentIds.size
      ? eligible.filter(student=>choice.studentIds.has(student.id)):eligible;
    const selectedLabel=choice.studentIds.size
      ? `${choice.studentIds.size} élève(s) sélectionné(s)`:'Tous les élèves';

    const scoreCache=new Map();
    const score=(activity,student)=>{
      const key=activity.id+'|'+student.id;
      if(!scoreCache.has(key)){
        const result=scoreResult(activity,student);
        scoreCache.set(key,Number.isFinite(result?.note)?result:null);
      }
      return scoreCache.get(key);
    };
    const matching=allActivities.filter(activity=>activity.className===choice.className&&(
      choice.mode==='all'||String(activity.situation||'').toLocaleLowerCase('fr')===choice.mode
    ));
    const activities=matching.filter(activity=>students.some(student=>assigned(activity,student)&&score(activity,student)))
      .sort((a,b)=>(a.date||'').localeCompare(b.date||'')||a.title.localeCompare(b.title,'fr'));
    const displayedStudents=choice.mode==='all'?students:students.filter(student=>
      activities.some(activity=>assigned(activity,student)&&score(activity,student)));
    const periods=Array.isArray(state.trainingPeriods)?state.trainingPeriods:[];
    const tableWidth=510+210*activities.length;

    target.innerHTML=`<div class="page-head"><div><h1>${modes[choice.mode]}</h1><p>Notes et compétences évaluées pour chaque activité.</p></div></div>
      <nav class="ccf-submenus" aria-label="Sous-menus du Récap CCF">${Object.entries(modes).map(([id,label])=>
        `<button type="button" class="ccf-submenu ${choice.mode===id?'active':''}" data-ccf-mode="${id}" aria-current="${choice.mode===id?'page':'false'}">${label}</button>`
      ).join('')}</nav>
      <section class="panel ccf-compact-filters"><div class="field"><label for="ccfCompactClass">Classe</label><select id="ccfCompactClass"><option value="">Choisir une classe…</option>${classes.map(name=>
        `<option value="${safe(name)}" ${choice.className===name?'selected':''}>${safe(name)}</option>`).join('')}</select></div>
      ${choice.className?`<div class="field ccf-compact-groups"><label>Groupe</label><div class="scope-choices" role="group" aria-label="Choisir un groupe"><button type="button" data-ccf-group="" class="scope-choice ${!choice.groupId?'active':''}" aria-pressed="${!choice.groupId}">Toute la classe</button>${classGroups.map(item=>
        `<button type="button" data-ccf-group="${safe(item.id)}" class="scope-choice ${choice.groupId===item.id?'active':''}" aria-pressed="${choice.groupId===item.id}">${safe(item.name)}</button>`).join('')}</div></div>
      <div class="field ccf-compact-students"><label>Élèves</label><details class="ccf-student-picker"><summary>${safe(selectedLabel)}</summary><div class="ccf-student-picker-body"><button type="button" class="button small" id="ccfAllStudents">Tous les élèves</button><div class="ccf-student-checks">${eligible.map(student=>
        `<label><input type="checkbox" data-ccf-student="${safe(student.id)}" ${choice.studentIds.has(student.id)?'checked':''}><span>${safe(student.name)}</span></label>`).join('')||'<p>Aucun élève dans cette sélection.</p>'}</div></div></details></div>`:''}</section>
      ${choice.className?activities.length?`<p class="ccf-scroll-hint">Sur petit écran, faites glisser le tableau horizontalement.</p><div class="panel dashboard-table-wrap ccf-table-wrap" style="--ccf-table-width:${tableWidth}px"><table class="dashboard-table ccf-compact-table" aria-label="${safe(modes[choice.mode])}"><colgroup><col class="ccf-name-col">${activities.map(()=>'<col class="ccf-activity-col">').join('')}<col class="ccf-bilan-col"><col class="ccf-comment-col"></colgroup><thead><tr><th scope="col">Élève</th>${activities.map(activity=>{
        const period=periods.find(item=>item.id===activity.periodId);
        return `<th scope="col"><span class="ccf-activity-title">${safe(activity.title)}</span><small>${safe(activity.date||'Sans date')}${period?' · '+safe(period.name):''}</small></th>`;
      }).join('')}<th scope="col">Bilan</th><th scope="col">Commentaire (100 caractères)</th></tr></thead><tbody>${displayedStudents.map(student=>{
        const graded=activities.filter(activity=>assigned(activity,student)&&score(activity,student));
        const grades=graded.map(activity=>score(activity,student).note);
        const average=grades.length?grades.reduce((sum,value)=>sum+value,0)/grades.length:null;
        const competencyIds=[...new Set(graded.flatMap(activity=>activity.competencies||[]))];
        const comment=String(state.ccfComments[student.id]||'').slice(0,100);
        return `<tr><th scope="row">${safe(student.name)}</th>${activities.map(activity=>{
          const result=assigned(activity,student)?score(activity,student):null;
          return `<td>${result?`<strong>${note(result.note)} / 20</strong><div class="ccf-pills">${(activity.competencies||[]).map(id=>{
            const item=result.competencies?.find(candidate=>candidate.id===id);
            return pill(id,Number.isFinite(item?.factor)?item.factor:null);
          }).join('')}</div>`:'<span class="muted">—</span>'}</td>`;
        }).join('')}<td class="dashboard-bilan"><strong>${note(average)}${average===null?'':' / 20'}</strong><div class="ccf-pills">${competencyIds.map(id=>{
          const values=graded.map(activity=>score(activity,student).competencies?.find(item=>item.id===id)?.factor).filter(Number.isFinite);
          return pill(id,values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null);
        }).join('')}</div></td><td><textarea data-ccf-comment="${safe(student.id)}" maxlength="100" rows="2" placeholder="Bilan de l’élève…">${safe(comment)}</textarea><small class="char-count">${comment.length}/100</small></td></tr>`;
      }).join('')}</tbody></table></div>`:`<div class="panel ccf-empty">Aucune évaluation ${choice.mode==='all'?'':choice.mode} dans cette sélection.</div>`:''}`;

    target.querySelectorAll('[data-ccf-mode]').forEach(button=>button.onclick=()=>{
      choice.mode=button.dataset.ccfMode;renderCcfCompact();
    });
    const classSelect=target.querySelector('#ccfCompactClass');
    if(classSelect)classSelect.onchange=()=>{
      choice.className=classSelect.value;choice.groupId='';choice.studentIds.clear();renderCcfCompact();
    };
    target.querySelectorAll('[data-ccf-group]').forEach(button=>button.onclick=()=>{
      choice.groupId=button.dataset.ccfGroup;choice.studentIds.clear();renderCcfCompact();
    });
    target.querySelector('#ccfAllStudents')?.addEventListener('click',()=>{
      choice.studentIds.clear();renderCcfCompact();
    });
    target.querySelectorAll('[data-ccf-student]').forEach(input=>input.onchange=()=>{
      if(input.checked)choice.studentIds.add(input.dataset.ccfStudent);
      else choice.studentIds.delete(input.dataset.ccfStudent);
      renderCcfCompact();
      const picker=target.querySelector('.ccf-student-picker');
      if(picker)picker.open=true;
    });
    target.querySelectorAll('[data-ccf-comment]').forEach(textarea=>textarea.oninput=()=>{
      state.ccfComments[textarea.dataset.ccfComment]=textarea.value.slice(0,100);
      textarea.nextElementSibling.textContent=`${textarea.value.length}/100`;
      save();
    });
  }

  window.renderCcf=renderCcfCompact;
})();
