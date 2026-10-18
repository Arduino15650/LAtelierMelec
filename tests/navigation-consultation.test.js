const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('les modèles homonymes restent distincts sans modifier les activités ni leurs identifiants', () => {
  const source = read('activity-reuse.js');
  const context = {};
  vm.runInNewContext(source.slice(source.indexOf('  function templateLabels('), source.indexOf('  function render(){')), context);
  const activities = [
    {id:'b', activity:{title:'MyHome', competencies:['C1'], className:'TMELEC', date:'2026-10-01', scores:{s1:3}}},
    {id:'a', activity:{title:'MyHome', competencies:['C1'], className:'TMELEC', date:'2026-10-01', scores:{s2:2}}},
    {id:'c', activity:{title:'KNX', competencies:['C2']}}
  ];
  const original = structuredClone(activities);
  const labels = context.templateLabels(activities);
  assert.notEqual(labels.get('a'), labels.get('b'), 'même titre, même classe et même date restent distinguables');
  assert.match(labels.get('a'), /TMELEC/);
  assert.match(labels.get('a'), /2026-10-01/);
  const reversed = context.templateLabels([...activities].reverse());
  for (const {id} of activities) assert.equal(labels.get(id), reversed.get(id), 'libellé stable après réordonnancement');
  assert.equal(labels.get('c'), 'KNX · C2', 'les libellés sans ambiguïté restent inchangés');
  assert.deepEqual(activities, original, 'aucune activité ou note modifiée');
});

test('passer des TP aux devis puis revenir aux TP actualise le titre principal', () => {
  const source = read('teaching-space.js');
  const buttons = ['tp', 'quotes'].map(key => ({dataset:{teachTab:key}}));
  const select = {};
  const body = {};
  const root = {innerHTML:'', classList:{contains:()=>false},
    querySelector:selector=>selector === '#teachClass' ? select : body,
    querySelectorAll:()=>buttons};
  const context = {root, tab:'tp', classes:[], students:[], classId:'',
    selectedItemId:'', selectedTpId:'', editing:null, tpLoadedClassId:'', tpLoadedAt:Date.now(),
    studentsLoadedAt:Date.now(), messagesLoadedAt:Date.now(),
    document:{querySelectorAll:()=>[]}, esc:value=>value, status:()=>{},
    renderTp:()=>{}, renderStudents:()=>{}, renderAlerts:()=>{}, renderMessages:()=>{},
    window:{MelecDevis:{renderTeacher:()=>{}}}};
  vm.runInNewContext(
    source.slice(source.indexOf('  function pageHeading()'), source.indexOf('  async function load(')) +
    source.slice(source.indexOf('  function render()'), source.indexOf('  function tpIsActive(')), context);
  context.render();
  assert.match(root.innerHTML, /<h1>TP en atelier<\/h1>/);
  buttons[1].onclick();
  assert.match(root.innerHTML, /<h1>Devis des élèves<\/h1>/);
  assert.doesNotMatch(root.innerHTML, /<h1>TP en atelier<\/h1>/);
  buttons[0].onclick();
  assert.match(root.innerHTML, /<h1>TP en atelier<\/h1>/);
});
