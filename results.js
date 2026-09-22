(function(){
  'use strict';

  let selectedClass='';
  let selectedStudentIds=[];

  function surname(name){
    const value=String(name||'').trim();
    if(value.includes(','))return value.split(',')[0].trim();
    const words=value.split(/\s+/);
    const capitals=words.filter(word=>word.length>1&&word===word.toLocaleUpperCase('fr')&&/\p{L}/u.test(word));
    return capitals.length?capitals.join(' '):(words[0]||'');
  }
  function byName(a,b){return surname(a.name).localeCompare(surname(b.name),'fr',{sensitivity:'base'})||a.name.localeCompare(b.name,'fr',{sensitivity:'base'})}

  function assigned(activity,student){
    if(activity.className!==student.className)return false;
    const ids=Array.isArray(activity.studentIds)?activity.studentIds:[];
    if(ids.length)return ids.includes(student.id);
    return activity.audience!=='selected';
  }

  function renderResults(keepStudentListOpen=false){
    const target=document.querySelector('#resultsView');
    if(!target)return;
    const classes=[...new Set(state.students.map(student=>student.className).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fr',{numeric:true}));
    if(selectedClass&&!classes.includes(selectedClass)){selectedClass='';selectedStudentIds=[]}
    const pupils=state.students.filter(student=>student.className===selectedClass).sort(byName);
    const selected=pupils.filter(student=>selectedStudentIds.includes(student.id));
    target.innerHTML=`<div class="page-head results-heading"><div><h1>Résultats des élèves</h1><p>Notes et moyennes des activités évaluées, par classe et par élève.</p></div></div>
      <section class="panel results-filters"><div class="field"><label for="resultsClass">Classe</label><select id="resultsClass"><option value="">Choisir une classe…</option>${classes.map(name=>`<option value="${esc(name)}" ${selectedClass===name?'selected':''}>${esc(name)}</option>`).join('')}</select></div>
      ${selectedClass?`<div class="results-students"><span class="results-student-label">Élèves à afficher</span><details class="results-student-dropdown" ${keepStudentListOpen?'open':''}><summary>${selectedStudentIds.length?`${selectedStudentIds.length} élève(s) sélectionné(s)`:'Choisir un ou plusieurs élèves'} <span aria-hidden="true">⌄</span></summary><div class="results-student-panel"><div class="results-filter-actions"><button type="button" class="button small" id="resultsSelectAll">Toute la classe</button><button type="button" class="button small" id="resultsSelectNone">Effacer la sélection</button></div><div class="results-student-choices">${pupils.map(student=>`<label class="results-student-choice"><input type="checkbox" value="${esc(student.id)}" ${selectedStudentIds.includes(student.id)?'checked':''}><span>${esc(student.name)}</span></label>`).join('')}</div></div></details></div>`:''}</section>
      ${selectedClass?selected.length?`<div class="results-grid">${selected.map(student=>{
        const grades=state.activities.filter(activity=>assigned(activity,student)).map(activity=>({activity,result:scoreResult(activity,student)})).filter(item=>Number.isFinite(item.result.note));
        const average=grades.length?grades.reduce((sum,item)=>sum+item.result.note,0)/grades.length:null;
        return `<article class="panel result-card"><div class="result-card-head"><div><span class="result-class">${esc(student.className)}</span><h2>${esc(student.name)}</h2><p>${grades.length} activité(s) évaluée(s)</p></div><div class="result-average"><span>Moyenne</span><strong>${average===null?'—':average.toFixed(2)}${average===null?'':' <small>/ 20</small>'}</strong></div></div>${grades.length?`<details class="result-detail"><summary>Voir les résultats des activités <span>${grades.length}</span></summary><ul>${grades.map(({activity,result})=>`<li><span><strong>${esc(activity.title)}</strong><small>${esc(activity.date||'Sans date')}</small></span><b>${result.note.toFixed(2)} / 20</b></li>`).join('')}</ul></details>`:'<p class="result-empty">Aucune évaluation enregistrée pour cet élève.</p>'}</article>`;
      }).join('')}</div>`:'':''}`;

    target.querySelector('#resultsClass')?.addEventListener('change',event=>{
      selectedClass=event.target.value;
      selectedStudentIds=[];
      renderResults();
    });
    target.querySelectorAll('.results-student-choice input').forEach(input=>input.addEventListener('change',()=>{
      selectedStudentIds=[...target.querySelectorAll('.results-student-choice input:checked')].map(box=>box.value);
      renderResults(true);
    }));
    target.querySelector('#resultsSelectAll')?.addEventListener('click',()=>{selectedStudentIds=pupils.map(student=>student.id);renderResults()});
    target.querySelector('#resultsSelectNone')?.addEventListener('click',()=>{selectedStudentIds=[];renderResults()});
  }

  window.renderResults=renderResults;
  if(location.hash==='#results')renderResults();
})();
