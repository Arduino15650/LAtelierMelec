const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');

const source=fs.readFileSync(require('node:path').join(__dirname,'..','evaluation-atelier-v2.js'),'utf8');
const lockModule=source.slice(source.indexOf('/* Le verrou est propre'));

function scenario({hasNext=false,queue=false}={}){
  const calls=[];
  let click;
  const activity={id:'a1',className:'1MELEC',studentIds:queue?['s1','s2']:[],audience:'class',evaluationLocks:{}};
  const students=[{id:'s1',className:'1MELEC'},{id:'s2',className:'1MELEC'}];
  const createElement=()=>({className:'',textContent:'',setAttribute(){},addEventListener(name,fn){if(name==='click')click=fn;},append(){}});
  const panel={querySelectorAll(){return [];},append(){}};
  const baseGrade=id=>calls.push('render '+id);
  const window={grade:baseGrade,melecEvaluationQueue:queue?{activityId:'a1',studentIds:['s1','s2']}:null,
    showEvaluatedActivities(){calls.push('evaluated list');},confirm(){return true;}};
  const context={window,document:{querySelector(){return panel;},createElement},
    state:{activities:[activity],students},grade:baseGrade,gradeStudent:'s1',gradeActivityId:'a1',
    scoreResult(a,student){return {count:student.id==='s1'||!hasNext?1:0};},
    save(){calls.push('save');},show(name){calls.push('show '+name);},toast(message){calls.push(message);},Boolean,Array};
  vm.runInNewContext(lockModule,context);
  window.grade('a1');
  assert.equal(typeof click,'function');
  click();
  return {calls,activity,context,window};
}

const last=scenario();
assert.equal(last.activity.evaluationLocks.s1,true);
assert.ok(last.calls.indexOf('save')<last.calls.indexOf('evaluated list'));
assert.equal(last.calls.filter(value=>value==='render a1').length,1);
assert.equal(last.context.gradeStudent,'');

const next=scenario({hasNext:true,queue:true});
assert.equal(next.context.gradeStudent,'s2');
assert.equal(next.calls.filter(value=>value==='render a1').length,2);
assert.equal(next.calls.includes('evaluated list'),false);

process.stdout.write('Fin d’évaluation : dernier élève et élève suivant vérifiés.\n');
