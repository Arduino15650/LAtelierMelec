(function(){
  'use strict';
  if(!Array.isArray(state.studentGroups))state.studentGroups=[];
  const originalRenderStudents=renderStudents;

  function membersFor(className){return state.students.filter(student=>student.className===className).sort((a,b)=>a.name.localeCompare(b.name,'fr',{sensitivity:'base'}))}
  function groupsFor(className){return state.studentGroups.filter(group=>group.className===className).sort((a,b)=>a.name.localeCompare(b.name,'fr',{sensitivity:'base'}))}
  function choices(students,selected=[]){return students.map(student=>`<label class="group-member-row" style="display:flex!important;flex-direction:row!important;align-items:center!important;justify-content:flex-start!important;gap:12px!important;min-height:46px;padding:9px 12px"><input type="checkbox" style="appearance:auto!important;display:block!important;flex:0 0 20px!important;width:20px!important;height:20px!important;min-width:20px!important;min-height:20px!important;max-width:20px!important;max-height:20px!important;margin:0!important;padding:0!important" value="${esc(student.id)}" ${selected.includes(student.id)?'checked':''}><span style="display:block;min-width:0;line-height:1.35">${esc(student.name)}</span></label>`).join('')}

  renderStudents=function(){
    originalRenderStudents();
    const title=document.querySelector('#studentsView .classes-title');
    if(!title)return;
    const classes=classNames();
    const section=document.createElement('section');
    section.className='panel student-groups-panel';
    section.innerHTML=`<h2 class="panel-title">Groupes d’élèves</h2><p>Créez des groupes à partir d’une classe pour retrouver leurs résultats ensemble.</p>
      <form id="studentGroupForm" class="student-group-form"><div class="field"><label for="studentGroupClass">Classe</label><select id="studentGroupClass" required><option value="">Choisir une classe…</option>${classes.map(name=>`<option value="${esc(name)}">${esc(name)}</option>`).join('')}</select></div>
      <div class="field"><label for="studentGroupName">Nom du groupe</label><input id="studentGroupName" maxlength="80" required placeholder="Ex. Groupe A"></div>
      <div class="group-member-field"><span class="group-field-label">Élèves du groupe</span><div id="studentGroupChoices" class="group-member-list" style="display:grid!important;grid-template-columns:minmax(0,1fr)!important;gap:7px"><p>Choisissez d’abord une classe.</p></div></div><button type="submit" class="button primary">Créer le groupe</button></form>
      <div id="studentGroupsList" class="student-groups-list"></div>`;
    title.before(section);
    const classSelect=section.querySelector('#studentGroupClass');
    const memberChoices=section.querySelector('#studentGroupChoices');
    const groupList=section.querySelector('#studentGroupsList');
    const update=()=>{
      const className=classSelect.value;
      const students=membersFor(className);
      memberChoices.innerHTML=className?choices(students)||'<p>Aucun élève dans cette classe.</p>':'<p>Choisissez d’abord une classe.</p>';
      groupList.innerHTML=className?`<h3>Groupes de ${esc(className)}</h3>${groupsFor(className).map(group=>{
        const selected=Array.isArray(group.studentIds)?group.studentIds:[];
        return `<details class="student-group-item" data-group-id="${esc(group.id)}"><summary><strong>${esc(group.name)}</strong><span>${selected.filter(id=>students.some(student=>student.id===id)).length} élève(s) · Gérer</span></summary><div class="student-group-item-body"><div class="group-member-list" style="display:grid!important;grid-template-columns:minmax(0,1fr)!important;gap:7px">${choices(students,selected)}</div><div class="group-item-actions"><button type="button" class="button small group-save">Enregistrer les membres</button><button type="button" class="button small danger group-delete">Supprimer le groupe</button></div></div></details>`
      }).join('')||'<p>Aucun groupe créé pour cette classe.</p>'}`:'';
    };
    classSelect.addEventListener('change',update);
    section.querySelector('#studentGroupForm').addEventListener('submit',event=>{
      event.preventDefault();
      const className=classSelect.value,name=section.querySelector('#studentGroupName').value.trim();
      const studentIds=[...memberChoices.querySelectorAll('input:checked')].map(input=>input.value);
      if(!className||!name||!studentIds.length)return toast('Choisissez une classe, un nom et au moins un élève.');
      if(groupsFor(className).some(group=>group.name.toLocaleLowerCase('fr')===name.toLocaleLowerCase('fr')))return toast('Ce groupe existe déjà dans cette classe.');
      state.studentGroups.push({id:createId(),className,name,studentIds});
      save();
      section.querySelector('#studentGroupName').value='';
      update();
      toast('Groupe créé.');
    });
    groupList.addEventListener('click',event=>{
      const row=event.target.closest('.student-group-item');
      const group=state.studentGroups.find(item=>item.id===row?.dataset.groupId);
      if(!group)return;
      if(event.target.closest('.group-save')){
        group.studentIds=[...row.querySelectorAll('input:checked')].map(input=>input.value);
        if(!group.studentIds.length)return toast('Sélectionnez au moins un élève.');
        save();update();toast('Groupe mis à jour.');
      }
      if(event.target.closest('.group-delete')&&confirm(`Supprimer le groupe « ${group.name} » ? Les résultats des élèves seront conservés.`)){
        state.studentGroups=state.studentGroups.filter(item=>item.id!==group.id);
        save();update();toast('Groupe supprimé.');
      }
    });
  };
  window.renderStudents=renderStudents;
})();
