/* Gestion des groupes : ajout depuis la classe, retrait explicite depuis le groupe. */
(function(){
  'use strict';
  state.studentGroups=Array.isArray(state.studentGroups)?state.studentGroups:[];
  const previousRender=renderStudents;
  const members=className=>state.students.filter(student=>student.className===className)
    .sort((a,b)=>a.name.localeCompare(b.name,'fr',{sensitivity:'base'}));
  const groups=className=>state.studentGroups.filter(group=>group.className===className)
    .sort((a,b)=>a.name.localeCompare(b.name,'fr',{sensitivity:'base'}));
  const idOptions=students=>students.map(student=>'<label class="group-member-row"><input type="checkbox" value="'+esc(student.id)+'"><span>'+esc(student.name)+'</span></label>').join('');
  function displayLinkedGroups(){
    document.querySelectorAll('#studentsView .class-fold table').forEach(table=>{
      const heading=table.querySelector('thead th.group-column');
      if(!heading){
        const th=document.createElement('th');th.className='group-column';th.textContent='Groupe(s) lié(s)';
        table.querySelectorAll('thead th')[1]?.after(th);
      }
      table.querySelectorAll('tbody tr').forEach(row=>{
        const cells=row.querySelectorAll('td');
        const student=state.students.find(item=>item.name===cells[0]?.textContent&&item.className===cells[1]?.textContent);
        if(!student)return;
        let cell=row.querySelector('td.group-column');
        if(!cell){cell=document.createElement('td');cell.className='group-column';cells[1]?.after(cell)}
        const linked=groups(student.className).filter(group=>(group.studentIds||[]).includes(student.id));
        cell.innerHTML=linked.length?linked.map(group=>'<span class="student-group-chip">'+esc(group.name)+'</span>').join(''):'<span class="muted">Aucun groupe</span>';
      });
    });
  }
  renderStudents=function(){
    previousRender();
    displayLinkedGroups();
    const section=document.createElement('section');
    section.className='panel student-groups-panel';
    section.innerHTML='<h2 class="panel-title">Groupes d’élèves</h2>'+
      '<div class="group-form-grid"><div class="field"><label for="studentGroupClass">Classe</label><select id="studentGroupClass"><option value="">Choisir une classe…</option>'+
      classNames().map(name=>'<option value="'+esc(name)+'">'+esc(name)+'</option>').join('')+'</select></div>'+
      '<div class="field"><label for="studentGroupName">Créer un groupe dans cette classe</label><input id="studentGroupName" maxlength="80" placeholder="Ex. 1MELEC-G1"></div>'+
      '<button type="button" id="createStudentGroup" class="button primary">Créer le groupe</button></div>'+
      '<section class="group-assignment" id="groupAssignment" hidden><h3>Ajouter des élèves à un groupe</h3>'+
      '<p>Cochez un ou plusieurs élèves de la classe, choisissez le groupe de destination, puis confirmez l’ajout.</p>'+
      '<div class="group-select-tools"><button type="button" class="button small" id="groupSelectAll">Tout cocher</button><button type="button" class="button small" id="groupClearAll">Tout décocher</button></div>'+
      '<div class="group-member-list" id="groupClassChoices"></div>'+
      '<div class="group-assignment-actions"><div class="field"><label for="groupDestination">Groupe de destination</label><select id="groupDestination"><option value="">Choisir un groupe…</option></select></div>'+
      '<button type="button" class="button primary" id="addStudentsToGroup" disabled>Ajouter les élèves cochés</button></div></section>'+
      '<div id="studentGroupsList" class="student-groups-list"></div>';
    document.querySelector('#studentsView .classes-title')?.before(section);
    const classSelect=section.querySelector('#studentGroupClass');
    const groupName=section.querySelector('#studentGroupName');
    const assignment=section.querySelector('#groupAssignment');
    const choices=section.querySelector('#groupClassChoices');
    const destination=section.querySelector('#groupDestination');
    const addButton=section.querySelector('#addStudentsToGroup');
    const list=section.querySelector('#studentGroupsList');
    function refreshAvailable(){
      const selected=groups(classSelect.value).find(group=>group.id===destination.value);
      const linked=new Set(selected?.studentIds||[]);
      choices.querySelectorAll('input').forEach(input=>{
        input.disabled=linked.has(input.value);
        if(input.disabled)input.checked=false;
        input.closest('label')?.classList.toggle('already-linked',input.disabled);
      });
      addButton.disabled=!destination.value||!choices.querySelector('input:checked:not(:disabled)');
    }
    function update(openGroupId=''){
      const className=classSelect.value,students=members(className),availableGroups=groups(className);
      const previousDestination=destination.value;
      assignment.hidden=!className;
      choices.innerHTML=idOptions(students)||'<p>Aucun élève dans cette classe.</p>';
      destination.innerHTML='<option value="">Choisir un groupe…</option>'+
        availableGroups.map(group=>'<option value="'+esc(group.id)+'">'+esc(group.name)+'</option>').join('');
      if(availableGroups.some(group=>group.id===previousDestination))destination.value=previousDestination;
      list.innerHTML=className?'<h3>Groupes de '+esc(className)+'</h3>'+
        (availableGroups.map(group=>{
          const selected=students.filter(student=>(group.studentIds||[]).includes(student.id));
          return '<details class="student-group-item" data-group-id="'+esc(group.id)+'"'+(openGroupId===group.id?' open':'')+'>'+
            '<summary><strong>'+esc(group.name)+'</strong><span>'+selected.length+' élève(s)</span></summary>'+
            '<div class="student-group-item-body"><p class="group-edit-hint">Cochez uniquement les élèves à retirer de ce groupe. Aucune case n’est présélectionnée.</p>'+
            '<div class="group-member-list group-removal-list">'+(idOptions(selected)||'<p>Ce groupe est vide.</p>')+'</div>'+
            '<div class="group-item-actions"><button type="button" class="button small group-remove-selected" disabled>Retirer les élèves cochés</button>'+
            '<button type="button" class="button small danger group-delete">Supprimer le groupe</button></div></div></details>';
        }).join('')||'<p>Aucun groupe créé pour cette classe.</p>'):'';
      refreshAvailable();
      displayLinkedGroups();
    }
    classSelect.onchange=()=>{destination.value='';update()};
    destination.onchange=refreshAvailable;
    choices.onchange=refreshAvailable;
    section.querySelector('#groupSelectAll').onclick=()=>{
      choices.querySelectorAll('input:not(:disabled)').forEach(input=>input.checked=true);
      refreshAvailable();
    };
    section.querySelector('#groupClearAll').onclick=()=>{
      choices.querySelectorAll('input').forEach(input=>input.checked=false);
      refreshAvailable();
    };
    section.querySelector('#createStudentGroup').onclick=()=>{
      const className=classSelect.value,name=groupName.value.trim();
      if(!className||!name)return toast('Choisissez une classe et indiquez le nom du groupe.');
      if(groups(className).some(group=>group.name.toLocaleLowerCase('fr')===name.toLocaleLowerCase('fr')))return toast('Ce groupe existe déjà dans cette classe.');
      const group={id:createId(),className,name,studentIds:[]};
      state.studentGroups.push(group);
      save();
      groupName.value='';update(group.id);destination.value=group.id;refreshAvailable();
      toast('Groupe créé. Cochez maintenant les élèves à y ajouter.');
    };
    addButton.onclick=()=>{
      const group=state.studentGroups.find(item=>item.id===destination.value&&item.className===classSelect.value);
      const allowed=new Set(members(classSelect.value).map(student=>student.id));
      const ids=[...choices.querySelectorAll('input:checked:not(:disabled)')].map(input=>input.value).filter(id=>allowed.has(id));
      if(!group||!ids.length)return toast('Choisissez un groupe et au moins un élève à ajouter.');
      group.studentIds=[...new Set([...(group.studentIds||[]),...ids])];
      save();update(group.id);toast(ids.length+' élève(s) ajouté(s) au groupe.');
    };
    list.onchange=event=>{
      const row=event.target.closest('.student-group-item');
      if(row)row.querySelector('.group-remove-selected').disabled=!row.querySelector('.group-removal-list input:checked');
    };
    list.onclick=event=>{
      const row=event.target.closest('.student-group-item');
      const group=state.studentGroups.find(item=>item.id===row?.dataset.groupId&&item.className===classSelect.value);
      if(!group)return;
      if(event.target.closest('.group-remove-selected')){
        const checked=[...row.querySelectorAll('.group-removal-list input:checked')].map(input=>input.value);
        const ids=checked.filter(id=>(group.studentIds||[]).includes(id));
        if(!ids.length)return;
        if(!confirm('Retirer '+ids.length+' élève(s) du groupe « '+group.name+' » ? Leurs fiches et évaluations seront conservées.'))return;
        const removed=new Set(ids);
        group.studentIds=(group.studentIds||[]).filter(id=>!removed.has(id));
        save();update(group.id);toast(ids.length+' élève(s) retiré(s) du groupe.');
      }
      if(event.target.closest('.group-delete')&&confirm('Supprimer le groupe « '+group.name+' » ? Les fiches et évaluations des élèves seront conservées.')){
        state.studentGroups=state.studentGroups.filter(item=>item.id!==group.id);
        state.activities.filter(activity=>activity.groupId===group.id).forEach(activity=>delete activity.groupId);
        save();update();toast('Groupe supprimé.');
      }
    };
  };
  window.renderStudents=renderStudents;
})();
