(function(){
  'use strict';
  state.studentGroups=Array.isArray(state.studentGroups)?state.studentGroups:[];
  const baseRender=renderStudents;
  const members=name=>state.students.filter(s=>s.className===name).sort((a,b)=>a.name.localeCompare(b.name,'fr'));
  const groups=name=>state.studentGroups.filter(g=>g.className===name).sort((a,b)=>a.name.localeCompare(b.name,'fr'));
  const choices=(students,selected=[])=>students.map(s=>`<label class="group-member-row"><input type="checkbox" value="${esc(s.id)}" ${selected.includes(s.id)?'checked':''}><span>${esc(s.name)}</span></label>`).join('');
  function showStudentGroups(){
    document.querySelectorAll('#studentsView .class-fold table').forEach(table=>{
      const headings=table.querySelectorAll('thead th');
      if(!table.querySelector('thead th.group-column')){const th=document.createElement('th');th.className='group-column';th.textContent='Groupe(s) lié(s)';headings[1]?.after(th)}
      table.querySelectorAll('tbody tr').forEach(row=>{
        const cells=row.querySelectorAll('td'),student=state.students.find(s=>s.name===cells[0]?.textContent&&s.className===cells[1]?.textContent);
        if(!student)return;
        let cell=row.querySelector('td.group-column');if(!cell){cell=document.createElement('td');cell.className='group-column';cells[1]?.after(cell)}
        const linked=groups(student.className).filter(g=>g.studentIds.includes(student.id));
        cell.innerHTML=linked.length?linked.map(g=>`<span class="student-group-chip">${esc(g.name)}</span>`).join(''):'<span class="muted">Aucun groupe</span>';
      });
    });
  }
  renderStudents=function(){
    baseRender();
    showStudentGroups();
    const section=document.createElement('section');section.className='panel student-groups-panel';
    section.innerHTML=`<h2 class="panel-title">Groupes d’élèves</h2><div class="group-form-grid"><div class="field"><label for="studentGroupClass">Classe</label><select id="studentGroupClass"><option value="">Choisir une classe…</option>${classNames().map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('')}</select></div><div class="field"><label for="studentGroupName">Nom du groupe</label><input id="studentGroupName" maxlength="80" placeholder="Ex. Groupe A"></div></div><details id="newGroupMembers" class="selection-dropdown" hidden><summary>Choisir les élèves du groupe</summary><div id="studentGroupChoices" class="group-member-list"></div></details><button type="button" id="createStudentGroup" class="button primary">Créer le groupe</button><div id="studentGroupsList" class="student-groups-list"></div>`;
    document.querySelector('#studentsView .classes-title')?.before(section);
    const classSelect=section.querySelector('#studentGroupClass'),list=section.querySelector('#studentGroupsList'),choice=section.querySelector('#studentGroupChoices'),fold=section.querySelector('#newGroupMembers');
    const update=()=>{const name=classSelect.value,students=members(name);fold.hidden=!name;choice.innerHTML=choices(students)||'<p>Aucun élève dans cette classe.</p>';list.innerHTML=name?`<h3>Groupes de ${esc(name)}</h3>${groups(name).map(g=>{const selected=students.filter(s=>g.studentIds.includes(s.id)),others=students.filter(s=>!g.studentIds.includes(s.id));return `<details class="student-group-item" data-group-id="${esc(g.id)}"><summary><strong>${esc(g.name)}</strong><span>${selected.length} élève(s)</span></summary><div class="student-group-item-body"><details class="selection-dropdown"><summary>Élèves du groupe</summary><ul class="group-name-list">${selected.map(s=>`<li>${esc(s.name)}</li>`).join('')}</ul></details><details class="selection-dropdown"><summary>Modifier les membres</summary><div class="group-member-list">${choices(selected,g.studentIds)}</div>${others.length?`<div class="field"><label>Ajouter un élève</label><select class="group-add-student"><option value="">Choisir…</option>${others.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select></div>`:''}</details><div class="group-item-actions"><button type="button" class="button small group-save">Enregistrer</button><button type="button" class="button small danger group-delete">Supprimer</button></div></div></details>`}).join('')||'<p>Aucun groupe créé.</p>'}`:'';showStudentGroups()};
    classSelect.onchange=update;
    section.querySelector('#createStudentGroup').onclick=()=>{const className=classSelect.value,name=section.querySelector('#studentGroupName').value.trim(),studentIds=[...choice.querySelectorAll('input:checked')].map(x=>x.value);if(!className||!name||!studentIds.length)return toast('Choisissez une classe, un nom et des élèves.');if(groups(className).some(g=>g.name.toLocaleLowerCase('fr')===name.toLocaleLowerCase('fr')))return toast('Ce groupe existe déjà.');state.studentGroups.push({id:createId(),className,name,studentIds});save();section.querySelector('#studentGroupName').value='';fold.open=false;update();toast('Groupe créé.');};
    list.onclick=e=>{const row=e.target.closest('[data-group-id]'),g=state.studentGroups.find(x=>x.id===row?.dataset.groupId);if(!g)return;if(e.target.closest('.group-save')){const ids=[...row.querySelectorAll('.group-member-list input:checked')].map(x=>x.value),added=row.querySelector('.group-add-student')?.value;if(added)ids.push(added);if(!ids.length)return toast('Sélectionnez au moins un élève.');g.studentIds=ids;state.activities.filter(a=>a.groupId===g.id).forEach(a=>a.studentIds=[...ids]);save();update();toast('Groupe mis à jour.')}if(e.target.closest('.group-delete')&&confirm(`Supprimer le groupe « ${g.name} » ?`)){state.studentGroups=state.studentGroups.filter(x=>x.id!==g.id);state.activities.filter(a=>a.groupId===g.id).forEach(a=>delete a.groupId);save();update();toast('Groupe supprimé.')}};
  };
  window.renderStudents=renderStudents;
})();
