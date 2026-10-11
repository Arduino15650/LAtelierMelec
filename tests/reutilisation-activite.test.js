const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');

const source=fs.readFileSync(require('node:path').join(__dirname,'..','activity-reuse.js'),'utf8');
const snippet=source.slice(source.indexOf('  function launch(){'),source.indexOf('  const previousShow=show;'));

function scenario(modify){
  const calls=[];
  const original={id:'a1',title:'Même activité',className:'TMELEC',competencies:['C1'],criteria:['C1:0'],scores:{s1:{'C1:0':3}},evaluationLocks:{s1:true}};
  const students=[{id:'s1',className:'TMELEC'},{id:'s2',className:'TMELEC'}];
  const choice={familyId:'a1',className:'TMELEC',groupId:'__all__',studentIds:new Set(['s1','s2']),modifyCompetencies:modify};
  const context={choice,state:{activities:[original]},pendingVariant:null,draft:null,currentId:'',step:1,
    templates:()=>[{id:'a1',activity:original}],pupils:()=>students,instance:()=>original,
    cloneData:value=>structuredClone(value),createId:()=> 'a2',ensureSelectionMaps:()=>calls.push('selection maps'),
    renderEditor:()=>calls.push('editor'),save:()=>calls.push('save'),grade:id=>calls.push('grade '+id),
    toast:message=>calls.push(message),nextStep:()=>{calls.push('save editor');context.state.activities.unshift(context.draft)},
    cancelEdit:()=>calls.push('cancel'),window:{},gradeActivityId:'',gradeStudent:'',show:()=>{},renderActivities:()=>{},
    document:{getElementById:()=>null},Set,Array};
  vm.runInNewContext(snippet,context);
  context.launch();
  return {context,calls,original};
}

const changed=scenario(true);
assert.equal(changed.context.state.activities.length,1);
assert.deepEqual(changed.original.competencies,['C1']);
assert.equal(changed.context.draft.id,'a2');
assert.equal(changed.context.draft.scores.s1,undefined);
assert.equal(changed.context.draft.evaluationLocks.s1,undefined);
assert.deepEqual(Array.from(changed.context.draft.studentIds),['s1','s2']);
assert.equal(changed.context.draft.sourceActivityId,undefined);
assert.equal(changed.context.step,2);
assert.deepEqual(changed.calls,['selection maps','editor']);
changed.context.step=5;
changed.context.nextStep();
assert.equal(changed.context.state.activities.length,2);
assert.equal(changed.context.window.melecEvaluationQueue.activityId,'a2');
assert.equal(changed.calls.at(-1),'grade a2');

const kept=scenario(false);
assert.equal(kept.context.draft,null);
assert.equal(kept.context.state.activities.length,1);
assert.equal(kept.context.state.activities[0].id,'a1');
assert.equal(kept.context.state.activities[0].scores.s1['C1:0'],3);
assert.equal(kept.calls.at(-1),'grade a1');

process.stdout.write('Réutilisation : conservation et nouvelle version de compétences vérifiées.\n');
